from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


CaptureSlotId = Literal[
    "front",
    "side",
    "back",
    "top",
    "detail_1",
    "detail_2",
    "detail_3",
    "detail_4",
    "material_1",
    "material_2",
    "material_3",
    "material_4",
]

SlotStatus = Literal["Ready", "Low detail", "Reflections", "Too dark"]
ObjectTypeOption = Literal[
    "auto-detect",
    "chair-stool",
    "table-desk",
    "sofa-textile",
    "lighting",
    "decor",
    "rug-curtain",
    "divider",
]
ReconstructionMode = Literal["auto", "rigid", "organic"]
GenerationMode = Literal["conservative", "aggressive"]
Complexity = Literal["low", "medium", "high"]
ScaleDimension = Literal["width", "height", "depth"]
PreviewQuality = Literal["high", "low"]
Units = Literal["cm", "m"]
PivotMode = Literal["floor-center", "center"]
TextureSize = Literal["2k", "4k"]


class CaptureImageInput(BaseModel):
    slotId: CaptureSlotId
    fileName: str
    filePath: str | None = None
    userHint: str | None = None


class AnalyzeImagesRequest(BaseModel):
    objectType: str
    reconstructionMode: ReconstructionMode
    detectMultipleObjects: bool = False
    images: list[CaptureImageInput]


class AnalyzeImageResult(BaseModel):
    slotId: CaptureSlotId
    status: SlotStatus
    note: str


class AnalyzeImagesResponse(BaseModel):
    recommendedPreset: ObjectTypeOption
    slotResults: list[AnalyzeImageResult]
    notes: list[str]
    detectedObjects: list["AnalyzeDetectedObject"] | None = None


class AnalyzeDetectedObject(BaseModel):
    id: str
    bbox: tuple[int, int, int, int]
    areaRatio: float


class GenerationRequest(BaseModel):
    objectName: str = Field(min_length=1)
    objectType: str
    studioBasePreset: ObjectTypeOption | None = None
    reconstructionMode: ReconstructionMode
    generationMode: GenerationMode = "conservative"
    detectMultipleObjects: bool = False
    complexity: Complexity
    includeLightweight: bool = True
    scaleDimension: ScaleDimension
    scaleValueCm: float = Field(gt=0)
    pivotMode: PivotMode = "floor-center"
    images: list[CaptureImageInput]


class GenerationComponent(BaseModel):
    name: str
    order: int
    present: bool
    materialSlots: list[str]


class MaterialMapSet(BaseModel):
    baseColor: str
    normal: str
    roughness: str
    ao: str | None = None
    metalness: str | None = None


class GenerationMaterial(BaseModel):
    name: str
    roughnessDefault: float
    normalStrengthDefault: float
    mapsHigh: MaterialMapSet
    mapsLow: MaterialMapSet


class StatsSummary(BaseModel):
    faces: int
    materials: int
    components: int


class GenerationArtifacts(BaseModel):
    highGlb: str
    lowGlb: str
    highDae: str
    lowDae: str
    previewHigh: str
    previewLow: str


class GenerationResult(BaseModel):
    generationId: str
    objectId: str | None = None
    objectBoundingBox: tuple[int, int, int, int] | None = None
    multiObjectGroupId: str | None = None
    objectName: str
    resolvedPreset: ObjectTypeOption
    components: list[GenerationComponent]
    materials: list[GenerationMaterial]
    stats: dict[PreviewQuality, StatsSummary]
    width_cm: float | None = None
    height_cm: float | None = None
    depth_cm: float | None = None
    scale_axis_used: ScaleDimension | None = None
    generationModeUsed: GenerationMode | None = None
    conservativeMode: bool | None = None
    multiObjectEnabled: bool = False
    detectedObjects: list["DetectedObjectResult"] | None = None
    notes: list[str] = Field(default_factory=list)
    artifacts: GenerationArtifacts
    suggestedExportName: str


class DetectedObjectResult(BaseModel):
    id: str
    bbox: tuple[int, int, int, int]
    generationId: str
    objectName: str
    resolvedPreset: ObjectTypeOption
    components: list[GenerationComponent]
    materials: list[GenerationMaterial]
    stats: dict[PreviewQuality, StatsSummary]
    width_cm: float | None = None
    height_cm: float | None = None
    depth_cm: float | None = None
    scale_axis_used: ScaleDimension | None = None
    artifacts: GenerationArtifacts
    suggestedExportName: str


class ExportOptions(BaseModel):
    units: Units = "cm"
    pivot: PivotMode = "floor-center"
    smoothing: bool = True
    fixBackfaces: bool = True
    keepMaterialsSeparated: bool = True
    keepComponentsSeparated: bool = True
    includePbrMaps: bool = True
    textureSize: TextureSize = "2k"
    includeLightweight: bool = True


class ExportRequest(BaseModel):
    generationId: str
    objectName: str
    options: ExportOptions


class ExportResponse(BaseModel):
    ok: bool
    zipPath: str
    fileName: str
    message: str


class StudioPresetMaterialDefault(BaseModel):
    materialName: str
    roughness: float
    normalStrength: float


class StudioPresetDefinition(BaseModel):
    id: str
    presetName: str
    basePreset: ObjectTypeOption
    structureLocked: bool = True
    materialDefaults: list[StudioPresetMaterialDefault]
    exportDefaults: dict[str, str | bool]
    createdAt: str
    updatedAt: str


AnalyzeImagesResponse.model_rebuild()
GenerationResult.model_rebuild()
