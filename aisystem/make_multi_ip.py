import json

input_file = "dahua_logs.json"
output_file = "dahua_logs_multi.json"

rows = []

with open(input_file, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()

        if not line or not line.startswith("{"):
            continue

        try:
            obj = json.loads(line)
        except:
            continue

        event = obj.get("eventid", "")

        # 127.0.0.1 -> Brute Force only
        if "login.failed" in event or "login.success" in event or "session.connect" in event:
            x = obj.copy()
            x["src_ip"] = "127.0.0.1"
            rows.append(x)

        # 127.0.0.2 -> DDoS only
        if "session.connect" in event:
            x = obj.copy()
            x["src_ip"] = "127.0.0.2"
            rows.append(x)

        # Normal / other test IPs
        if "session.connect" in event:
            x = obj.copy()
            x["src_ip"] = "10.0.0.5"
            rows.append(x)

with open(output_file, "w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row) + "\n")

print("Generated clean multi-IP log file without unnecessary duplicate appends.")
