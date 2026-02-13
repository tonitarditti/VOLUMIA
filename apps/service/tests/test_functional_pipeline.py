from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
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
    draw.rectangle((120, 110, 390, 170), fill=(50, 44, 38))
    draw.rectangle((150, 175, 360, 330), fill=(58, 52, 46))
    return np.asarray(image, dtype=np.uint8)


def _multi_object_image(width: int = 512, height: int = 512) -> np.ndarray:
    image = Image.new("RGB", (width, height), color=(246, 244, 239))
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 110, 230, 350), fill=(42, 42, 42))
    draw.ellipse((290, 120, 490, 320), fill=(46, 46, 46))
    return np.asarray(image, dtype=np.uint8)


class FunctionalPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._temp_dir = tempfile.TemporaryDirectory(prefix="volumia-service-tests-")
        cls.generated_root = Path(cls._temp_dir.name) / "generated"
        cls.generated_root.mkdir(parents=True, exist_ok=True)
        os.environ["VOLUMIA_GENERATED_ROOT"] = str(cls.generated_root)

        service_main = importlib.import_module("app.main")
        cls.service_main = importlib.reload(service_main)
        cls.client = TestClient(cls.service_main.app)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temp_dir.cleanup()

    def test_end_to_end_conservative_generate_and_export(self) -> None:
        with tempfile.TemporaryDirectory(prefix="volumia-inputs-") as td:
            td_path = Path(td)
            front_path = td_path / "front.png"
            side_path = td_path / "side.png"
            _write_image(front_path, _front_table_image())
            _write_image(side_path, np.rot90(_front_table_image(), k=1).copy())

            analyze_payload = {
                "objectType": "table-desk",
                "reconstructionMode": "rigid",
                "detectMultipleObjects": False,
                "images": [
                    {"slotId": "front", "fileName": "front.png", "filePath": str(front_path)},
                    {"slotId": "side", "fileName": "side.png", "filePath": str(side_path)},
                ],
            }
            analyze_response = self.client.post("/analyze-images", json=analyze_payload)
            self.assertEqual(analyze_response.status_code, 200, analyze_response.text)

            generate_payload = {
                "objectName": "TableFixture",
                "objectType": "table-desk",
                "reconstructionMode": "rigid",
                "generationMode": "conservative",
                "detectMultipleObjects": False,
                "complexity": "medium",
                "includeLightweight": True,
                "scaleDimension": "width",
                "scaleValueCm": 100.0,
                "pivotMode": "floor-center",
                "images": analyze_payload["images"],
            }
            generate_response = self.client.post("/generate-model", json=generate_payload)
            self.assertEqual(generate_response.status_code, 200, generate_response.text)
            result = generate_response.json()
            self.assertIn("generationId", result)
            self.assertIn("artifacts", result)

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
            export_response = self.client.post("/export-package", json=export_payload)
            self.assertEqual(export_response.status_code, 200, export_response.text)
            export_json = export_response.json()
            zip_path = Path(export_json["zipPath"])
            self.assertTrue(zip_path.exists())

            with zipfile.ZipFile(zip_path, "r") as zf:
                names = set(zf.namelist())
                self.assertIn("HIGH/model_high.glb", names)
                self.assertIn("LOW/model_low.glb", names)
                self.assertIn("materials.json", names)
                self.assertIn("README.txt", names)

    def test_no_hallucination_single_view_table(self) -> None:
        with tempfile.TemporaryDirectory(prefix="volumia-inputs-") as td:
            td_path = Path(td)
            front_path = td_path / "front.png"
            _write_image(front_path, _front_table_image())

            generate_payload = {
                "objectName": "SingleFrontNoHallucination",
                "objectType": "table-desk",
                "reconstructionMode": "rigid",
                "generationMode": "conservative",
                "detectMultipleObjects": False,
                "complexity": "medium",
                "includeLightweight": True,
                "scaleDimension": "width",
                "scaleValueCm": 120.0,
                "pivotMode": "floor-center",
                "images": [
                    {"slotId": "front", "fileName": "front.png", "filePath": str(front_path)},
                ],
            }
            response = self.client.post("/generate-model", json=generate_payload)
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertTrue(payload.get("conservativeMode"))
            components = {item["name"]: item["present"] for item in payload["components"]}
            self.assertIn("OBJ_Legs", components)
            self.assertFalse(components["OBJ_Legs"])

    def test_multi_object_detection_and_generation(self) -> None:
        with tempfile.TemporaryDirectory(prefix="volumia-inputs-") as td:
            td_path = Path(td)
            front_path = td_path / "front_multi.png"
            _write_image(front_path, _multi_object_image())

            analyze_payload = {
                "objectType": "table-desk",
                "reconstructionMode": "rigid",
                "detectMultipleObjects": True,
                "images": [
                    {"slotId": "front", "fileName": "front_multi.png", "filePath": str(front_path)},
                ],
            }
            analyze_response = self.client.post("/analyze-images", json=analyze_payload)
            self.assertEqual(analyze_response.status_code, 200, analyze_response.text)
            analyze_json = analyze_response.json()
            self.assertGreaterEqual(len(analyze_json.get("detectedObjects") or []), 2)

            generate_payload = {
                "objectName": "MultiObjectFixture",
                "objectType": "table-desk",
                "reconstructionMode": "rigid",
                "generationMode": "conservative",
                "detectMultipleObjects": True,
                "complexity": "medium",
                "includeLightweight": True,
                "scaleDimension": "width",
                "scaleValueCm": 100.0,
                "pivotMode": "floor-center",
                "images": analyze_payload["images"],
            }
            generate_response = self.client.post("/generate-model", json=generate_payload)
            self.assertEqual(generate_response.status_code, 200, generate_response.text)
            result = generate_response.json()
            detected = result.get("detectedObjects") or []
            self.assertGreaterEqual(len(detected), 2)
            self.assertTrue(result.get("multiObjectEnabled"))


if __name__ == "__main__":
    unittest.main()
