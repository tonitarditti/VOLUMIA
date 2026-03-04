from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MaterialTemplate:
    name: str
    roughness: float
    normal_strength: float


@dataclass(frozen=True)
class ComponentTemplate:
    name: str
    required: bool
    material_slots: tuple[str, ...]


@dataclass(frozen=True)
class PresetDefinition:
    id: str
    label: str
    components: tuple[ComponentTemplate, ...]
    materials: tuple[MaterialTemplate, ...]


PRESET_MAP: dict[str, PresetDefinition] = {
    "chair-stool": PresetDefinition(
        id="chair-stool",
        label="Chair/Stool",
        components=(
            ComponentTemplate("OBJ_Seat", True, ("MAT_Wood_Primary", "MAT_Fabric_Seat")),
            ComponentTemplate("OBJ_Backrest", True, ("MAT_Fabric_Seat", "MAT_Wood_Primary")),
            ComponentTemplate("OBJ_Legs", True, ("MAT_Metal_Detail", "MAT_Wood_Primary")),
            ComponentTemplate("OBJ_Frame", True, ("MAT_Wood_Primary", "MAT_Metal_Detail")),
            ComponentTemplate("OBJ_Hardware", False, ("MAT_Metal_Detail",)),
        ),
        materials=(
            MaterialTemplate("MAT_Wood_Primary", 0.62, 0.25),
            MaterialTemplate("MAT_Fabric_Seat", 0.84, 0.35),
            MaterialTemplate("MAT_Metal_Detail", 0.28, 0.18),
        ),
    ),
    "table-desk": PresetDefinition(
        id="table-desk",
        label="Table/Desk",
        components=(
            ComponentTemplate("OBJ_Top", True, ("MAT_Wood_Top", "MAT_Stone_Top")),
            ComponentTemplate("OBJ_Legs", True, ("MAT_Wood_Base", "MAT_Metal_Detail")),
            ComponentTemplate("OBJ_Frame", True, ("MAT_Wood_Base", "MAT_Metal_Detail")),
            ComponentTemplate("OBJ_Drawers", False, ("MAT_Wood_Base",)),
            ComponentTemplate("OBJ_Hardware", False, ("MAT_Metal_Detail",)),
        ),
        materials=(
            MaterialTemplate("MAT_Wood_Top", 0.56, 0.22),
            MaterialTemplate("MAT_Wood_Base", 0.6, 0.2),
            MaterialTemplate("MAT_Metal_Detail", 0.3, 0.2),
            MaterialTemplate("MAT_Stone_Top", 0.48, 0.16),
        ),
    ),
    "sofa-textile": PresetDefinition(
        id="sofa-textile",
        label="Sofa/Textile",
        components=(
            ComponentTemplate("OBJ_Frame", True, ("MAT_Wood_Base", "MAT_Metal_Detail")),
            ComponentTemplate("OBJ_Cushions_Seat", True, ("MAT_Fabric_Primary",)),
            ComponentTemplate("OBJ_Cushions_Back", True, ("MAT_Fabric_Secondary", "MAT_Fabric_Primary")),
            ComponentTemplate("OBJ_Arms", True, ("MAT_Fabric_Primary",)),
            ComponentTemplate("OBJ_Legs", True, ("MAT_Wood_Base", "MAT_Metal_Detail")),
            ComponentTemplate("OBJ_Hardware", False, ("MAT_Metal_Detail",)),
        ),
        materials=(
            MaterialTemplate("MAT_Fabric_Primary", 0.9, 0.38),
            MaterialTemplate("MAT_Fabric_Secondary", 0.84, 0.33),
            MaterialTemplate("MAT_Wood_Base", 0.62, 0.22),
            MaterialTemplate("MAT_Metal_Detail", 0.32, 0.18),
        ),
    ),
    "lighting": PresetDefinition(
        id="lighting",
        label="Lighting",
        components=(
            ComponentTemplate("OBJ_Shade", True, ("MAT_Fabric_Shade", "MAT_Glass_Primary")),
            ComponentTemplate("OBJ_Body", True, ("MAT_Metal_Body",)),
            ComponentTemplate("OBJ_Cable", False, ("MAT_Metal_Body",)),
            ComponentTemplate("OBJ_Bulb", True, ("MAT_Emissive",)),
            ComponentTemplate("OBJ_Hardware", False, ("MAT_Metal_Body",)),
        ),
        materials=(
            MaterialTemplate("MAT_Glass_Primary", 0.12, 0.1),
            MaterialTemplate("MAT_Metal_Body", 0.26, 0.16),
            MaterialTemplate("MAT_Fabric_Shade", 0.78, 0.3),
            MaterialTemplate("MAT_Emissive", 0.1, 0.05),
        ),
    ),
    "decor": PresetDefinition(
        id="decor",
        label="Decor",
        components=(
            ComponentTemplate("OBJ_Main", True, ("MAT_Main_Surface",)),
            ComponentTemplate("OBJ_Base", False, ("MAT_Base",)),
            ComponentTemplate("OBJ_Details", False, ("MAT_Detail",)),
        ),
        materials=(
            MaterialTemplate("MAT_Main_Surface", 0.55, 0.2),
            MaterialTemplate("MAT_Base", 0.62, 0.16),
            MaterialTemplate("MAT_Detail", 0.4, 0.2),
        ),
    ),
    "rug-curtain": PresetDefinition(
        id="rug-curtain",
        label="Rug/Curtain",
        components=(
            ComponentTemplate("OBJ_Main", True, ("MAT_Fabric_Primary",)),
            ComponentTemplate("OBJ_Folds", False, ("MAT_Fabric_Secondary", "MAT_Fabric_Primary")),
        ),
        materials=(
            MaterialTemplate("MAT_Fabric_Primary", 0.88, 0.4),
            MaterialTemplate("MAT_Fabric_Secondary", 0.8, 0.34),
        ),
    ),
    "divider": PresetDefinition(
        id="divider",
        label="Divider",
        components=(
            ComponentTemplate("OBJ_Main", True, ("MAT_Main_Surface",)),
            ComponentTemplate("OBJ_Base", False, ("MAT_Base",)),
            ComponentTemplate("OBJ_Details", False, ("MAT_Detail",)),
        ),
        materials=(
            MaterialTemplate("MAT_Main_Surface", 0.58, 0.22),
            MaterialTemplate("MAT_Base", 0.64, 0.18),
            MaterialTemplate("MAT_Detail", 0.42, 0.2),
        ),
    ),
}


def resolve_auto_preset(object_type: str, reconstruction_mode: str, hints: list[str]) -> str:
    if object_type in PRESET_MAP:
        return object_type

    merged = " ".join(hints).lower()
    if any(term in merged for term in ["fabric", "textile", "sofa", "cushion", "rug", "curtain"]):
        return "sofa-textile"
    if any(term in merged for term in ["lamp", "light", "shade", "bulb"]):
        return "lighting"
    if any(term in merged for term in ["table", "desk"]):
        return "table-desk"
    if any(term in merged for term in ["chair", "stool"]):
        return "chair-stool"
    if reconstruction_mode == "organic":
        return "sofa-textile"
    if reconstruction_mode == "rigid":
        return "chair-stool"
    return "decor"
