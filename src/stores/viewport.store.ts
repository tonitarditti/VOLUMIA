import { create } from "zustand";

export type Dims = { w: number; d: number; h: number }; // cm

type State = {
  dims: Dims;
  original: Dims;
  maintainProportions: boolean;

  setDim: (key: keyof Dims, value: number) => void;
  setMaintainProportions: (v: boolean) => void;
  setOriginalFromModel: (dims: Dims) => void;
};

export const useViewportStore = create<State>((set) => ({
  dims: { w: 50, d: 50, h: 50 },
  original: { w: 50, d: 50, h: 50 },
  maintainProportions: true,

  setDim: (key, value) =>
    set((s) => ({
      dims: { ...s.dims, [key]: Math.max(1, Number.isFinite(value) ? value : 1) },
    })),

  setMaintainProportions: (v) => set({ maintainProportions: v }),

  setOriginalFromModel: (dims) => set({ original: dims, dims }),
}));
