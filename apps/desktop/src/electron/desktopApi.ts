import {
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
  type GenerationCaptureViewportMultiviewPayload,
  type GenerationTestResult,
  type GenerationWritePngBase64Payload,
  type Theme,
  type ClearCacheResult,
  type PythonDetectResult,
  type PythonDetectPayload,
  type PythonProbeResult,
  type PythonInstallTorchCudaResult,
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

export type VolumiaSystemInfoBridge = {
  getUserDataPath: () => Promise<string>;
  openUserDataFolder: () => Promise<string>;
  clearCache: () => Promise<ClearCacheResult>;
};

export type VolumiaGenerationBridge = {
  selectImages: () => Promise<string[]>;
  run: (payload: GenerationRunPayload) => Promise<GenerationRunResult>;
  cancel: (projectId: string) => Promise<void>;
  check: () => Promise<GenerationCheckResult>;
  test: () => Promise<GenerationTestResult>;
  captureViewportMultiview: (payload: GenerationCaptureViewportMultiviewPayload) => Promise<string[]>;
  setViewportMultiviewCaptureHandler: (
    handler: (payload: GenerationCaptureViewportMultiviewPayload) => Promise<string[]> | string[]
  ) => void;
  clearViewportMultiviewCaptureHandler: () => void;
  writePngBase64: (payload: GenerationWritePngBase64Payload) => Promise<string>;
  readImageAsDataUrl: (imagePath: string) => Promise<string>;
  openLogPath: (logPath: string) => Promise<{ ok: boolean; path: string; error?: string }>;
  openOutputFolder: (glbPath: string) => Promise<{ ok: boolean; path: string; error?: string }>;
  onProgress: (callback: (payload: GenerationProgressPayload) => void) => void;
  offProgress: (callback: (payload: GenerationProgressPayload) => void) => void;
  onDone: (callback: (payload: GenerationDonePayload) => void) => void;
  offDone: (callback: (payload: GenerationDonePayload) => void) => void;
  onError: (callback: (payload: GenerationErrorPayload) => void) => void;
  offError: (callback: (payload: GenerationErrorPayload) => void) => void;
};

export type VolumiaSystemPythonBridge = {
  detect: (payload?: PythonDetectPayload) => Promise<PythonDetectResult>;
  probe: (pythonPath: string) => Promise<PythonProbeResult>;
  installTorchCuda: (pythonPath: string) => Promise<PythonInstallTorchCudaResult>;
  onInstallLog: (callback: (line: string) => void) => void;
  offInstallLog: (callback: (line: string) => void) => void;
};

export type VolumiaBackendBridge = {
  status: () => Promise<BackendStatusResponse>;
  runDefault: (payload?: BackendRunDefaultPayload) => Promise<BackendRunDefaultResult>;
  importWorkflow: () => Promise<BackendImportWorkflowResult>;
};

export type VolumiaComfyBridge = {
  status: () => Promise<ComfyStatusResponse>;
  start: () => Promise<ComfyStatusResponse>;
  stop: () => Promise<ComfyStatusResponse>;
  logs: (limit?: number) => Promise<string[]>;
  runWorkflow: (payload?: ComfyRunWorkflowPayload) => Promise<ComfyRunWorkflowResult>;
  submitJob: (payload?: ComfySubmitJobPayload) => Promise<ComfySubmitJobResult>;
  getJobStatus: (jobId: string) => Promise<ComfyJobStatusResponse>;
  cancelJob: (jobId: string) => Promise<void>;
  resolveOutputs: (jobId: string) => Promise<ComfyJobOutputs>;
  getConfig: () => Promise<ComfyConfigResponse>;
  saveConfig: (patch: ComfyConfigPatch) => Promise<ComfyConfigResponse>;
};

export type VolumiaDesktopBridge = {
  exportJson: (payload: ProjectsExportEnvelope) => Promise<ExportProjectsResult>;
  importJson: () => Promise<ImportProjectsResult>;
  exportSettingsJson?: (payload: SettingsExportEnvelope) => Promise<ExportSettingsResult>;
  importSettingsJson?: () => Promise<ImportSettingsResult>;
  windowControls?: Partial<VolumiaWindowControls>;
  settingsWindow?: Partial<VolumiaSettingsWindowBridge>;
  system?: Partial<VolumiaSystemBridge>;
  systemInfo?: Partial<VolumiaSystemInfoBridge>;
  generation?: Partial<VolumiaGenerationBridge>;
  systemPython?: Partial<VolumiaSystemPythonBridge>;
  backend?: Partial<VolumiaBackendBridge>;
  comfy?: Partial<VolumiaComfyBridge>;
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

function ensureSystemInfoBridge(): VolumiaSystemInfoBridge {
  const systemInfo = ensureBridge().systemInfo;
  if (!systemInfo?.getUserDataPath || !systemInfo.openUserDataFolder || !systemInfo.clearCache) {
    throw new Error("Desktop system info bridge is unavailable.");
  }

  return systemInfo as VolumiaSystemInfoBridge;
}

function ensureGenerationBridge(): VolumiaGenerationBridge {
  const generation = ensureBridge().generation;
  if (
    !generation?.selectImages ||
    !generation.run ||
    !generation.cancel ||
    !generation.check ||
    !generation.test ||
    !generation.captureViewportMultiview ||
    !generation.setViewportMultiviewCaptureHandler ||
    !generation.clearViewportMultiviewCaptureHandler ||
    !generation.writePngBase64 ||
    !generation.readImageAsDataUrl ||
    !generation.openLogPath ||
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

function ensureSystemPythonBridge(): VolumiaSystemPythonBridge {
  const systemPython = ensureBridge().systemPython;
  if (
    !systemPython?.detect ||
    !systemPython.probe ||
    !systemPython.installTorchCuda ||
    !systemPython.onInstallLog ||
    !systemPython.offInstallLog
  ) {
    throw new Error("Desktop system Python bridge is unavailable.");
  }

  return systemPython as VolumiaSystemPythonBridge;
}

function ensureBackendBridge(): VolumiaBackendBridge {
  const backend = ensureBridge().backend;
  if (!backend?.status || !backend.runDefault || !backend.importWorkflow) {
    throw new Error("Desktop backend bridge is unavailable.");
  }
  return backend as VolumiaBackendBridge;
}

function ensureComfyBridge(): VolumiaComfyBridge {
  const comfy = ensureBridge().comfy;
  if (
    !comfy?.status ||
    !comfy.start ||
    !comfy.stop ||
    !comfy.logs ||
    !comfy.runWorkflow ||
    !comfy.submitJob ||
    !comfy.getJobStatus ||
    !comfy.cancelJob ||
    !comfy.resolveOutputs ||
    !comfy.getConfig ||
    !comfy.saveConfig
  ) {
    throw new Error("Desktop comfy bridge is unavailable.");
  }
  return comfy as VolumiaComfyBridge;
}

const generationProgressSubscribers = new Set<(payload: GenerationProgressPayload) => void>();
const generationDoneSubscribers = new Set<(payload: GenerationDonePayload) => void>();
const generationErrorSubscribers = new Set<(payload: GenerationErrorPayload) => void>();
let generationRelayAttached = false;
let generationRelayProgressHandler: ((payload: GenerationProgressPayload) => void) | null = null;
let generationRelayDoneHandler: ((payload: GenerationDonePayload) => void) | null = null;
let generationRelayErrorHandler: ((payload: GenerationErrorPayload) => void) | null = null;

function ensureGenerationEventRelay() {
  if (generationRelayAttached) {
    return;
  }

  const generation = ensureGenerationBridge();
  generationRelayProgressHandler = (payload) => {
    for (const callback of generationProgressSubscribers) {
      callback(payload);
    }
  };
  generationRelayDoneHandler = (payload) => {
    for (const callback of generationDoneSubscribers) {
      callback(payload);
    }
  };
  generationRelayErrorHandler = (payload) => {
    for (const callback of generationErrorSubscribers) {
      callback(payload);
    }
  };

  generation.onProgress(generationRelayProgressHandler);
  generation.onDone(generationRelayDoneHandler);
  generation.onError(generationRelayErrorHandler);
  generationRelayAttached = true;
}

function maybeDisposeGenerationEventRelay() {
  if (!generationRelayAttached) {
    return;
  }
  if (
    generationProgressSubscribers.size > 0 ||
    generationDoneSubscribers.size > 0 ||
    generationErrorSubscribers.size > 0
  ) {
    return;
  }

  try {
    const generation = ensureGenerationBridge();
    if (generationRelayProgressHandler) {
      generation.offProgress(generationRelayProgressHandler);
    }
    if (generationRelayDoneHandler) {
      generation.offDone(generationRelayDoneHandler);
    }
    if (generationRelayErrorHandler) {
      generation.offError(generationRelayErrorHandler);
    }
  } catch {
    // No-op by design.
  } finally {
    generationRelayAttached = false;
    generationRelayProgressHandler = null;
    generationRelayDoneHandler = null;
    generationRelayErrorHandler = null;
  }
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
  getUserDataPath(): Promise<string> {
    return ensureSystemInfoBridge().getUserDataPath();
  },
  openUserDataFolder(): Promise<string> {
    return ensureSystemInfoBridge().openUserDataFolder();
  },
  clearCache(): Promise<ClearCacheResult> {
    return ensureSystemInfoBridge().clearCache();
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
  readGenerationImageAsDataUrl(imagePath: string): Promise<string> {
    return ensureGenerationBridge().readImageAsDataUrl(imagePath);
  },
  openGenerationOutputFolder(glbPath: string): Promise<{ ok: boolean; path: string; error?: string }> {
    return ensureGenerationBridge().openOutputFolder(glbPath);
  },
  openGenerationLogPath(logPath: string): Promise<{ ok: boolean; path: string; error?: string }> {
    return ensureGenerationBridge().openLogPath(logPath);
  },
  onGenerationProgress(callback: (payload: GenerationProgressPayload) => void): () => void {
    ensureGenerationEventRelay();
    generationProgressSubscribers.add(callback);
    return () => {
      generationProgressSubscribers.delete(callback);
      maybeDisposeGenerationEventRelay();
    };
  },
  onGenerationDone(callback: (payload: GenerationDonePayload) => void): () => void {
    ensureGenerationEventRelay();
    generationDoneSubscribers.add(callback);
    return () => {
      generationDoneSubscribers.delete(callback);
      maybeDisposeGenerationEventRelay();
    };
  },
  onGenerationError(callback: (payload: GenerationErrorPayload) => void): () => void {
    ensureGenerationEventRelay();
    generationErrorSubscribers.add(callback);
    return () => {
      generationErrorSubscribers.delete(callback);
      maybeDisposeGenerationEventRelay();
    };
  },
  detectPythonInterpreters(preferredPath?: string): Promise<PythonDetectResult> {
    return ensureSystemPythonBridge().detect({ preferredPath });
  },
  probePythonInterpreter(pythonPath: string): Promise<PythonProbeResult> {
    return ensureSystemPythonBridge().probe(pythonPath);
  },
  installTorchCuda(pythonPath: string): Promise<PythonInstallTorchCudaResult> {
    return ensureSystemPythonBridge().installTorchCuda(pythonPath);
  },
  onPythonInstallLog(callback: (line: string) => void): () => void {
    const systemPython = ensureSystemPythonBridge();
    systemPython.onInstallLog(callback);
    return () => {
      systemPython.offInstallLog(callback);
    };
  },
  getBackendStatus(): Promise<BackendStatusResponse> {
    return ensureBackendBridge().status();
  },
  runDefaultBackendWorkflow(payload?: BackendRunDefaultPayload): Promise<BackendRunDefaultResult> {
    return ensureBackendBridge().runDefault(payload);
  },
  importBackendWorkflow(): Promise<BackendImportWorkflowResult> {
    return ensureBackendBridge().importWorkflow();
  },
  getComfyStatus(): Promise<ComfyStatusResponse> {
    return ensureComfyBridge().status();
  },
  startComfy(): Promise<ComfyStatusResponse> {
    return ensureComfyBridge().start();
  },
  stopComfy(): Promise<ComfyStatusResponse> {
    return ensureComfyBridge().stop();
  },
  getComfyLogs(limit?: number): Promise<string[]> {
    return ensureComfyBridge().logs(limit);
  },
  runComfyWorkflow(payload?: ComfyRunWorkflowPayload): Promise<ComfyRunWorkflowResult> {
    return ensureComfyBridge().runWorkflow(payload);
  },
  submitComfyJob(payload?: ComfySubmitJobPayload): Promise<ComfySubmitJobResult> {
    return ensureComfyBridge().submitJob(payload);
  },
  getComfyJobStatus(jobId: string): Promise<ComfyJobStatusResponse> {
    return ensureComfyBridge().getJobStatus(jobId);
  },
  cancelComfyJob(jobId: string): Promise<void> {
    return ensureComfyBridge().cancelJob(jobId);
  },
  resolveComfyOutputs(jobId: string): Promise<ComfyJobOutputs> {
    return ensureComfyBridge().resolveOutputs(jobId);
  },
  getComfyConfig(): Promise<ComfyConfigResponse> {
    return ensureComfyBridge().getConfig();
  },
  saveComfyConfig(patch: ComfyConfigPatch): Promise<ComfyConfigResponse> {
    return ensureComfyBridge().saveConfig(patch);
  },
};

export type VolumiaDesktopApi = typeof desktopApi;
