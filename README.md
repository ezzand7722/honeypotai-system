# Honeypot AI Security Detection Backend

This directory shows how to structure the FastAPI backend you are responsible for. The layout mirrors a clean separation between entry points (`routers`), business rules (`services`), shared data contracts (`schemas`), and config or models you may expand later.

```
proj/
└── backend/
    └── app/
        ├── main.py            # FastAPI app factory
        ├── config.py          # Shared settings for URLs, timeouts, etc.
        ├── routers/           # HTTP routes called by teammates
        ├── services/          # Business logic, AI, honeypot, reporting helpers
        ├── schemas/           # Pydantic contracts shared with AI+frontend
        └── models/            # Domain helpers if you need persistence data types
```

Use this backend to:
1. Accept and normalize honeypot events from your teammate, converting them into the agreed schema defined in `schemas/event.py`.
2. Route enriched events to the AI service using `services/ai_client.py` (REST, gRPC, or queue).
3. Aggregate or cache results for the frontend teammate via `routers/reporting.py`.

## Current API flow (honeypot -> AI -> frontend)

Yes, this implementation uses **HTTP APIs** end-to-end.

1. Honeypot sends logs to backend:
     - `POST /honeypot/events` for one event
     - `POST /honeypot/events/batch?chunk_size=25` for many events
2. Backend stores each event immediately in in-memory reporting store.
3. Backend sends data to AI in **chunks** using a pipeline ID:
     - each chunk payload includes `pipeline_id`, `chunk_index`, `total_chunks`, and events list (`event_id` + original `log` as-is)
4. AI returns prediction data (example fields):
     - `event_id`
     - `attacker_ip`
     - `threat_level` (`low` / `medium` / `high`)
     - `risk_score`, `confidence`, labels, and extra details
5. Backend attaches predictions to stored alerts.
6. Frontend reads:
     - `GET /report/alerts?limit=20`
     - `GET /report/pipelines/{pipeline_id}` to check batch progress/errors.

## Example batch request from honeypot

```json
[
    {
        "attack_id": "a-1001",
        "timestamp": "2026-03-30T14:20:00Z",
        "source_ip": "203.0.113.15",
        "destination_ip": "10.0.0.7",
        "destination_port": 22,
        "attack_vector": "ssh_bruteforce",
        "metadata": {"severity": "high"},
        "payload": "..."
    }
]
```

Use header: `X-Shared-Secret: <your-secret>`

## Example AI response shape (supported)

```json
{
    "predictions": [
        {
            "event_id": "57af...",
            "attacker_ip": "203.0.113.15",
            "threat_level": "high",
            "risk_score": 0.91,
            "confidence": 0.88,
            "labels": ["bruteforce", "credential_attack"],
            "summary": "Repeated SSH login attempts",
            "details": {"attempts": 540}
        }
    ]
}
```

## Local hosting behavior

- If you run backend locally (e.g., `http://localhost:8000`) and AI locally (`http://localhost:9000`), they talk directly on your machine.
- Frontend can call backend APIs from browser (`/report/*`, `/honeypot/*`) as long as CORS allows its origin.
- Current reporting storage is in-memory only: restarting backend clears alerts/pipeline history.
- To make it production-ready, replace in-memory store with a database/queue and keep the same API contracts.

## Deliverables for your teammates
- **To the AI trainer:** Send a precise schema (see `schemas/event.py`) listing required fields (timestamps, IPs, payload metadata, severity, etc.). Ask whether they expect REST, gRPC, or Kafka; this determines `ai_client.submit_for_scoring` implementation.
- **To the honeypot developer:** Ask how often logs arrive and ask for at least a sample of the payload structure so you can map it to the schema. Decide together whether the honeypot posts directly to `/honeypot/events` or if you should pull it.
- **To the frontend developer:** Share how you expose `/report/alerts` and `/report/summary` so they know what data they can query (count, classification, timestamps).

## Running locally
```bash
cd "G:/college project/proj/backend"
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn pydantic-settings
uvicorn app.main:app --reload
```

When new data arrives, `routers/honeypot.py` immediately hands it to a service that enriches it and forwards to the AI service asynchronously, leaving your API responsive.

## End-to-end test (full simulation)

Use these steps to test the complete chain:

`honeypot logs -> backend ingest -> chunked pipeline -> AI response -> frontend API`

### 1) Start backend dependencies

In `proj/backend`:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn httpx pydantic-settings
```

### 2) Run mock AI service (Terminal A)

```powershell
Set-Location "G:\college project\proj\backend"
.\.venv\Scripts\Activate.ps1
uvicorn app.mock_ai_service:app --host 127.0.0.1 --port 9000 --reload
```

### 3) Run backend API (Terminal B)

```powershell
Set-Location "G:\college project\proj\backend"
.\.venv\Scripts\Activate.ps1
$env:AI_SERVICE_URL="http://127.0.0.1:9000/ai/score"
$env:HONEYPOT_SHARED_SECRET="my-local-secret"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 4) Send honeypot batch logs to backend (Terminal C)

```powershell
Set-Location "G:\college project\proj\backend"
$headers = @{ "X-Shared-Secret" = "my-local-secret" }
$body = Get-Content .\testdata\sample_honeypot_batch.json -Raw

$batchResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:8000/honeypot/events/batch?chunk_size=2" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body

$batchResponse
```

Expected output includes `pipeline_id`, `events_received`, and `chunks_queued`.

### 5) Check pipeline progress

```powershell
$pipelineId = $batchResponse.pipeline_id
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/report/pipelines/$pipelineId"
```

Expected fields:
- `status` (`running`, `completed`, or `completed_with_errors`)
- `total_events`, `chunks_sent`, `chunks_failed`, `predicted_events`

### 6) Get frontend-ready alerts

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/report/alerts?limit=20"
```

Each item includes:
- `event` (normalized backend event)
- `prediction` (AI output with `attacker_ip`, `threat_level`, etc.)
- `pipeline_id` and `chunk_index`

### 7) Frontend usage (simple polling)

Frontend can:
1. call batch endpoint
2. save returned `pipeline_id`
3. poll `/report/pipelines/{pipeline_id}` every 1-2 seconds
4. fetch `/report/alerts` when status becomes `completed`

### 8) Optional: test single-event path

```powershell
$single = '{"attack_id":"attack-004","timestamp":"2026-03-30T10:05:00Z","source_ip":"203.0.113.99","destination_ip":"10.10.0.5","destination_port":3389,"attack_vector":"rdp_bruteforce","metadata":{"severity":"high"},"payload":"..."}'

Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:8000/honeypot/events" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $single
```

Then call `/report/alerts` again to confirm prediction attachment.
