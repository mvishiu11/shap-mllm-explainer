import contextvars
import logging
from collections import deque
from dataclasses import dataclass
from threading import Lock
from typing import Deque


_job_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("job_id", default=None)


def set_current_job_id(job_id: str | None) -> None:
    _job_id_var.set(job_id)


def get_current_job_id() -> str | None:
    return _job_id_var.get()


@dataclass
class JobLogState:
    job_id: str
    lines: Deque[str]


_lock = Lock()
_states: dict[str, JobLogState] = {}


class InMemoryJobLogHandler(logging.Handler):
    def __init__(self, *, max_lines: int = 500) -> None:
        super().__init__()
        self._max_lines = max_lines

    def emit(self, record: logging.LogRecord) -> None:
        job_id = get_current_job_id()
        if not job_id:
            return

        try:
            msg = self.format(record)
        except Exception:
            msg = record.getMessage()

        with _lock:
            state = _states.get(job_id)
            if state is None:
                state = JobLogState(job_id=job_id, lines=deque(maxlen=self._max_lines))
                _states[job_id] = state
            state.lines.append(msg)


def get_job_logs(job_id: str, *, last: int = 200) -> list[str] | None:
    with _lock:
        state = _states.get(job_id)
        if state is None:
            return None
        if last <= 0:
            return []
        return list(state.lines)[-last:]


def clear_job_logs(job_id: str) -> None:
    with _lock:
        _states.pop(job_id, None)
