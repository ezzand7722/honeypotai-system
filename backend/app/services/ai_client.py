import asyncio
import json
import logging
import os
import sys
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
from pathlib import Path
import tempfile
import platform
import time

from app.config import get_settings
from app.schemas.event import AiPrediction, EnrichedEvent
from app.services.persistence import persist_log_stage, persist_log_stages_batch, upsert_attack_context
from app.services.reporting import (
    attach_prediction,
    attach_predictions_batch,
    complete_pipeline,
    initialize_pipeline,
    mark_chunk_failed,
    mark_chunk_sent,
)
from app.services.honeypot_ingest import STATIC_LOCATION, STATIC_LATITUDE, STATIC_LONGITUDE

def _update_live_context_safe(ai_output: dict) -> None:
    """Lazy import to avoid circular import with attack_context router."""
    try:
        from app.routers.attack_context import update_live_context
        update_live_context(ai_output)
    except Exception as e:
        log.debug("Could not update live context: %s", e)

settings = get_settings()
log = logging.getLogger(__name__)

# Paths for AI system
AI_SYS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "aisystem")

# --- Initialize Global DynamicAttackTracker ---
if AI_SYS_DIR not in sys.path:
    sys.path.append(AI_SYS_DIR)

try:
    from ai_v2 import DynamicAttackTracker
    def db_lookup_session(src_ip: str, attack_type: str) -> Optional[dict]:
        """Lookup active session in postgres to restore state across restarts."""
        from app.services.persistence import _connect_postgres, _use_postgres, _release_conn
        if not _use_postgres():
            return None
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                if attack_type:
                    cur.execute('''
                        SELECT attack_id, connection_count, success_count, failed_count, 
                               unique_passwords, command_count, suspicious_cmds, start_time, attack_type, commands, destination_port
                        FROM public.attack_context
                        WHERE src_ip = %s AND attack_type = %s
                          AND attack_status IN ('new', 'ongoing', 'renewed')
                          AND last_seen_time > NOW() - INTERVAL '5 minutes'
                        ORDER BY last_seen_time DESC LIMIT 1
                    ''', (src_ip, attack_type))
                else:
                    cur.execute('''
                        SELECT attack_id, connection_count, success_count, failed_count, 
                               unique_passwords, command_count, suspicious_cmds, start_time, attack_type, commands, destination_port
                        FROM public.attack_context
                        WHERE src_ip = %s
                          AND attack_status IN ('new', 'ongoing', 'renewed')
                          AND last_seen_time > NOW() - INTERVAL '5 minutes'
                        ORDER BY last_seen_time DESC LIMIT 1
                    ''', (src_ip,))
                row = cur.fetchone()
                if row:
                    start_time_ts = time.time()
                    if row[7]:
                        # Handle datetime translation
                        if hasattr(row[7], 'timestamp'):
                            start_time_ts = row[7].timestamp()
                    return {
                        "attack_id": row[0],
                        "connection_count": row[1],
                        "success_count": row[2],
                        "failed_count": row[3],
                        "unique_passwords": row[4],
                        "command_count": row[5],
                        "suspicious_commands": row[6],
                        "start_time": start_time_ts,
                        "attack_type": row[8],
                        "commands": row[9] or [],
                        "destination_port": row[10]
                    }
        except Exception as e:
            log.error("Failed to lookup active session from DB: %s", e)
        finally:
            _release_conn(conn)
        return None

    def sweep_expired_sessions_db() -> None:
        """Sweeps stale active sessions in database directly (idle > 5 minutes) to handle restart drift."""
        from app.services.persistence import _connect_postgres, _use_postgres, _release_conn, archive_ended_attack
        if not _use_postgres():
            return
        conn = _connect_postgres()
        expired_ids = []
        try:
            with conn.cursor() as cur:
                # Standard idle-timeout sweep
                cur.execute("""
                    SELECT attack_id FROM public.attack_context
                    WHERE attack_status IN ('new', 'ongoing', 'renewed')
                      AND last_seen_time < NOW() - INTERVAL '5 minutes'
                """)
                expired_ids = [r[0] for r in cur.fetchall()]
                cur.execute("""
                    UPDATE public.attack_context
                    SET attack_status = 'ended',
                        ended_time = NOW()
                    WHERE attack_status IN ('new', 'ongoing', 'renewed')
                      AND last_seen_time < NOW() - INTERVAL '5 minutes'
                """)

                # NOTE: the old "end ghost Unknown rows for IPs that also have a
                # typed session" cleanup was removed. Sessions are now keyed by
                # honeypot session id, so one device can legitimately have
                # several concurrent sessions and a young session may still be
                # "Unknown" — killing it per-IP broke back-to-back attacks.

            conn.commit()
            log.info("Successfully executed DB session sweep for expired sessions.")
        except Exception as e:
            log.error("Failed to sweep expired sessions in DB: %s", e)
        finally:
            _release_conn(conn)

        for aid in expired_ids:
            try:
                archive_ended_attack(aid)
            except Exception as e:
                log.error("Failed to archive expired session %s: %s", aid, e)

    def on_attack_ended(payload):
        """Callback fired by DynamicAttackTracker when an IP is idle for 1 hour."""
        log.info("Session expired for IP: %s (1 hour idle)", payload.get("src_ip"))
        try:
            upsert_attack_context(payload)
            _update_live_context_safe(payload)
        except Exception as e:
            log.error("Failed to process expired session payload: %s", e)

    # 5 min idle boundary — long enough for multi-chunk log uploads without
    # splitting one attack into many attack_ids (which caused UI flicker).
    global_tracker = DynamicAttackTracker(
        expiry_seconds=300.0,
        callback_on_ended=on_attack_ended
    )
    log.info("Successfully initialized stateful DynamicAttackTracker with 300s expiry and DB lookup!")
except ImportError as e:
    log.error("Failed to import DynamicAttackTracker from ai_v2: %s", e)
    global_tracker = None
    def sweep_expired_sessions_db() -> None:
        pass
# -----------------------------------------------

def _chunked(items: Sequence, size: int) -> List[Sequence]:
    return [items[i : i + size] for i in range(0, len(items), size)]

def _format_log_for_ai(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    raw_log = dict(raw_log)

    # Flatten the nested metadata dict into top-level fields so the AI's
    # feature extractor can see password/username/input/session/protocol/
    # src_port/dst_port/etc. (the AI only scans top-level columns).
    metadata = raw_log.get("metadata")
    if isinstance(metadata, dict):
        for k, v in metadata.items():
            raw_log.setdefault(k, v)

    formatted: Dict[str, Any] = {}

    formatted["eventid"] = raw_log.get("eventid") or raw_log.get("attack_vector")
    import re
    ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', str(raw_log))
    extracted_ip = ip_match.group(0) if ip_match else None
    formatted["src_ip"] = raw_log.get("src_ip") or raw_log.get("source_ip") or extracted_ip
    formatted["src_port"] = raw_log.get("src_port")
    formatted["dst_ip"] = raw_log.get("dst_ip")
    formatted["dst_port"] = raw_log.get("dst_port")
    formatted["session"] = raw_log.get("session")
    formatted["protocol"] = raw_log.get("protocol")
    formatted["message"] = raw_log.get("message")
    formatted["sensor"] = raw_log.get("sensor")
    formatted["uuid"] = raw_log.get("uuid", str(uuid4()))

    timestamp = raw_log.get("timestamp")
    if isinstance(timestamp, str) and timestamp:
        formatted["timestamp"] = timestamp
    elif isinstance(timestamp, datetime):
        formatted["timestamp"] = timestamp.isoformat() + "Z"
    else:
        formatted["timestamp"] = datetime.utcnow().isoformat() + "Z"

    for key, value in raw_log.items():
        if key not in formatted:
            formatted[key] = value

    return formatted

def _threat_level_from_severity(sev: str | None) -> str | None:
    if not sev:
        return None
    return {
        "Extreme": "high", "High": "high",
        "Medium": "medium", "Mild": "low", "Low": "low"
    }.get(sev)

def _risk_score_from_severity(sev: str | None) -> float:
    if not sev:
        return 0.0
    return {
        "Extreme": 0.99, "High": 0.92,
        "Medium": 0.65, "Mild": 0.40, "Low": 0.20
    }.get(sev, 0.0)

def _confidence_from_severity(sev: str | None) -> float:
    if not sev:
        return 0.0
    return {
        "Extreme": 0.97, "High": 0.90,
        "Medium": 0.78, "Mild": 0.65, "Low": 0.55
    }.get(sev, 0.0)


async def _run_ai_script(formatted_logs: list[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Now runs the AI engine directly in-memory, maintaining state across calls!
    """
    if not global_tracker:
        log.error("DynamicAttackTracker not initialized! Returning empty results.")
        return {}

    if formatted_logs:
        try:
            from app.services.activity import touch_ingest_activity
            touch_ingest_activity()
        except Exception:
            pass

    # Run the logs through the in-memory engine (which is thread-safe)
    # We run it in a threadpool to not block the asyncio event loop during pandas/sklearn ops
    try:
        results = await asyncio.to_thread(global_tracker.process_incoming_logs, formatted_logs)
    except Exception as e:
        log.exception("Error processing logs in DynamicAttackTracker: %s", e)
        return {}

    # Keyed by (src_ip, honeypot_session): one device/IP can launch several
    # attacks back-to-back — each cowrie session is its own attack and must
    # never merge into the previous one.
    results_by_ip = {}
    if results:
        for r in results:
            results_by_ip[(r.get("src_ip"), str(r.get("session") or ""))] = r

    # Re-derive attack_type from accumulated counts to fix single-event
    # misclassification (I2) and restore Command Injection category (I8).
    for _key, result in results_by_ip.items():
        failed = result.get("failed_count", 0)
        success = result.get("success_count", 0)
        unique_passwords = result.get("unique_passwords", 0)
        command_count = result.get("command_count", 0)
        connection_count = result.get("connection_count", 0)

        if failed >= 1 or unique_passwords >= 1 or success >= 1:
            result["attack_type"] = "Brute Force"
        elif command_count >= 1:
            result["attack_type"] = "Command Injection"
        elif connection_count >= 3:
            result["attack_type"] = "DDoS"
        else:
            result["attack_type"] = "Unknown"

    # Reconstruct commands and destination_port from formatted_logs (I3, I4, I7).
    # Groups logs by (src_ip, session) and extracts command strings + dst_port.
    import re as _re
    _ip_commands: dict[tuple, list[str]] = {}
    _ip_dst_port: dict[tuple, int | None] = {}
    for log_item in formatted_logs:
        lip = log_item.get("src_ip")
        if not lip:
            continue
        lkey = (lip, str(log_item.get("session") or ""))
        # Extract destination port
        dp = log_item.get("dst_port")
        if dp and lkey not in _ip_dst_port:
            try:
                _ip_dst_port[lkey] = int(dp)
            except (ValueError, TypeError):
                pass
        # Extract command from known fields
        eid = str(log_item.get("eventid", "")).lower()
        cmd = None
        if "command" in eid or "input" in eid:
            # Try input, then message, then command fields
            for field in ("input", "message", "command"):
                val = log_item.get(field)
                if val and str(val).strip() and str(val).strip().lower() != "nan":
                    cmd = str(val).strip()[:500]
                    break
        if not cmd:
            for field in ("input", "command", "cmd"):
                val = log_item.get(field)
                if val and str(val).strip() and str(val).strip().lower() != "nan":
                    cmd = str(val).strip()[:500]
                    break
        if cmd:
            _ip_commands.setdefault(lkey, []).append(cmd)

    for key, result in results_by_ip.items():
        # Tracker keeps the full accumulated command list across chunks/re-uploads;
        # per-chunk reconstruction below is only a fallback (e.g. fresh formats).
        result["commands"] = result.get("commands") or _ip_commands.get(key, [])
        result["destination_port"] = _ip_dst_port.get(key)

    # Extract location from the incoming logs so we don't do a second mmdb lookup
    ip_to_geo = {}
    for log_item in formatted_logs:
        ip = log_item.get("src_ip")
        metadata = log_item.get("metadata", {})
        if ip and "location" in metadata:
            ip_to_geo[ip] = {
                "location": metadata.get("location"),
                "latitude": metadata.get("latitude"),
                "longitude": metadata.get("longitude")
            }

    # Persist each AI v2 result to attack_context table + push to live WS feed
    for (ip, _sess), result in results_by_ip.items():
        try:
            geo = ip_to_geo.get(ip, {})
            result["location"] = geo.get("location") or STATIC_LOCATION
            result["latitude"] = geo.get("latitude") if geo.get("latitude") is not None else STATIC_LATITUDE
            result["longitude"] = geo.get("longitude") if geo.get("longitude") is not None else STATIC_LONGITUDE
            
            await asyncio.to_thread(upsert_attack_context, result)
            _update_live_context_safe(result)
        except Exception as e:
            log.error("Failed to persist attack_context for ip=%s: %s", ip, e)

    return results_by_ip

def _build_prediction(event_id: str, formatted_log: dict, result: dict, pipeline_info: dict = None) -> AiPrediction:
    src_ip = formatted_log.get("src_ip")
    if not result:
        result = {}

    sev = result.get("severity")
    at_type = result.get("attack_type")

    labels = []
    if at_type == "Brute Force":
        labels = ["bruteforce", "credential_attack"]
    elif at_type == "DDoS":
        labels = ["ddos", "flooding"]
    elif at_type:
        labels = [str(at_type).lower().replace(" ", "_")]

    return AiPrediction(
        event_id=event_id,
        model_version="isolation-forest-file-v1",
        threat_level=_threat_level_from_severity(sev),
        severity=sev,
        risk_score=_risk_score_from_severity(sev),
        confidence=_confidence_from_severity(sev),
        labels=labels,
        summary=f"{at_type} attack detected from {src_ip}",
        details={
            "attack": result.get("attack", "Attack"),
            "attack_type": at_type,
            "severity": sev,
            "src_ip": src_ip,
            "connection_count": result.get("connection_count", 0),
            "success_count": result.get("success_count", 0),
            "failed_count": result.get("failed_count", 0),
            "unique_passwords": result.get("unique_passwords", 0),
            "command_count": result.get("command_count", 0),
            "suspicious_commands": result.get("suspicious_commands", 0),
            "commands": result.get("commands", []),
            "destination_port": result.get("destination_port") or result.get("dst_port"),
            "pipeline": result.get("pipeline", []),
            "attack_id": result.get("attack_id", ""),
            "detection_time": result.get("detection_time", ""),
            "attack_status": result.get("attack_status", "new"),
            "suspicious_cmds": int(result.get("suspicious_commands", result.get("suspicious_cmds", 0))),
            "duration_seconds": float(result.get("duration_seconds", 0.0)),
            "signal": result.get("signal", ""),
            ** (pipeline_info or {})
        }
    )

async def submit_for_scoring(event: EnrichedEvent, original_log: Optional[Dict[str, Any]] = None) -> None:
    formatted_log = _format_log_for_ai(original_log) if original_log is not None else event.model_dump(mode="json")
    if event.metadata:
        meta = formatted_log.setdefault("metadata", {})
        meta.setdefault("location", event.metadata.get("location"))
        meta.setdefault("latitude", event.metadata.get("latitude"))
        meta.setdefault("longitude", event.metadata.get("longitude"))
    await asyncio.to_thread(persist_log_stage, event.event_id, "ai_normalized", formatted_log)

    log.info("SUBMIT_TO_AI: event_id=%s src_ip=%s", event.event_id, formatted_log.get("src_ip"))

    results_by_ip = await _run_ai_script([formatted_log])
    result = results_by_ip.get(
        (formatted_log.get("src_ip", ""), str(formatted_log.get("session") or "")), {}
    )

    prediction = _build_prediction(event.event_id, formatted_log, result)
    await asyncio.to_thread(attach_prediction, event.event_id, prediction)
    log.info("AI_RESPONSE: event_id=%s status=ok", event.event_id)

async def submit_batch_for_scoring(
    events: list[EnrichedEvent],
    raw_logs: list[dict],
    pipeline_id: Optional[str] = None,
    chunk_size: Optional[int] = None,
) -> str:
    if not events:
        return pipeline_id or str(uuid4())

    effective_pipeline_id = pipeline_id or str(uuid4())
    effective_chunk_size = max(1, chunk_size or settings.ai_chunk_size)
    chunked_events = _chunked(events, effective_chunk_size)
    chunked_logs = _chunked(raw_logs, effective_chunk_size)
    total_chunks = len(chunked_events)

    initialize_pipeline(effective_pipeline_id, total_events=len(events), total_chunks=total_chunks)

    try:
        for chunk_index, event_chunk in enumerate(chunked_events):
            raw_chunk = chunked_logs[chunk_index] if chunk_index < len(chunked_logs) else []
            formatted_chunk = [_format_log_for_ai(raw_log) for raw_log in raw_chunk]

            # One batched multi-row write per chunk instead of one roundtrip per event
            stage_rows = []
            for event, formatted_log in zip(event_chunk, formatted_chunk):
                formatted_log["attack_id"] = event.attack_id
                stage_rows.append((event.event_id, "ai_normalized", formatted_log))
            try:
                await asyncio.to_thread(persist_log_stages_batch, stage_rows)
                failed_stage_ids = []
            except Exception as e:
                log.error("PERSIST_STAGE_BATCH_ERROR chunk=%d error=%s", chunk_index, e)
                failed_stage_ids = [event.event_id for event in event_chunk]

            success_stage_count = len(event_chunk) - len(failed_stage_ids)
            log.info("STAGE_PERSIST_SUMMARY chunk=%d total=%d success=%d failed=%d", 
                     chunk_index, len(event_chunk), success_stage_count, len(failed_stage_ids))
            if failed_stage_ids:
                log.error("STAGE_PERSIST_FAILED_EVENTS chunk=%d failed_ids=%r", chunk_index, failed_stage_ids)

            pipeline_info = {
                "pipeline_id": effective_pipeline_id,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
            }

            try:
                results_by_ip = await _run_ai_script(formatted_chunk)
                mark_chunk_sent(effective_pipeline_id, len(event_chunk))

                # One batched write per chunk instead of one roundtrip per event
                prediction_pairs = []
                for event, formatted_log in zip(event_chunk, formatted_chunk):
                    result = results_by_ip.get(
                        (formatted_log.get("src_ip", ""), str(formatted_log.get("session") or "")), {}
                    )
                    prediction = _build_prediction(event.event_id, formatted_log, result, pipeline_info)
                    prediction_pairs.append((event.event_id, prediction))
                await asyncio.to_thread(attach_predictions_batch, prediction_pairs)

            except Exception as exc:
                log.error("AI chunk scoring failed for pipeline %s chunk %s: %s", effective_pipeline_id, chunk_index, exc)
                mark_chunk_failed(effective_pipeline_id, chunk_index, str(exc))

            if settings.ai_chunk_pause_ms > 0 and chunk_index < total_chunks - 1:
                await asyncio.sleep(settings.ai_chunk_pause_ms / 1000)

    finally:
        complete_pipeline(effective_pipeline_id)
        try:
            await asyncio.to_thread(sweep_expired_sessions_db)
        except Exception as e:
            log.error("Failed to run DB session sweep: %s", e)

    return effective_pipeline_id
