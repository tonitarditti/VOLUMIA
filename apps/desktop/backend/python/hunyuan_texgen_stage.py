import argparse
import json
import os
import shutil
import sys
import traceback
from typing import Any, Dict, List, Optional, Tuple


def write_result(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(payload, indent=2, ensure_ascii=False))
        f.write("\n")


def resolve_existing_module_roots(raw_roots: List[str]) -> List[str]:
    roots: List[str] = []
    seen = set()
    for raw in raw_roots:
        candidate = os.path.abspath(raw)
        if candidate in seen:
            continue
        seen.add(candidate)
        if os.path.isdir(candidate):
            roots.append(candidate)
    return roots


def add_module_roots_to_syspath(roots: List[str]) -> None:
    for root in roots:
        if root not in sys.path:
            sys.path.insert(0, root)


def check_texgen_dependencies(roots: List[str]) -> Tuple[List[str], List[str]]:
    valid_roots: List[str] = []
    missing_reasons: List[str] = []
    for root in roots:
        texgen_root = os.path.join(root, "hy3dgen", "texgen")
        custom_rasterizer = os.path.join(texgen_root, "custom_rasterizer")
        differentiable_renderer = os.path.join(
            texgen_root,
            "differentiable_renderer",
        )
        has_custom = os.path.isdir(custom_rasterizer)
        has_diff = os.path.isdir(differentiable_renderer)
        if has_custom and has_diff:
            valid_roots.append(root)
        else:
            missing = []
            if not has_custom:
                missing.append("custom_rasterizer")
            if not has_diff:
                missing.append("differentiable_renderer")
            missing_reasons.append(f"{root}: missing {', '.join(missing)}")
    return valid_roots, missing_reasons


def import_pipeline_class() -> Tuple[type, str]:
    attempts = [
        ("hy3dgen.texgen", "Hunyuan3DPaintPipeline"),
        ("hy3dgen.texgen.pipelines", "Hunyuan3DPaintPipeline"),
        ("hy3dgen.texgen", "HunyuanPaintPipeline"),
        ("hy3dgen.texgen.pipelines", "HunyuanPaintPipeline"),
    ]
    errors: List[str] = []
    for module_name, class_name in attempts:
        try:
            module = __import__(module_name, fromlist=[class_name])
            pipeline_cls = getattr(module, class_name)
            return pipeline_cls, f"{module_name}.{class_name}"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{module_name}.{class_name}: {exc}")
    joined = " | ".join(errors)
    raise RuntimeError(f"Could not import Hunyuan paint pipeline: {joined}")


def instantiate_pipeline(pipeline_cls: type) -> Any:
    create_errors: List[str] = []

    from_pretrained = getattr(pipeline_cls, "from_pretrained", None)
    if callable(from_pretrained):
        try:
            return from_pretrained()
        except Exception as exc:  # noqa: BLE001
            create_errors.append(f"from_pretrained(): {exc}")

    try:
        return pipeline_cls()
    except Exception as exc:  # noqa: BLE001
        create_errors.append(f"{pipeline_cls.__name__}(): {exc}")

    raise RuntimeError(" | ".join(create_errors))


def try_export_result(result: Any, out_path: str) -> bool:
    if result is None:
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 0

    if isinstance(result, str):
        if os.path.isfile(result):
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            if os.path.abspath(result) != os.path.abspath(out_path):
                shutil.copyfile(result, out_path)
            return os.path.isfile(out_path) and os.path.getsize(out_path) > 0
        return False

    if isinstance(result, dict):
        for key in ("output_path", "glb_path", "mesh_path", "path"):
            maybe_path = result.get(key)
            if isinstance(maybe_path, str) and os.path.isfile(maybe_path):
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                if os.path.abspath(maybe_path) != os.path.abspath(out_path):
                    shutil.copyfile(maybe_path, out_path)
                return os.path.isfile(out_path) and os.path.getsize(out_path) > 0

    export_fn = getattr(result, "export", None)
    if callable(export_fn):
        export_fn(out_path)
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 0

    save_fn = getattr(result, "save", None)
    if callable(save_fn):
        save_fn(out_path)
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 0

    return False


def execute_pipeline(
    pipeline: Any,
    mesh_obj: Any,
    image_obj: Any,
    mesh_path: str,
    image_path: str,
    out_path: str,
) -> Optional[str]:
    attempts = [
        lambda: pipeline(mesh_obj, image_obj),
        lambda: pipeline(mesh=mesh_obj, image=image_obj),
        lambda: pipeline(mesh=mesh_obj, image=image_obj, output_path=out_path),
        lambda: pipeline(mesh_path=mesh_path, image_path=image_path, output_path=out_path),
    ]

    method_names = ("paint", "generate", "run", "texture")
    for method_name in method_names:
        method = getattr(pipeline, method_name, None)
        if callable(method):
            attempts.extend(
                [
                    lambda m=method: m(mesh_obj, image_obj),
                    lambda m=method: m(mesh=mesh_obj, image=image_obj),
                    lambda m=method: m(
                        mesh=mesh_obj,
                        image=image_obj,
                        output_path=out_path,
                    ),
                    lambda m=method: m(
                        mesh_path=mesh_path,
                        image_path=image_path,
                        output_path=out_path,
                    ),
                ]
            )

    errors: List[str] = []
    for run in attempts:
        try:
            result = run()
            if try_export_result(result, out_path):
                return None
            if os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
                return None
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))

    return "Pipeline calls failed: " + " | ".join(errors)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Hunyuan texgen stage using an existing mesh and input image.",
    )
    parser.add_argument("--mesh", required=True, help="Input mesh/glb path")
    parser.add_argument("--image", required=True, help="Input image path")
    parser.add_argument("--out", required=True, help="Output textured glb path")
    parser.add_argument(
        "--result-json",
        required=True,
        help="Path where the stage result JSON will be written",
    )
    parser.add_argument(
        "--module-root",
        action="append",
        default=[],
        help="Directory to prepend to PYTHONPATH (repeatable)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result: Dict[str, Any] = {
        "ok": False,
        "status": "failed",
        "mesh_path": os.path.abspath(args.mesh),
        "input_image_path": os.path.abspath(args.image),
        "output_path": os.path.abspath(args.out),
        "pipeline": None,
        "error": None,
    }

    try:
        if not os.path.isfile(args.mesh):
            raise RuntimeError(f"Mesh not found: {args.mesh}")
        if not os.path.isfile(args.image):
            raise RuntimeError(f"Input image not found: {args.image}")

        module_roots = resolve_existing_module_roots(args.module_root)
        valid_roots, missing_reasons = check_texgen_dependencies(module_roots)
        result["module_roots"] = module_roots
        result["valid_module_roots"] = valid_roots
        result["dependency_missing"] = missing_reasons

        if not valid_roots:
            raise RuntimeError(
                "No valid hy3dgen texgen dependencies found. "
                "Required: hy3dgen/texgen/custom_rasterizer and "
                "hy3dgen/texgen/differentiable_renderer"
            )

        add_module_roots_to_syspath(valid_roots)

        from PIL import Image  # noqa: WPS433
        import trimesh  # noqa: WPS433

        pipeline_cls, pipeline_ref = import_pipeline_class()
        pipeline = instantiate_pipeline(pipeline_cls)

        mesh = trimesh.load(args.mesh, force="mesh")
        image = Image.open(args.image).convert("RGB")
        os.makedirs(os.path.dirname(args.out), exist_ok=True)

        run_error = execute_pipeline(
            pipeline=pipeline,
            mesh_obj=mesh,
            image_obj=image,
            mesh_path=args.mesh,
            image_path=args.image,
            out_path=args.out,
        )
        if run_error:
            raise RuntimeError(run_error)

        if not os.path.isfile(args.out) or os.path.getsize(args.out) <= 0:
            raise RuntimeError("Texgen finished without writing a valid GLB file.")

        result["ok"] = True
        result["status"] = "ready"
        result["pipeline"] = pipeline_ref
        write_result(args.result_json, result)
        return 0
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
        write_result(args.result_json, result)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
