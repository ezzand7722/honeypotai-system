from collections import deque
from datetime import datetime
from threading import Lock
from typing import Any, Deque, Dict, Optional

from app.schemas.event import AiPrediction, EnrichedEvent
from app.services.persistence import persist_ai_result, persist_ingested_event

MAX_HISTORY = 200
_store: Deque[Dict[str, Any]] = deque(maxlen=MAX_HISTORY)
_pipelines: Dict[str, Dict[str, Any]] = {}
_lock = Lock()


def record_alert(
    event: EnrichedEvent,
    pipeline_id: Optional[str] = None,
    chunk_index: Optional[int] = None,
    raw_log: Optional[dict[str, Any]] = None,
    normalized_log: Optional[dict[str, Any]] = None,
) -> None:
    with _lock:
        _store.appendleft(
            {
                "event": event,
                "prediction": None,
                "received_at": datetime.utcnow(),
                "pipeline_id": pipeline_id,
                "chunk_index": chunk_index,
            }
        )

    persist_ingested_event(
        event,
        raw_log=raw_log,
        normalized_log=normalized_log,
        pipeline_id=pipeline_id,
        chunk_index=chunk_index,
    )


def attach_prediction(event_id: str, prediction: AiPrediction) -> None:
    with _lock:
        for record in _store:
            if record["event"].event_id == event_id:
                record["prediction"] = prediction
                record["received_at"] = datetime.utcnow()
                pipeline_id = record.get("pipeline_id")
                if pipeline_id and pipeline_id in _pipelines:
                    pipeline = _pipelines[pipeline_id]
                    pipeline["predicted_events"] = pipeline.get("predicted_events", 0) + 1
                break

    persist_ai_result(event_id, prediction)


def initialize_pipeline(pipeline_id: str, total_events: int, total_chunks: int) -> None:
    with _lock:
        _pipelines[pipeline_id] = {
            "pipeline_id": pipeline_id,
            "status": "running",
            "total_events": total_events,
            "total_chunks": total_chunks,
            "chunks_sent": 0,
            "processed_events": 0,
            "chunks_failed": 0,
            "predicted_events": 0,
            "errors": [],
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
        }


def mark_chunk_sent(pipeline_id: str, chunk_size: int) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["chunks_sent"] += 1
        pipeline["processed_events"] = min(
            pipeline.get("processed_events", 0) + chunk_size,
            pipeline["total_events"],
        )


def mark_chunk_failed(pipeline_id: str, chunk_index: int, error: str) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["chunks_failed"] += 1
        pipeline["errors"].append({"chunk_index": chunk_index, "message": error})


def complete_pipeline(pipeline_id: str) -> None:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return

        pipeline["status"] = "completed"
        if pipeline["chunks_failed"] > 0:
            pipeline["status"] = "completed_with_errors"
        pipeline["completed_at"] = datetime.utcnow().isoformat()


def pipeline_status(pipeline_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        pipeline = _pipelines.get(pipeline_id)
        if not pipeline:
            return None
        return dict(pipeline)


def recent_alerts(limit: int = 10) -> list[Dict[str, Any]]:
    """Return alerts from the in-memory store in a flat format for the frontend."""
    with _lock:
        snapshot = list(_store)[:limit]

    results = []
    for record in snapshot:
        event = record["event"]
        prediction = record.get("prediction")

        # Build attack_type from prediction labels or event attack_vector
        attack_type = event.attack_vector or "Unknown"
        severity = event.severity or "high"
        if prediction:
            if prediction.attack_type:
                attack_type = prediction.attack_type
            elif prediction.labels:
                attack_type = prediction.labels[0]
            if prediction.severity:
                severity = prediction.severity

        results.append({
            "id": event.event_id,
            "timestamp": event.first_seen.timestamp(),
            "attack_type": attack_type,
            "src_ip": str(event.source_ip),
            "dest_port": event.destination_port,
            "protocol": "TCP",
            "severity": severity,
            "details": {
                "event": event.model_dump(mode="json"),
                "prediction": prediction.model_dump(mode="json") if prediction else None,
                "received_at": record["received_at"].isoformat(),
                "pipeline_id": record.get("pipeline_id"),
            }
        })
    return results
