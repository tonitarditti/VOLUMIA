import { create } from "zustand";

export type AppScreen = "newCapture" | "processing" | "reviewExport" | "settings";

type UiState = {
  screen: AppScreen;
  exportModalOpen: boolean;
  errorMessage: string | null;
  setScreen: (screen: AppScreen) => void;
  openExportModal: () => void;
  closeExportModal: () => void;
  setErrorMessage: (message: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  screen: "newCapture",
  exportModalOpen: false,
  errorMessage: null,
  setScreen: (screen) => set({ screen }),
  openExportModal: () => set({ exportModalOpen: true }),
  closeExportModal: () => set({ exportModalOpen: false }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
