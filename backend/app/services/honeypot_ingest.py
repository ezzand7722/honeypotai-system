import uuid
from typing import Optional

from app.schemas.event import EnrichedEvent, RawHoneypotRecord
from app.services.geo import get_location


def normalize_event(raw: RawHoneypotRecord) -> EnrichedEvent:
    severity = _derive_severity(raw)
    risk_score = _risk_from_severity(severity)
    
    geo = get_location(str(raw.source_ip))
    
    # We create a new metadata dict to avoid mutating the original
    metadata = dict(raw.metadata) if raw.metadata else {}
    metadata["location"] = geo.get("location")
    metadata["latitude"] = geo.get("latitude")
    metadata["longitude"] = geo.get("longitude")

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
