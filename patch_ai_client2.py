import os

ai_path = "/root/honeypotai-system/backend/app/services/ai_client.py"
with open(ai_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """        summary=f"{at_type} attack detected from {src_ip}",
        details={"""

replacement = """        summary=f"{at_type} attack detected from {src_ip}",
        severity=sev,
        attack_type=at_type,
        details={"""

if target in content:
    content = content.replace(target, replacement)
    with open(ai_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched ai_client.py successfully")
else:
    print("Target not found in ai_client.py")
