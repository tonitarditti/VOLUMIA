import { create } from "zustand";
import type {
  CaptureImageInput,
  CaptureSlotId,
  ComplexityLevel,
  ObjectTypeOption,
  ReconstructionMode,
  ScaleDimension,
  SlotStatus,
} from "@volumia/shared";

export type CaptureSlot = {
  id: CaptureSlotId;
  label: string;
  recommended: boolean;
  optional: boolean;
  image: {
    fileName: string;
    filePath?: string;
    previewUrl: string;
    status: SlotStatus;
    note: string;
  } | null;
};

export type GuidedPoint = {
  x: number;
  y: number;
};

export type GuidedDimensionMark = {
  axis: "width" | "height";
  start: GuidedPoint;
  end: GuidedPoint;
};

export type GuidedRectangle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export type GuidedAnnotations = {
  sourceSlotId: CaptureSlotId | null;
  dimensions: GuidedDimensionMark[];
  rectangles: GuidedRectangle[];
};

const slotBlueprint: Array<Omit<CaptureSlot, "image">> = [
  { id: "front", label: "Front", recommended: true, optional: false },
  { id: "side", label: "Side", recommended: true, optional: false },
  { id: "back", label: "Back", recommended: false, optional: true },
  { id: "top", label: "Top", recommended: false, optional: true },
  { id: "detail_1", label: "Detail 1", recommended: false, optional: true },
  { id: "detail_2", label: "Detail 2", recommended: false, optional: true },
  { id: "detail_3", label: "Detail 3", recommended: false, optional: true },
  { id: "detail_4", label: "Detail 4", recommended: false, optional: true },
  { id: "material_1", label: "Material Close-up 1", recommended: false, optional: true },
  { id: "material_2", label: "Material Close-up 2", recommended: false, optional: true },
  { id: "material_3", label: "Material Close-up 3", recommended: false, optional: true },
  { id: "material_4", label: "Material Close-up 4", recommended: false, optional: true },
];

function createInitialSlots(): CaptureSlot[] {
  return slotBlueprint.map((slot) => ({ ...slot, image: null }));
}

function revokePreview(slot: CaptureSlot) {
  if (slot.image?.previewUrl) {
    URL.revokeObjectURL(slot.image.previewUrl);
  }
}

type CaptureState = {
  slots: CaptureSlot[];
  objectType: ObjectTypeOption;
  reconstructionMode: ReconstructionMode;
  complexity: ComplexityLevel;
  includeLightweight: boolean;
  scaleDimension: ScaleDimension;
  scaleValueCm: number;
  guidedOpen: boolean;
  guidedAnnotations: GuidedAnnotations;
  setObjectType: (value: ObjectTypeOption) => void;
  setReconstructionMode: (value: ReconstructionMode) => void;
  setComplexity: (value: ComplexityLevel) => void;
  setIncludeLightweight: (value: boolean) => void;
  setScaleDimension: (value: ScaleDimension) => void;
  setScaleValueCm: (value: number) => void;
  setGuidedOpen: (value: boolean) => void;
  setGuidedSourceSlot: (slotId: CaptureSlotId | null) => void;
  setGuidedDimensions: (dimensions: GuidedDimensionMark[]) => void;
  setGuidedRectangles: (rectangles: GuidedRectangle[]) => void;
  clearGuidedAnnotations: () => void;
  setSlotFile: (slotId: CaptureSlotId, file: File) => void;
  removeSlotFile: (slotId: CaptureSlotId) => void;
  assignFilesToNextSlots: (files: File[]) => void;
  setSlotStatus: (slotId: CaptureSlotId, status: SlotStatus, note: string) => void;
  toCaptureImageInputs: () => CaptureImageInput[];
};

export const useCaptureStore = create<CaptureState>((set, get) => ({
  slots: createInitialSlots(),
  objectType: "auto-detect",
  reconstructionMode: "auto",
  complexity: "medium",
  includeLightweight: true,
  scaleDimension: "width",
  scaleValueCm: 100,
  guidedOpen: false,
  guidedAnnotations: {
    sourceSlotId: "front",
    dimensions: [],
    rectangles: [],
  },

  setObjectType: (objectType) => set({ objectType }),
  setReconstructionMode: (reconstructionMode) => set({ reconstructionMode }),
  setComplexity: (complexity) => set({ complexity }),
  setIncludeLightweight: (includeLightweight) => set({ includeLightweight }),
  setScaleDimension: (scaleDimension) => set({ scaleDimension }),
  setScaleValueCm: (scaleValueCm) => set({ scaleValueCm }),
  setGuidedOpen: (guidedOpen) => set({ guidedOpen }),
  setGuidedSourceSlot: (sourceSlotId) =>
    set((state) => ({
      guidedAnnotations: { ...state.guidedAnnotations, sourceSlotId },
    })),
  setGuidedDimensions: (dimensions) =>
    set((state) => ({
      guidedAnnotations: { ...state.guidedAnnotations, dimensions },
    })),
  setGuidedRectangles: (rectangles) =>
    set((state) => ({
      guidedAnnotations: { ...state.guidedAnnotations, rectangles },
    })),
  clearGuidedAnnotations: () =>
    set((state) => ({
      guidedAnnotations: { ...state.guidedAnnotations, dimensions: [], rectangles: [] },
    })),

  setSlotFile: (slotId, file) => {
    set((state) => {
      const localPath = (file as File & { path?: string }).path;
      const slots = state.slots.map((slot) => {
        if (slot.id !== slotId) return slot;
        revokePreview(slot);
        return {
          ...slot,
          image: {
            fileName: file.name,
            filePath: localPath,
            previewUrl: URL.createObjectURL(file),
            status: "Ready" as SlotStatus,
            note: "Ready to process",
          },
        };
      });
      return { slots };
    });
  },

  removeSlotFile: (slotId) => {
    set((state) => {
      const slots = state.slots.map((slot) => {
        if (slot.id !== slotId) return slot;
        revokePreview(slot);
        return { ...slot, image: null };
      });
      return { slots };
    });
  },

  assignFilesToNextSlots: (files) => {
    const queue = [...files];
    if (queue.length === 0) return;

    set((state) => {
      const slots = state.slots.map((slot) => {
        if (queue.length === 0) return slot;
        if (slot.image) return slot;

        const nextFile = queue.shift();
        if (!nextFile) return slot;
        const localPath = (nextFile as File & { path?: string }).path;

        return {
          ...slot,
          image: {
            fileName: nextFile.name,
            filePath: localPath,
            previewUrl: URL.createObjectURL(nextFile),
            status: "Ready" as SlotStatus,
            note: "Ready to process",
          },
        };
      });
      return { slots };
    });
  },

  setSlotStatus: (slotId, status, note) => {
    set((state) => ({
      slots: state.slots.map((slot) => {
        if (slot.id !== slotId || !slot.image) return slot;
        return { ...slot, image: { ...slot.image, status, note } };
      }),
    }));
  },

  toCaptureImageInputs: () => {
    return get()
      .slots.filter((slot) => slot.image)
      .map((slot) => ({
        slotId: slot.id,
        fileName: slot.image!.fileName,
        filePath: slot.image!.filePath,
      }));
  },
}));
