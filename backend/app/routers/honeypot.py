import logging
import json
import asyncio
from uuid import uuid4
from typing import Optional, Union, Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, File, UploadFile, Form, Request
from pydantic import BaseModel
import shutil
import tempfile
import os

from app.config import get_settings
from app.schemas.event import RawHoneypotRecord
from app.services.ai_client import submit_batch_for_scoring, submit_for_scoring
from app.services.honeypot_ingest import normalize_event
from app.services.log_file_ingest import parse_honeypot_file, _map_to_raw_record
from app.services.reporting import record_alert

router = APIRouter()
logger = logging.getLogger("honeypot.ingest")
settings = get_settings()


@router.post("/events/debug-file", status_code=202)
async def debug_file_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chunk_size: int = Form(25),
    max_records: Optional[int] = Form(None),
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
) -> dict[str, str]:
    """Debug endpoint to test file upload form parsing."""
    logger.info("DEBUG_FILE filename=%s chunk_size=%s max_records=%s", file.filename, chunk_size, max_records)
    return {
        "status": "received",
        "filename": file.filename,
        "chunk_size": str(chunk_size),
        "max_records": str(max_records) if max_records else "None"
    }


class FileIngestRequest(BaseModel):
    file_path: str
    chunk_size: int = 25
    max_records: Optional[int] = None


@router.post("/events", status_code=202)
async def ingest_honeypot_event(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
) -> dict[str, str]:
    if x_shared_secret != settings.honeypot_shared_secret:
        raise HTTPException(status_code=401, detail="Invalid honeypot credential")

    try:
        mapped_record = _map_to_raw_record(payload, source_file="api", source_line=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload format: {e}")

    event = normalize_event(mapped_record)
    logger.info("INGEST single event event_id=%s src=%s vec=%s", event.event_id, event.source_ip, event.attack_vector)
    raw_payload = mapped_record.model_dump(mode="json")
    normalized_payload = event.model_dump(mode="json")
    await asyncio.to_thread(record_alert, event, None, None, raw_payload, normalized_payload)
    background_tasks.add_task(submit_for_scoring, event, raw_payload)

    return {"status": "accepted", "event_id": event.event_id}


@router.post(
    "/events/batch",
    status_code=202,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "string",
                        "description": "Paste JSONL (one JSON object per line) OR a JSON array [ {...}, {...} ]",
                        "example": '{"eventid":"cowrie.session.connect","src_ip":"1.2.3.4","src_port":1234,"dst_ip":"127.0.0.1","dst_port":2222,"session":"abc123","protocol":"ssh","message":"New connection","sensor":"sensor1","timestamp":"2026-01-01T00:00:00Z"}\n{"eventid":"cowrie.login.success","username":"root","password":"1234","message":"login succeeded","sensor":"sensor1","timestamp":"2026-01-01T00:00:01Z","src_ip":"1.2.3.4","session":"abc123","protocol":"ssh"}',
                    }
                },
                "text/plain": {
                    "schema": {
                        "type": "string",
                        "description": "JSONL format — one JSON object per line",
                    }
                },
            },
        }
    },
)
async def ingest_honeypot_events_batch(
    request: Request,
    background_tasks: BackgroundTasks,
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
    chunk_size: int = Query(25, ge=1, le=500),
) -> dict[str, Union[str, int]]:
    """Accept both JSON array format and JSONL format (one JSON object per line)"""
    if x_shared_secret != settings.honeypot_shared_secret:
        raise HTTPException(status_code=401, detail="Invalid honeypot credential")

    # Parse request body as either JSON array or JSONL
    try:
        body = await request.body()
        body_str = body.decode('utf-8').strip()
        
        if not body_str:
            raise HTTPException(status_code=400, detail="Request body cannot be empty")
        
        # Try JSON array format first (starts with '[')
        if body_str.startswith('['):
            payload = json.loads(body_str)
            source_format = "json_array"
        else:
            # Parse as JSONL (one JSON object per line)
            payload = []
            for line_num, line in enumerate(body_str.split('\n'), 1):
                line = line.strip()
                if line:  # Skip empty lines
                    try:
                        obj = json.loads(line)
                        payload.append(obj)
                    except json.JSONDecodeError as e:
                        logger.warning(f"Skipping invalid JSON on line {line_num}: {str(e)}")
                        continue
            source_format = "jsonl"
            
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing request body: {str(e)}")

    if not payload:
        raise HTTPException(status_code=400, detail="Payload must contain at least one event")

    mapped_records = []
    for idx, raw in enumerate(payload):
        try:
            mapped_records.append(_map_to_raw_record(raw, source_file="api_batch", source_line=idx))
        except Exception:
            continue

    if not mapped_records:
        raise HTTPException(status_code=400, detail="No readable events in payload")

    pipeline_id = str(uuid4())
    events = [normalize_event(item) for item in mapped_records]
    raw_logs = [item.model_dump(mode="json") for item in mapped_records]

    for index, event in enumerate(events):
        await asyncio.to_thread(
            record_alert,
            event,
            pipeline_id,
            index // chunk_size,
            raw_logs[index],
            event.model_dump(mode="json"),
        )
    logger.info(
        "INGEST batch pipeline_id=%s events=%s chunk_size=%s format=%s first_event_id=%s",
        pipeline_id,
        len(events),
        chunk_size,
        source_format,
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
        "format": source_format,
    }


@router.post("/events/from-file", status_code=202)
async def ingest_honeypot_events_from_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chunk_size: Optional[int] = Form(None),
    max_records: Optional[int] = Form(None),
    x_shared_secret: Optional[str] = Header(None, alias="X-Shared-Secret"),
) -> dict[str, Union[str, int]]:

    async def _process_file_ingest(
        saved_path: str,
        pipeline_id: str,
        chunk_size_val: int,
        max_records_val: Optional[int],
    ) -> None:
        try:
            raw_records = parse_honeypot_file(saved_path, max_records_val)
            logger.info("FILE_PARSED_BG pipeline_id=%s records=%s max=%s", pipeline_id, len(raw_records), max_records_val)
            if not raw_records:
                logger.warning("FILE_EMPTY_BG pipeline_id=%s path=%s", pipeline_id, saved_path)
                return

            events = [normalize_event(item) for item in raw_records]
            raw_logs = [item.model_dump(mode="json") for item in raw_records]

            async def _persist_single(index, event):
                try:
                    await asyncio.to_thread(
                        record_alert,
                        event,
                        pipeline_id,
                        index // chunk_size_val,
                        raw_logs[index],
                        event.model_dump(mode="json"),
                    )
                except Exception as e:
                    logger.error("RECORD_ALERT_ERROR_BG pipeline_id=%s event_id=%s error=%s", pipeline_id, event.event_id, e)

            # Persist all alerts in parallel to dramatically reduce Supabase network round-trip overhead
            tasks = [_persist_single(index, event) for index, event in enumerate(events)]
            await asyncio.gather(*tasks)

            await submit_batch_for_scoring(events, raw_logs, pipeline_id, chunk_size_val)
            logger.info("FILE_INGEST_BG_COMPLETE pipeline_id=%s", pipeline_id)
        except Exception as e:
            logger.error("FILE_INGEST_BG_ERROR pipeline_id=%s error=%s", pipeline_id, e, exc_info=True)
        finally:
            try:
                if os.path.exists(saved_path):
                    os.remove(saved_path)
            except Exception:
                pass

    try:
        logger.info("AUTH_CHECK: x_shared_secret=%r settings.honeypot_shared_secret=%r equal=%r", x_shared_secret, settings.honeypot_shared_secret, x_shared_secret == settings.honeypot_shared_secret)
        if x_shared_secret != settings.honeypot_shared_secret:
            raise HTTPException(status_code=401, detail="Invalid honeypot credential")

        # Use defaults if not provided
        _chunk_size = chunk_size if chunk_size is not None else 25
        _max_records = max_records
        
        if _chunk_size < 1 or _chunk_size > 500:
            raise HTTPException(status_code=400, detail="chunk_size must be between 1 and 500")

        file_path = os.path.join(tempfile.gettempdir(), f"{uuid4()}_{file.filename}")
        logger.info("FILE_UPLOAD_START path=%s filename=%s", file_path, file.filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            logger.info("FILE_SAVED path=%s size=%s", file_path, os.path.getsize(file_path))
        except Exception as e:
            logger.error("FILE_SAVE_ERROR error=%s", e, exc_info=True)
            raise HTTPException(status_code=400, detail=f"Failed to save file: {str(e)}")

        pipeline_id = str(uuid4())
        background_tasks.add_task(_process_file_ingest, file_path, pipeline_id, _chunk_size, _max_records)
        logger.info("FILE_INGEST_QUEUED pipeline_id=%s path=%s chunk_size=%s max_records=%s", pipeline_id, file_path, _chunk_size, _max_records)
        return {
            "status": "accepted",
            "pipeline_id": pipeline_id,
            "source_file": file_path,
        }
    except HTTPException as e:
        logger.error("HTTP_EXCEPTION_RAISED status=%s detail=%s", e.status_code, e.detail)
        raise
    except Exception as e:
        logger.error("UNEXPECTED_ERROR error=%s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
