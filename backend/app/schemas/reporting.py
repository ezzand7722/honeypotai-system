from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.event import AiPrediction, EnrichedEvent


class AlertRecord(BaseModel):
    event: EnrichedEvent
    prediction: Optional[AiPrediction] = None
    received_at: datetime = Field(default_factory=datetime.utcnow)
