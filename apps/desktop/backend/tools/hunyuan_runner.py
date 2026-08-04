import argparse
import gc
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_sequence_number = 0


def emit(job_id: str, stage: str, detail: str, *, state: str = "running", progress: int | None = None, indeterminate: bool = False) -> None:
    global _sequence_number
    _sequence_number += 1
    payload: dict[str, Any] = {
        "jobId": job_id,
        "stage": stage,
        "state": state,
        "detail": detail,
        "indeterminate": indeterminate,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sequenceNumber": _sequence_number,
    }
    if progress is not None:
        payload["progress"] = progress
    print(f"VOLUMIA_EVENT:{json.dumps(payload)}", flush=True)


def apply_openmp_compat_env() -> None:
    defaults = {
        "KMP_DUPLICATE_LIB_OK": os.environ.get("VOLUMIA_KMP_DUPLICATE_LIB_OK", "TRUE"),
        "OMP_NUM_THREADS": os.environ.get("VOLUMIA_OMP_NUM_THREADS", "1"),
        "MKL_NUM_THREADS": os.environ.get("VOLUMIA_MKL_NUM_THREADS", "1"),
        "NUMEXPR_NUM_THREADS": os.environ.get("VOLUMIA_NUMEXPR_NUM_THREADS", "1"),
    }
    for key, value in defaults.items():
        os.environ[key] = os.environ.get(key) or value


def print_runtime_diagnostics(torch_module: Any, pipeline_class: Any) -> None:
    try:
        import diffusers
        print(f"[hunyuan] diffusers={getattr(diffusers, '__version__', 'unknown')} file={getattr(diffusers, '__file__', 'unknown')}", flush=True)
    except Exception as error:
        print(f"[hunyuan] diffusers diagnostics unavailable: {error}", flush=True)
    print(f"[hunyuan] shape_pipeline_class={pipeline_class.__module__}.{pipeline_class.__name__}", flush=True)
    print(f"[hunyuan] shape_pipeline_module={sys.modules[pipeline_class.__module__].__file__}", flush=True)
    print(f"[hunyuan] torch={getattr(torch_module, '__version__', 'unknown')} file={getattr(torch_module, '__file__', 'unknown')}", flush=True)
    relevant_paths = [item for item in sys.path if "hunyuan" in item.lower() or "site-packages" in item.lower()]
    print(f"[hunyuan] relevant_sys_path={json.dumps(relevant_paths)}", flush=True)


def cleanup_cuda(torch_module: Any, resources: list[Any]) -> None:
    print("[hunyuan] geometry GPU cleanup started", flush=True)
    for resource in resources:
        if resource is None:
            continue
        try:
            if hasattr(resource, "to"):
                resource.to("cpu")
        except Exception:
            pass
    resources.clear()
    gc.collect()
    try:
        if torch_module is not None and torch_module.cuda.is_available():
            torch_module.cuda.synchronize()
            torch_module.cuda.empty_cache()
            if hasattr(torch_module.cuda, "ipc_collect"):
                torch_module.cuda.ipc_collect()
    finally:
        print("[hunyuan] geometry GPU cleanup completed", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the geometry-only Hunyuan3D stage.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--hunyuan-dir", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-path", default=os.environ.get("VOLUMIA_HUNYUAN_MODEL_PATH", "tencent/Hunyuan3D-2"))
    parser.add_argument("--shape-subfolder", default=os.environ.get("VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER", "hunyuan3d-dit-v2-0"))
    parser.add_argument("--steps", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_STEPS", "30")))
    parser.add_argument("--octree-resolution", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_OCTREE", "320")))
    parser.add_argument("--num-chunks", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_CHUNKS", "8000")))
    parser.add_argument("--seed", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_SEED", "12345")))
    args = parser.parse_args()
    args.job_id = str(args.job_id).strip()
    if not args.job_id:
        raise ValueError("--job-id no puede estar vacío")

    hunyuan_dir = Path(args.hunyuan_dir).resolve()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not hunyuan_dir.exists() or not input_path.exists():
        print(f"Invalid Hunyuan/input path: {hunyuan_dir} / {input_path}", file=sys.stderr, flush=True)
        return 2

    apply_openmp_compat_env()
    sys.path.insert(0, str(hunyuan_dir))
    os.environ["PYTHONPATH"] = f"{hunyuan_dir}{os.pathsep}{os.environ.get('PYTHONPATH', '')}"
    torch_module = None
    resources: list[Any] = []
    try:
        import torch
        from PIL import Image
        from hy3dgen.rembg import BackgroundRemover
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

        torch_module = torch
        print_runtime_diagnostics(torch, Hunyuan3DDiTFlowMatchingPipeline)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        print(f"[hunyuan] device={device}", flush=True)

        emit(args.job_id, "preparing_image", "Preparando imagen y segmentación.", indeterminate=True)
        original = Image.open(input_path)
        image = original.convert("RGBA")
        if original.mode == "RGB":
            remover = BackgroundRemover()
            resources.append(remover)
            image = remover(original.convert("RGB"))
        emit(args.job_id, "preparing_image", "Imagen y máscara preparadas.", state="complete", progress=100)

        started = time.time()
        emit(args.job_id, "geometry", "Cargando modelo de geometría.", indeterminate=True)
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            args.model_path,
            subfolder=args.shape_subfolder,
            variant="fp16",
            device=device,
            dtype=dtype,
        )
        resources.append(shape_pipeline)
        emit(args.job_id, "geometry", "Modelo cargado.", progress=20)
        generator = torch.Generator(device=device).manual_seed(args.seed) if device == "cuda" else torch.manual_seed(args.seed)
        resources.append(generator)
        emit(args.job_id, "geometry", "Inferencia iniciada.", indeterminate=True)
        mesh = shape_pipeline(
            image=image,
            num_inference_steps=args.steps,
            octree_resolution=args.octree_resolution,
            num_chunks=args.num_chunks,
            generator=generator,
            output_type="trimesh",
        )[0]
        resources.append(mesh)
        emit(args.job_id, "geometry", "Malla base generada.", progress=75)
        shape_path = output_dir / "shape.glb"
        mesh.export(shape_path)
        if not shape_path.is_file() or shape_path.stat().st_size < 100:
            raise RuntimeError("Geometry stage did not create a valid shape.glb file.")
        print(f"[hunyuan] shape exported: {shape_path}", flush=True)
        emit(args.job_id, "geometry", "Malla base guardada; esperando validación del backend.", progress=95)
        print(f"[hunyuan] geometry finished in {time.time() - started:.2f}s", flush=True)
        return 0
    except Exception as error:
        print(f"Error running Hunyuan3D geometry: {error}", file=sys.stderr, flush=True)
        return 4
    finally:
        cleanup_cuda(torch_module, resources)


if __name__ == "__main__":
    raise SystemExit(main())
