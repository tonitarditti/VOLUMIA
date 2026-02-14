import { contextBridge, ipcRenderer } from "electron";
import {
  type ExportSettingsResult,
  IPC_CHANNELS,
  type ClearCacheResult,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationCheckResult,
  type GenerationProgressPayload,
  type GenerationRunPayload,
  type GenerationRunResult,
  type GenerationTestResult,
  type ImportProjectsResult,
  type PythonDetectResult,
  type PythonInstallLogPayload,
  type PythonInstallTorchCudaResult,
  type PythonProbeResult,
  type ProjectsExportEnvelope,
  type RememberWindowBoundsPayload,
  type SettingsExportEnvelope,
  type Theme,
  type WindowModePayload,
  type SystemThemeChangedPayload,
  type WindowStateSnapshot,
} from "./channels";

const systemThemeListeners = new Map<(theme: Theme) => void, (_event: Electron.IpcRendererEvent, payload: SystemThemeChangedPayload) => void>();
const generationProgressListeners = new Map<
  (payload: GenerationProgressPayload) => void,
  (_event: Electron.IpcRendererEvent, payload: GenerationProgressPayload) => void
>();
const generationDoneListeners = new Map<
  (payload: GenerationDonePayload) => void,
  (_event: Electron.IpcRendererEvent, payload: GenerationDonePayload) => void
>();
const generationErrorListeners = new Map<
  (payload: GenerationErrorPayload) => void,
  (_event: Electron.IpcRendererEvent, payload: GenerationErrorPayload) => void
>();
const pythonInstallLogListeners = new Map<
  (line: string) => void,
  (_event: Electron.IpcRendererEvent, payload: PythonInstallLogPayload) => void
>();

const bridge = {
  exportJson: (payload: ProjectsExportEnvelope) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportProjectsJson, payload) as Promise<ExportProjectsResult>,
  importJson: () => ipcRenderer.invoke(IPC_CHANNELS.importProjectsJson) as Promise<ImportProjectsResult>,
  exportSettingsJson: (payload: SettingsExportEnvelope) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportSettingsJson, payload) as Promise<ExportSettingsResult>,
  importSettingsJson: () =>
    ipcRenderer.invoke(IPC_CHANNELS.importSettingsJson) as Promise<ImportSettingsResult>,
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow) as Promise<boolean>,
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow) as Promise<boolean>,
    close: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow) as Promise<boolean>,
  },
  settingsWindow: {
    setMode: (payload: WindowModePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.setWindowMode, payload) as Promise<WindowStateSnapshot>,
    setBoundsRemember: (payload: RememberWindowBoundsPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.setWindowBoundsRemember, payload) as Promise<WindowStateSnapshot>,
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowState) as Promise<WindowStateSnapshot>,
    resetLayout: () => ipcRenderer.invoke(IPC_CHANNELS.resetWindowLayout) as Promise<WindowStateSnapshot>,
  },
  system: {
    getLocale: () => ipcRenderer.invoke(IPC_CHANNELS.getSystemLocale) as Promise<string>,
    getTheme: () => ipcRenderer.invoke(IPC_CHANNELS.getSystemTheme) as Promise<Theme>,
    onThemeChanged: (callback: (theme: Theme) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SystemThemeChangedPayload) => {
        callback(payload.theme);
      };

      systemThemeListeners.set(callback, wrapped);
      ipcRenderer.on(IPC_CHANNELS.systemThemeChanged, wrapped);
    },
    offThemeChanged: (callback: (theme: Theme) => void) => {
      const wrapped = systemThemeListeners.get(callback);
      if (!wrapped) return;
      ipcRenderer.off(IPC_CHANNELS.systemThemeChanged, wrapped);
      systemThemeListeners.delete(callback);
    },
  },
  systemInfo: {
    getUserDataPath: () => ipcRenderer.invoke(IPC_CHANNELS.getUserDataPath) as Promise<string>,
    openUserDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openUserDataFolder) as Promise<string>,
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.clearCache) as Promise<ClearCacheResult>,
  },
  generation: {
    selectImages: () => ipcRenderer.invoke(IPC_CHANNELS.generationSelectImages) as Promise<string[]>,
    run: (payload: GenerationRunPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.generationRun, payload) as Promise<GenerationRunResult>,
    cancel: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.generationCancel, { projectId }) as Promise<void>,
    check: () => ipcRenderer.invoke(IPC_CHANNELS.generationCheck) as Promise<GenerationCheckResult>,
    test: () => ipcRenderer.invoke(IPC_CHANNELS.generationTest) as Promise<GenerationTestResult>,
    readGlb: (glbPath: string) => ipcRenderer.invoke("gen:read-glb", glbPath),
    readImageAsDataUrl: (imagePath: string) => ipcRenderer.invoke("gen:read-image-data-url", imagePath) as Promise<string>,
    openLogPath: (logPath: string) =>
      ipcRenderer.invoke("gen:open-log-path", { logPath }) as Promise<{ ok: boolean; path: string; error?: string }>,
    openOutputFolder: (glbPath: string) =>
      ipcRenderer.invoke("gen:open-output-folder", { glbPath }) as Promise<{ ok: boolean; path: string; error?: string }>,
    onProgress: (callback: (payload: GenerationProgressPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: GenerationProgressPayload) => {
        callback(payload);
      };

      generationProgressListeners.set(callback, wrapped);
      ipcRenderer.on(IPC_CHANNELS.generationProgress, wrapped);
    },
    offProgress: (callback: (payload: GenerationProgressPayload) => void) => {
      const wrapped = generationProgressListeners.get(callback);
      if (!wrapped) return;
      ipcRenderer.off(IPC_CHANNELS.generationProgress, wrapped);
      generationProgressListeners.delete(callback);
    },
    onDone: (callback: (payload: GenerationDonePayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: GenerationDonePayload) => {
        callback(payload);
      };

      generationDoneListeners.set(callback, wrapped);
      ipcRenderer.on(IPC_CHANNELS.generationDone, wrapped);
    },
    offDone: (callback: (payload: GenerationDonePayload) => void) => {
      const wrapped = generationDoneListeners.get(callback);
      if (!wrapped) return;
      ipcRenderer.off(IPC_CHANNELS.generationDone, wrapped);
      generationDoneListeners.delete(callback);
    },
    onError: (callback: (payload: GenerationErrorPayload) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: GenerationErrorPayload) => {
        callback(payload);
      };

      generationErrorListeners.set(callback, wrapped);
      ipcRenderer.on(IPC_CHANNELS.generationError, wrapped);
    },
    offError: (callback: (payload: GenerationErrorPayload) => void) => {
      const wrapped = generationErrorListeners.get(callback);
      if (!wrapped) return;
      ipcRenderer.off(IPC_CHANNELS.generationError, wrapped);
      generationErrorListeners.delete(callback);
    },
  },
  systemPython: {
    detect: () => ipcRenderer.invoke(IPC_CHANNELS.pyDetect) as Promise<PythonDetectResult>,
    probe: (pythonPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pyProbe, { pythonPath }) as Promise<PythonProbeResult>,
    installTorchCuda: (pythonPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pyInstallTorchCuda, { pythonPath }) as Promise<PythonInstallTorchCudaResult>,
    onInstallLog: (callback: (line: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: PythonInstallLogPayload) => {
        callback(payload.line);
      };

      pythonInstallLogListeners.set(callback, wrapped);
      ipcRenderer.on(IPC_CHANNELS.pyInstallLog, wrapped);
    },
    offInstallLog: (callback: (line: string) => void) => {
      const wrapped = pythonInstallLogListeners.get(callback);
      if (!wrapped) return;
      ipcRenderer.off(IPC_CHANNELS.pyInstallLog, wrapped);
      pythonInstallLogListeners.delete(callback);
    },
  },
  // Backward compatibility for existing renderer wrappers.
  exportProjectsJson: (payload: ProjectsExportEnvelope) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportProjectsJson, payload) as Promise<ExportProjectsResult>,
  importProjectsJson: () =>
    ipcRenderer.invoke(IPC_CHANNELS.importProjectsJson) as Promise<ImportProjectsResult>,
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow) as Promise<boolean>,
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow) as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("volumia", bridge);

export {};
