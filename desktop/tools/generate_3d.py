#!/usr/bin/env python3
import argparse
import json
import os
import struct
import time


def emit(stage: str, percent: int, message: str) -> None:
    print(json.dumps({"stage": stage, "percent": percent, "message": message}), flush=True)


def pad4(data: bytes, pad_byte: bytes) -> bytes:
    remainder = len(data) % 4
    if remainder == 0:
        return data
    return data + (pad_byte * (4 - remainder))


def build_placeholder_glb() -> bytes:
    positions = struct.pack(
        "<9f",
        -0.6,
        0.0,
        0.6,
        0.6,
        0.0,
        0.6,
        0.0,
        1.1,
        0.0,
    )
    indices = struct.pack("<3H", 0, 1, 2)
    binary_chunk = pad4(positions + indices, b"\x00")

    gltf = {
        "asset": {"version": "2.0", "generator": "VOLUMIA Python Placeholder Generator"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "buffers": [{"byteLength": len(binary_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(positions), "target": 34962},
            {"buffer": 0, "byteOffset": len(positions), "byteLength": len(indices), "target": 34963},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "min": [-0.6, 0.0, 0.0],
                "max": [0.6, 1.1, 0.6],
            },
            {
                "bufferView": 1,
                "componentType": 5123,
                "count": 3,
                "type": "SCALAR",
            },
        ],
    }

    json_chunk = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")

    header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_chunk) + 8 + len(binary_chunk))
    json_header = struct.pack("<II", len(json_chunk), 0x4E4F534A)
    bin_header = struct.pack("<II", len(binary_chunk), 0x004E4942)
    return header + json_header + json_chunk + bin_header + binary_chunk


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate placeholder GLB for VOLUMIA MVP.")
    parser.add_argument("--out_glb", required=True)
    parser.add_argument("--images", nargs="+", required=True)
    parser.add_argument("--preset", choices=["fast", "balanced", "quality"], default="balanced")
    args = parser.parse_args()

    emit("preprocess", 10, "Validating inputs")
    time.sleep(0.05)

    emit("infer", 60, f"Running preset: {args.preset}")
    time.sleep(0.05)

    out_dir = os.path.dirname(os.path.abspath(args.out_glb))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out_glb, "wb") as fp:
        fp.write(build_placeholder_glb())

    emit("export", 90, "Writing GLB")
    time.sleep(0.05)
    emit("done", 100, "GLB ready")


if __name__ == "__main__":
    main()
