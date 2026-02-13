import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("volumia", {
  analyzeImages: (payload: unknown) => ipcRenderer.invoke("volumia:analyze-images", payload),
  generateModel: (payload: unknown) => ipcRenderer.invoke("volumia:generate-model", payload),
  exportPackage: (payload: unknown) => ipcRenderer.invoke("volumia:export-package", payload),
  saveExportDialog: (payload: { suggestedFileName: string; sourceZipPath: string }) =>
    ipcRenderer.invoke("volumia:save-export-dialog", payload),
  listStudioPresets: () => ipcRenderer.invoke("volumia:studio-preset:list"),
  saveStudioPreset: (payload: unknown) => ipcRenderer.invoke("volumia:studio-preset:save", payload),
  getSettings: () => ipcRenderer.invoke("volumia:settings:get"),
  saveSettings: (payload: unknown) => ipcRenderer.invoke("volumia:settings:set", payload),
  getWindowState: () => ipcRenderer.invoke("volumia:window:get-state"),
  getWindowBounds: () => ipcRenderer.invoke("volumia:window:get-bounds"),
  setWindowBounds: (payload: unknown) => ipcRenderer.invoke("volumia:window:set-bounds", payload),
  applyWindowSizePreset: (preset: "small" | "medium" | "large") =>
    ipcRenderer.invoke("volumia:window:apply-size-preset", preset),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("volumia:window:set-always-on-top", value),
  setMaximized: (value: boolean) => ipcRenderer.invoke("volumia:window:set-maximized", value),
  setZoomFactor: (value: number) => ipcRenderer.invoke("volumia:window:set-zoom-factor", value),
  getGpuInfo: () => ipcRenderer.invoke("volumia:diagnostics:gpu-info"),
  openLogsFolder: () => ipcRenderer.invoke("volumia:diagnostics:open-logs-folder"),
  openServiceFolder: () => ipcRenderer.invoke("volumia:diagnostics:open-service-folder"),
  restartPythonService: () => ipcRenderer.invoke("volumia:diagnostics:restart-service"),
  getServiceStatus: () => ipcRenderer.invoke("volumia:diagnostics:service-status"),
  getServiceInfo: () => ipcRenderer.invoke("service:getInfo"),
  getAppVersion: () => ipcRenderer.invoke("volumia:getAppVersion") as Promise<string>,
});

contextBridge.exposeInMainWorld("volumiaWindow", {
  minimize: () => ipcRenderer.invoke("volumia:window:minimize") as Promise<boolean>,
  toggleMaximize: () => ipcRenderer.invoke("volumia:window:toggle-maximize") as Promise<boolean>,
  close: () => ipcRenderer.invoke("volumia:window:close") as Promise<boolean>,
  isMaximized: () => ipcRenderer.invoke("volumia:window:is-maximized") as Promise<boolean>,
});

export {};
