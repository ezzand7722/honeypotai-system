import uuid
from typing import Optional

from app.schemas.event import EnrichedEvent, RawHoneypotRecord

# Static deployment location (Amman, Jordan) — all attacks are geo-pinned here.
STATIC_LOCATION = "Amman, Jordan"
STATIC_LATITUDE = 31.9454
STATIC_LONGITUDE = 35.9284


def normalize_event(raw: RawHoneypotRecord) -> EnrichedEvent:
    severity = _derive_severity(raw)
    risk_score = _risk_from_severity(severity)

    # We create a new metadata dict to avoid mutating the original
    metadata = dict(raw.metadata) if raw.metadata else {}
    metadata["location"] = STATIC_LOCATION
    metadata["latitude"] = STATIC_LATITUDE
    metadata["longitude"] = STATIC_LONGITUDE

    return EnrichedEvent(
        event_id=str(uuid.uuid4()),
        source_ip=raw.source_ip,
        destination_ip=raw.destination_ip,
        destination_port=raw.destination_port,
        attack_vector=raw.attack_vector,
        severity=severity,
        risk_score=risk_score,
        first_seen=raw.timestamp,
        payload=raw.payload,
        metadata=metadata,
    )


def _derive_severity(raw: RawHoneypotRecord) -> Optional[str]:
    hint = raw.metadata.get("severity") or raw.metadata.get("level")
    if not hint:
        return None
    hint = hint.lower()
    if "high" in hint or hint in {"critical", "red"}:
        return "high"
    if "low" in hint or hint in {"info", "green"}:
        return "low"
    return None


def _risk_from_severity(severity: Optional[str]) -> float:
    if not severity:
        return 0.0
    return {"low": 0.2, "medium": 0.5, "high": 0.85}.get(severity, 0.0)
