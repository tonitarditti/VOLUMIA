import { contextBridge, ipcRenderer } from "electron";
import {
  type ExportSettingsResult,
  IPC_CHANNELS,
  type ClearCacheResult,
  type ImportSettingsResult,
  type ExportProjectsResult,
  type BackendRunDefaultPayload,
  type BackendRunDefaultResult,
  type BackendImportWorkflowResult,
  type BackendStatusResponse,
  type ComfyConfigPatch,
  type ComfyConfigResponse,
  type ComfyJobOutputs,
  type ComfyJobStatusResponse,
  type ComfyRunWorkflowPayload,
  type ComfyRunWorkflowResult,
  type ComfySubmitJobPayload,
  type ComfySubmitJobResult,
  type ComfyStatusResponse,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationCheckResult,
  type GenerationCaptureViewportMultiviewPayload,
  type GenerationProgressPayload,
  type GenerationRunPayload,
  type GenerationRunResult,
  type GenerationWritePngBase64Payload,
  type GenerationTestResult,
  type ImportProjectsResult,
  type PythonDetectResult,
  type PythonDetectPayload,
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

// Use Sets and single ipcRenderer handlers per channel to avoid registering many ipcRenderer listeners
const systemThemeListeners = new Set<(theme: Theme) => void>();
const generationProgressListeners = new Set<(payload: GenerationProgressPayload) => void>();
const generationDoneListeners = new Set<(payload: GenerationDonePayload) => void>();
const generationErrorListeners = new Set<(payload: GenerationErrorPayload) => void>();
const pythonInstallLogListeners = new Set<(line: string) => void>();
let viewportMultiviewCaptureHandler:
  | ((payload: GenerationCaptureViewportMultiviewPayload) => Promise<string[]> | string[])
  | null = null;

let _systemThemeIpcAttached = false;
let _generationProgressIpcAttached = false;
let _generationDoneIpcAttached = false;
let _generationErrorIpcAttached = false;
let _pythonInstallLogIpcAttached = false;

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
      systemThemeListeners.add(callback);
      if (!_systemThemeIpcAttached) {
        _systemThemeIpcAttached = true;
        ipcRenderer.on(IPC_CHANNELS.systemThemeChanged, (_event, payload: SystemThemeChangedPayload) => {
          for (const cb of systemThemeListeners) {
            try {
              cb(payload.theme);
            } catch {
              // swallow
            }
          }
        });
      }
    },
    offThemeChanged: (callback: (theme: Theme) => void) => {
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
    writePngBase64: (payload: GenerationWritePngBase64Payload) =>
      ipcRenderer.invoke("gen:write-png-base64", payload) as Promise<string>,
    captureViewportMultiview: async (payload: GenerationCaptureViewportMultiviewPayload) => {
      if (!viewportMultiviewCaptureHandler) {
        throw new Error("Viewport multiview capture handler unavailable.");
      }
      const paths = await viewportMultiviewCaptureHandler(payload);
      if (!Array.isArray(paths) || paths.some((item) => typeof item !== "string")) {
        throw new Error("Viewport multiview capture returned invalid paths.");
      }
      return paths;
    },
    setViewportMultiviewCaptureHandler: (
      handler: (payload: GenerationCaptureViewportMultiviewPayload) => Promise<string[]> | string[]
    ) => {
      viewportMultiviewCaptureHandler = handler;
    },
    clearViewportMultiviewCaptureHandler: () => {
      viewportMultiviewCaptureHandler = null;
    },
    readImageAsDataUrl: (imagePath: string) => ipcRenderer.invoke("gen:read-image-data-url", imagePath) as Promise<string>,
    openLogPath: (logPath: string) =>
      ipcRenderer.invoke("gen:open-log-path", { logPath }) as Promise<{ ok: boolean; path: string; error?: string }>,
    openOutputFolder: (glbPath: string) =>
      ipcRenderer.invoke("gen:open-output-folder", { glbPath }) as Promise<{ ok: boolean; path: string; error?: string }>,
    onProgress: (callback: (payload: GenerationProgressPayload) => void) => {
      generationProgressListeners.add(callback);
      if (!_generationProgressIpcAttached) {
        _generationProgressIpcAttached = true;
        ipcRenderer.on(IPC_CHANNELS.generationProgress, (_event, payload: GenerationProgressPayload) => {
          for (const cb of generationProgressListeners) {
            try {
              cb(payload);
            } catch {
              // swallow
            }
          }
        });
      }
    },
    offProgress: (callback: (payload: GenerationProgressPayload) => void) => {
      generationProgressListeners.delete(callback);
    },
    onDone: (callback: (payload: GenerationDonePayload) => void) => {
      generationDoneListeners.add(callback);
      if (!_generationDoneIpcAttached) {
        _generationDoneIpcAttached = true;
        ipcRenderer.on(IPC_CHANNELS.generationDone, (_event, payload: GenerationDonePayload) => {
          for (const cb of generationDoneListeners) {
            try {
              cb(payload);
            } catch {
              // swallow
            }
          }
        });
      }
    },
    offDone: (callback: (payload: GenerationDonePayload) => void) => {
      generationDoneListeners.delete(callback);
    },
    onError: (callback: (payload: GenerationErrorPayload) => void) => {
      generationErrorListeners.add(callback);
      if (!_generationErrorIpcAttached) {
        _generationErrorIpcAttached = true;
        ipcRenderer.on(IPC_CHANNELS.generationError, (_event, payload: GenerationErrorPayload) => {
          for (const cb of generationErrorListeners) {
            try {
              cb(payload);
            } catch {
              // swallow
            }
          }
        });
      }
    },
    offError: (callback: (payload: GenerationErrorPayload) => void) => {
      generationErrorListeners.delete(callback);
    },
  },
  systemPython: {
    detect: (payload?: PythonDetectPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.pyDetect, payload ?? {}) as Promise<PythonDetectResult>,
    probe: (pythonPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pyProbe, { pythonPath }) as Promise<PythonProbeResult>,
    installTorchCuda: (pythonPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pyInstallTorchCuda, { pythonPath }) as Promise<PythonInstallTorchCudaResult>,
    onInstallLog: (callback: (line: string) => void) => {
      pythonInstallLogListeners.add(callback);
      if (!_pythonInstallLogIpcAttached) {
        _pythonInstallLogIpcAttached = true;
        ipcRenderer.on(IPC_CHANNELS.pyInstallLog, (_event, payload: PythonInstallLogPayload) => {
          for (const cb of pythonInstallLogListeners) {
            try {
              cb(payload.line);
            } catch {
              // swallow
            }
          }
        });
      }
    },
    offInstallLog: (callback: (line: string) => void) => {
      pythonInstallLogListeners.delete(callback);
    },
  },
  backend: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.backendStatus) as Promise<BackendStatusResponse>,
    runDefault: (payload?: BackendRunDefaultPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.backendRunDefault, payload ?? {}) as Promise<BackendRunDefaultResult>,
    importWorkflow: () =>
      ipcRenderer.invoke(IPC_CHANNELS.backendImportWorkflow) as Promise<BackendImportWorkflowResult>,
  },
  comfy: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.comfyStatus) as Promise<ComfyStatusResponse>,
    start: () => ipcRenderer.invoke(IPC_CHANNELS.comfyStart) as Promise<ComfyStatusResponse>,
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.comfyStop) as Promise<ComfyStatusResponse>,
    logs: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.comfyLogs, { limit }) as Promise<string[]>,
    runWorkflow: (payload?: ComfyRunWorkflowPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfyRunWorkflow, payload ?? {}) as Promise<ComfyRunWorkflowResult>,
    submitJob: (payload?: ComfySubmitJobPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfySubmitJob, payload ?? {}) as Promise<ComfySubmitJobResult>,
    getJobStatus: (jobId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfyJobStatus, { jobId }) as Promise<ComfyJobStatusResponse>,
    cancelJob: (jobId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfyCancelJob, { jobId }) as Promise<void>,
    resolveOutputs: (jobId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfyResolveOutputs, { jobId }) as Promise<ComfyJobOutputs>,
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.comfyGetConfig) as Promise<ComfyConfigResponse>,
    saveConfig: (patch: ComfyConfigPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.comfySaveConfig, patch ?? {}) as Promise<ComfyConfigResponse>,
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
