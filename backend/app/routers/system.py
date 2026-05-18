import psutil
import time
from fastapi import APIRouter

router = APIRouter()

last_net_io = psutil.net_io_counters()
last_net_time = time.time()

@router.get("/stats")
async def get_system_stats():
    global last_net_io, last_net_time
    
    cpu_percent = psutil.cpu_percent(interval=None)
    
    virtual_mem = psutil.virtual_memory()
    # Convert bytes to GB
    ram_used_gb = virtual_mem.used / (1024 ** 3)
    ram_total_gb = virtual_mem.total / (1024 ** 3)
    
    current_net_io = psutil.net_io_counters()
    current_time = time.time()
    
    time_delta = current_time - last_net_time
    if time_delta > 0:
        bytes_sent_sec = (current_net_io.bytes_sent - last_net_io.bytes_sent) / time_delta
        bytes_recv_sec = (current_net_io.bytes_recv - last_net_io.bytes_recv) / time_delta
    else:
        bytes_sent_sec = 0
        bytes_recv_sec = 0
        
    last_net_io = current_net_io
    last_net_time = current_time
    
    def format_bandwidth(bytes_per_sec):
        if bytes_per_sec > 1024 * 1024:
            return f"{bytes_per_sec / (1024 * 1024):.1f} MB/s"
        return f"{bytes_per_sec / 1024:.1f} KB/s"
        
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
            "bytes_recv_sec": bytes_recv_sec
        }
    }
