import { create } from "zustand";
import type { AssetCategory, AssetRecord, DimsCM } from "./library.types";
import { dbDeleteAsset, dbGetIndex, dbUpsertRecord, dbWipeAll, dbSetBlob, glbKey, thumbKey } from "./library.db";
import { nowISO, normalizeTags, uid8, safeNumber } from "./library.util";

type State = {
  isHydrated: boolean;
  items: AssetRecord[];
  query: string;
  category: AssetCategory | "all";
  onlyFavorites: boolean;

  hydrate: () => Promise<void>;

  setQuery: (q: string) => void;
  setCategory: (c: State["category"]) => void;
  setOnlyFavorites: (v: boolean) => void;

  saveDemoAsset: (opts: { name: string; tagsCsv: string; dims: DimsCM }) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  wipeAll: () => Promise<void>;
};

export const useLibraryStore = create<State>((set, get) => ({
  isHydrated: false,
  items: [],
  query: "",
  category: "all",
  onlyFavorites: false,

  hydrate: async () => {
    const index = await dbGetIndex();
    set({ items: index, isHydrated: true });
  },

  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setOnlyFavorites: (onlyFavorites) => set({ onlyFavorites }),

  saveDemoAsset: async ({ name, tagsCsv, dims }) => {
    const id = uid8();
    const createdAt = nowISO();

    const fakeGlb = new Blob([`VOLUMIA_DEMO_GLB:${id}`], { type: "model/gltf-binary" });
    const fakePng = new Blob([`VOLUMIA_DEMO_THUMB:${id}`], { type: "image/png" });

    await dbSetBlob(glbKey(id), fakeGlb);
    await dbSetBlob(thumbKey(id), fakePng);

    const record: AssetRecord = {
      id,
      name: name.trim() || "Untitled Asset",
      tags: normalizeTags(tagsCsv),
      category: "furniture",
      units: "cm",
      dims_cm: {
        w: Math.round(safeNumber(dims.w, 50)),
        d: Math.round(safeNumber(dims.d, 50)),
        h: Math.round(safeNumber(dims.h, 50)),
      },
      source: "generated_demo",
      files: {
        glbKey: glbKey(id),
        thumbKey: thumbKey(id),
      },
      favorite: false,
      version: 1,
      notes: "",
      createdAt,
      updatedAt: createdAt,
    };

    await dbUpsertRecord(record);
    set({ items: await dbGetIndex() });
  },

  toggleFavorite: async (id) => {
    const rec = get().items.find((x) => x.id === id);
    if (!rec) return;
    const next: AssetRecord = { ...rec, favorite: !rec.favorite, updatedAt: nowISO() };
    await dbUpsertRecord(next);
    set({ items: await dbGetIndex() });
  },

  remove: async (id) => {
    await dbDeleteAsset(id);
    set({ items: await dbGetIndex() });
  },

  wipeAll: async () => {
    await dbWipeAll();
    set({ items: [], isHydrated: true });
  },
}));
