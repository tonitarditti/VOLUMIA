from __future__ import annotations

import importlib
import os
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


def _write_image(path: Path, image: np.ndarray) -> None:
    Image.fromarray(image.astype(np.uint8), mode="RGB").save(path)


def _front_table_image(width: int = 512, height: int = 512) -> np.ndarray:
    image = Image.new("RGB", (width, height), color=(244, 241, 236))
    draw = ImageDraw.Draw(image)
    draw.rectangle((118, 108, 394, 168), fill=(50, 44, 38))
    draw.rectangle((148, 174, 364, 332), fill=(58, 52, 46))
    return np.asarray(image, dtype=np.uint8)


def _side_table_image(width: int = 512, height: int = 512) -> np.ndarray:
    image = Image.new("RGB", (width, height), color=(244, 241, 236))
    draw = ImageDraw.Draw(image)
    draw.rectangle((140, 110, 360, 168), fill=(52, 46, 40))
    draw.rectangle((170, 172, 316, 340), fill=(64, 58, 50))
    return np.asarray(image, dtype=np.uint8)


def _multi_object_image(width: int = 512, height: int = 512) -> np.ndarray:
    image = Image.new("RGB", (width, height), color=(246, 244, 239))
    draw = ImageDraw.Draw(image)
    draw.rectangle((42, 116, 234, 356), fill=(42, 42, 42))
    draw.ellipse((292, 124, 492, 324), fill=(46, 46, 46))
    return np.asarray(image, dtype=np.uint8)


@pytest.fixture(scope="module")
def service_client() -> TestClient:
    with tempfile.TemporaryDirectory(prefix="volumia-service-tests-") as td:
        generated_root = Path(td) / "generated"
        generated_root.mkdir(parents=True, exist_ok=True)
        os.environ["VOLUMIA_GENERATED_ROOT"] = str(generated_root)

        service_main = importlib.import_module("app.main")
        service_main = importlib.reload(service_main)
        with TestClient(service_main.app) as client:
            yield client


def _base_generate_payload(images: list[dict[str, str]], object_name: str) -> dict[str, object]:
    return {
        "objectName": object_name,
        "objectType": "table-desk",
        "reconstructionMode": "rigid",
        "generationMode": "conservative",
        "detectMultipleObjects": False,
        "complexity": "medium",
        "includeLightweight": True,
        "scaleDimension": "width",
        "scaleValueCm": 120.0,
        "pivotMode": "floor-center",
        "images": images,
    }


def test_one_view_conservative_no_hallucinated_legs(service_client: TestClient, tmp_path: Path) -> None:
    front_path = tmp_path / "front.png"
    _write_image(front_path, _front_table_image())

    payload = _base_generate_payload(
        images=[{"slotId": "front", "fileName": front_path.name, "filePath": str(front_path)}],
        object_name="SingleViewNoLegHallucination",
    )
    response = service_client.post("/generate-model", json=payload)
    assert response.status_code == 200, response.text

    data = response.json()
    assert data.get("conservativeMode") is True
    component_presence = {item["name"]: item["present"] for item in data["components"]}
    assert component_presence.get("OBJ_Legs") is False
    warnings = data.get("warnings") or []
    assert "Side view missing: depth is estimated" in warnings
    assert "Legs not separable: not generated (avoiding hallucination)" in warnings


def test_two_view_depth_and_scale_axis(service_client: TestClient, tmp_path: Path) -> None:
    front_path = tmp_path / "front_scale.png"
    side_path = tmp_path / "side_scale.png"
    _write_image(front_path, _front_table_image())
    _write_image(side_path, _side_table_image())

    one_view_payload = _base_generate_payload(
        images=[{"slotId": "front", "fileName": front_path.name, "filePath": str(front_path)}],
        object_name="ScaleOneView",
    )
    two_view_payload = _base_generate_payload(
        images=[
            {"slotId": "front", "fileName": front_path.name, "filePath": str(front_path)},
            {"slotId": "side", "fileName": side_path.name, "filePath": str(side_path)},
        ],
        object_name="ScaleTwoViews",
    )

    one_view = service_client.post("/generate-model", json=one_view_payload)
    assert one_view.status_code == 200, one_view.text
    two_view = service_client.post("/generate-model", json=two_view_payload)
    assert two_view.status_code == 200, two_view.text

    one_json = one_view.json()
    two_json = two_view.json()

    assert abs(float(two_json["width_cm"]) - 120.0) <= 2.5
    assert float(two_json["depth_cm"]) > float(one_json["depth_cm"]) + 5.0
    assert "Side view missing: depth is estimated" not in (two_json.get("warnings") or [])


def test_multi_object_detection_returns_two_objects(service_client: TestClient, tmp_path: Path) -> None:
    front_path = tmp_path / "front_multi.png"
    _write_image(front_path, _multi_object_image())

    analyze_payload = {
        "objectType": "table-desk",
        "reconstructionMode": "rigid",
        "detectMultipleObjects": True,
        "images": [
            {"slotId": "front", "fileName": front_path.name, "filePath": str(front_path)},
        ],
    }
    analyze_response = service_client.post("/analyze-images", json=analyze_payload)
    assert analyze_response.status_code == 200, analyze_response.text
    analyze_json = analyze_response.json()
    assert len(analyze_json.get("detectedObjects") or []) >= 2

    generate_payload = _base_generate_payload(
        images=analyze_payload["images"],
        object_name="MultiObjectFixture",
    )
    generate_payload["detectMultipleObjects"] = True
    generate_response = service_client.post("/generate-model", json=generate_payload)
    assert generate_response.status_code == 200, generate_response.text
    generated = generate_response.json()
    assert generated.get("multiObjectEnabled") is True
    assert len(generated.get("detectedObjects") or []) >= 2


def test_export_zip_contains_required_structure(service_client: TestClient, tmp_path: Path) -> None:
    front_path = tmp_path / "front_export.png"
    side_path = tmp_path / "side_export.png"
    _write_image(front_path, _front_table_image())
    _write_image(side_path, _side_table_image())

    generate_payload = _base_generate_payload(
        images=[
            {"slotId": "front", "fileName": front_path.name, "filePath": str(front_path)},
            {"slotId": "side", "fileName": side_path.name, "filePath": str(side_path)},
        ],
        object_name="ExportFixture",
    )
    generate_response = service_client.post("/generate-model", json=generate_payload)
    assert generate_response.status_code == 200, generate_response.text
    result = generate_response.json()

    export_payload = {
        "generationId": result["generationId"],
        "objectName": result["objectName"],
        "options": {
            "units": "cm",
            "pivot": "floor-center",
            "smoothing": True,
            "fixBackfaces": True,
            "keepMaterialsSeparated": True,
            "keepComponentsSeparated": True,
            "includePbrMaps": True,
            "textureSize": "2k",
            "includeLightweight": True,
        },
    }
    export_response = service_client.post("/export-package", json=export_payload)
    assert export_response.status_code == 200, export_response.text
    zip_path = Path(export_response.json()["zipPath"])
    assert zip_path.exists()

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = set(zf.namelist())
        assert "HIGH/model_high.glb" in names
        assert "LOW/model_low.glb" in names
        assert "materials.json" in names
        assert "README.txt" in names
        assert any(name.startswith("HIGH/textures/") for name in names)
        assert any(name.startswith("LOW/textures/") for name in names)
