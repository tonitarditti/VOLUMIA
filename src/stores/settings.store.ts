import { create } from "zustand";

export type Units = "cm" | "m";
export type Mode = "concept" | "production" | "editable_clean";
export type Detail = "low" | "medium" | "high";
export type Precision = "loose" | "accurate";

type State = {
  units: Units;
  mode: Mode;
  detail: Detail;
  precision: Precision;
  materials: boolean;
  clayPreview: boolean;
  keepProportions: boolean;

  setUnits: (u: Units) => void;
  setMode: (m: Mode) => void;
  setDetail: (d: Detail) => void;
  setPrecision: (p: Precision) => void;
  setMaterials: (v: boolean) => void;
  setClayPreview: (v: boolean) => void;
  setKeepProportions: (v: boolean) => void;
};

export const useSettingsStore = create<State>((set) => ({
  units: "cm",
  mode: "production",
  detail: "medium",
  precision: "accurate",
  materials: true,
  clayPreview: false,
  keepProportions: true,

  setUnits: (units) => set({ units }),
  setMode: (mode) => set({ mode }),
  setDetail: (detail) => set({ detail }),
  setPrecision: (precision) => set({ precision }),
  setMaterials: (materials) => set({ materials }),
  setClayPreview: (clayPreview) => set({ clayPreview }),
  setKeepProportions: (keepProportions) => set({ keepProportions }),
}));
