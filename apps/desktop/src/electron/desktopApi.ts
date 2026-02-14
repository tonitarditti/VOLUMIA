import {
  type ExportSettingsResult,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type ImportProjectsResult,
  type ProjectsExportEnvelope,
  type RememberWindowBoundsPayload,
  type SettingsExportEnvelope,
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

export type VolumiaDesktopBridge = {
  exportJson: (payload: ProjectsExportEnvelope) => Promise<ExportProjectsResult>;
  importJson: () => Promise<ImportProjectsResult>;
  exportSettingsJson?: (payload: SettingsExportEnvelope) => Promise<ExportSettingsResult>;
  importSettingsJson?: () => Promise<ImportSettingsResult>;
  windowControls?: Partial<VolumiaWindowControls>;
  settingsWindow?: Partial<VolumiaSettingsWindowBridge>;
};

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
};

export type VolumiaDesktopApi = typeof desktopApi;
