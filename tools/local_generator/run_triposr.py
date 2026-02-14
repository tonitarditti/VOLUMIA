#!/usr/bin/env python3
import argparse
import json
import os
import sys
import traceback


def emit(stage: str, percent: int, message: str) -> None:
    print(json.dumps({"stage": stage, "percent": percent, "message": message}), flush=True)


def ensure_output_path(path: str) -> str:
    absolute_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    return absolute_path


def resolve_device(requested: str) -> str:
    if requested == "cpu":
        return "cpu"

    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def run_triposr(image_path: str, out_glb: str, preset: str, requested_device: str) -> None:
    emit("preprocess", 10, "Loading image")

    if not os.path.exists(image_path):
        raise RuntimeError(f"Input image not found: {image_path}")

    try:
        import torch  # type: ignore
        from PIL import Image  # type: ignore
        from tsr.system import TSR  # type: ignore
        from tsr.utils import remove_background, resize_foreground  # type: ignore
    except Exception as error:
        raise RuntimeError(
            "TripoSR dependencies are not installed. Install torch, pillow and triposr runtime first."
        ) from error

    image = Image.open(image_path).convert("RGB")
    image = remove_background(image)
    image = resize_foreground(image, 0.85)

    device = resolve_device(requested_device)

    emit("infer", 45, f"Loading TripoSR model on {device}")
    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.to(device)

    chunk_size_by_preset = {
        "fast": 16384,
        "balanced": 8192,
        "quality": 4096,
    }
    resolution_by_preset = {
        "fast": 128,
        "balanced": 192,
        "quality": 256,
    }

    if hasattr(model, "renderer") and hasattr(model.renderer, "set_chunk_size"):
        model.renderer.set_chunk_size(chunk_size_by_preset[preset])

    emit("infer", 70, "Running local reconstruction")
    with torch.no_grad():
        scene_codes = model([image], device=device)
        meshes = model.extract_mesh(scene_codes, resolution=resolution_by_preset[preset])

    if not meshes:
        raise RuntimeError("TripoSR did not return any mesh.")

    emit("export", 90, "Exporting GLB")
    meshes[0].export(out_glb)

    if not os.path.exists(out_glb):
        raise RuntimeError("GLB was not created.")

    size = os.path.getsize(out_glb)
    if size < 10_000:
        raise RuntimeError(f"Generated GLB is too small: {size} bytes")

    emit("done", 100, "Generation complete")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local VOLUMIA TripoSR runner")
    parser.add_argument("--out_glb", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--preset", choices=["fast", "balanced", "quality"], default="balanced")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    out_glb = ensure_output_path(args.out_glb)

    try:
        run_triposr(args.image, out_glb, args.preset, args.device)
        return 0
    except Exception as error:
        emit("error", 0, str(error))
        print("[local_generator] generation failed", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
