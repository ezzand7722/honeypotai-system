import logging
from uuid import uuid4
from typing import Optional, Union

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, File, UploadFile, Form
from pydantic import BaseModel
import shutil
import tempfile
import os

from app.config import get_settings
from app.schemas.event import RawHoneypotRecord
from app.services.ai_client import submit_batch_for_scoring, submit_for_scoring
from app.services.honeypot_ingest import normalize_event
from app.services.log_file_ingest import parse_honeypot_file
from app.services.reporting import record_alert

router = APIRouter()
logger = logging.getLogger("honeypot.ingest")
settings = get_settings()


class FileIngestRequest(BaseModel):
    file_path: str
    chunk_size: int = 25
    max_records: Optional[int] = None


@router.post("/events", status_code=202)
async def ingest_honeypot_event(
    payload: RawHoneypotRecord,
    background_tasks: BackgroundTasks,
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
) -> dict[str, str]:
    if x_shared_secret != settings.honeypot_shared_secret:
        raise HTTPException(status_code=401, detail="Invalid honeypot credential")

    event = normalize_event(payload)
    logger.info("INGEST single event event_id=%s src=%s vec=%s", event.event_id, event.source_ip, event.attack_vector)
    raw_payload = payload.model_dump(mode="json")
    normalized_payload = event.model_dump(mode="json")
    record_alert(event, raw_log=raw_payload, normalized_log=normalized_payload)
    background_tasks.add_task(submit_for_scoring, event, raw_payload)

    return {"status": "accepted", "event_id": event.event_id}


@router.post("/events/batch", status_code=202)
async def ingest_honeypot_events_batch(
    payload: list[RawHoneypotRecord],
    background_tasks: BackgroundTasks,
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
    chunk_size: int = Query(25, ge=1, le=500),
) -> dict[str, Union[str, int]]:
    if x_shared_secret != settings.honeypot_shared_secret:
        raise HTTPException(status_code=401, detail="Invalid honeypot credential")

    if not payload:
        raise HTTPException(status_code=400, detail="Payload must contain at least one event")

    pipeline_id = str(uuid4())
    events = [normalize_event(item) for item in payload]
    raw_logs = [item.model_dump(mode="json") for item in payload]

    for index, event in enumerate(events):
        record_alert(
            event,
            pipeline_id=pipeline_id,
            chunk_index=index // chunk_size,
            raw_log=raw_logs[index],
            normalized_log=event.model_dump(mode="json"),
        )
    logger.info(
        "INGEST batch pipeline_id=%s events=%s chunk_size=%s first_event_id=%s",
        pipeline_id,
        len(events),
        chunk_size,
        events[0].event_id if events else None,
    )

    background_tasks.add_task(
        submit_batch_for_scoring,
        events,
        raw_logs,
        pipeline_id,
        chunk_size,
    )

    total_chunks = (len(events) + chunk_size - 1) // chunk_size
    return {
        "status": "accepted",
        "pipeline_id": pipeline_id,
        "events_received": len(events),
        "chunks_queued": total_chunks,
    }


@router.post("/events/from-file", status_code=202)
async def ingest_honeypot_events_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chunk_size: int = Form(25),
    max_records: Optional[int] = Form(None),
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
) -> dict[str, Union[str, int]]:
    if x_shared_secret != settings.honeypot_shared_secret:
        raise HTTPException(status_code=401, detail="Invalid honeypot credential")

    if chunk_size < 1 or chunk_size > 500:
        raise HTTPException(status_code=400, detail="chunk_size must be between 1 and 500")

    file_path = os.path.join(tempfile.gettempdir(), f"{uuid4()}_{file.filename}")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        raw_records = parse_honeypot_file(file_path, max_records)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to process file: {exc}") from exc

    if not raw_records:
        raise HTTPException(status_code=400, detail="No valid records found in file")

    pipeline_id = str(uuid4())
    events = [normalize_event(item) for item in raw_records]
    raw_logs = [item.model_dump(mode="json") for item in raw_records]

    for index, event in enumerate(events):
        record_alert(
            event,
            pipeline_id=pipeline_id,
            chunk_index=index // request.chunk_size,
            raw_log=raw_logs[index],
            normalized_log=event.model_dump(mode="json"),
        )

    background_tasks.add_task(
        submit_batch_for_scoring,
        events,
        raw_logs,
        pipeline_id,
        request.chunk_size,
    )

    total_chunks = (len(events) + request.chunk_size - 1) // request.chunk_size
    return {
        "status": "accepted",
        "pipeline_id": pipeline_id,
        "events_received": len(events),
        "chunks_queued": total_chunks,
        "source_file": request.file_path,
    }
