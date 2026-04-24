import json

input_file = "dahua_logs.json"
output_file = "dahua_logs_multi.json"

rows = []

with open(input_file, "r", encoding="utf-8", errors="ignore") as f:
    original = []
    for line in f:
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            original.append(json.loads(line))
        except:
            continue

for obj in original:
    event = obj.get("eventid", "")

    # =========================
    # النتائج السابقة
    # =========================

    # 192.168.1.10 -> Brute Force
    if "login.failed" in event or "login.success" in event or "session.connect" in event:
        x = obj.copy()
        x["src_ip"] = "192.168.1.10"
        rows.append(x)

    # 192.168.1.20 -> Brute Force
    if "login.failed" in event or "session.connect" in event:
        x = obj.copy()
        x["src_ip"] = "192.168.1.20"
        rows.append(x)

    # 10.0.0.5 -> DDoS
    if "session.connect" in event or "session.closed" in event:
        x = obj.copy()
        x["src_ip"] = "10.0.0.5"
        rows.append(x)

    # 10.0.0.8 -> DDoS أقوى
    if "session.connect" in event:
        x = obj.copy()
        x["src_ip"] = "10.0.0.8"
        rows.append(x)
        rows.append(x.copy())
        rows.append(x.copy())

    # =========================
    # الإضافة الجديدة: Loopback IPs
    # =========================

    # 127.0.0.1 -> Loopback Brute Force
    if "login.failed" in event or "login.success" in event or "session.connect" in event:
        x = obj.copy()
        x["src_ip"] = "127.0.0.1"
        rows.append(x)

    # 127.0.0.2 -> Loopback DDoS
    if "session.connect" in event or "session.closed" in event:
        x = obj.copy()
        x["src_ip"] = "127.0.0.2"
        rows.append(x)
        rows.append(x.copy())
        rows.append(x.copy())

with open(output_file, "w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row) + "\n")

print("Generated dataset with previous IPs + loopback Brute Force + loopback DDoS")
