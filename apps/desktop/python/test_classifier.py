#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import tempfile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Quick AUTO classifier test")
    parser.add_argument("--image", action="append", required=True, help="Input image path (repeat up to 3+ times)")
    parser.add_argument("--quality", choices=["fast", "balanced", "high"], default="balanced")
    parser.add_argument("--auto-profile", choices=["auto", "hard_surface", "organic"], default="auto")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    import numpy as np
    import image_to_3d_depth_glb as pipeline

    pipeline.np = np

    for image_path in args.image:
        absolute_image = os.path.abspath(image_path)
        if not os.path.exists(absolute_image):
            print(json.dumps({"image": absolute_image, "ok": False, "error": "file not found"}), flush=True)
            continue

        temp_dir = tempfile.mkdtemp(prefix="volumia-auto-classifier-")
        try:
            out_path = os.path.join(temp_dir, "tmp.glb")
            preprocess = pipeline._prepare_auto_triposr_image(
                image_path=absolute_image,
                out_path=out_path,
                quality=args.quality,
            )
            classification = pipeline._classify_auto_surface_profile(preprocess, args.auto_profile)
            is_hard_surface = bool(classification.get("is_hard_surface", False))
            route = "hard-surface -> triposr (fallback blockout)" if is_hard_surface else "organic/default route"
            print(
                json.dumps(
                    {
                        "image": absolute_image,
                        "ok": True,
                        "hardSurfaceScore": round(float(classification.get("hard_surface_score", 0.0)), 4),
                        "isHardSurface": is_hard_surface,
                        "route": route,
                        "signals": classification.get("signals", {}),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "image": absolute_image,
                        "ok": False,
                        "error": str(error),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
