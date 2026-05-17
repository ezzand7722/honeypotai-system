import json
import pandas as pd

INPUT_FILE = "dahua_logs_multi.json"
OUTPUT_FILE = "attack_results.json"

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

grouped = grouped[
    [
        "src_ip",
        "attack",
        "attack_type",
        "severity",
        "instance_count",
        "first_seen",
        "last_seen",
        "time_frame_minutes",
        "status"
    ]
]

grouped.to_json(OUTPUT_FILE, orient="records", indent=2, date_format="iso")

print("=== ACCUMULATED ATTACK RESULTS ===")
print(grouped)
print("Saved to attack_results.json")
