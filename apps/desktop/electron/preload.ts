import { contextBridge, ipcRenderer } from "electron";
import {
  type ExportSettingsResult,
  IPC_CHANNELS,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type ImportProjectsResult,
  type ProjectsExportEnvelope,
  type RememberWindowBoundsPayload,
  type SettingsExportEnvelope,
  type WindowModePayload,
  type WindowStateSnapshot,
} from "./channels";

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
