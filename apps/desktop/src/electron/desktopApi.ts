import {
  type ExportSettingsResult,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type ImportProjectsResult,
  type ProjectsExportEnvelope,
  type RememberWindowBoundsPayload,
  type SettingsExportEnvelope,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationCheckResult,
  type GenerationProgressPayload,
  type GenerationRunPayload,
  type GenerationRunResult,
  type GenerationTestResult,
  type Theme,
  type WindowModePayload,
  type WindowStateSnapshot,
} from "./channels";

export type VolumiaWindowControls = {
  minimize: () => Promise<boolean>;
  maximize: () => Promise<boolean>;
  close: () => Promise<boolean>;
};

export type VolumiaSettingsWindowBridge = {
  setMode: (payload: WindowModePayload) => Promise<WindowStateSnapshot>;
  setBoundsRemember: (payload: RememberWindowBoundsPayload) => Promise<WindowStateSnapshot>;
  getState: () => Promise<WindowStateSnapshot>;
  resetLayout: () => Promise<WindowStateSnapshot>;
};

export type VolumiaSystemBridge = {
  getLocale: () => Promise<string>;
  getTheme: () => Promise<Theme>;
  onThemeChanged: (callback: (theme: Theme) => void) => void;
  offThemeChanged: (callback: (theme: Theme) => void) => void;
};

export type VolumiaGenerationBridge = {
  selectImages: () => Promise<string[]>;
  run: (payload: GenerationRunPayload) => Promise<GenerationRunResult>;
  cancel: (projectId: string) => Promise<void>;
  check: () => Promise<GenerationCheckResult>;
  test: () => Promise<GenerationTestResult>;
  openOutputFolder: (glbPath: string) => Promise<{ ok: boolean; path: string; error?: string }>;
  onProgress: (callback: (payload: GenerationProgressPayload) => void) => void;
  offProgress: (callback: (payload: GenerationProgressPayload) => void) => void;
  onDone: (callback: (payload: GenerationDonePayload) => void) => void;
  offDone: (callback: (payload: GenerationDonePayload) => void) => void;
  onError: (callback: (payload: GenerationErrorPayload) => void) => void;
  offError: (callback: (payload: GenerationErrorPayload) => void) => void;
};

export type VolumiaDesktopBridge = {
  exportJson: (payload: ProjectsExportEnvelope) => Promise<ExportProjectsResult>;
  importJson: () => Promise<ImportProjectsResult>;
  exportSettingsJson?: (payload: SettingsExportEnvelope) => Promise<ExportSettingsResult>;
  importSettingsJson?: () => Promise<ImportSettingsResult>;
  windowControls?: Partial<VolumiaWindowControls>;
  settingsWindow?: Partial<VolumiaSettingsWindowBridge>;
  system?: Partial<VolumiaSystemBridge>;
  generation?: Partial<VolumiaGenerationBridge>;
};

export function hasDesktopBridge() {
  return typeof window !== "undefined" && Boolean(window.volumia);
}

function ensureBridge(): VolumiaDesktopBridge {
  const bridge = window.volumia;
  if (!bridge) {
    throw new Error("Desktop bridge is unavailable.");
  }
  return bridge;
}

function ensureWindowControls(): VolumiaWindowControls {
  const controls = ensureBridge().windowControls;
  if (!controls?.minimize || !controls.maximize || !controls.close) {
    throw new Error("Desktop bridge window controls are unavailable.");
  }

  return controls as VolumiaWindowControls;
}

function ensureSettingsWindow(): VolumiaSettingsWindowBridge {
  const settingsWindow = ensureBridge().settingsWindow;
  if (!settingsWindow?.setMode || !settingsWindow.setBoundsRemember || !settingsWindow.getState || !settingsWindow.resetLayout) {
    throw new Error("Desktop settings window bridge is unavailable.");
  }

  return settingsWindow as VolumiaSettingsWindowBridge;
}

function ensureSettingsExport() {
  const fn = ensureBridge().exportSettingsJson;
  if (!fn) {
    throw new Error("Desktop settings export bridge is unavailable.");
  }
  return fn;
}

function ensureSettingsImport() {
  const fn = ensureBridge().importSettingsJson;
  if (!fn) {
    throw new Error("Desktop settings import bridge is unavailable.");
  }
  return fn;
}

function ensureSystemBridge(): VolumiaSystemBridge {
  const system = ensureBridge().system;
  if (!system?.getLocale || !system.getTheme || !system.onThemeChanged || !system.offThemeChanged) {
    throw new Error("Desktop system bridge is unavailable.");
  }

  return system as VolumiaSystemBridge;
}

function ensureGenerationBridge(): VolumiaGenerationBridge {
  const generation = ensureBridge().generation;
  if (
    !generation?.selectImages ||
    !generation.run ||
    !generation.cancel ||
    !generation.check ||
    !generation.test ||
    !generation.openOutputFolder ||
    !generation.onProgress ||
    !generation.offProgress ||
    !generation.onDone ||
    !generation.offDone ||
    !generation.onError ||
    !generation.offError
  ) {
    throw new Error("Desktop generation bridge is unavailable.");
  }

  return generation as VolumiaGenerationBridge;
}

export const desktopApi = {
  exportProjectsJson(payload: ProjectsExportEnvelope): Promise<ExportProjectsResult> {
    return ensureBridge().exportJson(payload);
  },
  importProjectsJson(): Promise<ImportProjectsResult> {
    return ensureBridge().importJson();
  },
  minimizeWindow(): Promise<boolean> {
    return ensureWindowControls().minimize();
  },
  toggleMaximizeWindow(): Promise<boolean> {
    return ensureWindowControls().maximize();
  },
  closeWindow(): Promise<boolean> {
    return ensureWindowControls().close();
  },
  exportSettingsJson(payload: SettingsExportEnvelope): Promise<ExportSettingsResult> {
    return ensureSettingsExport()(payload);
  },
  importSettingsJson(): Promise<ImportSettingsResult> {
    return ensureSettingsImport()();
  },
  setWindowMode(mode: WindowModePayload["mode"]): Promise<WindowStateSnapshot> {
    return ensureSettingsWindow().setMode({ mode });
  },
  setWindowBoundsRemember(remember: boolean): Promise<WindowStateSnapshot> {
    return ensureSettingsWindow().setBoundsRemember({ remember });
  },
  getWindowState(): Promise<WindowStateSnapshot> {
    return ensureSettingsWindow().getState();
  },
  resetWindowLayout(): Promise<WindowStateSnapshot> {
    return ensureSettingsWindow().resetLayout();
  },
  getSystemLocale(): Promise<string> {
    return ensureSystemBridge().getLocale();
  },
  getSystemTheme(): Promise<Theme> {
    return ensureSystemBridge().getTheme();
  },
  onSystemThemeChanged(callback: (theme: Theme) => void): () => void {
    const system = ensureSystemBridge();
    system.onThemeChanged(callback);

    return () => {
      system.offThemeChanged(callback);
    };
  },
  selectGenerationImages(): Promise<string[]> {
    return ensureGenerationBridge().selectImages();
  },
  runGeneration(payload: GenerationRunPayload): Promise<GenerationRunResult> {
    return ensureGenerationBridge().run(payload);
  },
  cancelGeneration(projectId: string): Promise<void> {
    return ensureGenerationBridge().cancel(projectId);
  },
  checkLocalGenerator(): Promise<GenerationCheckResult> {
    return ensureGenerationBridge().check();
  },
  runLocalGeneratorTest(): Promise<GenerationTestResult> {
    return ensureGenerationBridge().test();
  },
  openGenerationOutputFolder(glbPath: string): Promise<{ ok: boolean; path: string; error?: string }> {
    return ensureGenerationBridge().openOutputFolder(glbPath);
  },
  onGenerationProgress(callback: (payload: GenerationProgressPayload) => void): () => void {
    const generation = ensureGenerationBridge();
    generation.onProgress(callback);
    return () => {
      generation.offProgress(callback);
    };
  },
  onGenerationDone(callback: (payload: GenerationDonePayload) => void): () => void {
    const generation = ensureGenerationBridge();
    generation.onDone(callback);
    return () => {
      generation.offDone(callback);
    };
  },
  onGenerationError(callback: (payload: GenerationErrorPayload) => void): () => void {
    const generation = ensureGenerationBridge();
    generation.onError(callback);
    return () => {
      generation.offError(callback);
    };
  },
};

export type VolumiaDesktopApi = typeof desktopApi;
