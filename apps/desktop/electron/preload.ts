import { contextBridge, ipcRenderer } from "electron";
import {
  type ExportSettingsResult,
  IPC_CHANNELS,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationProgressPayload,
  type GenerationRunPayload,
  type GenerationRunResult,
  type ImportProjectsResult,
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
  generation: {
    selectImages: () => ipcRenderer.invoke(IPC_CHANNELS.generationSelectImages) as Promise<string[]>,
    run: (payload: GenerationRunPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.generationRun, payload) as Promise<GenerationRunResult>,
    cancel: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.generationCancel, { projectId }) as Promise<void>,
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
