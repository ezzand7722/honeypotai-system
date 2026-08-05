import os

rep_path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(rep_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """        pipeline_id = record.get("pipeline_id") or "unknown_pipeline"
        group_key = f"{src_ip}|{pipeline_id}"

        if group_key not in groups:"""

replacement = """        pipeline_id = record.get("pipeline_id") or "unknown_pipeline"
        group_key = f"{src_ip}|{attack_type}|{pipeline_id}"

        if group_key not in groups:"""

if target in content:
    content = content.replace(target, replacement)
    with open(rep_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched reporting.py grouping successfully")
else:
    print("Target not found in reporting.py")
