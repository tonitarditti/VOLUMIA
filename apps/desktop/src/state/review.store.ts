import { create } from "zustand";
import type { GenerationResult, PreviewQuality } from "@volumia/shared";

export type MaterialControlState = {
  tiling: number;
  rotation: number;
  roughness: number;
  normalStrength: number;
};

type ReviewState = {
  generationResult: GenerationResult | null;
  previewQuality: PreviewQuality;
  materialControls: Record<string, MaterialControlState>;
  setGenerationResult: (result: GenerationResult) => void;
  setPreviewQuality: (quality: PreviewQuality) => void;
  updateMaterialControl: (materialName: string, patch: Partial<MaterialControlState>) => void;
  clear: () => void;
};

export const useReviewStore = create<ReviewState>((set) => ({
  generationResult: null,
  previewQuality: "high",
  materialControls: {},

  setGenerationResult: (generationResult) =>
    set({
      generationResult,
      previewQuality: "high",
      materialControls: generationResult.materials.reduce<Record<string, MaterialControlState>>((acc, material) => {
        acc[material.name] = {
          tiling: 1,
          rotation: 0,
          roughness: material.roughnessDefault,
          normalStrength: material.normalStrengthDefault,
        };
        return acc;
      }, {}),
    }),

  setPreviewQuality: (previewQuality) => set({ previewQuality }),

  updateMaterialControl: (materialName, patch) =>
    set((state) => ({
      materialControls: {
        ...state.materialControls,
        [materialName]: {
          ...state.materialControls[materialName],
          ...patch,
        },
      },
    })),

  clear: () => set({ generationResult: null, previewQuality: "high", materialControls: {} }),
}));
