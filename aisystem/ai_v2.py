import json
import re
import time
import uuid
import threading
import pandas as pd
from sklearn.ensemble import IsolationForest
import os
import sys

SUSPICIOUS_CMDS = [
    "wget", "curl", "chmod", "rm", "nc", "bash", "sh",
    "uname", "ls", "pwd", "mkdir", "cd", "python", "perl", "exec"
]


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
        return any(x in text for x in SUSPICIOUS_CMDS)

    def extract_features_from_logs(self, raw_logs):
        """
        Adaptive Universal Parser:
        Dynamically extracts metrics regardless of JSON keys or plain-text formatting.
        """
        rows = []
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
                        rows.append({"src_ip": ip_match.group(0), "raw_message": line})
        elif isinstance(raw_logs, list):
            rows = raw_logs

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows)

        ip_candidates = ["src_ip", "ip", "client_ip", "remote_ip", "host", "remote_addr", "source_ip"]
        found_ip_col = next((c for c in ip_candidates if c in df.columns), None)

        if found_ip_col:
            df["normalized_ip"] = df[found_ip_col].astype(str)
        else:
            df["normalized_ip"] = df.apply(
                lambda r: next((re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', str(v)).group(0)
                                for v in r.values if re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', str(v))), None),
                axis=1
            )

        extracted = []
        grouped = df.groupby("normalized_ip")

        for ip, group in grouped:
            if not ip or ip == "nan" or ip == "":
                continue

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

            combined_rows = group.apply(lambda r: " ".join(str(v) for v in r.values), axis=1).str.lower()

            pattern_conns = combined_rows.str.contains(r'connect|session|accepted|get|post|request|handshake|init', regex=True).sum()
            pattern_fails = combined_rows.str.contains(r'fail|invalid|unauthorized|denied|401|403|reject|wrong', regex=True).sum()
            pattern_succ = combined_rows.str.contains(r'success|accepted|authenticated|200|login.success|pass', regex=True).sum()

            total_conns = int(max(explicit_conns, pattern_conns, len(group)))
            total_fails = int(max(explicit_fails, pattern_fails))
            total_succ = int(max(explicit_succ, pattern_succ))

            cmd_c = 0
            susp_c = 0
            for text_val in combined_rows:
                if self._is_suspicious(text_val):
                    susp_c += 1
                if any(k in text_val for k in ["command", "cmd", "input", "exec", "terminal", "shell"]):
                    cmd_c += 1

            pwd_values = set()
            pwd_cols = [c for c in group.columns if any(k in c.lower() for k in ["pass", "pwd", "auth", "secret"])]
            for pcol in pwd_cols:
                valid_pwds = group[pcol].dropna().astype(str)
                pwd_values.update([p for p in valid_pwds if p.strip() and p.lower() != "nan"])

            uniq_pwd = len(pwd_values)
            
            # Extract explicit attack type if available
            explicit_type = None
            for col in ["attack_vector", "attack_type", "type"]:
                if col in group.columns:
                    valid_types = group[col].dropna().astype(str).tolist()
                    valid_types = [t for t in valid_types if t.strip() and t.lower() != "nan" and t.lower() != "unknown"]
                    if valid_types:
                        explicit_type = valid_types[0]
                        break

            # Collect the actual command strings typed by this attacker IP
            commands_list = []
            for _, g_row in group.iterrows():
                cmd = _command_from_row(g_row.to_dict())
                if cmd:
                    commands_list.append(cmd)

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
                "explicit_type": explicit_type,
                "commands": commands_list,
                "destination_port": dst_port
            })

        return pd.DataFrame(extracted)

    def classify_attack_type(self, row):
        conn = row["connection_count"]
        failed = row["failed_count"]
        success = row["success_count"]
        cmds = row["command_count"]
        explicit = row.get("explicit_type")
        unique_passwords = row.get("unique_passwords", 0)

        if conn >= 8 and failed == 0 and success == 0 and cmds == 0:
            return "DDoS"
        if conn > cmds and failed == 0 and success == 0:
            return "DDoS"
        
        if failed > 0 or unique_passwords > 0:
            return "Brute Force"
        
        if explicit and not explicit.lower().startswith("cowrie."):
            return explicit
            
        return None

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
                new_commands = list(row.get("commands") or [])

                if context_key in self.context_table:
                    ctx = self.context_table[context_key]
                    status = "ongoing"
                    ctx["last_seen"] = now
                    ctx["connection_count"] += row["connection_count"]
                    ctx["success_count"] += row["success_count"]
                    ctx["failed_count"] += row["failed_count"]
                    ctx["unique_passwords"] = max(ctx["unique_passwords"], row["unique_passwords"])
                    ctx["command_count"] += row["command_count"]
                    ctx["suspicious_commands"] += row["suspicious_commands"]
                    ctx["commands"] = _merge_commands(ctx.get("commands"), new_commands)
                    if not ctx.get("destination_port"):
                        ctx["destination_port"] = _as_int(row.get("destination_port"))

                    duration = now - ctx["start_time"]
                    sev = self.calculate_severity(ctx, ongoing_duration=duration)
                    ctx["severity"] = sev
                    ctx["status"] = status
                else:
                    # Check if there is an active session in the database first to ensure stability across restarts
                    db_ctx = None
                    if self.db_lookup_callback:
                        db_ctx = self.db_lookup_callback(ip, a_type)

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
                            "destination_port": db_ctx.get("destination_port") or _as_int(row.get("destination_port")),
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
                            "destination_port": _as_int(row.get("destination_port")),
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

        callbacks_to_fire = []
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
                        "destination_port": ctx.get("destination_port"),
                        "signal": "STOP_SENDING_LOGS"
                    }
                    callbacks_to_fire.append(ended_payload)

        if self.callback_on_ended:
            for payload in callbacks_to_fire:
                self.callback_on_ended(payload)


def main():
    """
    Standalone entry point.
    Reads logs from DAHUA_LOGS_FILE env var (or stdin if not set),
    processes them with DynamicAttackTracker, and writes JSON results
    to ATTACK_RESULTS_FILE env var (or stdout).
    """
    import sys

    input_file = os.environ.get("DAHUA_LOGS_FILE", "")
    output_file = os.environ.get("ATTACK_RESULTS_FILE", "")

    # Read input
    if input_file and os.path.exists(input_file):
        with open(input_file, "r", encoding="utf-8") as f:
            raw_content = f.read()
    else:
        # Try reading from the default dahua_logs_multi.json in same directory
        default_path = os.path.join(os.path.dirname(__file__), "dahua_logs_multi.json")
        if os.path.exists(default_path):
            with open(default_path, "r", encoding="utf-8") as f:
                raw_content = f.read()
        else:
            raw_content = sys.stdin.read()

    # Parse raw content
    try:
        raw_logs = json.loads(raw_content)
    except json.JSONDecodeError:
        # Try JSONL
        raw_logs = []
        for line in raw_content.strip().splitlines():
            line = line.strip()
            if line:
                try:
                    raw_logs.append(json.loads(line))
                except Exception:
                    continue

    ended_results = []

    def on_ended(payload):
        ended_results.append(payload)

    tracker = DynamicAttackTracker(expiry_seconds=10.0, callback_on_ended=on_ended)
    results = tracker.process_incoming_logs(raw_logs)

    output = json.dumps(results, indent=2)

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(output)
    else:
        # Write to default attack_results.json in same directory
        default_out = os.path.join(os.path.dirname(__file__), "attack_results.json")
        with open(default_out, "w", encoding="utf-8") as f:
            f.write(output)

    print(output)


if __name__ == "__main__":
    main()
