from __future__ import annotations

import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class ManagedProcess:
    name: str
    popen: subprocess.Popen[Any]
    started_at: float
    started_by_backend: bool

    @property
    def pid(self) -> int:
        return int(self.popen.pid)

    def is_alive(self) -> bool:
        return self.popen.poll() is None


class ProcessRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._processes: dict[str, ManagedProcess] = {}

    def register(self, name: str, popen: subprocess.Popen[Any], started_by_backend: bool = True) -> ManagedProcess:
        process = ManagedProcess(
            name=name,
            popen=popen,
            started_at=time.time(),
            started_by_backend=started_by_backend,
        )
        with self._lock:
            self._processes[name] = process
        return process

    def get(self, name: str) -> ManagedProcess | None:
        with self._lock:
            process = self._processes.get(name)
        if process and not process.is_alive():
            self.unregister(name)
            return None
        return process

    def unregister(self, name: str) -> None:
        with self._lock:
            self._processes.pop(name, None)

    def list_active(self) -> list[dict[str, Any]]:
        active: list[dict[str, Any]] = []
        with self._lock:
            names = list(self._processes.keys())
        for name in names:
            process = self.get(name)
            if not process:
                continue
            active.append(
                {
                    "name": name,
                    "pid": process.pid,
                    "startedAt": process.started_at,
                    "startedByBackend": process.started_by_backend,
                }
            )
        return active

    def terminate(self, name: str, timeout_seconds: float = 6.0) -> bool:
        process = self.get(name)
        if process is None:
            return True
        try:
            process.popen.terminate()
            process.popen.wait(timeout=timeout_seconds)
            self.unregister(name)
            return True
        except Exception:
            try:
                process.popen.kill()
                process.popen.wait(timeout=2.0)
            except Exception:
                return False
            finally:
                self.unregister(name)
            return True

    def terminate_all(self) -> None:
        with self._lock:
            names = list(self._processes.keys())
        for name in names:
            self.terminate(name)

