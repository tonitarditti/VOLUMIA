export type SlotStatus = "Ready" | "Low detail" | "Reflections" | "Too dark";

export type CaptureSlotId =
  | "front"
  | "side"
  | "back"
  | "top"
  | "detail_1"
  | "detail_2"
  | "detail_3"
  | "detail_4"
  | "material_1"
  | "material_2"
  | "material_3"
  | "material_4";

export type ReconstructionMode = "auto" | "rigid" | "organic";
export type ComplexityLevel = "low" | "medium" | "high";
export type ScaleDimension = "width" | "height" | "depth";
export type Units = "cm" | "m";
export type PreviewQuality = "high" | "low";

export type ObjectTypeOption =
  | "auto-detect"
  | "chair-stool"
  | "table-desk"
  | "sofa-textile"
  | "lighting"
  | "decor"
  | "rug-curtain"
  | "divider"
  | `studio:${string}`;

export type CaptureImageInput = {
  slotId: CaptureSlotId;
  fileName: string;
  userHint?: string;
};

export type AnalyzeImagesRequest = {
  objectType: ObjectTypeOption;
  reconstructionMode: ReconstructionMode;
  images: CaptureImageInput[];
};

export type AnalyzeImageResult = {
  slotId: CaptureSlotId;
  status: SlotStatus;
  note: string;
};

export type AnalyzeImagesResponse = {
  recommendedPreset: Exclude<ObjectTypeOption, `studio:${string}`>;
  slotResults: AnalyzeImageResult[];
  notes: string[];
};

export type MaterialSlotRef = {
  componentName: string;
  materialName: string;
};

export type GenerationRequest = {
  objectName: string;
  objectType: ObjectTypeOption;
  studioBasePreset?: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
  reconstructionMode: ReconstructionMode;
  complexity: ComplexityLevel;
  includeLightweight: boolean;
  scaleDimension: ScaleDimension;
  scaleValueCm: number;
  images: CaptureImageInput[];
};

export type GenerationComponent = {
  name: string;
  order: number;
  present: boolean;
  materialSlots: string[];
};

export type MaterialMapSet = {
  baseColor: string;
  normal: string;
  roughness: string;
  ao?: string;
  metalness?: string;
};

export type GenerationMaterial = {
  name: string;
  roughnessDefault: number;
  normalStrengthDefault: number;
  mapsHigh: MaterialMapSet;
  mapsLow: MaterialMapSet;
};

export type StatsSummary = {
  faces: number;
  materials: number;
  components: number;
};

export type GenerationArtifacts = {
  highGlb: string;
  lowGlb: string;
  highDae: string;
  lowDae: string;
  previewHigh: string;
  previewLow: string;
};

export type GenerationResult = {
  generationId: string;
  objectName: string;
  resolvedPreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
  components: GenerationComponent[];
  materials: GenerationMaterial[];
  stats: {
    high: StatsSummary;
    low: StatsSummary;
  };
  artifacts: GenerationArtifacts;
  suggestedExportName: string;
};

export type ExportOptions = {
  units: Units;
  pivot: "floor-center" | "center";
  smoothing: boolean;
  fixBackfaces: boolean;
  keepMaterialsSeparated: boolean;
  keepComponentsSeparated: boolean;
  includePbrMaps: boolean;
  textureSize: "2k" | "4k";
  includeLightweight: boolean;
};

export type ExportRequest = {
  generationId: string;
  objectName: string;
  options: ExportOptions;
};

export type ExportResponse = {
  ok: boolean;
  zipPath: string;
  fileName: string;
  message: string;
};

export type StudioPresetDefinition = {
  id: string;
  presetName: string;
  basePreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
  structureLocked: boolean;
  materialDefaults: Array<{
    materialName: string;
    roughness: number;
    normalStrength: number;
  }>;
  exportDefaults: {
    textureSize: "2k" | "4k";
    includeLightweight: boolean;
  };
  createdAt: string;
  updatedAt: string;
};
