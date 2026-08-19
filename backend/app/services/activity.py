"""Track last honeypot/log ingest time for idle-based DB reset."""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_last_ingest_ts: float = time.time()


def touch_ingest_activity() -> None:
    """Call on any real log/event ingest (not on UI polls)."""
    global _last_ingest_ts
    with _lock:
        _last_ingest_ts = time.time()


def seconds_since_last_ingest() -> float:
    with _lock:
        return time.time() - _last_ingest_ts


def last_ingest_ts() -> float:
    with _lock:
        return _last_ingest_ts
