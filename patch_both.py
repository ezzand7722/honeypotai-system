import os

# 1. Patch ai_client.py
ai_path = "/root/honeypotai-system/backend/app/services/ai_client.py"
with open(ai_path, "r", encoding="utf-8") as f:
    content = f.read()

target_ai = """        labels=labels,
        summary=f"{at_type} attack detected from {src_ip}",
        details=result,"""

replacement_ai = """        labels=labels,
        summary=f"{at_type} attack detected from {src_ip}",
        details=result,
        severity=sev,
        attack_type=at_type,"""

if target_ai in content:
    content = content.replace(target_ai, replacement_ai)
    with open(ai_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched ai_client.py")
else:
    print("Failed to patch ai_client.py (target not found)")


# 2. Patch reporting.py
rep_path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(rep_path, "r", encoding="utf-8") as f:
    content2 = f.read()

target_rep = """    for record in snapshot:
        prediction = record.get("prediction")
        if not prediction:
            continue

        event = record["event"]"""

replacement_rep = """    for record in snapshot:
        prediction = record.get("prediction")
        if not prediction:
            continue
            
        details = prediction.details or {}
        if not details.get("attack_id"):
            continue

        event = record["event"]"""

if target_rep in content2:
    content2 = content2.replace(target_rep, replacement_rep)
    with open(rep_path, "w", encoding="utf-8") as f:
        f.write(content2)
    print("Patched reporting.py")
else:
    print("Failed to patch reporting.py (target not found)")

