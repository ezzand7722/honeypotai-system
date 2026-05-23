import asyncio
import psutil
import threading
import time

from fastapi import APIRouter

router = APIRouter()

_lock = threading.Lock()
_last_net_io = None
_last_net_time = None

@router.get("/stats")
async def get_system_stats():
    global _last_net_io, _last_net_time

    # psutil.cpu_percent(interval=...) is blocking; run it off the event loop.
    cpu_percent = await asyncio.to_thread(psutil.cpu_percent, 0.1)

    virtual_mem = psutil.virtual_memory()
    ram_used_gb = virtual_mem.used / (1024**3)
    ram_total_gb = virtual_mem.total / (1024**3)

    current_net_io = psutil.net_io_counters()
    current_time = time.monotonic()

    with _lock:
        if _last_net_io is None or _last_net_time is None:
            bytes_sent_sec = 0.0
            bytes_recv_sec = 0.0
        else:
            time_delta = current_time - _last_net_time
            if time_delta <= 0:
                bytes_sent_sec = 0.0
                bytes_recv_sec = 0.0
            else:
                sent_delta = current_net_io.bytes_sent - _last_net_io.bytes_sent
                recv_delta = current_net_io.bytes_recv - _last_net_io.bytes_recv

                # Counters can reset on interface changes; clamp to 0.
                if sent_delta < 0:
                    sent_delta = 0
                if recv_delta < 0:
                    recv_delta = 0

                bytes_sent_sec = sent_delta / time_delta
                bytes_recv_sec = recv_delta / time_delta

        _last_net_io = current_net_io
        _last_net_time = current_time

    def format_bandwidth(bytes_per_sec: float) -> str:
        if bytes_per_sec >= 1024 * 1024:
            return f"{bytes_per_sec / (1024 * 1024):.1f} MB/s"
        if bytes_per_sec >= 1024:
            return f"{bytes_per_sec / 1024:.1f} KB/s"
        return f"{bytes_per_sec:.0f} B/s"

    network_str = f"↓ {format_bandwidth(bytes_recv_sec)} | ↑ {format_bandwidth(bytes_sent_sec)}"

    return {
        "cpu": f"{cpu_percent:.1f}%",
        "ram": f"{ram_used_gb:.1f} GB / {ram_total_gb:.1f}GB",
        "network": network_str,
        "raw": {
            "cpu_percent": cpu_percent,
            "ram_used_gb": ram_used_gb,
            "ram_total_gb": ram_total_gb,
            "bytes_sent_sec": bytes_sent_sec,
            "bytes_recv_sec": bytes_recv_sec,
            "bytes_sent_total": current_net_io.bytes_sent,
            "bytes_recv_total": current_net_io.bytes_recv,
        },
    }
