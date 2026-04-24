import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Optional

import psycopg

from app.config import get_settings
from app.schemas.event import AiPrediction, EnrichedEvent

_lock = Lock()
log = logging.getLogger(__name__)


def _db_path() -> Path:
    settings = get_settings()
    configured = Path(settings.database_path)
    if configured.is_absolute():
        return configured

    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / configured).resolve()


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _use_postgres() -> bool:
    settings = get_settings()
    return bool(settings.database_url)


def _connect_postgres() -> psycopg.Connection:
    settings = get_settings()
    return psycopg.connect(settings.database_url)


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


def initialize_database() -> None:
    if _use_postgres():
        log.info("Persistence target: Supabase/Postgres (DATABASE_URL is set)")
        with _lock:
            conn = _connect_postgres()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS public.attack_events (
                            event_id TEXT PRIMARY KEY,
                            pipeline_id TEXT,
                            chunk_index INTEGER,
                            source_ip INET,
                            destination_ip INET,
                            destination_port INTEGER,
                            attack_vector TEXT,
                            severity TEXT,
                            risk_score DOUBLE PRECISION,
                            first_seen TIMESTAMPTZ,
                            status TEXT,
                            created_at TIMESTAMPTZ,
                            updated_at TIMESTAMPTZ
                        )
                        """
                    )
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS public.event_logs (
                            id BIGSERIAL PRIMARY KEY,
                            event_id TEXT NOT NULL REFERENCES public.attack_events(event_id) ON DELETE CASCADE,
                            stage TEXT NOT NULL,
                            payload JSONB NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL,
                            UNIQUE(event_id, stage)
                        )
                        """
                    )
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS public.ai_results (
                            event_id TEXT PRIMARY KEY REFERENCES public.attack_events(event_id) ON DELETE CASCADE,
                            model_version TEXT,
                            threat_level TEXT,
                            risk_score DOUBLE PRECISION,
                            confidence DOUBLE PRECISION,
                            summary TEXT,
                            prediction_payload JSONB,
                            processed_at TIMESTAMPTZ
                        )
                        """
                    )
                conn.commit()
            finally:
                conn.close()
        return

    log.info("Persistence target: local SQLite at %s", _db_path())

    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS attack_events (
                    event_id TEXT PRIMARY KEY,
                    pipeline_id TEXT,
                    chunk_index INTEGER,
                    source_ip TEXT,
                    destination_ip TEXT,
                    destination_port INTEGER,
                    attack_vector TEXT,
                    severity TEXT,
                    risk_score REAL,
                    first_seen TEXT,
                    status TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS event_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(event_id, stage)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_results (
                    event_id TEXT PRIMARY KEY,
                    model_version TEXT,
                    threat_level TEXT,
                    risk_score REAL,
                    confidence REAL,
                    summary TEXT,
                    prediction_payload TEXT,
                    processed_at TEXT
                )
                """
            )
            conn.commit()
        finally:
            conn.close()


def persist_ingested_event(
    event: EnrichedEvent,
    raw_log: Optional[dict[str, Any]] = None,
    normalized_log: Optional[dict[str, Any]] = None,
    pipeline_id: Optional[str] = None,
    chunk_index: Optional[int] = None,
) -> None:
    event_json = event.model_dump(mode="json")
    normalized_payload = normalized_log or event_json

    if _use_postgres():
        with _lock:
            conn = _connect_postgres()
            try:
                now = _utc_now()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO public.attack_events (
                            event_id, pipeline_id, chunk_index, source_ip, destination_ip, destination_port,
                            attack_vector, severity, risk_score, first_seen, status, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT(event_id) DO UPDATE SET
                            pipeline_id=EXCLUDED.pipeline_id,
                            chunk_index=EXCLUDED.chunk_index,
                            source_ip=EXCLUDED.source_ip,
                            destination_ip=EXCLUDED.destination_ip,
                            destination_port=EXCLUDED.destination_port,
                            attack_vector=EXCLUDED.attack_vector,
                            severity=EXCLUDED.severity,
                            risk_score=EXCLUDED.risk_score,
                            first_seen=EXCLUDED.first_seen,
                            updated_at=EXCLUDED.updated_at
                        """,
                        (
                            event.event_id,
                            pipeline_id,
                            chunk_index,
                            str(event.source_ip),
                            str(event.destination_ip),
                            int(event.destination_port),
                            event.attack_vector,
                            event.severity,
                            float(event.risk_score),
                            event.first_seen.isoformat(),
                            "ingested",
                            now,
                            now,
                        ),
                    )

                    if raw_log is not None:
                        cur.execute(
                            """
                            INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                            VALUES (%s, 'raw', %s::jsonb, %s)
                            ON CONFLICT(event_id, stage) DO UPDATE SET
                                payload=EXCLUDED.payload,
                                created_at=EXCLUDED.created_at
                            """,
                            (event.event_id, _json(raw_log), now),
                        )

                    cur.execute(
                        """
                        INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                        VALUES (%s, 'normalized', %s::jsonb, %s)
                        ON CONFLICT(event_id, stage) DO UPDATE SET
                            payload=EXCLUDED.payload,
                            created_at=EXCLUDED.created_at
                        """,
                        (event.event_id, _json(normalized_payload), now),
                    )

                conn.commit()
            finally:
                conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            conn.execute(
                """
                INSERT INTO attack_events (
                    event_id, pipeline_id, chunk_index, source_ip, destination_ip, destination_port,
                    attack_vector, severity, risk_score, first_seen, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    pipeline_id=excluded.pipeline_id,
                    chunk_index=excluded.chunk_index,
                    source_ip=excluded.source_ip,
                    destination_ip=excluded.destination_ip,
                    destination_port=excluded.destination_port,
                    attack_vector=excluded.attack_vector,
                    severity=excluded.severity,
                    risk_score=excluded.risk_score,
                    first_seen=excluded.first_seen,
                    updated_at=excluded.updated_at
                """,
                (
                    event.event_id,
                    pipeline_id,
                    chunk_index,
                    str(event.source_ip),
                    str(event.destination_ip),
                    int(event.destination_port),
                    event.attack_vector,
                    event.severity,
                    float(event.risk_score),
                    event.first_seen.isoformat(),
                    "ingested",
                    now,
                    now,
                ),
            )

            if raw_log is not None:
                conn.execute(
                    """
                    INSERT INTO event_logs (event_id, stage, payload, created_at)
                    VALUES (?, 'raw', ?, ?)
                    ON CONFLICT(event_id, stage) DO UPDATE SET
                        payload=excluded.payload,
                        created_at=excluded.created_at
                    """,
                    (event.event_id, _json(raw_log), now),
                )

            conn.execute(
                """
                INSERT INTO event_logs (event_id, stage, payload, created_at)
                VALUES (?, 'normalized', ?, ?)
                ON CONFLICT(event_id, stage) DO UPDATE SET
                    payload=excluded.payload,
                    created_at=excluded.created_at
                """,
                (event.event_id, _json(normalized_payload), now),
            )

            conn.commit()
        finally:
            conn.close()


def persist_log_stage(event_id: str, stage: str, payload: dict[str, Any]) -> None:
    if _use_postgres():
        with _lock:
            conn = _connect_postgres()
            try:
                now = _utc_now()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                        VALUES (%s, %s, %s::jsonb, %s)
                        ON CONFLICT(event_id, stage) DO UPDATE SET
                            payload=EXCLUDED.payload,
                            created_at=EXCLUDED.created_at
                        """,
                        (event_id, stage, _json(payload), now),
                    )
                conn.commit()
            finally:
                conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            conn.execute(
                """
                INSERT INTO event_logs (event_id, stage, payload, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(event_id, stage) DO UPDATE SET
                    payload=excluded.payload,
                    created_at=excluded.created_at
                """,
                (event_id, stage, _json(payload), now),
            )
            conn.commit()
        finally:
            conn.close()


def persist_ai_result(event_id: str, prediction: AiPrediction) -> None:
    if _use_postgres():
        with _lock:
            conn = _connect_postgres()
            try:
                now = _utc_now()
                prediction_payload = prediction.model_dump(mode="json")
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO public.ai_results (
                            event_id, model_version, threat_level, risk_score,
                            confidence, summary, prediction_payload, processed_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT(event_id) DO UPDATE SET
                            model_version=EXCLUDED.model_version,
                            threat_level=EXCLUDED.threat_level,
                            risk_score=EXCLUDED.risk_score,
                            confidence=EXCLUDED.confidence,
                            summary=EXCLUDED.summary,
                            prediction_payload=EXCLUDED.prediction_payload,
                            processed_at=EXCLUDED.processed_at
                        """,
                        (
                            event_id,
                            prediction.model_version,
                            prediction.threat_level,
                            float(prediction.risk_score),
                            float(prediction.confidence),
                            prediction.summary,
                            _json(prediction_payload),
                            now,
                        ),
                    )
                    cur.execute(
                        """
                        UPDATE public.attack_events
                        SET status = 'processed', updated_at = %s
                        WHERE event_id = %s
                        """,
                        (now, event_id),
                    )
                conn.commit()
            finally:
                conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            prediction_payload = prediction.model_dump(mode="json")
            conn.execute(
                """
                INSERT INTO ai_results (
                    event_id, model_version, threat_level, risk_score,
                    confidence, summary, prediction_payload, processed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    model_version=excluded.model_version,
                    threat_level=excluded.threat_level,
                    risk_score=excluded.risk_score,
                    confidence=excluded.confidence,
                    summary=excluded.summary,
                    prediction_payload=excluded.prediction_payload,
                    processed_at=excluded.processed_at
                """,
                (
                    event_id,
                    prediction.model_version,
                    prediction.threat_level,
                    float(prediction.risk_score),
                    float(prediction.confidence),
                    prediction.summary,
                    _json(prediction_payload),
                    now,
                ),
            )
            conn.execute(
                """
                UPDATE attack_events
                SET status = 'processed', updated_at = ?
                WHERE event_id = ?
                """,
                (now, event_id),
            )
            conn.commit()
        finally:
            conn.close()