import uuid

from app.schemas.event import EnrichedEvent, RawHoneypotRecord


def normalize_event(raw: RawHoneypotRecord) -> EnrichedEvent:
    severity = _derive_severity(raw)
    risk_score = _risk_from_severity(severity)

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
        metadata=raw.metadata,
    )


def _derive_severity(raw: RawHoneypotRecord) -> str:
    hint = raw.metadata.get("severity") or raw.metadata.get("level") or "medium"
    hint = hint.lower()
    if "high" in hint or hint in {"critical", "red"}:
        return "high"
    if "low" in hint or hint in {"info", "green"}:
        return "low"
    return "medium"


def _risk_from_severity(severity: str) -> float:
    return {"low": 0.2, "medium": 0.5, "high": 0.85}.get(severity, 0.5)
