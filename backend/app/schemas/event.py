from datetime import datetime
from typing import Any, Literal, Mapping, Optional

from pydantic import BaseModel, Field, IPvAnyAddress, validator


class RawHoneypotRecord(BaseModel):
    attack_id: str
    timestamp: datetime
    source_ip: IPvAnyAddress
    destination_ip: IPvAnyAddress
    destination_port: int
    attack_vector: str
    metadata: Mapping[str, Any] = Field(default_factory=dict)
    payload: Optional[str] = None


class EnrichedEvent(BaseModel):
    event_id: str
    source_ip: IPvAnyAddress
    destination_ip: IPvAnyAddress
    destination_port: int
    attack_vector: str
    severity: Literal["low", "medium", "high"]
    risk_score: float = Field(ge=0, le=1)
    first_seen: datetime
    payload: Optional[str] = None
    metadata: Mapping[str, Any]

    @validator("severity", pre=True)
    def normalize_severity(cls, value: str) -> str:
        return value.lower()


class AiPrediction(BaseModel):
    event_id: Optional[str] = None
    model_version: str = "unknown"
    attacker_ip: Optional[IPvAnyAddress] = None
    src_ip: Optional[IPvAnyAddress] = None  # New field from updated AI response
    threat_level: Literal["low", "medium", "high", "unknown"] = "unknown"
    risk_score: float = Field(default=0.5, ge=0, le=1)
    labels: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    summary: Optional[str] = None
    recommendations: list[str] = Field(default_factory=list)
    indicators: Mapping[str, Any] = Field(default_factory=dict)
    details: Mapping[str, Any] = Field(default_factory=dict)
    
    # New fields from updated AI response format
    connection_count: Optional[int] = None
    success_count: Optional[int] = None
    failed_count: Optional[int] = None
    unique_passwords: Optional[int] = None
    command_count: Optional[int] = None
    suspicious_commands: Optional[int] = None
    attack: Optional[str] = None
    attack_type: Optional[str] = None
    severity: Optional[str] = None

    @validator("threat_level", pre=True)
    def normalize_threat_level(cls, value: Optional[str]) -> str:
        if not value:
            return "unknown"

        normalized = str(value).lower()
        if normalized in {"high", "critical", "severe", "red"}:
            return "high"
        if normalized in {"medium", "med", "moderate", "amber", "orange"}:
            return "medium"
        if normalized in {"low", "minor", "green", "info"}:
            return "low"
        return "unknown"
