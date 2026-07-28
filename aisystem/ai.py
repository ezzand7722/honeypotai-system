import json
import os
from collections import defaultdict
from datetime import datetime, timedelta

INPUT_FILE = "dahua_logs_multi.json"
OUTPUT_FILE = os.environ.get("ATTACK_RESULTS_FILE", "attack_results.json")

def detect_attack_type(eventid):
    event = str(eventid)
    if "login.failed" in event or "login.success" in event:
        return "Brute Force"
    if "session.connect" in event:
        return "DDoS"
    return "Unknown"

rows = []
try:
    with open(INPUT_FILE, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith("{"): continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
except FileNotFoundError:
    pass

if not rows:
    print("No logs found.")
    exit()

# Deduplicate rows by taking the first seen for identical string representations
seen_rows = set()
unique_rows = []
for row in rows:
    cols_to_keep = ["src_ip", "eventid", "timestamp", "username", "password", "input", "protocol"]
    filtered_row = {col: row.get(col, "") for col in cols_to_keep}
    
    row_str = json.dumps(filtered_row, sort_keys=True)
    if row_str not in seen_rows:
        seen_rows.add(row_str)
        unique_rows.append(filtered_row)

# Group by src_ip and attack_type
groups = defaultdict(lambda: {"instance_count": 0, "first_seen": None, "last_seen": None})

for row in unique_rows:
    attack_type = detect_attack_type(row["eventid"])
    if attack_type == "Unknown": continue
    
    src_ip = row["src_ip"]
    ts_str = row["timestamp"]
    if not ts_str: continue
    
    # Simple parse attempt
    try:
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except Exception:
        try:
            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            continue
            
    group = groups[(src_ip, attack_type)]
    group["instance_count"] += 1
    if group["first_seen"] is None or ts < group["first_seen"]:
        group["first_seen"] = ts
    if group["last_seen"] is None or ts > group["last_seen"]:
        group["last_seen"] = ts

grouped_results = []
for (src_ip, attack_type), stats in groups.items():
    if stats["first_seen"] is None or stats["last_seen"] is None:
        continue
    
    time_frame_minutes = (stats["last_seen"] - stats["first_seen"]).total_seconds() / 60
    
    count = stats["instance_count"]
    minutes = time_frame_minutes if time_frame_minutes > 0 else 1
    rate = count / minutes
    
    if count >= 10 or rate >= 5:
        severity = "High"
    elif count >= 5 or rate >= 2:
        severity = "Medium"
    else:
        severity = "Low"
        
    grouped_results.append({
        "attack_id": "", # filled later
        "src_ip": src_ip,
        "attack": "Attack",
        "attack_type": attack_type,
        "severity": severity,
        "instance_count": count,
        "first_seen": stats["first_seen"].isoformat(),
        "last_seen": stats["last_seen"].isoformat(),
        "time_frame_minutes": time_frame_minutes,
        "detection_time": "", # filled later
        "status": "Detected"
    })

# Pipeline generation
STAGE_OFFSETS = [
    ("LOG_RECEIVED", "Logs received from Honeypot", 0),
    ("DATA_CLEANED", "Invalid records removed", 1),
    ("FEATURES_EXTRACTED", "Features generated", 0),
    ("AI_ANALYSIS_STARTED", "Attack analysis started", 1),
    ("ATTACK_DETECTED", None, 0),
    ("SEVERITY_ASSIGNED", None, 0),
    ("RESULT_SENT", "Dashboard updated", 1),
]

def build_pipeline(start_time, attack_type, severity):
    pipeline = []
    t = start_time
    detection_time_str = None
    for stage, message, delta_seconds in STAGE_OFFSETS:
        t = t + timedelta(seconds=delta_seconds)
        if stage == "ATTACK_DETECTED":
            message = f"{attack_type} detected"
            detection_time_str = t.strftime("%H:%M:%S")
        elif stage == "SEVERITY_ASSIGNED":
            message = f"Severity = {severity}"
        pipeline.append({
            "time": t.strftime("%H:%M:%S"),
            "event": stage,
            "message": message
        })
    return pipeline, detection_time_str

run_start = datetime.now()

for i, row in enumerate(grouped_results):
    row_start = run_start + timedelta(seconds=i * 2)
    pipeline, detection_time = build_pipeline(row_start, row["attack_type"], row["severity"])
    
    row["attack_id"] = f"ATT-{i + 1:03d}"
    row["detection_time"] = detection_time
    row["pipeline"] = pipeline

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(grouped_results, f, indent=2)

print("=== ACCUMULATED ATTACK RESULTS ===")
for r in grouped_results:
    display_row = {k: v for k, v in r.items() if k != "pipeline"}
    print(display_row)
print("Saved to", OUTPUT_FILE)
