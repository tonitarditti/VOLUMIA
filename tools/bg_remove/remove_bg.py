#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
from io import BytesIO


def _emit(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _emit_error(message: str, detail: str = "") -> None:
    payload: dict[str, object] = {"type": "error", "message": message}
    if detail.strip():
        payload["detail"] = detail
    _emit(payload)


def _load_dependencies():
    try:
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime dependency guard
        _emit_error(
            "Missing dependency: pillow",
            f"{exc}\nInstall: pip install -U rembg onnxruntime pillow",
        )
        raise SystemExit(2) from exc

    try:
        from rembg import new_session, remove  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime dependency guard
        _emit_error(
            "Missing dependency: rembg/onnxruntime",
            f"{exc}\nInstall: pip install -U rembg onnxruntime pillow",
        )
        raise SystemExit(2) from exc

    return Image, new_session, remove


def _to_image(image_module, value):
    if isinstance(value, image_module.Image):
        return value.convert("RGBA")
    if isinstance(value, (bytes, bytearray)):
        return image_module.open(BytesIO(value)).convert("RGBA")
    raise RuntimeError(f"Unsupported output type from rembg: {type(value)!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove background and output RGBA PNG.")
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output RGBA PNG path")
    parser.add_argument("--mask-output", default="", help="Optional alpha mask output PNG path")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)
    mask_output_path = os.path.abspath(args.mask_output) if args.mask_output else ""

    if not os.path.exists(input_path):
        _emit_error("Input image not found", input_path)
        return 1

    Image, new_session, remove = _load_dependencies()

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    if mask_output_path:
        os.makedirs(os.path.dirname(mask_output_path), exist_ok=True)

    try:
        with Image.open(input_path) as src_image:
            src_rgba = src_image.convert("RGBA")
            session = new_session("u2net")
            result = remove(src_rgba, session=session)
            rgba = _to_image(Image, result)
            rgba.save(output_path, format="PNG")
            if mask_output_path:
                alpha = rgba.getchannel("A")
                alpha.save(mask_output_path, format="PNG")
    except Exception as exc:
        _emit_error("Background removal failed", str(exc))
        return 1

    _emit(
        {
            "type": "done",
            "input": input_path,
            "output": output_path,
            "mask": mask_output_path,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
