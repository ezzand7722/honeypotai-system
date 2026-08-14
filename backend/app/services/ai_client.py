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
from app.services.persistence import persist_log_stage, upsert_attack_context
from app.services.reporting import (
    attach_prediction,
    complete_pipeline,
    initialize_pipeline,
    mark_chunk_failed,
    mark_chunk_sent,
)

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
        from app.services.persistence import _connect_postgres, _use_postgres
        if not _use_postgres():
            return None
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                if attack_type:
                    cur.execute('''
                        SELECT attack_id, connection_count, success_count, failed_count, 
                               unique_passwords, command_count, suspicious_cmds, start_time, attack_type, commands
                        FROM public.attack_context
                        WHERE src_ip = %s AND attack_type = %s
                        ORDER BY last_seen_time DESC LIMIT 1
                    ''', (src_ip, attack_type))
                else:
                    cur.execute('''
                        SELECT attack_id, connection_count, success_count, failed_count, 
                               unique_passwords, command_count, suspicious_cmds, start_time, attack_type, commands
                        FROM public.attack_context
                        WHERE src_ip = %s
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
                        "commands": row[9] or []
                    }
        except Exception as e:
            log.error("Failed to lookup active session from DB: %s", e)
        finally:
            conn.close()
        return None

    def sweep_expired_sessions_db() -> None:
        """Sweeps stale active sessions in database directly (idle > 1 hour) to handle restart drift."""
        from app.services.persistence import _connect_postgres, _use_postgres
        if not _use_postgres():
            return
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE public.attack_context
                    SET attack_status = 'ended',
                        ended_time = NOW()
                    WHERE attack_status IN ('new', 'ongoing', 'renewed')
                      AND last_seen_time < NOW() - INTERVAL '1 hour'
                """)
            conn.commit()
            log.info("Successfully executed DB session sweep for expired sessions.")
        except Exception as e:
            log.error("Failed to sweep expired sessions in DB: %s", e)
        finally:
            conn.close()

    def on_attack_ended(payload):
        """Callback fired by DynamicAttackTracker when an IP is idle for 1 hour."""
        log.info("Session expired for IP: %s (1 hour idle)", payload.get("src_ip"))
        try:
            upsert_attack_context(payload)
            _update_live_context_safe(payload)
        except Exception as e:
            log.error("Failed to process expired session payload: %s", e)

    # Align the in-memory AI tracker with the DB's 1-hour (3600s) session boundary
    global_tracker = DynamicAttackTracker(
        expiry_seconds=3600.0, 
        callback_on_ended=on_attack_ended,
        db_lookup_callback=db_lookup_session
    )
    log.info("Successfully initialized stateful DynamicAttackTracker with 1-hour expiry and DB lookup!")
except ImportError as e:
    log.error("Failed to import DynamicAttackTracker from ai_v2: %s", e)
    global_tracker = None
    def sweep_expired_sessions_db() -> None:
        pass
# -----------------------------------------------

def _chunked(items: Sequence, size: int) -> List[Sequence]:
    return [items[i : i + size] for i in range(0, len(items), size)]

def _format_log_for_ai(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    formatted: Dict[str, Any] = {}

    formatted["eventid"] = raw_log.get("eventid") or (raw_log.get("metadata") or {}).get("eventid") or raw_log.get("attack_vector")
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

    # Run the logs through the in-memory engine (which is thread-safe)
    # We run it in a threadpool to not block the asyncio event loop during pandas/sklearn ops
    try:
        results = await asyncio.to_thread(global_tracker.process_incoming_logs, formatted_logs)
    except Exception as e:
        log.exception("Error processing logs in DynamicAttackTracker: %s", e)
        return {}

    results_by_ip = {}
    if results:
        for r in results:
            results_by_ip[r.get("src_ip")] = r

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
    for ip, result in results_by_ip.items():
        try:
            geo = ip_to_geo.get(ip, {})
            result["location"] = geo.get("location")
            result["latitude"] = geo.get("latitude")
            result["longitude"] = geo.get("longitude")
            
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
    result = results_by_ip.get(formatted_log.get("src_ip", ""), {})

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
            
            sem = asyncio.Semaphore(5)

            async def _persist_stage_safe(event_id, stage, payload):
                async with sem:
                    try:
                        await asyncio.to_thread(persist_log_stage, event_id, stage, payload)
                        return None
                    except Exception as e:
                        log.error("PERSIST_STAGE_ERROR event_id=%s stage=%s error=%s", event_id, stage, e)
                        return event_id

            # Parallelize database logging of staging stages to improve latency with limited concurrency
            tasks = []
            for event, formatted_log in zip(event_chunk, formatted_chunk):
                formatted_log["attack_id"] = event.attack_id
                tasks.append(_persist_stage_safe(event.event_id, "ai_normalized", formatted_log))
            results = await asyncio.gather(*tasks)
            
            failed_stage_ids = [eid for eid in results if eid is not None]
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

                # Parallelize database prediction attachments
                tasks = []
                for event, formatted_log in zip(event_chunk, formatted_chunk):
                    result = results_by_ip.get(formatted_log.get("src_ip", ""), {})
                    prediction = _build_prediction(event.event_id, formatted_log, result, pipeline_info)
                    tasks.append(asyncio.to_thread(attach_prediction, event.event_id, prediction))
                await asyncio.gather(*tasks)

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
