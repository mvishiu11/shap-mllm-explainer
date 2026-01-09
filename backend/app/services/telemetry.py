import os
import subprocess
import time
from dataclasses import asdict, dataclass

import psutil


@dataclass
class TelemetrySnapshot:
    ts: float
    cpu_percent: float
    ram_percent: float
    process_rss_mb: float
    gpu_util_percent: float | None = None
    gpu_mem_used_mb: float | None = None
    gpu_mem_total_mb: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _try_nvidia_smi() -> tuple[float | None, float | None, float | None]:
    cmd = [
        "nvidia-smi",
        "--query-gpu=utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
    ]
    try:
        p = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=1.0)
    except Exception:
        return None, None, None

    line = (p.stdout or "").strip().splitlines()
    if not line:
        return None, None, None

    parts = [x.strip() for x in line[0].split(",")]
    if len(parts) < 3:
        return None, None, None

    try:
        util = float(parts[0])
        mem_used = float(parts[1])
        mem_total = float(parts[2])
        return util, mem_used, mem_total
    except Exception:
        return None, None, None


def get_telemetry_snapshot() -> TelemetrySnapshot:
    # CPU percentage is measured since last call; this endpoint is polled so that's fine.
    cpu_percent = float(psutil.cpu_percent(interval=None))
    ram_percent = float(psutil.virtual_memory().percent)

    proc = psutil.Process(os.getpid())
    process_rss_mb = float(proc.memory_info().rss) / (1024.0 * 1024.0)

    gpu_util, gpu_mem_used, gpu_mem_total = _try_nvidia_smi()

    return TelemetrySnapshot(
        ts=time.time(),
        cpu_percent=cpu_percent,
        ram_percent=ram_percent,
        process_rss_mb=process_rss_mb,
        gpu_util_percent=gpu_util,
        gpu_mem_used_mb=gpu_mem_used,
        gpu_mem_total_mb=gpu_mem_total,
    )
