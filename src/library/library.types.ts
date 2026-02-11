export type AssetCategory = "furniture" | "decor" | "fixture" | "custom";
export type AssetSource = "image_single" | "images_multi" | "imported" | "generated_demo";
export type Units = "cm";
export type DimsCM = { w: number; d: number; h: number };

export type AssetRecord = {
  id: string;
  name: string;
  tags: string[];
  category: AssetCategory;
  units: Units;
  dims_cm: DimsCM;
  source: AssetSource;

  files: {
    glbKey?: string;
    objKey?: string;
    thumbKey?: string;
  };

  favorite: boolean;
  version: number;
  notes?: string;

  createdAt: string;
  updatedAt: string;
};
