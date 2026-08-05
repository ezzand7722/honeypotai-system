import os

path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target = """    for record in snapshot:
        event = record["event"]
        prediction = record.get("prediction")
        received_at: datetime = record.get("received_at") or datetime.utcnow()"""

replacement = """    for record in snapshot:
        prediction = record.get("prediction")
        if not prediction:
            continue

        event = record["event"]
        received_at: datetime = record.get("received_at") or datetime.utcnow()"""

content = content.replace(target, replacement)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied to reporting.py")
