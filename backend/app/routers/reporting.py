from fastapi import APIRouter, HTTPException, Query

from app.services.reporting import pipeline_status, recent_alerts

router = APIRouter()


@router.get("/alerts")
async def alerts(limit: int = Query(20, ge=1, le=200)) -> list[dict]:
    return recent_alerts(limit)


@router.get("/pipelines/{pipeline_id}")
async def get_pipeline_status(pipeline_id: str) -> dict:
    status = pipeline_status(pipeline_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return status
