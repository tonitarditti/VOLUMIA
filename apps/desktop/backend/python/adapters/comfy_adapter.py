from __future__ import annotations

import json
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from threading import Event
from typing import Any, Callable

from config import (
    COMFY_BASE_URL,
    COMFY_DEFAULT_WORKFLOW,
    COMFY_DIR,
    COMFY_HOST,
    COMFY_PORT,
    COMFY_PYTHON_EXE,
    COMFY_STARTUP_TIMEOUT_MS,
    COMFY_WORKFLOW_TIMEOUT_MS,
    COMFY_WORKFLOW_DIR,
    RUNTIME_LOGS_DIR,
    USE_COMFY_ADAPTER,
)
from core.job_manager import JobCancelledError


class ComfyAdapter:
    def __init__(self, process_registry: Any) -> None:
        self._process_registry = process_registry
        self._state = "not_started"
        self._state_lock = threading.Lock()
        self._last_error: str | None = None
        self._base_url = COMFY_BASE_URL
        self._host = COMFY_HOST
        self._port = COMFY_PORT
        self._config: dict[str, Any] = {
            "host": self._host,
            "port": self._port,
            "baseUrl": self._base_url,
            "comfyDir": str(COMFY_DIR),
            "pythonExeOverride": COMFY_PYTHON_EXE,
            "startupTimeoutMs": COMFY_STARTUP_TIMEOUT_MS,
        }
        self._process_name = "comfyui"

    def _set_state(self, next_state: str, error: str | None = None) -> None:
        with self._state_lock:
            self._state = next_state
            self._last_error = error

    def status(self) -> dict[str, Any]:
        process = self._process_registry.get(self._process_name)
        running = process is not None and process.is_alive()
        healthy = self._healthcheck()
        with self._state_lock:
            state = self._state
            last_error = self._last_error
        if healthy and state in {"starting", "not_started", "degraded", "failed"}:
            state = "healthy"
        return {
            "state": state,
            "running": running or healthy,
            "healthy": healthy,
            "url": self._base_url,
            "host": self._host,
            "port": self._port,
            "pid": process.pid if process else None,
            "startedByBackend": process is not None,
            "lastError": last_error,
            "message": "ComfyUI ready." if healthy else (last_error or "ComfyUI unavailable."),
            "config": self.get_config(),
        }

    def get_config(self) -> dict[str, Any]:
        return dict(self._config)

    def patch_config(self, patch: dict[str, Any]) -> dict[str, Any]:
        for key in ("host", "port", "baseUrl", "comfyDir", "pythonExeOverride", "startupTimeoutMs"):
            if key not in patch:
                continue
            value = patch[key]
            if key == "port":
                self._config[key] = int(value)
            elif key == "startupTimeoutMs":
                self._config[key] = int(value)
            else:
                self._config[key] = str(value)

        self._host = str(self._config["host"])
        self._port = int(self._config["port"])
        self._base_url = str(self._config["baseUrl"]).rstrip("/")
        return self.get_config()

    def ensure_server(self) -> dict[str, Any]:
        if self._healthcheck():
            self._set_state("healthy")
            return self.status()

        if not USE_COMFY_ADAPTER:
            self._set_state("failed", "ComfyUI is not running and USE_COMFY_ADAPTER is disabled.")
            raise RuntimeError("COMFY_START_FAILED: ComfyUI is unavailable and adapter autostart is disabled.")

        process = self._process_registry.get(self._process_name)
        if process and process.is_alive():
            self._wait_until_healthy(timeout_ms=int(self._config.get("startupTimeoutMs") or COMFY_STARTUP_TIMEOUT_MS))
            self._set_state("healthy")
            return self.status()

        self._set_state("starting")
        self._start_process()
        self._wait_until_healthy(timeout_ms=int(self._config.get("startupTimeoutMs") or COMFY_STARTUP_TIMEOUT_MS))
        self._set_state("healthy")
        return self.status()

    def stop_server(self) -> dict[str, Any]:
        self._process_registry.terminate(self._process_name)
        self._set_state("stopped")
        return self.status()

    def execute_workflow(
        self,
        image_path: str,
        workflow_name: str | None = None,
        project_id: str | None = None,
        preset: str | None = None,
        progress_cb: Callable[[int, str], None] | None = None,
        cancel_event: Event | None = None,
    ) -> dict[str, Any]:
        _ = preset  # Preset reserved for workflow patching phase.
        self.ensure_server()
        self._set_state("busy")
        if progress_cb:
            progress_cb(8, "Starting Comfy workflow")

        workflow_payload = self._load_workflow_json(workflow_name)
        uploaded_image_name = self._install_input_image(image_path, project_id)
        patched_workflow = self._inject_image(workflow_payload, uploaded_image_name)

        if cancel_event and cancel_event.is_set():
            raise JobCancelledError("Cancelled before workflow queueing")

        queue_response = self._post_json("/prompt", {"prompt": patched_workflow})
        prompt_id = str((queue_response or {}).get("prompt_id") or "").strip()
        if not prompt_id:
            raise RuntimeError("WORKFLOW_VALIDATION_FAILED: ComfyUI did not return prompt_id.")

        if progress_cb:
            progress_cb(18, f"Workflow queued ({prompt_id})")

        started = time.time()
        while (time.time() - started) * 1000 <= COMFY_WORKFLOW_TIMEOUT_MS:
            if cancel_event and cancel_event.is_set():
                self._cancel_prompt(prompt_id)
                raise JobCancelledError("Cancelled during Comfy execution")

            history = self._get_json(f"/history/{urllib.parse.quote(prompt_id)}")
            history_entry = None
            if isinstance(history, dict):
                history_entry = history.get(prompt_id)
                if history_entry is None and history:
                    history_entry = next(iter(history.values()))

            if history_entry:
                files = self._extract_output_files(history_entry)
                if progress_cb:
                    progress_cb(84, "Comfy workflow completed")
                self._set_state("healthy")
                outputs = self._to_output_payload(files)
                return {
                    "promptId": prompt_id,
                    "workflowName": workflow_name or COMFY_DEFAULT_WORKFLOW,
                    "output": outputs,
                    "history": history_entry,
                }

            if progress_cb:
                elapsed = int(time.time() - started)
                progress_cb(min(80, 20 + elapsed), "Running workflow")
            time.sleep(1.0)

        self._set_state("degraded", "Comfy workflow timeout.")
        raise RuntimeError("COMFY_TIMEOUT: Workflow execution timed out.")

    def _wait_until_healthy(self, timeout_ms: int) -> None:
        started = time.time()
        while (time.time() - started) * 1000 <= timeout_ms:
            if self._healthcheck():
                return
            time.sleep(0.6)
        self._set_state("failed", "Comfy startup timeout.")
        raise RuntimeError("COMFY_START_FAILED: Comfy startup timeout.")

    def _start_process(self) -> None:
        comfy_dir = Path(str(self._config.get("comfyDir") or COMFY_DIR))
        comfy_main = comfy_dir / "main.py"
        if not comfy_main.is_file():
            self._set_state("failed", f"Comfy main.py not found in {COMFY_DIR}")
            raise FileNotFoundError(f"ComfyUI main.py not found: {comfy_main}")

        python_exe = str(self._config.get("pythonExeOverride") or COMFY_PYTHON_EXE or "python")
        cmd = [python_exe, "main.py", "--listen", self._host, "--port", str(self._port)]

        RUNTIME_LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_path = Path(RUNTIME_LOGS_DIR) / "comfyui.log"
        log_file = log_path.open("a", encoding="utf-8")

        popen = subprocess.Popen(
            cmd,
            cwd=str(comfy_dir),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            shell=False,
        )
        self._process_registry.register(self._process_name, popen, started_by_backend=True)

    def _healthcheck(self) -> bool:
        try:
            payload = self._get_json("/system_stats", timeout_seconds=2.5)
            return bool(payload)
        except Exception:
            return False

    def _load_workflow_json(self, workflow_name: str | None) -> dict[str, Any]:
        filename = workflow_name or COMFY_DEFAULT_WORKFLOW
        workflow_path = Path(COMFY_WORKFLOW_DIR) / filename
        if not workflow_path.is_file():
            raise FileNotFoundError(f"Workflow file not found: {workflow_path}")
        payload = json.loads(workflow_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("WORKFLOW_VALIDATION_FAILED: workflow root must be an object.")
        return payload

    def _install_input_image(self, image_path: str, project_id: str | None) -> str:
        source = Path(image_path).resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Input image not found: {source}")
        comfy_dir = Path(str(self._config.get("comfyDir") or COMFY_DIR))
        input_dir = comfy_dir / "input"
        input_dir.mkdir(parents=True, exist_ok=True)
        safe_project = (project_id or "job").replace("/", "_").replace("\\", "_")
        target_name = f"volumia_{safe_project}_{int(time.time())}{source.suffix.lower() or '.png'}"
        target = input_dir / target_name
        shutil.copyfile(source, target)
        return target_name

    def _inject_image(self, workflow: dict[str, Any], uploaded_image_name: str) -> dict[str, Any]:
        patched = json.loads(json.dumps(workflow))
        for node_value in patched.values():
            if not isinstance(node_value, dict):
                continue
            class_type = str(node_value.get("class_type") or "")
            if "loadimage" not in class_type.lower():
                continue
            inputs = node_value.get("inputs")
            if not isinstance(inputs, dict):
                inputs = {}
            if "image" in inputs and isinstance(inputs["image"], str):
                inputs["image"] = uploaded_image_name
                node_value["inputs"] = inputs
        return patched

    def _extract_output_files(self, history_entry: Any) -> list[dict[str, str]]:
        outputs: list[dict[str, str]] = []
        if not isinstance(history_entry, dict):
            return outputs
        history_outputs = history_entry.get("outputs")
        if not isinstance(history_outputs, dict):
            return outputs

        for node_output in history_outputs.values():
            if not isinstance(node_output, dict):
                continue
            for value in node_output.values():
                if not isinstance(value, list):
                    continue
                for item in value:
                    if not isinstance(item, dict):
                        continue
                    filename = str(item.get("filename") or "").strip()
                    if not filename:
                        continue
                    outputs.append(
                        {
                            "filename": filename,
                            "subfolder": str(item.get("subfolder") or "").strip(),
                            "type": str(item.get("type") or "output").strip() or "output",
                        }
                    )
        return outputs

    def _to_output_payload(self, files: list[dict[str, str]]) -> dict[str, Any]:
        resolved_paths: list[str] = []
        comfy_dir = Path(str(self._config.get("comfyDir") or COMFY_DIR))
        for item in files:
            folder = comfy_dir / "output"
            subfolder = item.get("subfolder", "")
            if subfolder:
                folder = folder / subfolder
            candidate = folder / item["filename"]
            if candidate.exists():
                resolved_paths.append(str(candidate.resolve()))

        glb_candidates = [path for path in resolved_paths if path.lower().endswith(".glb")]
        image_candidates = [
            path
            for path in resolved_paths
            if path.lower().endswith(".png") or path.lower().endswith(".jpg") or path.lower().endswith(".jpeg")
        ]
        payload: dict[str, Any] = {
            "files": resolved_paths,
            "previewImages": image_candidates,
        }
        if glb_candidates:
            payload["glbPath"] = glb_candidates[0]
            payload["meshPath"] = glb_candidates[0]
            payload["texturedGlbPath"] = glb_candidates[0]
        return payload

    def _cancel_prompt(self, prompt_id: str) -> None:
        try:
            self._post_json("/interrupt", {})
        except Exception:
            pass
        try:
            self._post_json("/queue", {"delete": [prompt_id]})
        except Exception:
            pass

    def _post_json(self, route: str, payload: dict[str, Any], timeout_seconds: float = 20.0) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self._base_url}{route}",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read().decode("utf-8") or "{}"
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Comfy route {route} failed ({error.code}): {detail}") from error

    def _get_json(self, route: str, timeout_seconds: float = 10.0) -> Any:
        request = urllib.request.Request(
            url=f"{self._base_url}{route}",
            method="GET",
            headers={"Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Comfy route {route} failed ({error.code}): {detail}") from error
