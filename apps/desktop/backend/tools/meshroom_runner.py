import argparse
import subprocess
import sys
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


def find_meshroom_batch(meshroom_path: Path) -> Path | None:
    if meshroom_path.is_file() and meshroom_path.name.lower() in {"meshroom_batch.exe", "meshroom_batch"}:
        return meshroom_path
    if not meshroom_path.is_dir():
        return None
    for name in ("meshroom_batch.exe", "MeshroomBatch.exe", "meshroom_batch"):
        candidate = meshroom_path / name
        if candidate.exists() and candidate.is_file():
            return candidate
    for candidate in meshroom_path.rglob("meshroom_batch.exe"):
        if candidate.is_file():
            return candidate
    return None


def image_count(input_dir: Path) -> int:
    return sum(1 for item in input_dir.iterdir() if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Meshroom photogrammetry with meshroom_batch.")
    parser.add_argument("--meshroom-dir", required=True)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    meshroom_path = Path(args.meshroom_dir).resolve()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    cache_dir = output_dir / "meshroom_cache"
    meshroom_output = output_dir / "meshroom_result"
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    meshroom_output.mkdir(parents=True, exist_ok=True)

    if not input_dir.exists():
        print(f"Input dir not found: {input_dir}", file=sys.stderr)
        return 2
    if image_count(input_dir) < 2:
        print("Meshroom requires at least two input images.", file=sys.stderr)
        return 2

    executable = find_meshroom_batch(meshroom_path)
    if not executable:
        print(
            f"meshroom_batch.exe not found in: {meshroom_path}. "
            "Install Meshroom/AliceVision and configure VOLUMIA_MESHROOM_DIR.",
            file=sys.stderr,
        )
        return 3

    command = [
        str(executable),
        "--input",
        str(input_dir),
        "--output",
        str(meshroom_output),
        "--cache",
        str(cache_dir),
    ]
    print("[meshroom] running:", " ".join(command), flush=True)
    return subprocess.call(command, cwd=str(executable.parent))


if __name__ == "__main__":
    raise SystemExit(main())
