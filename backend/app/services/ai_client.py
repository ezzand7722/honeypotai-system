import asyncio
import json
import logging
import os
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
from pathlib import Path

from app.config import get_settings
from app.schemas.event import AiPrediction, EnrichedEvent
from app.services.persistence import persist_log_stage
from app.services.reporting import (
    attach_prediction,
    complete_pipeline,
    initialize_pipeline,
    mark_chunk_failed,
    mark_chunk_sent,
)

settings = get_settings()
log = logging.getLogger(__name__)

# Paths for AI system
BASE_DIR = Path(__file__).resolve().parents[4]  # Up to proj folder
# Alternatively, since backend and aisystem are usually side-by-side:
PROJECT_ROOT = Path(__file__).resolve().parents[3] 
# Actually, the file is at backend/app/services/ai_client.py (3 levels up is backend, 4 levels up is proj)
AI_SYS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "aisystem")

print("AI_SYS_DIR resolves to:", AI_SYS_DIR)

DAHUA_LOGS = os.path.join(AI_SYS_DIR, "dahua_logs_multi.json")
ATTACK_RESULTS = os.path.join(AI_SYS_DIR, "attack_results.json")
AI_PY_SCRIPT = os.path.join(AI_SYS_DIR, "ai.py")

# Support both Windows and Linux venv paths
if os.name == 'nt':
    PYTHON_EXE = os.path.join(AI_SYS_DIR, "venv", "Scripts", "python.exe")
else:
    PYTHON_EXE = os.path.join(AI_SYS_DIR, "venv", "bin", "python")

def _chunked(items: Sequence, size: int) -> List[Sequence]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _format_log_for_ai(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    formatted: Dict[str, Any] = {}

    formatted["eventid"] = raw_log.get("eventid", "unknown")
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
    return {"High": "high", "Medium": "medium", "Low": "low"}.get(sev, "low")

def _risk_score_from_severity(sev: str) -> float:
    return {"High": 0.92, "Medium": 0.65, "Low": 0.30}.get(sev, 0.30)

def _confidence_from_severity(sev: str) -> float:
    return {"High": 0.90, "Medium": 0.78, "Low": 0.60}.get(sev, 0.60)


async def _run_ai_script(formatted_logs: list[Dict[str, Any]]) -> Dict[str, Any]:
    # 1. Append logs to dahua_logs_multi.json
    try:
        with open(DAHUA_LOGS, "a", encoding="utf-8") as f:
            for log_entry in formatted_logs:
                f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        log.error("Failed to append to %s: %s", DAHUA_LOGS, e)

    # 2. Run ai.py
    try:
        process = await asyncio.create_subprocess_exec(
            PYTHON_EXE, AI_PY_SCRIPT,
            cwd=AI_SYS_DIR,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            log.error("ai.py failed with returncode %s", process.returncode)
            log.error("stderr: %s", stderr.decode('utf-8', errors='replace'))
    except Exception as e:
        log.error("Failed to execute ai.py: %s", e)

    # 3. Read attack_results.json
    results_by_ip = {}
    try:
        if os.path.exists(ATTACK_RESULTS):
            with open(ATTACK_RESULTS, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    results = json.loads(content)
                    for r in results:
                        results_by_ip[r.get("src_ip")] = r
    except Exception as e:
        log.error("Failed to read %s: %s", ATTACK_RESULTS, e)

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
    attach_prediction(event.event_id, prediction)
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
                    attach_prediction(event.event_id, prediction)

            except Exception as exc:
                log.error("AI chunk scoring failed for pipeline %s chunk %s: %s", effective_pipeline_id, chunk_index, exc)
                mark_chunk_failed(effective_pipeline_id, chunk_index, str(exc))

            if settings.ai_chunk_pause_ms > 0 and chunk_index < total_chunks - 1:
                await asyncio.sleep(settings.ai_chunk_pause_ms / 1000)

    finally:
        complete_pipeline(effective_pipeline_id)

    return effective_pipeline_id
