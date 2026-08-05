from collections import deque
from datetime import datetime
from threading import Lock
from typing import Any, Deque, Dict, Optional, Union

from pydantic import IPvAnyAddress

from app.schemas.event import AiPrediction, EnrichedEvent
from app.services.persistence import persist_ai_result, persist_ingested_event

MAX_HISTORY = 200
_store: Deque[Dict[str, Any]] = deque(maxlen=MAX_HISTORY)
_pipelines: Dict[str, Dict[str, Any]] = {}
_lock = Lock()


def record_alert(
    event: EnrichedEvent,
    pipeline_id: Optional[str] = None,
    chunk_index: Optional[int] = None,
    raw_log: Optional[dict[str, Any]] = None,
    normalized_log: Optional[dict[str, Any]] = None,
) -> None:
    with _lock:
        _store.appendleft(
            {
                "event": event,
                "prediction": None,
                "received_at": datetime.utcnow(),
                "pipeline_id": pipeline_id,
                "chunk_index": chunk_index,
            }
        )

    persist_ingested_event(
        event,
        raw_log=raw_log,
        normalized_log=normalized_log,
        pipeline_id=pipeline_id,
        chunk_index=chunk_index,
    )


def attach_prediction(event_id: str, prediction: AiPrediction) -> None:
    with _lock:
        for record in _store:
            if record["event"].event_id == event_id:
                record["prediction"] = prediction
                record["received_at"] = datetime.utcnow()
                pipeline_id = record.get("pipeline_id")
                if pipeline_id and pipeline_id in _pipelines:
                    pipeline = _pipelines[pipeline_id]
                    pipeline["predicted_events"] = pipeline.get("predicted_events", 0) + 1
                break

    persist_ai_result(event_id, prediction)


def initialize_pipeline(pipeline_id: str, total_events: int, total_chunks: int) -> None:
    with _lock:
        _pipelines[pipeline_id] = {
            "pipeline_id": pipeline_id,
            "status": "running",
            "total_events": total_events,
            "total_chunks": total_chunks,
            "chunks_sent": 0,
            "processed_events": 0,
            "chunks_failed": 0,
            "predicted_events": 0,
            "errors": [],
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
        }


def mark_chunk_sent(pipeline_id: str, chunk_size: int) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["chunks_sent"] += 1
        pipeline["processed_events"] = min(
            pipeline.get("processed_events", 0) + chunk_size,
            pipeline["total_events"],
        )


def mark_chunk_failed(pipeline_id: str, chunk_index: int, error: str) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["chunks_failed"] += 1
        pipeline["errors"].append({"chunk_index": chunk_index, "message": error})


def complete_pipeline(pipeline_id: str) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["status"] = "completed"
        if pipeline["chunks_failed"] > 0:
            pipeline["status"] = "completed_with_errors"
        pipeline["completed_at"] = datetime.utcnow().isoformat()


def pipeline_status(pipeline_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return None
        return dict(pipeline)


def recent_alerts(limit: int = 10) -> list[Dict[str, Any]]:
    """Return alerts aggregated by (src_ip, attack_type) so multiple logs
    from the same attacker doing the same attack = 1 card."""
    with _lock:
        snapshot = list(_store)

    # Group by (src_ip, attack_type)
    groups: Dict[str, Dict[str, Any]] = {}
    for record in snapshot:
        event = record["event"]
        prediction = record.get("prediction")
        received_at: datetime = record.get("received_at") or datetime.utcnow()
        if received_at.tzinfo is not None:
            received_at = received_at.replace(tzinfo=None)

        attack_type = event.attack_vector or "Unknown"
        severity = event.severity or "high"
        if prediction:
            if prediction.attack_type:
                attack_type = prediction.attack_type
            elif prediction.labels:
                attack_type = prediction.labels[0]
            if prediction.severity:
                severity = prediction.severity

        src_ip = str(event.source_ip)
        group_key = f"{src_ip}|{attack_type}"

        if group_key not in groups:
            groups[group_key] = {
                "id": f"AGG-{src_ip}-{attack_type}",
                "first_seen": event.first_seen.timestamp(),
                "last_seen": event.first_seen.timestamp(),
                "last_received_at": received_at,
                "attack_type": attack_type,
                "src_ip": src_ip,
                "dest_port": event.destination_port,
                "protocol": "TCP",
                "severity": severity,
                "instance_count": 0,
                "details": {
                    "event": event.model_dump(mode="json"),
                    "prediction": prediction.model_dump(mode="json") if prediction else None,
                    "received_at": received_at.isoformat(),
                    "pipeline_id": record.get("pipeline_id"),
                }
            }

        group = groups[group_key]
        group["instance_count"] += 1
        # Track newest ingestion timestamp for replay visibility / sorting
        if received_at > group.get("last_received_at", received_at):
            group["last_received_at"] = received_at
            group["details"]["received_at"] = received_at.isoformat()
            group["details"]["pipeline_id"] = record.get("pipeline_id")
            # Keep the most recently ingested raw event/prediction for context
            group["details"]["event"] = event.model_dump(mode="json")
            group["details"]["prediction"] = prediction.model_dump(mode="json") if prediction else group["details"].get("prediction")

        ts = event.first_seen.timestamp()
        if ts < group["first_seen"]:
            group["first_seen"] = ts
        if ts > group["last_seen"]:
            group["last_seen"] = ts
        # Keep the most recent prediction details
        if prediction and record.get("prediction"):
            group["details"]["prediction"] = prediction.model_dump(mode="json")

    # Convert to list, use ingestion time as timestamp, sort newest first
    results = []
    for group in groups.values():
        last_received_at = group.get("last_received_at")
        group["ingested_at"] = last_received_at.timestamp() if isinstance(last_received_at, datetime) else None
        group["timestamp"] = group["ingested_at"] or group["last_seen"]
        group.pop("last_received_at", None)
        results.append(group)

    results.sort(key=lambda x: x["timestamp"], reverse=True)
    return results[:limit]


def attacker_stats(src_ip: Union[str, IPvAnyAddress]) -> Dict[str, Any]:
    """Compute attacker statistics from ingested honeypot logs.

    This is a fallback when the AI prediction payload does not provide
    counts like connection_count/success_count/etc.
    """
    src_ip_str = str(src_ip)

    with _lock:
        snapshot = list(_store)

    connection_count = 0
    success_count = 0
    failed_count = 0
    unique_passwords: set[str] = set()
    command_count = 0
    suspicious_commands = 0

    # Detect whether AI is providing these fields for this attacker.
    ai_fields_seen = {
        "connection_count": False,
        "success_count": False,
        "failed_count": False,
        "unique_passwords": False,
        "command_count": False,
        "suspicious_commands": False,
    }

    suspicious_markers = (
        "wget ",
        "curl ",
        "chmod ",
        "chown ",
        "nc ",
        "ncat ",
        "netcat ",
        "bash ",
        "sh ",
        "python ",
        "perl ",
        "mkfifo ",
        "/dev/tcp",
        "tftp ",
        "ftp ",
        "powershell ",
        "certutil ",
    )

    for record in snapshot:
        event = record.get("event")
        if not event:
            continue

        if str(event.source_ip) != src_ip_str:
            continue

        connection_count += 1

        raw = {}
        try:
            raw = dict(event.metadata) if event.metadata else {}
        except Exception:
            raw = {}

        eventid = str(raw.get("eventid") or raw.get("attack_vector") or event.attack_vector or "")
        eventid_lower = eventid.lower()

        if "login.success" in eventid_lower:
            success_count += 1
            pw = raw.get("password")
            if pw is not None:
                unique_passwords.add(str(pw))
        elif "login.failed" in eventid_lower or "login.failure" in eventid_lower:
            failed_count += 1
            pw = raw.get("password")
            if pw is not None:
                unique_passwords.add(str(pw))

        if "command.input" in eventid_lower or raw.get("input") is not None:
            cmd = raw.get("input") or raw.get("message") or ""
            cmd_str = str(cmd)
            if cmd_str:
                command_count += 1
                cmd_l = cmd_str.lower()
                if any(m in cmd_l for m in suspicious_markers):
                    suspicious_commands += 1

        prediction = record.get("prediction")
        if prediction is not None:
            # Mark presence of AI-provided fields if they are set.
            for key in ai_fields_seen.keys():
                if getattr(prediction, key, None) is not None:
                    ai_fields_seen[key] = True

    return {
        "connection_count": connection_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "unique_passwords": len(unique_passwords),
        "command_count": command_count,
        "suspicious_commands": suspicious_commands,
        "ai_provided_any": any(ai_fields_seen.values()),
        "ai_fields_seen": ai_fields_seen,
        "window": {
            "max_history": MAX_HISTORY,
            "events_considered": connection_count,
        },
    }


def load_historical_alerts() -> None:
    """Restores the persisted SQLite/Postgres events into the in-memory _store deque on startup."""
    from dateutil.parser import parse
    from app.services.persistence import load_all_events
    from app.schemas.event import EnrichedEvent, AiPrediction

    try:
        events_data = load_all_events()
        with _lock:
            # Clear current store in case we're restarting/re-initializing
            _store.clear()
            
            # Since load_all_events returns rows ordered by created_at DESC (newest first),
            # we iterate in reverse order (oldest first) and use appendleft so that
            # the final _store order has the newest alert on the left (at index 0).
            for item in reversed(events_data):
                try:
                    received_at = item["created_at"]
                    if isinstance(received_at, str):
                        try:
                            received_at = parse(received_at)
                        except Exception:
                            received_at = datetime.utcnow()
                    elif not isinstance(received_at, datetime):
                        received_at = datetime.utcnow()

                    event_payload = item["event_payload"]
                    if not event_payload:
                        continue

                    event = EnrichedEvent.model_validate(event_payload)
                    prediction = None
                    if item["prediction_payload"]:
                        prediction = AiPrediction.model_validate(item["prediction_payload"])

                    _store.appendleft(
                        {
                            "event": event,
                            "prediction": prediction,
                            "received_at": received_at,
                            "pipeline_id": item["pipeline_id"],
                            "chunk_index": item["chunk_index"],
                        }
                    )
                except Exception as inner_ex:
                    print(f"[restore] Failed to validate inner event: {inner_ex}")
            print(f"[restore] Successfully loaded {len(_store)} historical events into in-memory store.")
    except Exception as ex:
        print(f"[restore] Global error restoring historical events: {ex}")
