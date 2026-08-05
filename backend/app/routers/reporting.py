from fastapi import APIRouter, HTTPException, Query

from app.services.reporting import attacker_stats, pipeline_status, recent_alerts
from app.services.ai_client import global_tracker
import os
import json

router = APIRouter()


@router.get("/alerts")
def alerts(limit: int = Query(20, ge=1, le=200)) -> dict:
    return {"status": "success", "alerts": recent_alerts(limit)}


@router.get("/pipelines/{pipeline_id}")
def get_pipeline_status(pipeline_id: str) -> dict:
    status = pipeline_status(pipeline_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return status


@router.get("/attacker-stats")
def get_attacker_stats(src_ip: str = Query(..., min_length=1)) -> dict:
    return {"status": "success", "src_ip": src_ip, "stats": attacker_stats(src_ip)}


@router.get("/raw-ai-output")
def get_raw_ai_output():
    if global_tracker:
        with global_tracker.lock:
            return list(global_tracker.context_table.values())
    return []
