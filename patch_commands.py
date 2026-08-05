import os

rep_path = "/root/honeypotai-system/backend/app/services/reporting.py"
with open(rep_path, "r", encoding="utf-8") as f:
    content = f.read()

target1 = """    unique_passwords: set[str] = set()
    command_count = 0
    suspicious_commands = 0"""

replacement1 = """    unique_passwords: set[str] = set()
    command_count = 0
    suspicious_commands = 0
    commands_used: set[str] = set()"""

target2 = """            if cmd_str:
                command_count += 1
                cmd_l = cmd_str.lower()"""

replacement2 = """            if cmd_str:
                command_count += 1
                commands_used.add(cmd_str)
                cmd_l = cmd_str.lower()"""

target3 = """    return {
        "connection_count": connection_count,"""

replacement3 = """    return {
        "commands_used": list(commands_used),
        "connection_count": connection_count,"""

if target1 in content:
    content = content.replace(target1, replacement1)
if target2 in content:
    content = content.replace(target2, replacement2)
if target3 in content:
    content = content.replace(target3, replacement3)

with open(rep_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched reporting.py with commands_used successfully")
