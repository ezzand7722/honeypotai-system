from fastapi import APIRouter, HTTPException, Query

from app.services.reporting import attacker_stats, pipeline_status, recent_alerts
from app.services.ai_client import ATTACK_RESULTS
import os
import json

router = APIRouter()


@router.get("/alerts")
async def alerts(limit: int = Query(20, ge=1, le=200)) -> dict:
    return {"status": "success", "alerts": recent_alerts(limit)}


@router.get("/pipelines/{pipeline_id}")
async def get_pipeline_status(pipeline_id: str) -> dict:
    status = pipeline_status(pipeline_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return status


@router.get("/attacker-stats")
async def get_attacker_stats(src_ip: str = Query(..., min_length=1)) -> dict:
    return {"status": "success", "src_ip": src_ip, "stats": attacker_stats(src_ip)}


@router.get("/raw-ai-output")
async def get_raw_ai_output():
    if os.path.exists(ATTACK_RESULTS):
        try:
            with open(ATTACK_RESULTS, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except Exception as e:
            return {"error": str(e)}
    return []
