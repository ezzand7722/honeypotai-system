import os

rep_path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(rep_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """                "id": f"AGG-{src_ip}-{pipeline_id}","""
replacement = """                "id": f"AGG-{src_ip}-{attack_type.replace(' ', '_')}-{pipeline_id}","""

if target in content:
    content = content.replace(target, replacement)
    with open(rep_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched reporting.py id generation successfully")
else:
    print("Target not found in reporting.py")
