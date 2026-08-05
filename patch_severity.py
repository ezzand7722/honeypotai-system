import os

rep_path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(rep_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """            if prediction.severity:
                severity = prediction.severity"""

replacement = """            if prediction.severity:
                severity = prediction.severity
            elif details.get("severity"):
                severity = details.get("severity").lower()"""

if target in content:
    content = content.replace(target, replacement)
    with open(rep_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched reporting.py successfully")
else:
    print("Target not found in reporting.py")
