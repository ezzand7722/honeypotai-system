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
    
    def on_attack_ended(payload):
        """Callback fired by DynamicAttackTracker when an IP is idle for 10 seconds."""
        log.info("Attack ended for IP: %s", payload.get("src_ip"))
        try:
            upsert_attack_context(payload)
            _update_live_context_safe(payload)
        except Exception as e:
            log.error("Failed to process ended attack payload: %s", e)

    global_tracker = DynamicAttackTracker(expiry_seconds=10.0, callback_on_ended=on_attack_ended)
    log.info("Successfully initialized stateful DynamicAttackTracker!")
except ImportError as e:
    log.error("Failed to import DynamicAttackTracker from ai_v2: %s", e)
    global_tracker = None
# -----------------------------------------------

def _chunked(items: Sequence, size: int) -> List[Sequence]:
    return [items[i : i + size] for i in range(0, len(items), size)]

def _format_log_for_ai(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    formatted: Dict[str, Any] = {}

    formatted["eventid"] = raw_log.get("eventid") or (raw_log.get("metadata") or {}).get("eventid") or raw_log.get("attack_vector", "unknown")
    formatted["src_ip"] = raw_log.get("src_ip") or raw_log.get("source_ip") or "127.0.0.1"
    formatted["src_port"] = raw_log.get("src_port")
    formatted["dst_ip"] = raw_log.get("dst_ip", "127.0.0.1")
    formatted["dst_port"] = raw_log.get("dst_port")
    formatted["session"] = raw_log.get("session", "")
    formatted["protocol"] = raw_log.get("protocol", "unknown")
    formatted["message"] = raw_log.get("message", "")
    formatted["sensor"] = raw_log.get("sensor", "honeypot")
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

def _threat_level_from_severity(sev: str) -> str:
    return {
        "Extreme": "high", "High": "high",
        "Medium": "medium", "Mild": "low", "Low": "low"
    }.get(sev, "low")

def _risk_score_from_severity(sev: str) -> float:
    return {
        "Extreme": 0.99, "High": 0.92,
        "Medium": 0.65, "Mild": 0.40, "Low": 0.20
    }.get(sev, 0.30)

def _confidence_from_severity(sev: str) -> float:
    return {
        "Extreme": 0.97, "High": 0.90,
        "Medium": 0.78, "Mild": 0.65, "Low": 0.55
    }.get(sev, 0.60)


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

    # Persist each AI v2 result to attack_context table + push to live WS feed
    for ip, result in results_by_ip.items():
        try:
            await asyncio.to_thread(upsert_attack_context, result)
            _update_live_context_safe(result)
        except Exception as e:
            log.error("Failed to persist attack_context for ip=%s: %s", ip, e)

    return results_by_ip

def _build_prediction(event_id: str, formatted_log: dict, result: dict, pipeline_info: dict = None) -> AiPrediction:
    src_ip = formatted_log.get("src_ip", "0.0.0.0")
    if not result:
        # Default prediction if IP not found
        result = {"attack_type": "Brute Force", "severity": "Low"}

    sev = result.get("severity", "Low")
    at_type = result.get("attack_type", "Unknown")

    labels = []
    if at_type == "Brute Force":
        labels = ["bruteforce", "credential_attack"]
    elif at_type == "DDoS":
        labels = ["ddos", "flooding"]
    else:
        labels = ["unknown"]

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
    persist_log_stage(event.event_id, "ai_normalized", formatted_log)

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
            for event, formatted_log in zip(event_chunk, formatted_chunk):
                persist_log_stage(event.event_id, "ai_normalized", formatted_log)

            pipeline_info = {
                "pipeline_id": effective_pipeline_id,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
            }

            try:
                results_by_ip = await _run_ai_script(formatted_chunk)
                mark_chunk_sent(effective_pipeline_id, len(event_chunk))

                for event, formatted_log in zip(event_chunk, formatted_chunk):
                    result = results_by_ip.get(formatted_log.get("src_ip", ""), {})
                    prediction = _build_prediction(event.event_id, formatted_log, result, pipeline_info)
                    await asyncio.to_thread(attach_prediction, event.event_id, prediction)

            except Exception as exc:
                log.error("AI chunk scoring failed for pipeline %s chunk %s: %s", effective_pipeline_id, chunk_index, exc)
                mark_chunk_failed(effective_pipeline_id, chunk_index, str(exc))

            if settings.ai_chunk_pause_ms > 0 and chunk_index < total_chunks - 1:
                await asyncio.sleep(settings.ai_chunk_pause_ms / 1000)

    finally:
        complete_pipeline(effective_pipeline_id)

    return effective_pipeline_id
