# Log Normalization Testing Guide

This guide shows you how to test that the log normalization is working correctly and to inspect the transformed data before it's sent to the AI.

## **Method 1: Run Python Test Script (Quickest)**

```bash
cd g:\college project\proj\backend
python test_log_formatting.py
```

This will:
- ✅ Show raw logs and how they're transformed
- ✅ Display the normalized output
- ✅ Verify all required fields are present
- ✅ Show a complete transformation summary

**Example Output:**
```
================================================================================
LOG NORMALIZATION TEST
================================================================================

================================================================================
TEST 1: cowrie.session.connect
================================================================================

>>> RAW LOG (INPUT):
{
  "eventid": "cowrie.session.connect",
  "src_ip": "192.168.1.10",
  ...
}

>>> FORMATTED LOG (OUTPUT FOR AI):
{
  "eventid": "cowrie.session.connect",
  "src_ip": "192.168.1.10",
  "src_port": 48124,
  "dst_ip": "127.0.0.1",
  "dst_port": 2222,
  "session": "c42c656698ae",
  "protocol": "ssh",
  "message": "New connection: 127.0.0.1:48124...",
  "sensor": "muath",
  "uuid": "74eb25f8-2a04-11f1-92a6-080027d0fc5c",
  "timestamp": "2026-03-28T00:02:47.076502Z"
}
```

---

## **Method 2: Use Debug API Endpoints (Real-Time Testing)**

### **Start the Backend:**
```bash
cd g:\college project\proj\backend
python -m uvicorn app.main:app --reload --port 8000
```

### **Endpoint 1: Test Log Formatting**
```bash
curl -X POST http://localhost:8000/debug/format-log \
  -H "Content-Type: application/json" \
  -d '{
    "log": {
      "eventid": "cowrie.session.connect",
      "src_ip": "192.168.1.10",
      "src_port": 48124,
      "dst_ip": "127.0.0.1",
      "dst_port": 2222,
      "session": "c42c656698ae",
      "protocol": "ssh",
      "message": "New connection",
      "sensor": "muath",
      "timestamp": "2026-03-28T00:02:47.076502Z"
    }
  }'
```

**Response:**
```json
{
  "raw_log": { ... },
  "formatted_log": { ... },
  "fields_created": ["eventid", "src_ip", "src_port", ...],
  "validation": {
    "required_fields_present": true,
    "src_ip_normalized": "192.168.1.10",
    "timestamp_format": "2026-03-28T00:02:47.076502Z"
  }
}
```

### **Endpoint 2: Preview AI Request Payload**
This shows **exactly** what will be sent to the AI service:

```bash
curl -X POST http://localhost:8000/debug/preview-ai-request \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "test-event-1",
    "log": {
      "eventid": "cowrie.session.connect",
      "src_ip": "192.168.1.10",
      "src_port": 48124,
      "dst_ip": "127.0.0.1",
      "dst_port": 2222,
      "session": "abc123",
      "protocol": "ssh",
      "message": "Test",
      "sensor": "honeypot",
      "timestamp": "2026-03-28T00:02:47Z"
    }
  }'
```

**Response shows:**
```json
{
  "message": "This is what will be sent to the AI service",
  "ai_service_payload": {
    "event_id": "test-event-1",
    "log": { ... normalized fields ... }
  },
  "log_fields": {
    "original_fields": [...],
    "formatted_fields": [...],
    "new_fields_added": [...]
  }
}
```

---

## **Method 3: Browser Developer Tools (Network Inspection)**

### **Step 1: Open DevTools**
- Press `F12` in your browser
- Go to **Network** tab

### **Step 2: Filter for API Requests**
- Filter by `Fetch/XHR`
- Look for requests to `/ai/score` or `/honeypot/events`

### **Step 3: Inspect the Request Payload**
- Click on the request
- Go to **Request** tab
- See the full formatted log being sent

### **Step 4: View Response**
- Check **Response** tab to see what AI returned

---

## **Method 4: Add Logging to Backend (See Real Execution)**

Already added! When you run the backend, you'll see log output like:

```
2026-04-01 10:30:45 INFO app.services.ai_client - Formatting log for AI
2026-04-01 10:30:45 INFO app.services.ai_client - Sending to AI service: {...normalized log...}
```

## **Method 5: Test with Actual Files**

### **Using the Existing Dahua Logs:**
```bash
curl -X POST http://localhost:8000/honeypot/events/from-file \
  -H "X-Shared-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "g:\\college project\\proj\\dahua_logs (1).json",
    "chunk_size": 25,
    "max_records": 5
  }'
```

This will:
- Load actual logs from the file
- Format them
- Show you the transformation in action

---

## **What to Look For:**

✅ **Timestamp Format**
- Input: `"2026-03-28T00:02:47.076502Z"`
- Output: `"2026-03-28T00:02:47.076502Z"` (preserved)

✅ **IP Address Normalization**
- Input: `"src_ip": "192.168.1.10"`
- Output: `"src_ip": "192.168.1.10"` (as IPvAnyAddress)

✅ **Missing Fields Are Added**
- If `uuid` is missing → auto-generated
- If `timestamp` is missing → uses current time
- If `src_ip` is missing → defaults to "127.0.0.1"

✅ **All Required Fields Present**
```
- eventid ✓
- src_ip ✓
- src_port ✓
- dst_ip ✓
- dst_port ✓
- session ✓
- protocol ✓
- message ✓
- sensor ✓
- uuid ✓
- timestamp ✓
```

---

## **PowerShell Examples (Alternative to curl)**

### **If curl is not available, use PowerShell:**

```powershell
$body = @{
    log = @{
        eventid = "cowrie.session.connect"
        src_ip = "192.168.1.10"
        src_port = 48124
        dst_ip = "127.0.0.1"
        dst_port = 2222
        session = "c42c656698ae"
        protocol = "ssh"
        message = "New connection"
        sensor = "muath"
        timestamp = "2026-03-28T00:02:47.076502Z"
    }
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/debug/format-log" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $body
```

---

## **Real-World Testing Workflow**

### **1. Start Backend:**
```bash
cd g:\college project\proj\backend
python -m uvicorn app.main:app --reload
```

### **2. In Another Terminal, Run Test:**
```bash
python test_log_formatting.py
```

### **3. See the Output:**
You'll see:
- Raw log input
- Formatted output
- Validation results
- Summary of transformations

### **4. Test API Endpoint (Optional):**
```bash
curl -X POST http://localhost:8000/debug/format-log ...
```

---

## **Troubleshooting**

**Q: "Import error: No module named app"**
- Solution: Run from the `backend` directory
- Command: `cd g:\college project\proj\backend && python test_log_formatting.py`

**Q: Port 8000 already in use**
- Solution: Use different port: `python -m uvicorn app.main:app --reload --port 8001`

**Q: Debug endpoints not found**
- Solution: Make sure you've registered the debug router (already done in main.py)

---

## **What Happens Next:**

Once logs are normalized, they're sent to the AI service with this structure:

```python
payload = {
    "event_id": "unique-event-id",
    "log": {
        "eventid": "...",
        "src_ip": "...",
        "src_port": ...,
        "dst_ip": "...",
        "dst_port": ...,
        "session": "...",
        "protocol": "...",
        "message": "...",
        "sensor": "...",
        "uuid": "...",
        "timestamp": "..."
    }
}
```

The AI then responds with predictions using the schema with fields like:
- `src_ip`
- `connection_count`
- `success_count`
- `attack_type`
- `severity`
- etc.
