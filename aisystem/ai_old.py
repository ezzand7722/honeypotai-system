import json
import pandas as pd
from sklearn.ensemble import IsolationForest

# ===== 1) قراءة الملف =====
rows = []

with open("dahua_logs_multi.json", "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        if not line.startswith("{"):
            continue
        try:
            rows.append(json.loads(line))
        except:
            continue

data = pd.DataFrame(rows)

print("Loaded rows:", len(data))

# ===== 2) تجهيز الأعمدة =====
for col in ["src_ip", "eventid", "protocol", "username", "password", "input", "timestamp"]:
    if col not in data.columns:
        data[col] = ""

data = data.fillna("")

# ===== 3) تقسيم الأحداث =====
login_success = data[data["eventid"].str.contains("login.success", na=False)].copy()
login_failed  = data[data["eventid"].str.contains("login.failed", na=False)].copy()
commands      = data[data["eventid"].str.contains("command.input", na=False)].copy()
connections   = data[data["eventid"].str.contains("session.connect", na=False)].copy()

# ===== 4) كشف الأوامر المشبوهة =====
suspicious_cmds = [
    "wget", "curl", "chmod", "rm", "nc", "bash", "sh",
    "uname", "ls", "pwd", "mkdir", "cd"
]

def is_suspicious(cmd):
    cmd = str(cmd).lower()
    return any(x in cmd for x in suspicious_cmds)

commands["is_suspicious"] = commands["input"].apply(is_suspicious)

# ===== 5) استخراج Features لكل IP =====
all_ips = pd.Series(data["src_ip"].unique(), name="src_ip")
features = pd.DataFrame({"src_ip": all_ips})

success_counts = login_success.groupby("src_ip").size().rename("success_count")
failed_counts = login_failed.groupby("src_ip").size().rename("failed_count")
command_counts = commands.groupby("src_ip").size().rename("command_count")
suspicious_counts = commands.groupby("src_ip")["is_suspicious"].sum().rename("suspicious_commands")
connection_counts = connections.groupby("src_ip").size().rename("connection_count")
password_counts = pd.concat([login_success, login_failed]).groupby("src_ip")["password"].nunique().rename("unique_passwords")

features = features.merge(success_counts, on="src_ip", how="left")
features = features.merge(failed_counts, on="src_ip", how="left")
features = features.merge(command_counts, on="src_ip", how="left")
features = features.merge(suspicious_counts, on="src_ip", how="left")
features = features.merge(connection_counts, on="src_ip", how="left")
features = features.merge(password_counts, on="src_ip", how="left")

features = features.fillna(0)

numeric_cols = [
    "success_count",
    "failed_count",
    "command_count",
    "suspicious_commands",
    "connection_count",
    "unique_passwords"
]

features[numeric_cols] = features[numeric_cols].astype(int)

# ===== 6) AI Model =====
if len(features) >= 3:
    model = IsolationForest(contamination=0.4, random_state=42)
    model.fit(features[numeric_cols])
    features["anomaly"] = model.predict(features[numeric_cols])
else:
    features["anomaly"] = 1

# ===== 7) نوع الهجوم: فقط Brute Force أو DDoS =====
def attack_type(row):
    # DDoS: اتصالات كثيرة + لا يوجد login تقريبا + لا يوجد commands
    if row["connection_count"] >= 10 and row["failed_count"] == 0 and row["success_count"] == 0 and row["command_count"] == 0:
        return "DDoS"

    # Brute Force: يوجد login attempts أو كلمات مرور متعددة
    if row["failed_count"] >= 1 or row["success_count"] >= 1 or row["unique_passwords"] >= 2:
        return "Brute Force"

    # fallback
    if row["connection_count"] > row["command_count"]:
        return "DDoS"

    return "Brute Force"

features["attack_type"] = features.apply(attack_type, axis=1)

# ===== 8) Attack label =====
features["attack"] = "Attack"

# ===== 9) تحديد الخطورة =====
def severity(row):
    if row["attack_type"] == "DDoS":
        if row["connection_count"] >= 20:
            return "High"
        elif row["connection_count"] >= 10:
            return "Medium"
        else:
            return "Low"

    if row["attack_type"] == "Brute Force":
        score = 0
        score += row["failed_count"] * 2
        score += row["success_count"] * 3
        score += row["unique_passwords"] * 2

        if score >= 8:
            return "High"
        elif score >= 4:
            return "Medium"
        else:
            return "Low"

    return "Low"

features["severity"] = features.apply(severity, axis=1)

# ===== 10) ترتيب الأعمدة =====
features = features[
    [
        "src_ip",
        "connection_count",
        "success_count",
        "failed_count",
        "unique_passwords",
        "command_count",
        "suspicious_commands",
        "attack",
        "attack_type",
        "severity"
    ]
]

# ===== 11) حفظ النتائج =====
features.to_json("attack_results.json", orient="records", indent=2)

print("\n=== DONE ===")
print(features)
print("\nSaved to attack_results.json")
