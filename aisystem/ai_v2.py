import json
import re
import time
import uuid
import threading
import pandas as pd
from sklearn.ensemble import IsolationForest

# Word-boundary safe suspicious command markers to prevent partial matches (e.g., 'ssh' matching 'sh')
SUSPICIOUS_PATTERN = r'\b(?:wget|curl|chmod|rm|nc|bash|sh|uname|ls|pwd|mkdir|cd|python|perl|exec)\b'


def _command_from_row(row):
    """Extract the actual typed command string from a raw/formatted log row."""
    if not isinstance(row, dict):
        return None
    cmd = row.get("input")
    if not isinstance(cmd, str):
        cmd = None
    if not cmd:
        md = row.get("metadata")
        if isinstance(md, dict):
            c = md.get("input") or md.get("command")
            cmd = c if isinstance(c, str) else None
    if not cmd:
        return None
    cmd = cmd.strip()
    return cmd if cmd and cmd.lower() != "nan" else None


def _as_int(value):
    try:
        if value is None:
            return None
        f = float(value)
        if f != f:
            return None
        return int(f)
    except Exception:
        return None


def _merge_commands(existing, new):
    """Accumulate command strings, preserving order and keeping a sane cap."""
    merged = list(existing or [])
    merged.extend(new or [])
    return merged[-500:]


class DynamicAttackTracker:
    def __init__(self, expiry_seconds=10.0, callback_on_ended=None, db_lookup_callback=None):
        self.expiry_seconds = expiry_seconds
        self.callback_on_ended = callback_on_ended
        self.db_lookup_callback = db_lookup_callback
        self.context_table = {}
        self.lock = threading.Lock()

    def _is_suspicious(self, text):
        text = str(text).lower()
        return bool(re.search(SUSPICIOUS_PATTERN, text))

    def extract_features_from_logs(self, raw_logs):
        """
        Adaptive Universal Parser:
        Dynamically extracts metrics using eventid and real command extraction.
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

            # Collect the actual command strings typed by this attacker IP
            commands_list = []
            for _, g_row in group.iterrows():
                cmd = _command_from_row(g_row.to_dict())
                if cmd:
                    commands_list.append(cmd)

            # Event ID based accurate counting
            eventid = group["eventid"].astype(str).str.lower() if "eventid" in group.columns else pd.Series([], dtype=str)

            total_conns = int(eventid.str.contains("session.connect", na=False).sum())
            if total_conns == 0:
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

            # Destination port (for frontend card display)
            dst_port = None
            for col in ["dst_port", "destination_port"]:
                if col in group.columns:
                    vals = pd.to_numeric(group[col], errors="coerce").dropna()
                    if not vals.empty:
                        dst_port = _as_int(vals.iloc[0])
                        break

            extracted.append({
                "src_ip": ip,
                "connection_count": total_conns,
                "success_count": total_succ,
                "failed_count": total_fails,
                "unique_passwords": uniq_pwd,
                "command_count": cmd_c,
                "suspicious_commands": susp_c,
                "commands": commands_list,
                "destination_port": dst_port
            })

        return pd.DataFrame(extracted)

    def classify_attack_type(self, row):
        failed = row["failed_count"]
        success = row["success_count"]
        cmds = row["command_count"]
        conn = row["connection_count"]
        unique_passwords = row.get("unique_passwords", 0)

        if failed > 0 or unique_passwords > 0:
            return "Brute Force"
        if cmds > 0:
            return "Command Injection"
        if success > 0:
            return "Brute Force"
        if conn >= 5 and success == 0 and failed == 0 and cmds == 0:
            return "DDoS"
        return "Unknown"

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
                new_commands = list(row.get("commands") or [])
                dst_port = _as_int(row.get("destination_port"))

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
                    ctx["connection_count"] += int(row["connection_count"])
                    ctx["success_count"] += int(row["success_count"])
                    ctx["failed_count"] += int(row["failed_count"])
                    ctx["unique_passwords"] = max(ctx["unique_passwords"], int(row["unique_passwords"]))
                    ctx["command_count"] += int(row["command_count"])
                    ctx["suspicious_commands"] += int(row["suspicious_commands"])
                    ctx["commands"] = _merge_commands(ctx.get("commands"), new_commands)
                    if not ctx.get("destination_port") and dst_port:
                        ctx["destination_port"] = dst_port

                    duration = now - ctx["start_time"]
                    sev = self.calculate_severity(ctx, ongoing_duration=duration)
                    ctx["severity"] = sev
                    ctx["status"] = status
                else:
                    # Classify only once on session creation using aggregated initial row metrics
                    a_type = self.classify_attack_type(row)
                    context_key = (ip, a_type)

                    # Restore session state from DB across restarts if available
                    db_ctx = None
                    if self.db_lookup_callback:
                        try:
                            db_ctx = self.db_lookup_callback(ip, a_type)
                        except Exception:
                            db_ctx = None

                    if db_ctx:
                        status = "ongoing"
                        final_a_type = a_type if a_type else db_ctx.get("attack_type")
                        ctx = {
                            "attack_id": db_ctx["attack_id"],
                            "src_ip": ip,
                            "attack_type": final_a_type,
                            "status": "ongoing",
                            "connection_count": db_ctx["connection_count"] + int(row["connection_count"]),
                            "success_count": db_ctx["success_count"] + int(row["success_count"]),
                            "failed_count": db_ctx["failed_count"] + int(row["failed_count"]),
                            "unique_passwords": max(db_ctx["unique_passwords"], int(row["unique_passwords"])),
                            "command_count": db_ctx["command_count"] + int(row["command_count"]),
                            "suspicious_commands": db_ctx["suspicious_commands"] + int(row["suspicious_commands"]),
                            "commands": _merge_commands(db_ctx.get("commands"), new_commands),
                            "destination_port": db_ctx.get("destination_port") or dst_port,
                            "start_time": db_ctx["start_time"],
                            "last_seen": now
                        }
                        duration = now - ctx["start_time"]
                        ctx["severity"] = self.calculate_severity(ctx, ongoing_duration=duration)
                        self.context_table[context_key] = ctx
                    else:
                        status = "new"
                        duration = 0.0
                        sev = self.calculate_severity(row, ongoing_duration=duration)
                        final_a_type = a_type if a_type else "Unknown"

                        ctx = {
                            "attack_id": str(uuid.uuid4()),
                            "src_ip": ip,
                            "attack_type": final_a_type,
                            "status": "ongoing",
                            "severity": sev,
                            "connection_count": int(row["connection_count"]),
                            "success_count": int(row["success_count"]),
                            "failed_count": int(row["failed_count"]),
                            "unique_passwords": int(row["unique_passwords"]),
                            "command_count": int(row["command_count"]),
                            "suspicious_commands": int(row["suspicious_commands"]),
                            "commands": list(new_commands),
                            "destination_port": dst_port,
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
                    "commands": ctx.get("commands", []),
                    "destination_port": ctx.get("destination_port"),
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
                        "commands": ctx.get("commands", []),
                        "destination_port": ctx.get("destination_port"),
                        "signal": "STOP_SENDING_LOGS"
                    }

                    if self.callback_on_ended:
                        self.callback_on_ended(ended_payload)
