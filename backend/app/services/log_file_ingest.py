import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.schemas.event import RawHoneypotRecord


def parse_honeypot_file(file_path: str, max_records: Optional[int] = None) -> list[RawHoneypotRecord]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    content = path.read_text(encoding="utf-8").strip()
    if not content:
        return []

    records = _parse_json_or_json_lines(content)
    mapped: list[RawHoneypotRecord] = []

    for idx, raw in enumerate(records, start=1):
        try:
            mapped.append(_map_to_raw_record(raw, source_file=str(path), source_line=idx))
        except Exception:
            continue

        if max_records is not None and len(mapped) >= max_records:
            break

    return mapped


def _parse_json_or_json_lines(content: str) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    output: list[dict[str, Any]] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            item = json.loads(stripped)
            if isinstance(item, dict):
                output.append(item)
        except json.JSONDecodeError:
            continue

    return output


def _safe_timestamp(value: Any) -> datetime:
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.utcnow()


def _map_to_raw_record(raw: dict[str, Any], source_file: str, source_line: int) -> RawHoneypotRecord:
    src_ip = raw.get("src_ip") or raw.get("source_ip") or "127.0.0.1"
    dst_ip = raw.get("dst_ip") or raw.get("destination_ip") or "127.0.0.1"
    dst_port = raw.get("dst_port") or raw.get("destination_port") or 0

    attack_id = str(
        raw.get("attack_id")
        or raw.get("uuid")
        or raw.get("session")
        or f"line-{source_line}"
    )

    attack_vector = str(raw.get("eventid") or raw.get("attack_vector") or raw.get("protocol") or "unknown")
    payload = raw.get("payload") or raw.get("message") or raw.get("input")

    metadata = dict(raw)
    metadata["source_file"] = source_file
    metadata["source_line"] = source_line

    return RawHoneypotRecord(
        attack_id=attack_id,
        timestamp=_safe_timestamp(raw.get("timestamp")),
        source_ip=src_ip,
        destination_ip=dst_ip,
        destination_port=int(dst_port),
        attack_vector=attack_vector,
        metadata=metadata,
        payload=str(payload) if payload is not None else None,
    )
