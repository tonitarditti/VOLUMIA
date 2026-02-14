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
}

export type PythonCandidateSource = "conda" | "where" | "py-launcher" | "custom";

export type PythonCandidate = {
  pythonPath: string;
  source: PythonCandidateSource;
};

export type PythonDetectResult = {
  candidates: PythonCandidate[];
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
export type GenerationPipeline = "depth_glb" | "gen_skp";
export type GenerationSkpQuality = "fast" | "high";

export type ProjectModel = {
  sourceImages: string[];
  glbPath?: string;
  generatedAt?: number;
  preset?: GenerationPreset;
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
  pythonPath?: string;
  pipeline?: GenerationPipeline;
  inputs?: string[];
  projectName?: string;
  workDir?: string;
  outputDir?: string;
  quality?: GenerationSkpQuality;
  sketchupExe?: string;
};

export type GenerationRunResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
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
  device?: GenerationDevice;
};

export type GenerationErrorPayload = {
  projectId: string;
  message: string;
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
