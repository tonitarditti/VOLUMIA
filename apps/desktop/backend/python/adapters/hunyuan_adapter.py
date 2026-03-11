from __future__ import annotations

from pathlib import Path
from threading import Event
from typing import Any, Callable

from core.job_manager import JobCancelledError


class HunyuanAdapter:
    def __init__(self, model_manager: Any, gpu_manager: Any) -> None:
        self._model_manager = model_manager
        self._gpu_manager = gpu_manager
        self._loaded = False

    def ensure_loaded(self) -> None:
        if self._loaded:
            self._model_manager.mark_used("hunyuan_texgen")
            return
        self._model_manager.mark_loaded(
            model_name="hunyuan_texgen",
            device="cuda",
            dtype="float16",
            ram_estimate_mb=2500,
            vram_estimate_mb=4500,
        )
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False
        self._model_manager.unload("hunyuan_texgen")

    def generate_texture(
        self,
        mesh_path: str,
        reference_images: list[str],
        output_glb_path: str,
        timeout_ms: int,
        preset: str,
        repo_root: str | None = None,
        progress_cb: Callable[[str], None] | None = None,
        cancel_event: Event | None = None,
    ) -> dict[str, Any]:
        if cancel_event and cancel_event.is_set():
            raise JobCancelledError("Cancelled before texture generation")

        if not reference_images:
            raise ValueError("referenceImages must contain at least one image.")

        image_path = reference_images[0]
        mesh_file = Path(mesh_path).resolve()
        image_file = Path(image_path).resolve()
        output_file = Path(output_glb_path).resolve()

        if not mesh_file.is_file():
            raise FileNotFoundError(f"Mesh file not found: {mesh_file}")
        if not image_file.is_file():
            raise FileNotFoundError(f"Reference image not found: {image_file}")

        output_file.parent.mkdir(parents=True, exist_ok=True)

        if progress_cb:
            progress_cb("Loading Hunyuan texture pipeline")
        self.ensure_loaded()

        if cancel_event and cancel_event.is_set():
            raise JobCancelledError("Cancelled before texgen inference")

        # Reuse real texgen logic by importing the refactored callable instead of spawning
        # an isolated Python process.
        from hunyuan_texgen import run_texgen  # noqa: WPS433

        if progress_cb:
            progress_cb("Running texture inference")
        details = run_texgen(
            image_path=str(image_file),
            mesh_path=str(mesh_file),
            output_glb_path=str(output_file),
            timeout_ms=max(0, int(timeout_ms)),
            preset=preset,
            repo_root=repo_root,
        )

        if not output_file.exists() or output_file.stat().st_size <= 0:
            raise RuntimeError("Texgen finished without a valid textured GLB.")

        self._model_manager.mark_used("hunyuan_texgen")
        return {
            "texturedGlbPath": str(output_file),
            "shapeGlbPath": str(mesh_file),
            "referenceImagePath": str(image_file),
            "details": details,
        }

