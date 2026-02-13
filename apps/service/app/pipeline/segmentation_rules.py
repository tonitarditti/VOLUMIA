from __future__ import annotations

from typing import Any

PrimitiveRecipe = dict[str, Any]
ComponentRecipes = dict[str, list[PrimitiveRecipe]]


def _box(bounds: tuple[float, float, float, float, float, float]) -> PrimitiveRecipe:
    return {"type": "box", "bounds": bounds}


def _cylinder(
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
) -> PrimitiveRecipe:
    return {
        "type": "cylinder",
        "radiusRatio": radius_ratio,
        "heightRatio": height_ratio,
        "centerRatio": center_ratio,
    }


def _cone(
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
) -> PrimitiveRecipe:
    return {
        "type": "cone",
        "radiusRatio": radius_ratio,
        "heightRatio": height_ratio,
        "centerRatio": center_ratio,
    }


def _sphere(radius_ratio: float, center_ratio: tuple[float, float, float]) -> PrimitiveRecipe:
    return {"type": "sphere", "radiusRatio": radius_ratio, "centerRatio": center_ratio}


def _lathe(profile: list[tuple[float, float]]) -> PrimitiveRecipe:
    return {"type": "lathe", "profile": profile}


def build_component_recipes(
    preset_id: str,
    component_names: list[str],
    quality: str,
    heuristics: dict[str, float | bool],
) -> ComponentRecipes:
    recipes: ComponentRecipes = {}
    depth_ratio = float(heuristics.get("depth_ratio", 0.6))
    seat_ratio = float(heuristics.get("seat_height_ratio", 0.45))
    drawer_hint = bool(heuristics.get("drawer_hint", False))
    back_profile = float(heuristics.get("back_profile", 0.35))

    if preset_id == "chair-stool":
        seat_depth = min(0.86, max(0.5, depth_ratio * 0.95))
        leg_as_box = quality == "low"
        recipes["OBJ_Seat"] = [_box((0.14, 0.86, max(0.22, seat_ratio - 0.05), seat_ratio + 0.05, 0.1, seat_depth))]
        recipes["OBJ_Backrest"] = [_box((0.18, 0.82, seat_ratio + 0.03, 0.95, 0.03, 0.16 + back_profile * 0.1))]
        if leg_as_box:
            recipes["OBJ_Legs"] = [
                _box((0.12, 0.2, 0.0, seat_ratio - 0.07, 0.14, 0.24)),
                _box((0.8, 0.88, 0.0, seat_ratio - 0.07, 0.14, 0.24)),
                _box((0.12, 0.2, 0.0, seat_ratio - 0.07, seat_depth - 0.14, seat_depth - 0.04)),
                _box((0.8, 0.88, 0.0, seat_ratio - 0.07, seat_depth - 0.14, seat_depth - 0.04)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.035, seat_ratio - 0.06, (-0.36, (seat_ratio - 0.06) * 0.5, -0.3)),
                _cylinder(0.035, seat_ratio - 0.06, (0.36, (seat_ratio - 0.06) * 0.5, -0.3)),
                _cylinder(0.035, seat_ratio - 0.06, (-0.36, (seat_ratio - 0.06) * 0.5, 0.3)),
                _cylinder(0.035, seat_ratio - 0.06, (0.36, (seat_ratio - 0.06) * 0.5, 0.3)),
            ]
        recipes["OBJ_Frame"] = [_box((0.16, 0.84, seat_ratio - 0.09, seat_ratio - 0.04, 0.18, seat_depth - 0.05))]
        recipes["OBJ_Hardware"] = [_box((0.45, 0.55, seat_ratio + 0.02, seat_ratio + 0.04, 0.12, 0.16))]

    elif preset_id == "table-desk":
        top_thickness = 0.05
        top_y1 = 0.86
        top_y0 = top_y1 - top_thickness
        leg_as_box = quality == "low"
        recipes["OBJ_Top"] = [_box((0.05, 0.95, top_y0, top_y1, 0.08, 0.92))]
        if leg_as_box:
            recipes["OBJ_Legs"] = [
                _box((0.08, 0.16, 0.0, top_y0 - 0.01, 0.12, 0.2)),
                _box((0.84, 0.92, 0.0, top_y0 - 0.01, 0.12, 0.2)),
                _box((0.08, 0.16, 0.0, top_y0 - 0.01, 0.8, 0.88)),
                _box((0.84, 0.92, 0.0, top_y0 - 0.01, 0.8, 0.88)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.03, top_y0, (-0.4, top_y0 * 0.5, -0.35)),
                _cylinder(0.03, top_y0, (0.4, top_y0 * 0.5, -0.35)),
                _cylinder(0.03, top_y0, (-0.4, top_y0 * 0.5, 0.35)),
                _cylinder(0.03, top_y0, (0.4, top_y0 * 0.5, 0.35)),
            ]
        recipes["OBJ_Frame"] = [_box((0.1, 0.9, 0.46, 0.52, 0.14, 0.86))]
        recipes["OBJ_Drawers"] = [_box((0.26, 0.74, 0.56, 0.76, 0.1, 0.26))] if drawer_hint else [_box((0.4, 0.6, 0.57, 0.7, 0.12, 0.22))]
        recipes["OBJ_Hardware"] = [_box((0.46, 0.54, 0.62, 0.67, 0.08, 0.12))]

    elif preset_id == "sofa-textile":
        cushion_count = 3 if quality == "high" else 2
        seat_boxes = []
        back_boxes = []
        for index in range(cushion_count):
            x0 = 0.12 + index * (0.76 / cushion_count)
            x1 = x0 + (0.76 / cushion_count) - 0.02
            seat_boxes.append(_box((x0, x1, 0.44, 0.64, 0.2, min(0.9, 0.74 + depth_ratio * 0.16))))
            back_boxes.append(_box((x0, x1, 0.63, 0.9, 0.08, 0.26)))
        recipes["OBJ_Frame"] = [_box((0.08, 0.92, 0.12, 0.46, 0.12, 0.9))]
        recipes["OBJ_Cushions_Seat"] = seat_boxes
        recipes["OBJ_Cushions_Back"] = back_boxes
        recipes["OBJ_Arms"] = [
            _box((0.06, 0.18, 0.36, 0.76, 0.14, 0.9)),
            _box((0.82, 0.94, 0.36, 0.76, 0.14, 0.9)),
        ]
        if quality == "low":
            recipes["OBJ_Legs"] = [
                _box((0.14, 0.2, 0.0, 0.1, 0.16, 0.24)),
                _box((0.8, 0.86, 0.0, 0.1, 0.16, 0.24)),
                _box((0.14, 0.2, 0.0, 0.1, 0.76, 0.84)),
                _box((0.8, 0.86, 0.0, 0.1, 0.76, 0.84)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.026, 0.1, (-0.35, 0.05, -0.32)),
                _cylinder(0.026, 0.1, (0.35, 0.05, -0.32)),
                _cylinder(0.026, 0.1, (-0.35, 0.05, 0.32)),
                _cylinder(0.026, 0.1, (0.35, 0.05, 0.32)),
            ]
        recipes["OBJ_Hardware"] = [_box((0.44, 0.56, 0.1, 0.15, 0.42, 0.58))]

    elif preset_id == "lighting":
        shade_radius = max(0.22, min(0.4, depth_ratio * 0.44))
        recipes["OBJ_Shade"] = [_cone(shade_radius, 0.34, (0.0, 0.83, 0.0))]
        recipes["OBJ_Body"] = [_cylinder(0.08, 0.66, (0.0, 0.41, 0.0))]
        recipes["OBJ_Cable"] = [_cylinder(0.018, 0.3, (0.0, 0.15, 0.0))]
        recipes["OBJ_Bulb"] = [_sphere(0.08, (0.0, 0.66, 0.0))]
        recipes["OBJ_Hardware"] = [_cylinder(0.12, 0.06, (0.0, 0.03, 0.0))]

    elif preset_id == "rug-curtain":
        recipes["OBJ_Main"] = [_box((0.05, 0.95, 0.0, 0.035, 0.06, 0.94))]
        fold_count = 4 if quality == "high" else 2
        recipes["OBJ_Folds"] = [
            _box((0.14 + i * 0.16, 0.22 + i * 0.16, 0.01, 0.06, 0.08, 0.92)) for i in range(fold_count)
        ]

    else:  # decor + divider
        recipes["OBJ_Main"] = [_lathe([(0.0, 0.0), (0.35, 0.08), (0.24, 0.45), (0.3, 0.78), (0.12, 1.0)])]
        recipes["OBJ_Base"] = [_cylinder(0.22, 0.08, (0.0, 0.04, 0.0))]
        recipes["OBJ_Details"] = [_box((0.32, 0.68, 0.38, 0.7, 0.32, 0.68))]

    # Always keep strict structure order from preset; fill with minimal placeholder if missing.
    strict: ComponentRecipes = {}
    for index, name in enumerate(component_names):
        strict[name] = recipes.get(name, [_box((0.42, 0.58, 0.12 + index * 0.05, 0.18 + index * 0.05, 0.42, 0.58))])
    return strict
