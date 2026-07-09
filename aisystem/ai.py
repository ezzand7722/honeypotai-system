import json
from datetime import datetime, timedelta
import pandas as pd
import os

INPUT_FILE = "dahua_logs_multi.json"
OUTPUT_FILE = os.environ.get("ATTACK_RESULTS_FILE", "attack_results.json")

rows = []
with open(INPUT_FILE, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            rows.append(json.loads(line))
        except:
            continue

data = pd.DataFrame(rows)
if data.empty:
    print("No logs found.")
    exit()

for col in ["src_ip", "eventid", "timestamp", "username", "password", "input", "protocol"]:
    if col not in data.columns:
        data[col] = ""

data = data.fillna("")
data = data.drop_duplicates()
data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")


def detect_attack_type(row):
    event = str(row["eventid"])
    if "login.failed" in event or "login.success" in event:
        return "Brute Force"
    if "session.connect" in event:
        return "DDoS"
    return "Unknown"


data["attack_type"] = data.apply(detect_attack_type, axis=1)
data = data[data["attack_type"] != "Unknown"]

grouped = data.groupby(["src_ip", "attack_type"]).agg(
    instance_count=("eventid", "count"),
    first_seen=("timestamp", "min"),
    last_seen=("timestamp", "max")
).reset_index()

grouped["time_frame_minutes"] = (
    grouped["last_seen"] - grouped["first_seen"]
).dt.total_seconds() / 60


def calculate_severity(row):
    count = row["instance_count"]
    minutes = row["time_frame_minutes"]
    if minutes <= 0:
        minutes = 1
    rate = count / minutes
    if count >= 10 or rate >= 5:
        return "High"
    elif count >= 5 or rate >= 2:
        return "Medium"
    else:
        return "Low"


grouped["severity"] = grouped.apply(calculate_severity, axis=1)
grouped["attack"] = "Attack"
grouped["status"] = "Detected"

# ---------------------------------------------------------------------------
# Pipeline / processing trail generation
# ---------------------------------------------------------------------------
# Each detected attack gets its own simulated processing timeline, matching
# the stage sequence and second-by-second cadence used on the dashboard:
#   LOG_RECEIVED -> DATA_CLEANED -> FEATURES_EXTRACTED -> AI_ANALYSIS_STARTED
#   -> ATTACK_DETECTED -> SEVERITY_ASSIGNED -> RESULT_SENT
#
# Stage offsets (seconds added *before* that stage's timestamp is recorded):
STAGE_OFFSETS = [
    ("LOG_RECEIVED", "Logs received from Honeypot", 0),
    ("DATA_CLEANED", "Invalid records removed", 1),
    ("FEATURES_EXTRACTED", "Features generated", 0),
    ("AI_ANALYSIS_STARTED", "Attack analysis started", 1),
    ("ATTACK_DETECTED", None, 0),          # message filled in per-row below
    ("SEVERITY_ASSIGNED", None, 0),        # message filled in per-row below
    ("RESULT_SENT", "Dashboard updated", 1),
]


def build_pipeline(start_time, attack_type, severity):
    """Return (pipeline_list, detection_time_str) for one attack row."""
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


# One shared "run" start time so all attacks in this batch look like they
# came from the same processing pass (bump by a couple seconds per row so
# timestamps don't collide if you show them all at once).
run_start = datetime.now()

attack_ids = []
detection_times = []
pipelines = []

for i, row in grouped.reset_index(drop=True).iterrows():
    row_start = run_start + timedelta(seconds=i * 2)
    pipeline, detection_time = build_pipeline(row_start, row["attack_type"], row["severity"])
    attack_ids.append(f"ATT-{i + 1:03d}")
    detection_times.append(detection_time)
    pipelines.append(pipeline)

grouped["attack_id"] = attack_ids
grouped["detection_time"] = detection_times
grouped["pipeline"] = pipelines

grouped = grouped[
    [
        "attack_id",
        "src_ip",
        "attack",
        "attack_type",
        "severity",
        "instance_count",
        "first_seen",
        "last_seen",
        "time_frame_minutes",
        "detection_time",
        "status",
        "pipeline",
    ]
]

grouped.to_json(OUTPUT_FILE, orient="records", indent=2, date_format="iso")

print("=== ACCUMULATED ATTACK RESULTS ===")
print(grouped.drop(columns=["pipeline"]))
print("Saved to attack_results.json")
