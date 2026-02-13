export const MATERIALS_SCHEMA_VERSION = "volumia.materials.v1";

export type MaterialsSchemaDocument = {
  schema: typeof MATERIALS_SCHEMA_VERSION;
  object: {
    name: string;
    generationId: string;
    preset: string;
    qualityTargets: {
      highFaces: number;
      lowFaces: number;
    };
  };
  components: Array<{
    name: string;
    order: number;
    materialSlots: string[];
  }>;
  materials: Array<{
    name: string;
    defaults: {
      roughness: number;
      normalStrength: number;
    };
    maps: {
      high: {
        baseColor: string;
        normal: string;
        roughness: string;
        ao?: string;
        metalness?: string;
      };
      low: {
        baseColor: string;
        normal: string;
        roughness: string;
        ao?: string;
        metalness?: string;
      };
    };
  }>;
};
