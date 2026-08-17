import json
import logging
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Optional

import psycopg

try:
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover - optional dependency
    ConnectionPool = None

from app.config import get_settings
from app.schemas.event import AiPrediction, EnrichedEvent

_lock = Lock()
log = logging.getLogger(__name__)

_pg_pool = None
_pg_pool_lock = Lock()


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


def _configure_connection(conn: psycopg.Connection) -> None:
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 30000;")
            cur.execute("SET idle_in_transaction_session_timeout = 30000;")
        conn.commit()
    except Exception as e:
        log.warning(f"Failed to set session timeouts: {e}")
        try:
            conn.rollback()
        except Exception:
            pass


def _get_pool():
    """Return a shared psycopg_pool.ConnectionPool, or None if unavailable."""
    global _pg_pool
    if _pg_pool is not None:
        return _pg_pool or None
    settings = get_settings()
    if not settings.database_url or ConnectionPool is None:
        _pg_pool = False
        return None
    with _pg_pool_lock:
        if _pg_pool is None:
            try:
                _pg_pool = ConnectionPool(
                    settings.database_url,
                    min_size=1,
                    max_size=10,
                    open=True,
                    configure=_configure_connection,
                )
                log.info("Postgres connection pool initialized (min=1, max=10)")
            except Exception as e:
                log.warning("Failed to initialize connection pool, falling back to per-call connections: %s", e)
                _pg_pool = False
    return _pg_pool or None


def _connect_postgres() -> psycopg.Connection:
    pool = _get_pool()
    if pool is not None:
        return pool.getconn()
    settings = get_settings()
    conn = psycopg.connect(settings.database_url)
    _configure_connection(conn)
    return conn


def _release_conn(c) -> None:
    """Release a DB connection back to the pool (or close it)."""
    if c is None:
        return
    pool = _get_pool()
    if pool is not None:
        try:
            pool.putconn(c)
            return
        except Exception as e:
            log.debug("Error returning connection to pool: %s", e)
    try:
        c.close()
    except Exception:
        pass


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
                        commands          JSONB NULL,
                        start_time        TIMESTAMP NOT NULL DEFAULT NOW(),
                        last_seen_time    TIMESTAMP NOT NULL DEFAULT NOW(),
                        ended_time        TIMESTAMP NULL,
                        renewed_count     INT NOT NULL DEFAULT 0,
                        location          VARCHAR(255) NULL,
                        latitude          DOUBLE PRECISION NULL,
                        longitude         DOUBLE PRECISION NULL,
                        destination_port  INT NULL,
                        UNIQUE(src_ip, attack_type)
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
                cur.execute("""
                    ALTER TABLE public.attack_context ADD COLUMN IF NOT EXISTS commands JSONB
                """)
                cur.execute("""
                    ALTER TABLE public.attack_context ADD COLUMN IF NOT EXISTS destination_port INT
                """)
                # Append-only archive of finalized (ended) attacks. Never truncated
                # by the DB reset loop — this is what the frontend History tab reads.
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS public.attack_history (
                        id BIGSERIAL PRIMARY KEY,
                        attack_id VARCHAR(36) NOT NULL,
                        src_ip VARCHAR(45) NOT NULL,
                        attack_type VARCHAR(50),
                        attack_status VARCHAR(20),
                        severity VARCHAR(20),
                        connection_count INT NOT NULL DEFAULT 0,
                        failed_count INT NOT NULL DEFAULT 0,
                        success_count INT NOT NULL DEFAULT 0,
                        unique_passwords INT NOT NULL DEFAULT 0,
                        command_count INT NOT NULL DEFAULT 0,
                        suspicious_cmds INT NOT NULL DEFAULT 0,
                        commands JSONB,
                        start_time TIMESTAMP,
                        last_seen_time TIMESTAMP,
                        ended_time TIMESTAMP,
                        renewed_count INT NOT NULL DEFAULT 0,
                        location VARCHAR(255),
                        latitude DOUBLE PRECISION,
                        longitude DOUBLE PRECISION,
                        destination_port INT,
                        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(attack_id, ended_time)
                    )
                """)
            conn.commit()
        finally:
            _release_conn(conn)
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
                    commands          TEXT,
                    start_time        TEXT NOT NULL,
                    last_seen_time    TEXT NOT NULL,
                    ended_time        TEXT NULL,
                    renewed_count     INTEGER NOT NULL DEFAULT 0,
                    location          TEXT NULL,
                    latitude          REAL NULL,
                    longitude         REAL NULL,
                    destination_port  INTEGER NULL,
                    UNIQUE(src_ip, attack_type)
                )
            """)
            try:
                conn.execute("ALTER TABLE attack_context ADD COLUMN commands TEXT")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE attack_context ADD COLUMN destination_port INTEGER")
            except Exception:
                pass
            # Append-only archive of finalized (ended) attacks. Never truncated
            # by the DB reset loop — this is what the frontend History tab reads.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS attack_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    attack_id TEXT NOT NULL,
                    src_ip TEXT NOT NULL,
                    attack_type TEXT,
                    attack_status TEXT,
                    severity TEXT,
                    connection_count INTEGER NOT NULL DEFAULT 0,
                    failed_count INTEGER NOT NULL DEFAULT 0,
                    success_count INTEGER NOT NULL DEFAULT 0,
                    unique_passwords INTEGER NOT NULL DEFAULT 0,
                    command_count INTEGER NOT NULL DEFAULT 0,
                    suspicious_cmds INTEGER NOT NULL DEFAULT 0,
                    commands TEXT,
                    start_time TEXT,
                    last_seen_time TEXT,
                    ended_time TEXT,
                    renewed_count INTEGER NOT NULL DEFAULT 0,
                    location TEXT,
                    latitude REAL,
                    longitude REAL,
                    destination_port INTEGER,
                    archived_at TEXT NOT NULL,
                    UNIQUE(attack_id, ended_time)
                )
            """)
            conn.commit()
        finally:
            _release_conn(conn)


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
    commands = ai_output.get("commands") or []
    destination_port = ai_output.get("destination_port") or ai_output.get("dst_port")
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
                        unique_passwords, command_count, suspicious_cmds, commands,
                        start_time, last_seen_time, ended_time,
                        location, latitude, longitude, destination_port
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW(), NOW(), %s, %s, %s, %s, %s)
                    ON CONFLICT (src_ip, attack_type) DO UPDATE SET
                        attack_status     = CASE 
                                                WHEN EXCLUDED.attack_status = 'ended' THEN 'ended'
                                                WHEN attack_context.attack_status = 'ended' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN 'renewed'
                                                WHEN attack_context.attack_status = 'renewed' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN 'renewed'
                                                ELSE EXCLUDED.attack_status
                                            END,
                        severity          = EXCLUDED.severity,
                        connection_count  = EXCLUDED.connection_count,
                        failed_count      = EXCLUDED.failed_count,
                        success_count     = EXCLUDED.success_count,
                        unique_passwords  = EXCLUDED.unique_passwords,
                        command_count     = EXCLUDED.command_count,
                        suspicious_cmds   = EXCLUDED.suspicious_cmds,
                        commands          = EXCLUDED.commands,
                        destination_port  = COALESCE(EXCLUDED.destination_port, attack_context.destination_port),
                        renewed_count     = CASE 
                                                WHEN attack_context.attack_status = 'ended' AND EXCLUDED.attack_status IN ('ongoing', 'new') THEN attack_context.renewed_count + 1
                                                ELSE attack_context.renewed_count
                                            END,
                        last_seen_time    = NOW(),
                        ended_time        = EXCLUDED.ended_time
                """, (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count,
                    unique_passwords, command_count, suspicious_cmds, _json(commands),
                    ended_time,
                    ai_output.get("location"),
                    ai_output.get("latitude"),
                    ai_output.get("longitude"),
                    destination_port,
                ))
            conn.commit()
            log.info("UPSERT attack_context attack_id=%s status=%s", attack_id, attack_status)
        except Exception as e:
            log.error("Failed to upsert attack_context: %s", e)
        finally:
            _release_conn(conn)
        if attack_status == "ended":
            archive_ended_attack(attack_id)
        return

    # SQLite fallback
    with _lock:
        conn = _connect()
        try:
            conn.execute("""
                INSERT INTO attack_context (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count,
                    unique_passwords, command_count, suspicious_cmds, commands,
                    start_time, last_seen_time, ended_time,
                    location, latitude, longitude, destination_port
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (attack_id) DO UPDATE SET
                    attack_status     = excluded.attack_status,
                    severity          = excluded.severity,
                    connection_count  = excluded.connection_count,
                    failed_count      = excluded.failed_count,
                    success_count     = excluded.success_count,
                    unique_passwords  = excluded.unique_passwords,
                    command_count     = excluded.command_count,
                    suspicious_cmds   = excluded.suspicious_cmds,
                    commands          = excluded.commands,
                    destination_port  = excluded.destination_port,
                    last_seen_time    = excluded.last_seen_time,
                    ended_time        = excluded.ended_time
            """, (
                attack_id, src_ip, attack_type, attack_status, severity,
                connection_count, failed_count, success_count,
                unique_passwords, command_count, suspicious_cmds, _json(commands),
                now, now, ended_time,
                ai_output.get("location"),
                ai_output.get("latitude"),
                ai_output.get("longitude"),
                destination_port,
            ))
            conn.commit()
            log.info("UPSERT attack_context attack_id=%s status=%s", attack_id, attack_status)
        except Exception as e:
            log.error("Failed to upsert attack_context (SQLite): %s", e)
        finally:
            _release_conn(conn)

    if attack_status == "ended":
        archive_ended_attack(attack_id)


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
                           unique_passwords, command_count, suspicious_cmds, commands,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude, destination_port
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
            _release_conn(conn)
    else:
        with _lock:
            conn = _connect()
            try:
                cursor = conn.execute("""
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds, commands,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude, destination_port
                    FROM attack_context
                    ORDER BY last_seen_time DESC
                    LIMIT ?
                """, (limit,))
                for row in cursor.fetchall():
                    rec = dict(row)
                    if isinstance(rec.get("commands"), str):
                        try:
                            rec["commands"] = json.loads(rec["commands"])
                        except Exception:
                            rec["commands"] = []
                    results.append(rec)
            except Exception as e:
                log.error("load_recent_attack_contexts sqlite error: %s", e)
            finally:
                _release_conn(conn)
    return results


def archive_ended_attack(attack_id: str) -> None:
    """Copy an ended attack_context row into the append-only attack_history table.

    Idempotent (UNIQUE on (attack_id, ended_time)) and never truncated by the
    reset loop, so the frontend History tab can show past attacks forever.
    """
    if not attack_id:
        return

    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO public.attack_history (
                        attack_id, src_ip, attack_type, attack_status, severity,
                        connection_count, failed_count, success_count,
                        unique_passwords, command_count, suspicious_cmds, commands,
                        start_time, last_seen_time, ended_time, renewed_count,
                        location, latitude, longitude, destination_port
                    )
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds, commands,
                           start_time, last_seen_time, ended_time, renewed_count,
                           location, latitude, longitude, destination_port
                    FROM public.attack_context
                    WHERE attack_id = %s AND attack_status = 'ended'
                    ON CONFLICT (attack_id, ended_time) DO NOTHING
                """, (attack_id,))
            conn.commit()
            log.info("Archived ended attack %s to attack_history", attack_id)
        except Exception as e:
            log.error("Failed to archive ended attack %s: %s", attack_id, e)
        finally:
            _release_conn(conn)
        return

    with _lock:
        conn = _connect()
        try:
            conn.execute("""
                INSERT OR IGNORE INTO attack_history (
                    attack_id, src_ip, attack_type, attack_status, severity,
                    connection_count, failed_count, success_count,
                    unique_passwords, command_count, suspicious_cmds, commands,
                    start_time, last_seen_time, ended_time, renewed_count,
                    location, latitude, longitude, destination_port, archived_at
                )
                SELECT attack_id, src_ip, attack_type, attack_status, severity,
                       connection_count, failed_count, success_count,
                       unique_passwords, command_count, suspicious_cmds, commands,
                       start_time, last_seen_time, ended_time, renewed_count,
                       location, latitude, longitude, destination_port, ?
                FROM attack_context
                WHERE attack_id = ? AND attack_status = 'ended'
            """, (_utc_now(), attack_id))
            conn.commit()
            log.info("Archived ended attack %s to attack_history (SQLite)", attack_id)
        except Exception as e:
            log.error("Failed to archive ended attack %s (SQLite): %s", attack_id, e)
        finally:
            _release_conn(conn)


def load_attack_history(limit: int = 200) -> list[dict]:
    """Load finalized attacks from the immutable attack_history table."""
    results = []
    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds, commands,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude, destination_port, archived_at
                    FROM public.attack_history
                    ORDER BY ended_time DESC, id DESC
                    LIMIT %s
                """, (limit,))
                cols = [d[0] for d in cur.description]
                for row in cur.fetchall():
                    results.append(dict(zip(cols, row)))
        except Exception as e:
            log.error("load_attack_history postgres error: %s", e)
        finally:
            _release_conn(conn)
    else:
        with _lock:
            conn = _connect()
            try:
                cursor = conn.execute("""
                    SELECT attack_id, src_ip, attack_type, attack_status, severity,
                           connection_count, failed_count, success_count,
                           unique_passwords, command_count, suspicious_cmds, commands,
                           start_time, last_seen_time, ended_time,
                           location, latitude, longitude, destination_port, archived_at
                    FROM attack_history
                    ORDER BY ended_time DESC, id DESC
                    LIMIT ?
                """, (limit,))
                for row in cursor.fetchall():
                    rec = dict(row)
                    if isinstance(rec.get("commands"), str):
                        try:
                            rec["commands"] = json.loads(rec["commands"])
                        except Exception:
                            rec["commands"] = []
                    results.append(rec)
            except Exception as e:
                log.error("load_attack_history sqlite error: %s", e)
            finally:
                _release_conn(conn)
    return results


def truncate_all_tables() -> None:
    tables = ["attack_events", "event_logs", "ai_results", "attack_context"]
    if _use_postgres():
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                for tbl in tables:
                    cur.execute(f"TRUNCATE TABLE public.{tbl} CASCADE")
            conn.commit()
            log.info("Truncated all Postgres tables: %s", tables)
        except Exception as e:
            log.error("Failed to truncate Postgres tables: %s", e)
        finally:
            _release_conn(conn)
        return

    with _lock:
        conn = _connect()
        try:
            for tbl in tables:
                conn.execute(f"DELETE FROM {tbl}")
            conn.commit()
            log.info("Truncated all SQLite tables: %s", tables)
        except Exception as e:
            log.error("Failed to truncate SQLite tables: %s", e)
        finally:
            _release_conn(conn)


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

    dest_ip = str(event.destination_ip) if event.destination_ip is not None else None

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
                    str(event.source_ip), dest_ip, int(event.destination_port),
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
            _release_conn(conn)
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
                str(event.source_ip), dest_ip, int(event.destination_port),
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
            _release_conn(conn)

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
        _release_conn(conn)

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
            _release_conn(conn)
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
            _release_conn(conn)


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
            _release_conn(conn)
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
            _release_conn(conn)


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
            _release_conn(conn)
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
                _release_conn(conn)
    return results
