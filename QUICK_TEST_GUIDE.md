# Quick Testing Reference

## **Fastest Way to Test (30 seconds)**

### **Option A: Run Quick Test Script**
```bash
cd g:\college project\proj\backend
python quick_test.py
```

**What you'll see:**
- ✓ Single log transformation
- ✓ Handling of missing fields
- ✓ Batch processing
- ✓ Before/after comparison
- ✓ Full validation report

---

### **Option B: Run Detailed Test Script**
```bash
cd g:\college project\proj\backend
python test_log_formatting.py
```

**What you'll see:**
- Raw log input
- Formatted output (exactly what goes to AI)
- Field-by-field transformation summary
- Validation checklist

---

## **Test with Live API (Real Time)**

### **Step 1: Start Backend**
```bash
cd g:\college project\proj\backend
python -m uvicorn app.main:app --reload --port 8000
```

You'll see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### **Step 2: Test Format Endpoint (in another terminal)**

#### **Using PowerShell:**
```powershell
$log = @{
    eventid = "cowrie.session.connect"
    src_ip = "192.168.1.10"
    src_port = 48124
    dst_ip = "127.0.0.1"
    dst_port = 2222
    session = "abc123"
    protocol = "ssh"
    message = "Test connection"
    sensor = "honeypot"
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.ffffffZ")
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://localhost:8000/debug/format-log" `
  -Method POST `
  -ContentType "application/json" `
  -Body @{ log = ($log | ConvertFrom-Json) } | ConvertTo-Json
```

#### **Using curl (if available):**
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
  "raw_log": { ... your input ... },
  "formatted_log": { ... normalized output ... },
  "fields_created": [...],
  "validation": {
    "required_fields_present": true
  }
}
```

---

## **Check Backend Logs During Tests**

When you run tests or API calls, watch the backend terminal for output like:

```
INFO:     REQUEST path=/debug/format-log method=POST status=200 duration_ms=15
DEBUG:    FORMAT_LOG: event_type=cowrie.session.connect src_ip=192.168.1.10 dst_port=2222 timestamp=2026-03-28T00:02:47.076502Z
INFO:     SUBMIT_TO_AI: event_id=evt-123 event_type=cowrie.login.success src_ip=192.168.1.10 protocol=ssh
DEBUG:    AI_PAYLOAD: { "event_id": "evt-123", "log": { ... formatted ... } }
DEBUG:    AI_RESPONSE_DATA: { "event_id": "evt-123", "threat_level": "high", ... }
```

---

## **Common Test Scenarios**

### **1. Test Complete Log (All Fields Present)**
```json
{
  "eventid": "cowrie.session.connect",
  "src_ip": "192.168.1.10",
  "src_port": 48124,
  "dst_ip": "127.0.0.1",
  "dst_port": 2222,
  "session": "c42c656698ae",
  "protocol": "ssh",
  "message": "New connection",
  "sensor": "muath",
  "uuid": "test-uuid",
  "timestamp": "2026-03-28T00:02:47Z"
}
```
**Expected:** All fields preserved, no auto-generation needed

### **2. Test Partial Log (Some Fields Missing)**
```json
{
  "eventid": "cowrie.login.success",
  "src_ip": "192.168.1.10",
  "dst_port": 2222,
  "username": "root",
  "password": "secret"
}
```
**Expected:** 
- Auto-generated: `uuid`, `timestamp`, `session`, `protocol`
- Defaults: `sensor` → "honeypot", `dst_ip` → "127.0.0.1"

### **3. Test Edge Case (Minimal Log)**
```json
{
  "src_ip": "10.0.0.5"
}
```
**Expected:**
- Auto-generates all missing fields
- Provides sensible defaults
- No errors

---

## **What to Verify**

✅ **Timestamp Normalization**
- Input: Any ISO format or datetime object
- Output: ISO format with 'Z' suffix
- Example: `2026-03-28T00:02:47.076502Z`

✅ **IP Address Validation**
- Input: String IP
- Output: Valid IPvAnyAddress format
- Handles missing IPs → defaults to `127.0.0.1`

✅ **UUID Generation**
- Input: Missing uuid field
- Output: Auto-generated UUID v4
- Example: `74eb25f8-2a04-11f1-92a6-080027d0fc5c`

✅ **Metadata Preservation**
- All extra fields from raw log are preserved
- Nothing is lost in transformation
- Clean, consistent structure

---

## **Debugging Output Levels**

The backend logs at different levels:

**INFO** (Normal operations):
```
INFO: FORMAT_LOG: event_type=cowrie.session.connect src_ip=192.168.1.10
INFO: SUBMIT_TO_AI: event_id=evt-123 protocol=ssh
```

**DEBUG** (Detailed inspection):
```
DEBUG: AI_PAYLOAD: { complete JSON payload }
DEBUG: AI_RESPONSE_DATA: { response from AI service }
```

To see DEBUG logs when testing:
```bash
python -m uvicorn app.main:app --log-level debug
```

---

## **End-to-End Flow**

```
RAW LOG (from honeypot)
    ↓
[_format_log_for_ai() function]
    ↓
FORMATTED LOG (standardized schema)
    ↓
[submit_for_scoring() function]
    ↓
AI SERVICE (receives normalized data)
    ↓
AI RESPONSE (with predictions)
    ↓
FRONTEND (displays results)
```

Each stage is independently testable!

---

## **Verify Success Criteria**

Your normalization is working correctly when:

✅ `quick_test.py` shows all tests passing  
✅ `/debug/format-log` endpoint returns formatted logs  
✅ Backend logs show normalized fields  
✅ AI responses include the new fields (src_ip, attack_type, severity, etc.)  
✅ Frontend displays transformed data correctly  

---

## **Troubleshooting**

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: app` | Run from `backend` directory |
| `Connection refused on :8000` | Start backend with `python -m uvicorn app.main:app --reload` |
| `No module named httpx` | Install: `pip install httpx` |
| Debug endpoints not found | Ensure `debug.router` is imported in `main.py` |
| No logs visible | Run with `--log-level debug` |

---

## **Next Steps After Testing**

Once you verify the normalization is working:

1. ✓ **Logs are formatted correctly** → Ready for AI
2. ✓ **Frontend receives real data** → Check History/Analysis modules
3. ✓ **AI responses have new fields** → Stats will update dynamically
4. ✓ **Everything integrated** → System ready for deployment

Congratulations! Your log normalization pipeline is working! 🎉
