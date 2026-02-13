import { create } from "zustand";
import { BUILTIN_PRESETS } from "@volumia/shared";
import type { ObjectTypeOption, StudioPresetDefinition } from "@volumia/shared";
import { desktopApi } from "@/api/desktopApi";

type PresetsState = {
  studioPresets: StudioPresetDefinition[];
  loading: boolean;
  loadStudioPresets: () => Promise<void>;
  saveStudioPreset: (payload: {
    presetName: string;
    basePreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
    structureLocked: boolean;
    materialDefaults: Array<{ materialName: string; roughness: number; normalStrength: number }>;
    exportDefaults: { textureSize: "2k" | "4k"; includeLightweight: boolean };
  }) => Promise<StudioPresetDefinition>;
};

export const builtinPresetOptions = BUILTIN_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
}));

export const usePresetsStore = create<PresetsState>((set, get) => ({
  studioPresets: [],
  loading: false,

  loadStudioPresets: async () => {
    set({ loading: true });
    try {
      const studioPresets = await desktopApi.listStudioPresets();
      set({ studioPresets, loading: false });
    } catch (error) {
      console.error("Failed to load studio presets", error);
      set({ loading: false });
    }
  },

  saveStudioPreset: async (payload) => {
    const saved = await desktopApi.saveStudioPreset(payload);
    set({ studioPresets: [...get().studioPresets, saved] });
    return saved;
  },
}));
