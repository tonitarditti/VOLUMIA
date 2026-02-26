export const IPC_CHANNELS = {
  exportProjectsJson: "volumia:projects:export-json",
  importProjectsJson: "volumia:projects:import-json",
  exportSettingsJson: "volumia:settings:export-json",
  importSettingsJson: "volumia:settings:import-json",
  minimizeWindow: "volumia:window:minimize",
  toggleMaximizeWindow: "volumia:window:toggle-maximize",
  closeWindow: "volumia:window:close",
  setWindowMode: "window:set-mode",
  setWindowBoundsRemember: "window:set-bounds-remember",
  getWindowState: "window:get-state",
  resetWindowLayout: "window:reset-layout",
  getSystemLocale: "system:get-locale",
  getSystemTheme: "system:get-theme",
  getUserDataPath: "system:get-userdata-path",
  openUserDataFolder: "system:open-userdata-folder",
  clearCache: "system:clear-cache",
  systemThemeChanged: "system:theme-changed",
  generationSelectImages: "gen:select-images",
  generationRun: "gen:run",
  generationCancel: "gen:cancel",
  generationCheck: "gen:check",
  generationTest: "gen:test",
  generationProgress: "gen:progress",
  generationDone: "gen:done",
  generationError: "gen:error",
  pyDetect: "py:detect",
  pyProbe: "py:probe",
  pyInstallTorchCuda: "py:install-torch-cuda",
  pyInstallLog: "py:install-log",
  pyInstallDone: "py:install-done",
  backendStatus: "backend:status",
  backendRunDefault: "backend:run-default",
  backendImportWorkflow: "backend:import-workflow",
  comfyStatus: "comfy:status",
  comfyStart: "comfy:start",
  comfyStop: "comfy:stop",
  comfyLogs: "comfy:logs",
  comfyRunWorkflow: "comfy:runWorkflow",
  comfyGetConfig: "comfy:get-config",
  comfySaveConfig: "comfy:save-config",
} as const;

export type LanguageMode = "system" | "manual";
export type Language = "es" | "en" | "pt";
export type ThemeMode = "system" | "time" | "manual";
export type Theme = "light" | "dark";
export type WindowMode = "windowed" | "maximized" | "fullscreen";
export type PerformancePreset = "quality" | "balanced" | "performance";

export type TimeTheme = {
  lightFrom: string;
  darkFrom: string;
};

export interface AppSettingsSnapshot {
  languageMode: LanguageMode;
  language: Language;
  themeMode: ThemeMode;
  theme: Theme;
  timeTheme: TimeTheme;
  windowMode: WindowMode;
  rememberWindowBounds: boolean;
  performancePreset: PerformancePreset;
  fpsLimit: 30 | 60 | 120;
  antialias: boolean;
  reduceMotion: boolean;
  pythonPath?: string;
  autoGenerationProfile?: GenerationAutoProfile;
}

export type PythonCandidateSource = "env" | "stored" | "conda" | "where" | "py-launcher" | "custom";

export type PythonCandidate = {
  pythonPath: string;
  source: PythonCandidateSource;
  isValid: boolean;
  rejectionReason?: string;
  recommended?: boolean;
};

export type PythonDetectPayload = {
  preferredPath?: string;
};

export type PythonDetectResult = {
  candidates: PythonCandidate[];
  rejectedCandidates: PythonCandidate[];
  selectedPythonPath?: string;
};

export type PythonProbePayload = {
  pythonPath: string;
};

export type PythonProbeResult = {
  pythonPath: string;
  ok: boolean;
  executable?: string;
  pip?: string;
  torchInstalled: boolean;
  torchVersion?: string;
  cudaAvailable?: boolean;
  deviceName?: string;
  error?: string;
};

export type PythonInstallTorchCudaPayload = {
  pythonPath: string;
};

export type PythonInstallTorchCudaResult = {
  ok: boolean;
  logs: string;
  error?: string;
};

export type PythonInstallLogPayload = {
  line: string;
};

export type PythonInstallDonePayload = {
  ok: boolean;
};

export type ClearCacheError = {
  name: string;
  message: string;
};

export type ClearCacheResult = {
  deleted: string[];
  missing: string[];
  errors: ClearCacheError[];
};

export type BackendServiceState = "stopped" | "starting" | "running" | "error";
export type ComfySupervisorState = "STOPPED" | "STARTING" | "READY" | "ERROR";

export type BackendStatusResponse = {
  mode: "dev" | "prod";
  startedAt: string | null;
  workflows: {
    sourceDir: string;
    targetDir: string;
    copied: number;
    replaced: number;
    backups: number;
    lastSyncAt: string | null;
    error: string | null;
    activeName: string | null;
    activePath: string | null;
  };
  models: {
    ok: boolean;
    totalFiles: number;
    installedFiles: number;
    message: string;
    error: string | null;
  };
  comfy: {
    running: boolean;
    url: string;
    lastError: string | null;
    state: BackendServiceState;
    host: string;
    port: number;
    pid: number | null;
    python: string | null;
    comfyRoot: string | null;
    healthy: boolean;
    external?: boolean;
    message: string;
  };
  activeProcesses: Array<{ name: string; pid: number }>;
  notes: string[];
};

export type ComfyConfigResponse = {
  host: string;
  port: number;
  baseUrl: string;
  comfyDir: string;
  condaHook: string;
  condaEnvName: string;
  pythonExeOverride: string;
  args: string[];
  startupTimeoutMs: number;
};

export type ComfyConfigPatch = Partial<{
  host: string;
  port: number;
  baseUrl: string;
  comfyDir: string;
  condaHook: string;
  condaEnvName: string;
  pythonExeOverride: string;
  startupTimeoutMs: number;
}>;

export type ComfyStatusResponse = {
  state: ComfySupervisorState;
  running: boolean;
  url: string;
  pid: number | null;
  startedByApp: boolean;
  lastError: string | null;
  lastLogs: string[];
  message: string;
  host: string;
  port: number;
  config: {
    comfyDir: string;
    condaHook: string;
    condaEnvName: string;
    pythonExeOverride: string;
    startupTimeoutMs: number;
  };
};

export type ComfyRunWorkflowPayload = {
  workflowId?: string;
  imagePath?: string;
  imageBase64?: string;
};

export type ComfyRunWorkflowResult = {
  ok: boolean;
  promptId?: string;
  workflowName?: string;
  workflowPath?: string;
  outputGlbPath?: string;
  message: string;
  error?: string;
  comfy: ComfyStatusResponse;
};

export type BackendRunDefaultPayload = {
  imagePath?: string;
  imageBase64?: string;
};

export type BackendRunDefaultResult = {
  ok: boolean;
  promptId?: string;
  workflowName?: string;
  workflowPath?: string;
  outputGlbPath?: string;
  message: string;
  error?: string;
  status: BackendStatusResponse;
};

export type BackendImportWorkflowResult = {
  ok: boolean;
  canceled: boolean;
  workflowName?: string;
  workflowPath?: string;
  message: string;
  error?: string;
  status: BackendStatusResponse;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ModelMetadata = {
  modelVersion: string;
  lastPrompt: string;
  lastAssistantSummary: string;
};

export type GenerationPreset = "fast" | "balanced" | "quality";
export type GenerationMode = "auto" | "neural" | "architectural";
export type GenerationPipeline = "depth_glb" | "gen_skp";
export type GenerationSkpQuality = "fast" | "high";
export type GenerationAutoEngine = "instantmesh" | "triposr" | "arch" | "blockout";
export type GenerationAutoPreset = "hard_surface" | "organic";
export type GenerationAutoProfile = "auto" | "hard_surface" | "organic";
export type GenerationMultiviewPreset = "hard_surface" | "balanced" | "organic";
export type GenerationMultiviewHardSurfaceQuality = "fast" | "balanced" | "pro";
export type ReconstructionTier = "preview" | "final";

export type ProjectModel = {
  sourceImages: string[];
  glbPath?: string;
  generatedAt?: number;
  preset?: GenerationPreset;
  mode?: GenerationMode;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  chatHistory: ChatMessage[];
  modelMetadata: ModelMetadata;
  model?: ProjectModel;
};

export type ProjectsExportEnvelope = {
  schemaVersion: 1;
  exportedAt: string;
  app: "VOLUMIA";
  projects: Project[];
};

export type ExportProjectsResult = {
  canceled: boolean;
  filePath?: string;
};

export type ImportProjectsResult = {
  canceled: boolean;
  filePath?: string;
  content?: string;
};

export type SettingsExportEnvelope = {
  schemaVersion: 1;
  exportedAt: string;
  app: "VOLUMIA";
  settings: AppSettingsSnapshot;
};

export type ExportSettingsResult = {
  canceled: boolean;
  filePath?: string;
};

export type ImportSettingsResult = {
  canceled: boolean;
  filePath?: string;
  content?: string;
};

export type WindowModePayload = {
  mode: WindowMode;
};

export type RememberWindowBoundsPayload = {
  remember: boolean;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowStateSnapshot = {
  bounds: WindowBounds;
  isMaximized: boolean;
  isFullScreen: boolean;
  mode: WindowMode;
  rememberWindowBounds: boolean;
};

export type SystemThemeChangedPayload = {
  theme: Theme;
};

export type GenerationRunPayload = {
  projectId: string;
  imagePaths: string[];
  preset: GenerationPreset;
  mode?: GenerationMode;
  autoProfile?: GenerationAutoProfile;
  multiviewEnabled?: boolean;
  multiviewPreset?: GenerationMultiviewPreset;
  multiviewHardSurfaceQuality?: GenerationMultiviewHardSurfaceQuality;
  reconstructionTier?: ReconstructionTier;
  pythonPath?: string;
  pipeline?: GenerationPipeline;
  inputs?: string[];
  projectName?: string;
  workDir?: string;
  outputDir?: string;
  quality?: GenerationSkpQuality;
  sketchupExe?: string;
};

export type GenerationCaptureViewportMultiviewPayload = {
  outputDir: string;
  baseName: string;
  width: number;
  height: number;
};

export type GenerationWritePngBase64Payload = {
  outputPath: string;
  base64: string;
};

export type GenerationRunResult =
  | {
      ok: true;
      outPath?: string;
      logPath?: string;
    }
  | {
      ok: false;
      error: string;
      logPath?: string;
    };

export type GenerationProgressPayload = {
  projectId: string;
  stage: string;
  percent: number;
  message: string;
  device?: "cuda" | "cpu";
};

export type GenerationDevice = {
  device: "cuda" | "cpu";
  name: string;
};

export type GenerationDonePayload = {
  projectId: string;
  pipeline?: GenerationPipeline;
  glbPath?: string;
  skpPath?: string;
  outGlbPath?: string;
  sourceImages?: string[];
  preset?: GenerationPreset;
  mode?: GenerationMode;
  autoUsed?: GenerationAutoEngine;
  autoPreset?: GenerationAutoPreset;
  device?: GenerationDevice;
  warnings?: string[];
};

export type GenerationErrorPayload = {
  projectId: string;
  message: string;
  logPath?: string;
};

export type GenerationCheckResult = {
  pythonFound: boolean;
  pythonPath?: string;
  venvPath?: string;
  scriptFound: boolean;
  scriptPath?: string;
  logs: string[];
};

export type GenerationTestResult =
  | {
      ok: true;
      glbPath: string;
      logs: string[];
    }
  | {
      ok: false;
      error: string;
      logs: string[];
    };
