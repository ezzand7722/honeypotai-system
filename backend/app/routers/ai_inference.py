from fastapi import APIRouter, BackgroundTasks

from app.schemas.event import EnrichedEvent
from app.services.ai_client import submit_for_scoring

router = APIRouter()


@router.post("/score")
async def score_event(event: EnrichedEvent, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(submit_for_scoring, event)
    return {"status": "queued", "event_id": event.event_id}
