from app.services.ai_client import ATTACK_RESULTS
import os

print("PATH:", ATTACK_RESULTS)
print("EXISTS:", os.path.exists(ATTACK_RESULTS))
if os.path.exists(ATTACK_RESULTS):
    print("SIZE:", os.path.getsize(ATTACK_RESULTS))
    with open(ATTACK_RESULTS, "r") as f:
        print("CONTENT PREVIEW:", f.read(100))
