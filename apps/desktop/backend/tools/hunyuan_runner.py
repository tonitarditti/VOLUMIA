import argparse
import json
import os
import sys
import time
from pathlib import Path


def emit(stage: str, detail: str, *, state: str = "running", progress: int | None = None, indeterminate: bool = False) -> None:
    payload = {"stage": stage, "state": state, "detail": detail, "indeterminate": indeterminate}
    if progress is not None:
        payload["progress"] = progress
    print(f"VOLUMIA_EVENT:{json.dumps(payload)}", flush=True)


def apply_openmp_compat_env() -> None:
    # Windows/Conda workaround for duplicate Intel OpenMP runtimes loaded by
    # torch/numpy/MKL. This is intentionally scoped to 3D generation Python.
    defaults = {
        "KMP_DUPLICATE_LIB_OK": os.environ.get("VOLUMIA_KMP_DUPLICATE_LIB_OK", "TRUE"),
        "OMP_NUM_THREADS": os.environ.get("VOLUMIA_OMP_NUM_THREADS", "1"),
        "MKL_NUM_THREADS": os.environ.get("VOLUMIA_MKL_NUM_THREADS", "1"),
        "NUMEXPR_NUM_THREADS": os.environ.get("VOLUMIA_NUMEXPR_NUM_THREADS", "1"),
    }
    for key, value in defaults.items():
        os.environ[key] = os.environ.get(key) or value


def print_openmp_env() -> None:
    for key in ("KMP_DUPLICATE_LIB_OK", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        print(f"[python-env] {key}={os.environ.get(key, '')}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Hunyuan3D image-to-textured-3D.")
    parser.add_argument("--hunyuan-dir", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-path", default=os.environ.get("VOLUMIA_HUNYUAN_MODEL_PATH", "tencent/Hunyuan3D-2"))
    parser.add_argument("--shape-subfolder", default=os.environ.get("VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER", "hunyuan3d-dit-v2-0"))
    parser.add_argument("--paint-subfolder", default=os.environ.get("VOLUMIA_HUNYUAN_PAINT_SUBFOLDER", "hunyuan3d-paint-v2-0-turbo"))
    parser.add_argument("--steps", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_STEPS", "30")))
    parser.add_argument("--octree-resolution", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_OCTREE", "320")))
    parser.add_argument("--num-chunks", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_CHUNKS", "8000")))
    parser.add_argument("--seed", type=int, default=int(os.environ.get("VOLUMIA_HUNYUAN_SEED", "12345")))
    args = parser.parse_args()

    hunyuan_dir = Path(args.hunyuan_dir).resolve()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not hunyuan_dir.exists():
      print(f"Hunyuan3D dir not found: {hunyuan_dir}", file=sys.stderr)
      return 2
    if not input_path.exists():
      print(f"Input image not found: {input_path}", file=sys.stderr)
      return 2

    apply_openmp_compat_env()
    print_openmp_env()
    sys.path.insert(0, str(hunyuan_dir))
    os.environ["PYTHONPATH"] = f"{hunyuan_dir}{os.pathsep}{os.environ.get('PYTHONPATH', '')}"

    try:
        import torch
        from PIL import Image
        from hy3dgen.rembg import BackgroundRemover
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        from hy3dgen.texgen import Hunyuan3DPaintPipeline
    except Exception as error:
        print(f"Error importing Hunyuan3D dependencies: {error}", file=sys.stderr)
        return 3

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    print(f"[hunyuan] device={device}", flush=True)
    print(f"[hunyuan] model_path={args.model_path}", flush=True)
    print(f"[hunyuan] shape_subfolder={args.shape_subfolder}", flush=True)
    print(f"[hunyuan] paint_subfolder={args.paint_subfolder}", flush=True)

    try:
        emit("preparing_image", "Preparando imagen de referencia.", indeterminate=True)
        image = Image.open(input_path).convert("RGBA")
        if image.mode == "RGB":
            image = BackgroundRemover()(image)
        emit("preparing_image", "Imagen de referencia preparada.", state="complete", progress=100)
    except Exception as error:
        print(f"Error loading input image: {error}", file=sys.stderr)
        return 3

    try:
        started = time.time()
        print("[hunyuan] loading shape pipeline", flush=True)
        emit("geometry", "Cargando modelo de geometría.", indeterminate=True)
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            args.model_path,
            subfolder=args.shape_subfolder,
            variant="fp16",
            device=device,
            dtype=dtype,
        )
        emit("geometry", "Modelo cargado.", progress=20)
        generator = torch.Generator(device=device).manual_seed(args.seed) if device == "cuda" else torch.manual_seed(args.seed)
        print("[hunyuan] generating shape", flush=True)
        emit("geometry", "Inferencia iniciada.", indeterminate=True)
        mesh = shape_pipeline(
            image=image,
            num_inference_steps=args.steps,
            octree_resolution=args.octree_resolution,
            num_chunks=args.num_chunks,
            generator=generator,
            output_type="trimesh",
        )[0]
        emit("geometry", "Malla base generada.", progress=65)
        shape_path = output_dir / "shape.glb"
        mesh.export(shape_path)
        print(f"[hunyuan] shape exported: {shape_path}", flush=True)
        emit("geometry", "GLB temporal guardado.", progress=75)

        print("[hunyuan] loading texture pipeline", flush=True)
        emit("texture", "Cargando modelo de texturas.", indeterminate=True)
        paint_pipeline = Hunyuan3DPaintPipeline.from_pretrained(
            args.model_path,
            subfolder=args.paint_subfolder,
        )
        print("[hunyuan] generating texture", flush=True)
        emit("texture", "Generando textura.", indeterminate=True)
        textured_mesh = paint_pipeline(mesh, image=image)
        output_path = output_dir / "textured.glb"
        textured_mesh.export(output_path)
        print(f"[hunyuan] textured GLB exported: {output_path}", flush=True)
        emit("texture", "Textura generada y GLB temporal guardado.", state="complete", progress=100)
        print(f"[hunyuan] finished in {time.time() - started:.2f}s", flush=True)
        return 0
    except Exception as error:
        print(f"Error running Hunyuan3D: {error}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
