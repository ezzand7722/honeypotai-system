import os

path = "/root/honeypotai-system/backend/app/services/ai_client.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the _build_prediction default fallback
target = """    if not result:
        # Default prediction if IP not found
        result = {"attack_type": "Brute Force", "severity": "Low"}"""

replacement = """    if not result:
        return None"""

content = content.replace(target, replacement)

# We must also handle if _build_prediction returns None when calling attach_prediction
target_2 = """                    prediction = _build_prediction(event.event_id, formatted_log, result, pipeline_info)
                    attach_prediction(event.event_id, prediction)"""

replacement_2 = """                    prediction = _build_prediction(event.event_id, formatted_log, result, pipeline_info)
                    if prediction:
                        attach_prediction(event.event_id, prediction)"""

content = content.replace(target_2, replacement_2)

target_3 = """    prediction = _build_prediction(event.event_id, formatted_log, result)
    attach_prediction(event.event_id, prediction)"""

replacement_3 = """    prediction = _build_prediction(event.event_id, formatted_log, result)
    if prediction:
        attach_prediction(event.event_id, prediction)"""
        
content = content.replace(target_3, replacement_3)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied to ai_client.py")
