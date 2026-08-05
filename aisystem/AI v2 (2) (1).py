import json
import re
import time
import uuid
import threading
import pandas as pd
from sklearn.ensemble import IsolationForest

SUSPICIOUS_CMDS = [
    "wget", "curl", "chmod", "rm", "nc", "bash", "sh",
    "uname", "ls", "pwd", "mkdir", "cd", "python", "perl", "exec"
]

class DynamicAttackTracker:
    def __init__(self, expiry_seconds=10.0, callback_on_ended=None):
        self.expiry_seconds = expiry_seconds
        self.callback_on_ended = callback_on_ended
        self.context_table = {}
        self.lock = threading.Lock()

    def _is_suspicious(self, text):
        text = str(text).lower()
        return any(x in text for x in SUSPICIOUS_CMDS)

    def extract_features_from_logs(self, raw_logs):
        """
        Adaptive Universal Parser:
        Dynamically extracts metrics (connection_count, failed_count, etc.) regardless of 
        the specific JSON keys or plain-text formatting used in the log file.
        """
        rows = []
        
        # 1. Standardize raw input format (JSON lines, JSON arrays, or Syslog strings)
        if isinstance(raw_logs, str):
            for line in raw_logs.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                if line.startswith("{") and line.endswith("}"):
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        continue
                else:
                    # Parse plain text / Syslog lines
                    ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', line)
                    if ip_match:
                        rows.append({
                            "src_ip": ip_match.group(0),
                            "raw_message": line
                        })
        elif isinstance(raw_logs, list):
            rows = raw_logs

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows)

        # 2. Dynamic IP Resolution (Maps src_ip, ip, client_ip, host, remote_addr, etc.)
        ip_candidates = ["src_ip", "ip", "client_ip", "remote_ip", "host", "remote_addr", "source_ip"]
        found_ip_col = next((c for c in ip_candidates if c in df.columns), None)
        
        if found_ip_col:
            df["normalized_ip"] = df[found_ip_col].astype(str)
        else:
            # Search inside text for IP fallback
            df["normalized_ip"] = df.apply(
                lambda r: next((re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', str(v)).group(0) 
                                for v in r.values if re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', str(v))), "127.0.0.1"), 
                axis=1
            )

        extracted = []
        grouped = df.groupby("normalized_ip")

        for ip, group in grouped:
            if not ip or ip == "nan" or ip == "":
                continue

            # 3. Dynamic Field Mapping & Explicit Metric Discovery
            # Extract explicitly defined numeric fields if present (e.g., custom JSONs with pre-computed counts)
            explicit_conns = 0
            for col in ["connection_count", "connections", "conn_count", "requests", "total_requests"]:
                if col in group.columns:
                    explicit_conns += pd.to_numeric(group[col], errors="coerce").fillna(0).sum()

            explicit_fails = 0
            for col in ["failed_count", "failed_attempts", "fail_count", "errors"]:
                if col in group.columns:
                    explicit_fails += pd.to_numeric(group[col], errors="coerce").fillna(0).sum()

            explicit_succ = 0
            for col in ["success_count", "successful_logins", "success_cnt"]:
                if col in group.columns:
                    explicit_succ += pd.to_numeric(group[col], errors="coerce").fillna(0).sum()

            # 4. Content Pattern Recognition (Fallback / Augment for event-driven logs)
            combined_rows = group.apply(lambda r: " ".join(r.astype(str)), axis=1).str.lower()

            pattern_conns = combined_rows.str.contains(r'connect|session|accepted|get|post|request|handshake|init', regex=True).sum()
            pattern_fails = combined_rows.str.contains(r'fail|invalid|unauthorized|denied|401|403|reject|wrong', regex=True).sum()
            pattern_succ = combined_rows.str.contains(r'success|accepted|authenticated|200|login.success|pass', regex=True).sum()

            # Adaptively pick the highest detected count between explicit fields and text patterns
            total_conns = int(max(explicit_conns, pattern_conns, len(group)))
            total_fails = int(max(explicit_fails, pattern_fails))
            total_succ = int(max(explicit_succ, pattern_succ))

            # 5. Command & Payload Metric Adaptation
            cmd_c = 0
            susp_c = 0
            for text_val in combined_rows:
                if self._is_suspicious(text_val):
                    susp_c += 1
                if any(k in text_val for k in ["command", "cmd", "input", "exec", "terminal", "shell"]):
                    cmd_c += 1

            # Dynamic password variation extraction across all potential credential columns
            pwd_values = set()
            pwd_cols = [c for c in group.columns if any(k in c.lower() for k in ["pass", "pwd", "auth", "secret"])]
            for pcol in pwd_cols:
                valid_pwds = group[pcol].dropna().astype(str)
                pwd_values.update([p for p in valid_pwds if p.strip() and p.lower() != "nan"])
            
            uniq_pwd = len(pwd_values)

            extracted.append({
                "src_ip": ip,
                "connection_count": total_conns,
                "success_count": total_succ,
                "failed_count": total_fails,
                "unique_passwords": uniq_pwd,
                "command_count": cmd_c,
                "suspicious_commands": susp_c
            })

        return pd.DataFrame(extracted)

    def classify_attack_type(self, row):
        conn = row["connection_count"]
        failed = row["failed_count"]
        success = row["success_count"]
        cmds = row["command_count"]

        if conn >= 8 and failed == 0 and success == 0 and cmds == 0:
            return "DDoS"

        if conn > cmds and failed == 0 and success == 0:
            return "DDoS"

        return "Brute Force"

    def calculate_severity(self, row, ongoing_duration=0.0):
        score = 0
        score += row["connection_count"] * 1.5
        score += row["failed_count"] * 2.5
        score += row["success_count"] * 4.0
        score += row["unique_passwords"] * 3.0
        score += row["suspicious_commands"] * 5.0

        if ongoing_duration > 7.0:
            score *= 1.5
        elif ongoing_duration > 4.0:
            score *= 1.2

        if score >= 35:
            return "Extreme"
        elif score >= 20:
            return "High"
        elif score >= 10:
            return "Medium"
        elif score >= 4:
            return "Mild"
        else:
            return "Low"

    def process_incoming_logs(self, raw_logs):
        df_features = self.extract_features_from_logs(raw_logs)
        if df_features.empty:
            return []

        if len(df_features) >= 3:
            num_cols = ["connection_count", "success_count", "failed_count", 
                        "unique_passwords", "command_count", "suspicious_commands"]
            iso = IsolationForest(contamination=0.3, random_state=42)
            df_features["anomaly"] = iso.fit_predict(df_features[num_cols])
        else:
            df_features["anomaly"] = 1

        output_records = []
        now = time.time()

        with self.lock:
            for _, row in df_features.iterrows():
                ip = row["src_ip"]
                a_type = self.classify_attack_type(row)
                context_key = (ip, a_type)

                if context_key in self.context_table:
                    ctx = self.context_table[context_key]
                    status = "ongoing"
                    ctx["last_seen"] = now
                    
                    # Accumulate metrics across log batches dynamically
                    ctx["connection_count"] += row["connection_count"]
                    ctx["success_count"] += row["success_count"]
                    ctx["failed_count"] += row["failed_count"]
                    ctx["unique_passwords"] = max(ctx["unique_passwords"], row["unique_passwords"])
                    ctx["command_count"] += row["command_count"]
                    ctx["suspicious_commands"] += row["suspicious_commands"]

                    duration = now - ctx["start_time"]
                    sev = self.calculate_severity(ctx, ongoing_duration=duration)
                    ctx["severity"] = sev
                    ctx["status"] = status
                else:
                    status = "new"
                    duration = 0.0
                    sev = self.calculate_severity(row, ongoing_duration=duration)
                    
                    ctx = {
                        "attack_id": str(uuid.uuid4()),
                        "src_ip": ip,
                        "attack_type": a_type,
                        "status": "ongoing",
                        "severity": sev,
                        "connection_count": int(row["connection_count"]),
                        "success_count": int(row["success_count"]),
                        "failed_count": int(row["failed_count"]),
                        "unique_passwords": int(row["unique_passwords"]),
                        "command_count": int(row["command_count"]),
                        "suspicious_commands": int(row["suspicious_commands"]),
                        "start_time": now,
                        "last_seen": now
                    }
                    self.context_table[context_key] = ctx

                out_payload = {
                    "attack_id": ctx["attack_id"],
                    "src_ip": ctx["src_ip"],
                    "attack": "Attack",
                    "attack_type": ctx["attack_type"],
                    "attack_status": status,
                    "severity": ctx["severity"],
                    "connection_count": ctx["connection_count"],
                    "success_count": ctx["success_count"],
                    "failed_count": ctx["failed_count"],
                    "unique_passwords": ctx["unique_passwords"],
                    "command_count": ctx["command_count"],
                    "suspicious_commands": ctx["suspicious_commands"],
                    "duration_seconds": round(now - ctx["start_time"], 2)
                }
                output_records.append(out_payload)

            threading.Thread(target=self._check_attack_expirations, daemon=True).start()

        return output_records

    def _check_attack_expirations(self):
        time.sleep(self.expiry_seconds + 0.5)
        now = time.time()
        
        with self.lock:
            for key, ctx in list(self.context_table.items()):
                if ctx["status"] == "ongoing" and (now - ctx["last_seen"]) >= self.expiry_seconds:
                    ctx["status"] = "ended"
                    
                    ended_payload = {
                        "attack_id": ctx["attack_id"],
                        "src_ip": ctx["src_ip"],
                        "attack": "Attack",
                        "attack_type": ctx["attack_type"],
                        "attack_status": "ended",
                        "severity": ctx["severity"],
                        "connection_count": ctx["connection_count"],
                        "success_count": ctx["success_count"],
                        "failed_count": ctx["failed_count"],
                        "unique_passwords": ctx["unique_passwords"],
                        "command_count": ctx["command_count"],
                        "suspicious_commands": ctx["suspicious_commands"],
                        "signal": "STOP_SENDING_LOGS"
                    }
                    
                    if self.callback_on_ended:
                        self.callback_on_ended(ended_payload)