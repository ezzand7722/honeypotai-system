import json
import logging
import sqlite3
import uuid
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
    conn = psycopg.connect(settings.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 30000;")
            cur.execute("SET idle_in_transaction_session_timeout = 30000;")
        conn.commit()
    except Exception as e:
        log.warning(f"Failed to set session timeouts: {e}")
        conn.rollback()
    return conn


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


# ────────────────────────────────────────────────────────────
# Database initialisation
# ────────────────────────────────────────────────────────────

def initialize_database() -> None:
    if _use_postgres():
        log.info("Persistence target: Supabase/Postgres (DATABASE_URL is set)")
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                # Legacy tables (kept for backward compatibility)
                cur.execute("""
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
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS public.event_logs (
                        id BIGSERIAL PRIMARY KEY,
                        event_id TEXT NOT NULL,
                        stage TEXT NOT NULL,
                        payload JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL,
                        UNIQUE(event_id, stage)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS public.ai_results (
                        event_id TEXT PRIMARY KEY,
                        model_version TEXT,
                        threat_level TEXT,
                        risk_score DOUBLE PRECISION,
                        confidence DOUBLE PRECISION,
                        summary TEXT,
                        prediction_payload JSONB,
                        processed_at TIMESTAMPTZ
                    )
                """)
                # NEW: attack_context table (main AI v2 output table)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS public.attack_context (
                        attack_id      VARCHAR(36)  PRIMARY KEY,
                        src_ip         VARCHAR(45)  NOT NULL,
                        attack_type    VARCHAR(50)  NOT NULL,
                        attack_status  VARCHAR(20)  NULL,
                        severity       VARCHAR(20)  NULL,
                        connection_count  INT  NOT NULL DEFAULT 0,
                        failed_count      INT  NOT NULL DEFAULT 0,
                        success_count     INT  NOT NULL DEFAULT 0,
                        unique_passwords   INT  NOT NULL DEFAULT 0,
                        command_count     INT  NOT NULL DEFAULT 0,
                        suspicious_cmds   INT  NOT NULL DEFAULT 0,
                        start_time        TIMESTAMP NOT NULL DEFAULT NOW(),
                        last_seen_time    TIMESTAMP NOT NULL DEFAULT NOW(),
                        ended_time        TIMESTAMP NULL,
                        renewed_count     INT NOT NULL DEFAULT 0,
                        location          VARCHAR(255) NULL,
                        latitude          DOUBLE PRECISION NULL,
                        longitude         DOUBLE PRECISION NULL
                    )
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_attack_context_src_ip
                        ON public.attack_context (src_ip)
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_attack_context_status
                        ON public.attack_context (attack_status)
                """)
            conn.commit()
        finally:
            conn.close()
        return

    log.info("Persistence target: local SQLite at %s", _db_path())
    with _lock:
        conn = _connect()
        try:
            conn.execute("""
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
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS event_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(event_id, stage)
                )
            """)
            conn.execute("""
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
            """)
            # NEW: attack_context table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS attack_context (
                    attack_id      TEXT PRIMARY KEY,
                    src_ip         TEXT NOT NULL,
                    attack_type    TEXT,
                    attack_status  TEXT NOT NULL DEFAULT 'new',
                    severity       TEXT DEFAULT 'Low',
                    connection_count  INTEGER NOT NULL DEFAULT 0,
                    failed_count      INTEGER NOT NULL DEFAULT 0,
                    success_count     INTEGER NOT NULL DEFAULT 0,
                    unique_passwords   INTEGER NOT NULL DEFAULT 0,
                    command_count     INTEGER NOT NULL DEFAULT 0,
                    suspicious_cmds   INTEGER NOT NULL DEFAULT 0,
                    start_time        TEXT NOT NULL,
                    last_seen_time    TEXT NOT NULL,
                    ended_time        TEXT NULL,
                    renewed_count     INTEGER NOT NULL DEFAULT 0,
                    location          TEXT NULL,
                    latitude          REAL NULL,
                    longitude         REAL NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()


# ────────────────────────────────────────────────────────────
# attack_context UPSERT  (called by ai_client after AI v2 runs)
# ────────────────────────────────────────────────────────────

def upsert_attack_context(ai_output: dict) -> None:
    """
    Upsert a single AI v2 output record into attack_context.
    Handles new / ongoing / ended lifecycles.
    """
    attack_id = ai_output.get("attack_id", "")
    if not attack_id:
        log.warning("upsert_attack_context: missing attack_id, skipping")
        return

    src_ip = ai_output.get("src_ip", "")
    attack_type = ai_output.get("attack_type")
    attack_status = ai_output.get("attack_status", "new")
    severity = ai_output.get("severity")
    connection_count = int(ai_output.get("connection_count", 0))
    failed_count = int(ai_output.get("failed_count", 0))
    success_count = int(ai_output.get("success_count", 0))
    unique_passwords = int(ai_output.get("unique_passwords", 0))
    command_count = int(ai_output.get("command_count", 0))
    suspicious_cmds = int(ai_output.get("suspicious_commands", ai_output.get("suspicious_cmds", 0)))
    now = _utc_now()
    ended_time = now if attack_status == "ended" else None

    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO public.attack_context (
                        attack_id, src_ip, attack_type, attack_status, severity,
                        connection_count, failed_count, success_count,
                        unique_passwords, command_count, suspicious_cmds,
                        start_time, last_seen_time, ended_time,
                        location, latitude, longitude
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, %s, %s, %s)
                    ON CONFLICT (src_ip, attack_type) DO UPDATE SET
                        attack_status     = CASE 
                                                WHEN EXCLUDED.attack_status = 'ended' THEN 'ended'
                                                WHEN attack_context.attack_status = 'ended' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN 'renewed'
                                                WHEN attack_context.attack_status = 'renewed' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN 'renewed'
                                                ELSE EXCLUDED.attack_status
                                            END,
                        severity          = EXCLUDED.severity,
                        connection_count  = GREATEST(attack_context.connection_count, EXCLUDED.connection_count),
                        failed_count      = GREATEST(attack_context.failed_count, EXCLUDED.failed_count),
                        success_count     = GREATEST(attack_context.success_count, EXCLUDED.success_count),
                        unique_passwords  = GREATEST(attack_context.unique_passwords, EXCLUDED.unique_passwords),
                        command_count     = GREATEST(attack_context.command_count, EXCLUDED.command_count),
                        suspicious_cmds   = GREATEST(attack_context.suspicious_cmds, EXCLUDED.suspicious_cmds),
                        renewed_count     = CASE 
                                                WHEN attack_context.attack_status = 'ended' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN attack_context.renewed_count + 1
                                                ELSE attack_context.renewed_count
                                            END,
                        last_seen_time    = NOW(),
                        ended_time        = EXCLUDED.ended_time
                """, (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count,
                    unique_passwords, command_count, suspicious_cmds,
                    ended_time,
                    ai_output.get("location"),
                    ai_output.get("latitude"),
                    ai_output.get("longitude"),
                ))
            conn.commit()
            log.info("UPSERT attack_context attack_id=%s status=%s", attack_id, attack_status)
        except Exception as e:
            log.error("Failed to upsert attack_context: %s", e)
        finally:
            conn.close()
        return

    # SQLite fallback
    with _lock:
        conn = _connect()
        try:
            conn.execute("""
                INSERT INTO attack_context (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count,
                    unique_passwords, command_count, suspicious_cmds,
                    start_time, last_seen_time, ended_time,
                    location, latitude, longitude
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (attack_id) DO UPDATE SET
                    attack_status     = excluded.attack_status,
                    severity          = excluded.severity,
                    connection_count  = excluded.connection_count,
                    failed_count      = excluded.failed_count,
                    success_count     = excluded.success_count,
                    unique_passwords  = excluded.unique_passwords,
                    command_count     = excluded.command_count,
                    suspicious_cmds   = excluded.suspicious_cmds,
                    last_seen_time    = excluded.last_seen_time,
                    ended_time        = excluded.ended_time
            """, (
                attack_id, src_ip, attack_type, attack_status, severity,
                connection_count, failed_count, success_count,
                unique_passwords, command_count, suspicious_cmds,
                now, now, ended_time,
                ai_output.get("location"),
                ai_output.get("latitude"),
                ai_output.get("longitude"),
            ))
            conn.commit()
            log.info("UPSERT attack_context attack_id=%s status=%s", attack_id, attack_status)
        except Exception as e:
            log.error("Failed to upsert attack_context (SQLite): %s", e)
        finally:
            conn.close()


def load_recent_attack_contexts(limit: int = 50) -> list[dict]:
    """Load most recent attack_context rows ordered by last_seen_time DESC."""
    results = []
    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude
                    FROM public.attack_context
                    ORDER BY last_seen_time DESC
                    LIMIT %s
                """, (limit,))
                cols = [d[0] for d in cur.description]
                for row in cur.fetchall():
                    results.append(dict(zip(cols, row)))
        except Exception as e:
            log.error("load_recent_attack_contexts postgres error: %s", e)
        finally:
            conn.close()
    else:
        with _lock:
            conn = _connect()
            try:
                cursor = conn.execute("""
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude
                    FROM attack_context
                    ORDER BY last_seen_time DESC
                    LIMIT ?
                """, (limit,))
                for row in cursor.fetchall():
                    results.append(dict(row))
            except Exception as e:
                log.error("load_recent_attack_contexts sqlite error: %s", e)
            finally:
                conn.close()
    return results


# ────────────────────────────────────────────────────────────
# Legacy persistence functions (kept for backward compat)
# ────────────────────────────────────────────────────────────

def persist_ingested_event(
    event: EnrichedEvent,
    raw_log: Optional[dict[str, Any]] = None,
    normalized_log: Optional[dict[str, Any]] = None,
    pipeline_id: Optional[str] = None,
    chunk_index: Optional[int] = None,
) -> None:
    # We no longer assign attack_id at ingestion time to avoid creating garbage placeholder rows in attack_context.
    # The session is only assigned and linked after the AI has classified the real attack type.
    event.attack_id = None
        
    event_json = event.model_dump(mode="json")
    normalized_payload = normalized_log or event_json

    if _use_postgres():
        conn = _connect_postgres()
        try:
            now = _utc_now()
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO public.attack_events (
                        event_id, attack_id, pipeline_id, chunk_index, source_ip, destination_ip, destination_port,
                        attack_vector, severity, risk_score, first_seen, status, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(event_id) DO UPDATE SET
                        attack_id=EXCLUDED.attack_id,
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
                """, (
                    event.event_id, event.attack_id, pipeline_id, chunk_index,
                    str(event.source_ip), str(event.destination_ip), int(event.destination_port),
                    event.attack_vector, event.severity, float(event.risk_score),
                    event.first_seen.isoformat(), "ingested", now, now,
                ))
                if raw_log is not None:
                    cur.execute("""
                        INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                        VALUES (%s, 'raw', %s::jsonb, %s)
                        ON CONFLICT(event_id, stage) DO UPDATE SET
                            payload=EXCLUDED.payload, created_at=EXCLUDED.created_at
                    """, (event.event_id, _json(raw_log), now))
                cur.execute("""
                    INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                    VALUES (%s, 'normalized', %s::jsonb, %s)
                    ON CONFLICT(event_id, stage) DO UPDATE SET
                        payload=EXCLUDED.payload, created_at=EXCLUDED.created_at
                """, (event.event_id, _json(normalized_payload), now))
            conn.commit()
        finally:
            conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            conn.execute("""
                INSERT INTO attack_events (
                    event_id, attack_id, pipeline_id, chunk_index, source_ip, destination_ip, destination_port,
                    attack_vector, severity, risk_score, first_seen, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    attack_id=excluded.attack_id,
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
            """, (
                event.event_id, event.attack_id, pipeline_id, chunk_index,
                str(event.source_ip), str(event.destination_ip), int(event.destination_port),
                event.attack_vector, event.severity, float(event.risk_score),
                event.first_seen.isoformat(), "ingested", now, now,
            ))
            if raw_log is not None:
                conn.execute("""
                    INSERT INTO event_logs (event_id, stage, payload, created_at)
                    VALUES (?, 'raw', ?, ?)
                    ON CONFLICT(event_id, stage) DO UPDATE SET
                        payload=excluded.payload, created_at=excluded.created_at
                """, (event.event_id, _json(raw_log), now))
            conn.execute("""
                INSERT INTO event_logs (event_id, stage, payload, created_at)
                VALUES (?, 'normalized', ?, ?)
                ON CONFLICT(event_id, stage) DO UPDATE SET
                    payload=excluded.payload, created_at=excluded.created_at
            """, (event.event_id, _json(normalized_payload), now))
            conn.commit()
        finally:
            conn.close()

def assign_attack_session(src_ip: str, attack_type: str = None) -> str:
    """
    Assigns or retrieves an attack_id based on the permanent (src_ip, attack_type) DB constraint.
    """
    if not _use_postgres():
        return str(uuid.uuid4())
        
    conn = _connect_postgres()
    try:
        now = _utc_now()
        new_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO public.attack_context (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count, unique_passwords,
                    command_count, suspicious_cmds, start_time, last_seen_time
                ) VALUES (%s, %s, %s, 'new', NULL, 0, 0, 0, 0, 0, 0, %s, %s)
                ON CONFLICT (src_ip, attack_type) DO UPDATE SET
                    last_seen_time = %s,
                    attack_status = CASE WHEN attack_context.attack_status = 'ended' THEN 'renewed' ELSE attack_context.attack_status END,
                    renewed_count = CASE WHEN attack_context.attack_status = 'ended' THEN attack_context.renewed_count + 1 ELSE attack_context.renewed_count END
                RETURNING attack_id
            """, (new_id, src_ip, attack_type, now, now, now))
            attack_id = cur.fetchone()[0]
        conn.commit()
        return attack_id
    finally:
        conn.close()

def persist_log_stage(event_id: str, stage: str, payload: dict[str, Any]) -> None:
    if _use_postgres():
        conn = _connect_postgres()
        try:
            now = _utc_now()
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO public.event_logs (event_id, stage, payload, created_at)
                    VALUES (%s, %s, %s::jsonb, %s)
                    ON CONFLICT(event_id, stage) DO UPDATE SET
                        payload=EXCLUDED.payload, created_at=EXCLUDED.created_at
                """, (event_id, stage, _json(payload), now))
            conn.commit()
        finally:
            conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            conn.execute("""
                INSERT INTO event_logs (event_id, stage, payload, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(event_id, stage) DO UPDATE SET
                    payload=excluded.payload, created_at=excluded.created_at
            """, (event_id, stage, _json(payload), now))
            conn.commit()
        finally:
            conn.close()


def persist_ai_result(event_id: str, prediction: AiPrediction) -> None:
    if _use_postgres():
        conn = _connect_postgres()
        try:
            now = _utc_now()
            prediction_payload = prediction.model_dump(mode="json")
            with conn.cursor() as cur:
                cur.execute("""
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
                """, (
                    event_id, prediction.model_version, prediction.threat_level,
                    float(prediction.risk_score), float(prediction.confidence),
                    prediction.summary, _json(prediction_payload), now,
                ))
                cur.execute("""
                    UPDATE public.attack_events
                    SET status = 'processed',
                        severity = %s,
                        risk_score = %s,
                        attack_id = %s,
                        updated_at = %s
                    WHERE event_id = %s
                """, (prediction.severity, float(prediction.risk_score), prediction.attack_id, now, event_id))
            conn.commit()
        finally:
            conn.close()
        return

    with _lock:
        conn = _connect()
        try:
            now = _utc_now()
            prediction_payload = prediction.model_dump(mode="json")
            conn.execute("""
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
            """, (
                event_id, prediction.model_version, prediction.threat_level,
                float(prediction.risk_score), float(prediction.confidence),
                prediction.summary, _json(prediction_payload), now,
            ))
            conn.execute("""
                UPDATE attack_events
                SET status = 'processed',
                    severity = ?,
                    risk_score = ?,
                    attack_id = ?,
                    updated_at = ?
                WHERE event_id = ?
            """, (prediction.severity, float(prediction.risk_score), prediction.attack_id, now, event_id))
            conn.commit()
        finally:
            conn.close()


def load_all_events() -> list[dict[str, Any]]:
    results = []
    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ae.event_id, ae.pipeline_id, ae.chunk_index, ae.created_at,
                           el.payload as event_payload, ar.prediction_payload
                    FROM public.attack_events ae
                    LEFT JOIN public.event_logs el ON ae.event_id = el.event_id AND el.stage = 'normalized'
                    LEFT JOIN public.ai_results ar ON ae.event_id = ar.event_id
                    ORDER BY ae.created_at DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()
                for row in rows:
                    event_id, pipeline_id, chunk_index, created_at, event_payload, prediction_payload = row
                    results.append({
                        "event_id": event_id,
                        "pipeline_id": pipeline_id,
                        "chunk_index": chunk_index,
                        "created_at": created_at,
                        "event_payload": event_payload,
                        "prediction_payload": prediction_payload
                    })
        except Exception as e:
            log.error("Failed to load events from Postgres: %s", e)
        finally:
            conn.close()
    else:
        with _lock:
            conn = _connect()
            try:
                cursor = conn.execute("""
                    SELECT ae.event_id, ae.pipeline_id, ae.chunk_index, ae.created_at,
                           el.payload as event_payload, ar.prediction_payload
                    FROM attack_events ae
                    LEFT JOIN event_logs el ON ae.event_id = el.event_id AND el.stage = 'normalized'
                    LEFT JOIN ai_results ar ON ae.event_id = ar.event_id
                    ORDER BY ae.created_at DESC
                    LIMIT 200
                """)
                for row in cursor.fetchall():
                    results.append({
                        "event_id": row["event_id"],
                        "pipeline_id": row["pipeline_id"],
                        "chunk_index": row["chunk_index"],
                        "created_at": row["created_at"],
                        "event_payload": json.loads(row["event_payload"]) if row["event_payload"] else None,
                        "prediction_payload": json.loads(row["prediction_payload"]) if row["prediction_payload"] else None
                    })
            except Exception as e:
                log.error("Failed to load events from SQLite: %s", e)
            finally:
                conn.close()
    return results