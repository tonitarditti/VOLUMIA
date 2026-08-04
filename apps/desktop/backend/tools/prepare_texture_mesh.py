import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean a final mesh and generate/validate UVs before texgen.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--target-triangles", type=int, default=100000)
    parser.add_argument("--atlas-size", type=int, default=2048)
    args = parser.parse_args()

    backend_python = Path(__file__).resolve().parents[1] / "python"
    sys.path.insert(0, str(backend_python))
    from utils.mesh_texture import prepare_mesh_for_texturing

    result = prepare_mesh_for_texturing(
        mesh_path=str(Path(args.input).resolve()),
        prepared_mesh_path=str(Path(args.output).resolve()),
        target_triangles=max(1, args.target_triangles),
        atlas_size=max(256, args.atlas_size),
        prefer_xatlas=True,
    )
    output_path = Path(result["preparedMeshPath"])
    if not output_path.is_file() or output_path.stat().st_size < 100:
        raise RuntimeError("UV preparation did not create a valid GLB.")
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
