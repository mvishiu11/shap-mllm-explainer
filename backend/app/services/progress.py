import time
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Any


@dataclass
class ProgressState:
    job_id: str
    status: str = "running"  # running|done|error
    current: int = 0
    total: int | None = None
    percent: float = 0.0
    message: str | None = None
    started_at: float = 0.0
    updated_at: float = 0.0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # keep timestamps readable-ish for JS
        d["started_at"] = self.started_at
        d["updated_at"] = self.updated_at
        return d


_lock = Lock()
_states: dict[str, ProgressState] = {}


def init_job(job_id: str, *, total: int | None = None, message: str | None = None) -> ProgressState:
    now = time.time()
    state = ProgressState(job_id=job_id, total=total, message=message, started_at=now, updated_at=now)
    with _lock:
        _states[job_id] = state
    return state


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    current: int | None = None,
    total: int | None = None,
    percent: float | None = None,
    message: str | None = None,
    error: str | None = None,
) -> None:
    now = time.time()
    with _lock:
        state = _states.get(job_id)
        if state is None:
            state = ProgressState(job_id=job_id, started_at=now, updated_at=now)
            _states[job_id] = state

        if status is not None:
            state.status = status
        if current is not None:
            state.current = current
        if total is not None:
            state.total = total
        if percent is not None:
            state.percent = max(0.0, min(1.0, percent))
        if message is not None:
            state.message = message
        if error is not None:
            state.error = error
        state.updated_at = now


def get_job(job_id: str) -> ProgressState | None:
    with _lock:
        state = _states.get(job_id)
        if state is None:
            return None
        # return a shallow copy to avoid mutation by callers
        return ProgressState(**state.to_dict())


def finish_job(job_id: str, *, message: str | None = None) -> None:
    update_job(job_id, status="done", percent=1.0, message=message)


def fail_job(job_id: str, *, error: str, message: str | None = None) -> None:
    update_job(job_id, status="error", error=error, message=message, percent=1.0)
