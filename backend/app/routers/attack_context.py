"""
attack_context router

Exposes the attack_context table (AI v2 output) to the frontend.
Provides:
  GET  /ai/attack-context          — paginated list of all sessions
  GET  /ai/attack-context/active   — only new/ongoing sessions
  GET  /ai/attack-context/{id}     — single session by attack_id
  WS   /ai/attack-context/ws       — WebSocket live feed
"""
from __future__ import annotations

import asyncio
from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.services.persistence import load_recent_attack_contexts, load_attack_history, archive_ended_attack, _connect_postgres, _release_conn

router = APIRouter()
log = logging.getLogger("honeypot.attack_context")

# ─── In-memory live store (populated by ai_client after each AI v2 run) ──────
_live_contexts: Dict[str, Dict[str, Any]] = {}
_ws_clients: List[WebSocket] = []
_ws_lock = asyncio.Lock()


def normalize_ai_output_for_frontend(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize AI v2 output dict into a clean, frontend-ready record.
    Maps field aliases and ensures all expected keys are present.
    """
    attack_status = raw.get("attack_status", raw.get("status", "new"))
    severity = raw.get("severity")

    # Severity → numeric score for frontend progress bars
    severity_score = {
        "Extreme": 100, "High": 80, "Medium": 55, "Mild": 30, "Low": 10
    }.get(severity, 10)

    # Severity → color token
    severity_color = {
        "Extreme": "#ff2d55", "High": "#ff6b35",
        "Medium": "#ffd60a", "Mild": "#30d158", "Low": "#636366"
    }.get(severity, "#636366")

    signal = raw.get("signal", "")
    is_ended = attack_status == "ended" or signal == "STOP_SENDING_LOGS"

    last_seen = raw.get("last_seen_time")
    if last_seen and not isinstance(last_seen, str):
        try:
            last_seen = last_seen.isoformat()
        except AttributeError:
            last_seen = str(last_seen)
    elif not last_seen:
        last_seen = None

    start_time = raw.get("start_time", raw.get("last_seen_time"))
    if start_time and not isinstance(start_time, str):
        try:
            start_time = start_time.isoformat()
        except AttributeError:
            start_time = str(start_time)
    elif not start_time:
        start_time = None

    ended_time = raw.get("ended_time")
    if ended_time and not isinstance(ended_time, str):
        try:
            ended_time = ended_time.isoformat()
        except AttributeError:
            ended_time = str(ended_time)
    elif not ended_time:
        ended_time = None

    return {
        # Core IDs
        "attack_id":       raw.get("attack_id", ""),
        "src_ip":          raw.get("src_ip", ""),
        # AI prediction mapped schema
        "attack_type":     raw.get("attack_type"),
        "threat_level":    str(raw.get("severity", "")).lower() or None,
        "attack_status":   "ended" if is_ended else attack_status,
        "is_active":       not is_ended,
        # Severity
        "severity":        severity,
        "severity_score":  severity_score,
        "severity_color":  severity_color,
        # Counters
        "connection_count":   int(raw.get("connection_count", 0)),
        "failed_count":       int(raw.get("failed_count", 0)),
        "success_count":      int(raw.get("success_count", 0)),
        "unique_passwords":   int(raw.get("unique_passwords", 0)),
        "command_count":      int(raw.get("command_count", 0)),
        "suspicious_cmds":    int(raw.get("suspicious_commands", raw.get("suspicious_cmds", 0))),
        # Timing
        "duration_seconds":  float(raw.get("duration_seconds", 0.0)),
        "start_time":        start_time,
        "last_seen_time":    last_seen,
        "ended_time":        ended_time,
        # Geo
        "location":         raw.get("location"),
        "latitude":         raw.get("latitude"),
        "longitude":        raw.get("longitude"),
        "destination_port": raw.get("destination_port"),
        # Signals
        "signal":            signal,
        # Real attacker commands captured from the logs (post-AI, keyed to this IP+type)
        "attacker_commands": [str(c) for c in (raw.get("commands") or []) if c is not None],
    }


async def _broadcast(message: Dict[str, Any]) -> None:
    """Broadcast a message to all connected WebSocket clients."""
    if not _ws_clients:
        return
    dead = []
    payload = json.dumps(message)
    async with _ws_lock:
        for ws in _ws_clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _ws_clients.remove(ws)


def update_live_context(ai_output: Dict[str, Any]) -> None:
    """
    Called by ai_client whenever AI v2 produces output.
    Updates the in-memory store and schedules a WebSocket broadcast.
    """
    normalized = normalize_ai_output_for_frontend(ai_output)
    attack_id = normalized["attack_id"]
    if not attack_id:
        return
    _live_contexts[attack_id] = normalized
    # Schedule broadcast (fire and forget)
    try:
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(asyncio.ensure_future, _broadcast({
            "type": "attack_context_update",
            "data": normalized
        }))
    except RuntimeError:
        pass  # No event loop running (e.g., during tests)


# ─── REST Endpoints ───────────────────────────────────────────────────────────

@router.get("/attack-context")
def list_attack_contexts(
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="Filter by attack_status: new, ongoing, ended")
) -> Dict[str, Any]:
    """Return all attack sessions (from DB + live in-memory overlay)."""
    # Load from DB
    db_rows = load_recent_attack_contexts(limit)
    # Merge with live in-memory contexts (live takes priority)
    merged: Dict[str, Dict] = {}
    for row in db_rows:
        aid = row.get("attack_id", "")
        if aid:
            merged[aid] = normalize_ai_output_for_frontend({
                **row,
                "suspicious_cmds": row.get("suspicious_cmds", 0)
            })
    # Override with live data - REMOVED because it bypasses DB state transitions (like renewed)
    results = list(merged.values())

    # Apply status filter
    if status:
        results = [r for r in results if r["attack_status"] == status]

    # Sort by last_seen_time desc, then by severity_score desc
    results.sort(key=lambda x: (x.get("last_seen_time") or "", x.get("severity_score", 0)), reverse=True)

    return {
        "status": "success",
        "count": len(results),
        "attack_contexts": results[:limit]
    }


@router.get("/history")
def list_attack_history(
    limit: int = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    """Return finalized (ended) attacks from the immutable attack_history table."""
    rows = load_attack_history(limit)
    normalized = [normalize_ai_output_for_frontend(row) for row in rows]
    return {"status": "success", "count": len(normalized), "history": normalized}


@router.get("/attack-context/active")
def list_active_attacks() -> Dict[str, Any]:
    """Return only new + ongoing attack sessions."""
    db_rows = load_recent_attack_contexts(200)
    merged: Dict[str, Dict] = {}
    for row in db_rows:
        aid = row.get("attack_id", "")
        status = row.get("attack_status", "")
        if aid and status in ("new", "ongoing", "renewed"):
            merged[aid] = normalize_ai_output_for_frontend(row)

    results = sorted(merged.values(), key=lambda x: x.get("severity_score", 0), reverse=True)
    return {"status": "success", "count": len(results), "attack_contexts": results}


@router.get("/attack-context/{attack_id}")
def get_attack_context(attack_id: str) -> Dict[str, Any]:
    """Return a single attack session by ID."""
    # Check live store first
    if attack_id in _live_contexts:
        return {"status": "success", "attack_context": _live_contexts[attack_id]}
    # Fall back to DB
    rows = load_recent_attack_contexts(500)
    for row in rows:
        if row.get("attack_id") == attack_id:
            return {"status": "success", "attack_context": normalize_ai_output_for_frontend(row)}
    return {"status": "not_found", "attack_context": None}




@router.post("/attack-context/{attack_id}/end")
def end_attack_context(attack_id: str) -> Dict[str, Any]:
    """Manually end an attack session server-side."""
    conn = None
    try:
        conn = _connect_postgres()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE public.attack_context SET attack_status = 'ended', ended_time = NOW() WHERE attack_id = %s",
                (attack_id,)
            )
            conn.commit()
            archive_ended_attack(attack_id)
            
        # Also remove from live contexts if it exists there
        if attack_id in _live_contexts:
            _live_contexts[attack_id]["attack_status"] = "ended"
            _live_contexts[attack_id]["is_active"] = False

        # Reset the in-memory AI session so future logs for this attacker start fresh
        try:
            from app.services.ai_client import global_tracker
            if global_tracker:
                global_tracker.end_session(attack_id=attack_id)
        except Exception as e:
            log.warning("Failed to reset in-memory tracker session %s: %s", attack_id, e)

        return {"status": "success", "message": f"Attack {attack_id} ended"}
    except Exception as e:
        log.error(f"Failed to end attack {attack_id}: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            _release_conn(conn)

# ─── WebSocket Endpoint ───────────────────────────────────────────────────────

@router.websocket("/attack-context/ws")
async def attack_context_ws(websocket: WebSocket):
    """
    WebSocket live feed for attack_context updates.
    Frontend connects here and receives real-time attack state changes.
    """
    await websocket.accept()
    async with _ws_lock:
        _ws_clients.append(websocket)
    log.info("WS client connected, total=%d", len(_ws_clients))

    # Send current state on connect
    try:
        current = list(_live_contexts.values())
        await websocket.send_text(json.dumps({
            "type": "initial_state",
            "data": current
        }))
    except Exception:
        pass

    try:
        while True:
            # Keep-alive ping every 30 seconds
            await asyncio.sleep(30)
            try:
                await websocket.send_text(json.dumps({"type": "ping"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        async with _ws_lock:
            if websocket in _ws_clients:
                _ws_clients.remove(websocket)
        log.info("WS client disconnected, total=%d", len(_ws_clients))
