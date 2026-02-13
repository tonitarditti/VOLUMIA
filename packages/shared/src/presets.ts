import type { ExportOptions, ObjectTypeOption } from "./dto";

export type ComponentTemplate = {
  name: string;
  required: boolean;
  materialSlots: string[];
};

export type MaterialTemplate = {
  name: string;
  roughnessDefault: number;
  normalStrengthDefault: number;
};

export type PresetDefinition = {
  id: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
  label: string;
  components: ComponentTemplate[];
  materials: MaterialTemplate[];
  defaultExportOptions: ExportOptions;
};

const defaultExportOptions: ExportOptions = {
  units: "cm",
  pivot: "floor-center",
  smoothing: true,
  fixBackfaces: true,
  keepMaterialsSeparated: true,
  keepComponentsSeparated: true,
  includePbrMaps: true,
  textureSize: "2k",
  includeLightweight: true,
};

export const BUILTIN_PRESETS: PresetDefinition[] = [
  {
    id: "chair-stool",
    label: "Chair/Stool",
    components: [
      { name: "OBJ_Seat", required: true, materialSlots: ["MAT_Wood_Primary", "MAT_Fabric_Seat"] },
      { name: "OBJ_Backrest", required: true, materialSlots: ["MAT_Fabric_Seat", "MAT_Wood_Primary"] },
      { name: "OBJ_Legs", required: true, materialSlots: ["MAT_Metal_Detail", "MAT_Wood_Primary"] },
      { name: "OBJ_Frame", required: true, materialSlots: ["MAT_Wood_Primary", "MAT_Metal_Detail"] },
      { name: "OBJ_Hardware", required: false, materialSlots: ["MAT_Metal_Detail"] },
    ],
    materials: [
      { name: "MAT_Wood_Primary", roughnessDefault: 0.62, normalStrengthDefault: 0.25 },
      { name: "MAT_Fabric_Seat", roughnessDefault: 0.84, normalStrengthDefault: 0.35 },
      { name: "MAT_Metal_Detail", roughnessDefault: 0.28, normalStrengthDefault: 0.18 },
    ],
    defaultExportOptions,
  },
  {
    id: "table-desk",
    label: "Table/Desk",
    components: [
      { name: "OBJ_Top", required: true, materialSlots: ["MAT_Wood_Top", "MAT_Stone_Top"] },
      { name: "OBJ_Legs", required: true, materialSlots: ["MAT_Wood_Base", "MAT_Metal_Detail"] },
      { name: "OBJ_Frame", required: true, materialSlots: ["MAT_Wood_Base", "MAT_Metal_Detail"] },
      { name: "OBJ_Drawers", required: false, materialSlots: ["MAT_Wood_Base"] },
      { name: "OBJ_Hardware", required: false, materialSlots: ["MAT_Metal_Detail"] },
    ],
    materials: [
      { name: "MAT_Wood_Top", roughnessDefault: 0.56, normalStrengthDefault: 0.22 },
      { name: "MAT_Wood_Base", roughnessDefault: 0.6, normalStrengthDefault: 0.2 },
      { name: "MAT_Metal_Detail", roughnessDefault: 0.3, normalStrengthDefault: 0.2 },
      { name: "MAT_Stone_Top", roughnessDefault: 0.48, normalStrengthDefault: 0.16 },
    ],
    defaultExportOptions,
  },
  {
    id: "sofa-textile",
    label: "Sofa/Textile",
    components: [
      { name: "OBJ_Frame", required: true, materialSlots: ["MAT_Wood_Base", "MAT_Metal_Detail"] },
      { name: "OBJ_Cushions_Seat", required: true, materialSlots: ["MAT_Fabric_Primary"] },
      { name: "OBJ_Cushions_Back", required: true, materialSlots: ["MAT_Fabric_Secondary", "MAT_Fabric_Primary"] },
      { name: "OBJ_Arms", required: true, materialSlots: ["MAT_Fabric_Primary"] },
      { name: "OBJ_Legs", required: true, materialSlots: ["MAT_Wood_Base", "MAT_Metal_Detail"] },
      { name: "OBJ_Hardware", required: false, materialSlots: ["MAT_Metal_Detail"] },
    ],
    materials: [
      { name: "MAT_Fabric_Primary", roughnessDefault: 0.9, normalStrengthDefault: 0.38 },
      { name: "MAT_Fabric_Secondary", roughnessDefault: 0.84, normalStrengthDefault: 0.33 },
      { name: "MAT_Wood_Base", roughnessDefault: 0.62, normalStrengthDefault: 0.22 },
      { name: "MAT_Metal_Detail", roughnessDefault: 0.32, normalStrengthDefault: 0.18 },
    ],
    defaultExportOptions,
  },
  {
    id: "lighting",
    label: "Lighting",
    components: [
      { name: "OBJ_Shade", required: true, materialSlots: ["MAT_Fabric_Shade", "MAT_Glass_Primary"] },
      { name: "OBJ_Body", required: true, materialSlots: ["MAT_Metal_Body"] },
      { name: "OBJ_Cable", required: false, materialSlots: ["MAT_Metal_Body"] },
      { name: "OBJ_Bulb", required: true, materialSlots: ["MAT_Emissive"] },
      { name: "OBJ_Hardware", required: false, materialSlots: ["MAT_Metal_Body"] },
    ],
    materials: [
      { name: "MAT_Glass_Primary", roughnessDefault: 0.12, normalStrengthDefault: 0.1 },
      { name: "MAT_Metal_Body", roughnessDefault: 0.26, normalStrengthDefault: 0.16 },
      { name: "MAT_Fabric_Shade", roughnessDefault: 0.78, normalStrengthDefault: 0.3 },
      { name: "MAT_Emissive", roughnessDefault: 0.1, normalStrengthDefault: 0.05 },
    ],
    defaultExportOptions,
  },
  {
    id: "decor",
    label: "Decor",
    components: [
      { name: "OBJ_Main", required: true, materialSlots: ["MAT_Main_Surface"] },
      { name: "OBJ_Base", required: false, materialSlots: ["MAT_Base"] },
      { name: "OBJ_Details", required: false, materialSlots: ["MAT_Detail"] },
    ],
    materials: [
      { name: "MAT_Main_Surface", roughnessDefault: 0.55, normalStrengthDefault: 0.2 },
      { name: "MAT_Base", roughnessDefault: 0.62, normalStrengthDefault: 0.16 },
      { name: "MAT_Detail", roughnessDefault: 0.4, normalStrengthDefault: 0.2 },
    ],
    defaultExportOptions,
  },
  {
    id: "rug-curtain",
    label: "Rug/Curtain",
    components: [
      { name: "OBJ_Main", required: true, materialSlots: ["MAT_Fabric_Primary"] },
      { name: "OBJ_Folds", required: false, materialSlots: ["MAT_Fabric_Secondary", "MAT_Fabric_Primary"] },
    ],
    materials: [
      { name: "MAT_Fabric_Primary", roughnessDefault: 0.88, normalStrengthDefault: 0.4 },
      { name: "MAT_Fabric_Secondary", roughnessDefault: 0.8, normalStrengthDefault: 0.34 },
    ],
    defaultExportOptions,
  },
  {
    id: "divider",
    label: "Divider",
    components: [
      { name: "OBJ_Main", required: true, materialSlots: ["MAT_Main_Surface"] },
      { name: "OBJ_Base", required: false, materialSlots: ["MAT_Base"] },
      { name: "OBJ_Details", required: false, materialSlots: ["MAT_Detail"] },
    ],
    materials: [
      { name: "MAT_Main_Surface", roughnessDefault: 0.58, normalStrengthDefault: 0.22 },
      { name: "MAT_Base", roughnessDefault: 0.64, normalStrengthDefault: 0.18 },
      { name: "MAT_Detail", roughnessDefault: 0.42, normalStrengthDefault: 0.2 },
    ],
    defaultExportOptions,
  },
];

const presetById = new Map(BUILTIN_PRESETS.map((preset) => [preset.id, preset]));

export function getPresetByType(type: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>) {
  return presetById.get(type) ?? presetById.get("decor")!;
}

export function normalizeStrictComponentOrder(
  preset: PresetDefinition,
  presentComponentNames: string[]
): ComponentTemplate[] {
  const lookup = new Set(presentComponentNames);
  return preset.components.filter((component) => component.required || lookup.has(component.name));
}

export function defaultMaterialTemplatesForPreset(
  preset: PresetDefinition,
  allowedNames?: string[]
): MaterialTemplate[] {
  if (!allowedNames || allowedNames.length === 0) return preset.materials;
  const names = new Set(allowedNames);
  return preset.materials.filter((material) => names.has(material.name));
}

export function resolveAutoDetectPreset(input: {
  objectType: ObjectTypeOption;
  reconstructionMode: "auto" | "rigid" | "organic";
  fileHints?: string[];
  materialHints?: string[];
}): Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`> {
  if (input.objectType !== "auto-detect" && !input.objectType.startsWith("studio:")) {
    return input.objectType as Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
  }

  const mergedHints = [...(input.fileHints ?? []), ...(input.materialHints ?? [])]
    .join(" ")
    .toLowerCase();

  if (/fabric|textile|sofa|cushion|curtain|rug/.test(mergedHints)) return "sofa-textile";
  if (/lamp|shade|light|bulb/.test(mergedHints)) return "lighting";
  if (/table|desk/.test(mergedHints)) return "table-desk";
  if (/chair|stool/.test(mergedHints)) return "chair-stool";
  if (/divider|panel/.test(mergedHints)) return "divider";
  if (input.reconstructionMode === "organic") return "sofa-textile";
  if (input.reconstructionMode === "rigid") return "chair-stool";
  return "decor";
}
