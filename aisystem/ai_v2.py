import json
import re
import time
import uuid
import threading
import pandas as pd
from sklearn.ensemble import IsolationForest

# Word-boundary safe suspicious command markers to prevent partial matches (e.g., 'ssh' matching 'sh')
SUSPICIOUS_PATTERN = r'\b(?:wget|curl|chmod|rm|nc|bash|sh|uname|ls|pwd|mkdir|cd|python|perl|exec)\b'

class DynamicAttackTracker:
    def __init__(self, expiry_seconds=10.0, callback_on_ended=None):
        self.expiry_seconds = expiry_seconds
        self.callback_on_ended = callback_on_ended
        self.context_table = {}
        self.lock = threading.Lock()

    def _is_suspicious(self, text):
        text = str(text).lower()
        return bool(re.search(SUSPICIOUS_PATTERN, text))

    def extract_features_from_logs(self, raw_logs):
        """
        Adaptive Universal Parser:
        Dynamically extracts metrics using eventid and real command extraction across JSON,
        Syslog, Cowrie, and Web log formats.
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

        # 2. Dynamic IP Resolution
        ip_candidates = ["src_ip", "ip", "client_ip", "remote_ip", "host", "remote_addr", "source_ip"]
        found_ip_col = next((c for c in ip_candidates if c in df.columns), None)
        
        if found_ip_col:
            df["normalized_ip"] = df[found_ip_col].astype(str)
        else:
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

            # Explicit numeric field fallbacks
            explicit_conns = 0
            for col in ["connection_count", "connections", "conn_count", "requests", "total_requests"]:
                if col in group.columns:
                    explicit_conns += pd.to_numeric(group[col], errors="coerce").fillna(0).sum()

            # Build commands_list first to enable accurate command and suspicious counting
            commands_list = []
            cmd_cols = [c for c in group.columns if any(k in c.lower() for k in ["command", "cmd", "input", "exec", "terminal", "shell", "line"])]
            for ccol in cmd_cols:
                valid_cmds = group[ccol].dropna().astype(str)
                commands_list.extend([c for c in valid_cmds if c.strip() and c.lower() != "nan"])
            
            # Check raw_message or message fields for command inputs if needed
            if not commands_list and "raw_message" in group.columns:
                for msg in group["raw_message"].dropna().astype(str):
                    if "command.input" in str(group.get("eventid", "")).lower() or "cmd" in msg.lower():
                        commands_list.append(msg)

            # Event ID based accurate counting
            eventid = group["eventid"].astype(str).str.lower() if "eventid" in group.columns else pd.Series([], dtype=str)

            total_conns = int(eventid.str.contains("session.connect", na=False).sum())
            if total_conns == 0:
                if eventid.str.startswith("cowrie.", na=False).any():
                    total_conns = int(explicit_conns)
                else:
                    total_conns = int(max(explicit_conns, len(group)))

            total_succ = int(eventid.str.contains("login.success", na=False).sum())
            total_fails = int(eventid.str.contains("login.failed", na=False).sum())

            # Command and suspicious counts derived from actual command strings
            cmd_c = len(commands_list)
            susp_c = sum(1 for c in commands_list if self._is_suspicious(str(c)))

            # Dynamic password variation extraction
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
        """
        Refactored Binary Classification Logic (Brute Force vs DDoS):
        - Brute Force: Any authentication activity detected (failed_count >= 1 OR unique_passwords >= 1 OR success_count >= 1).
        - DDoS: High connection volume without auth activity (connection_count >= 5 AND failed_count == 0 AND unique_passwords == 0 AND success_count == 0).
        - Default Fallback: Low-volume probe noise without auth activity (connection_count < 5) defaults to DDoS.
        """
        failed = row.get("failed_count", 0)
        success = row.get("success_count", 0)
        conn = row.get("connection_count", 0)
        unique_passwords = row.get("unique_passwords", 0)

        # 1. Brute Force Rule
        if failed >= 1 or unique_passwords >= 1 or success >= 1:
            return "Brute Force"

        # 2. DDoS Rule & Default Fallback
        if conn >= 5 and failed == 0 and unique_passwords == 0 and success == 0:
            return "DDoS"

        return "DDoS"

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
                
                # Check if an existing context already exists for this IP regardless of type to prevent splitting/flipping
                existing_ctx = None
                existing_key = None
                for key, ctx in self.context_table.items():
                    if key[0] == ip and ctx["status"] == "ongoing":
                        existing_ctx = ctx
                        existing_key = key
                        break

                if existing_ctx:
                    ctx = existing_ctx
                    status = "ongoing"
                    ctx["last_seen"] = now
                    
                    # Accumulate metrics across log batches dynamically
                    ctx["connection_count"] += row["connection_count"]
                    ctx["success_count"] += row["success_count"]
                    ctx["failed_count"] += row["failed_count"]
                    ctx["unique_passwords"] += int(row["unique_passwords"])
                    ctx["command_count"] += row["command_count"]
                    ctx["suspicious_commands"] += row["suspicious_commands"]

                    duration = now - ctx["start_time"]
                    sev = self.calculate_severity(ctx, ongoing_duration=duration)
                    ctx["severity"] = sev
                    ctx["status"] = status
                else:
                    # Classify only once on session creation using aggregated initial row metrics
                    a_type = self.classify_attack_type(row)
                    context_key = (ip, a_type)
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
                    self.context_table.pop(key, None)