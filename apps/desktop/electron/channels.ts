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
  systemThemeChanged: "system:theme-changed",
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
}

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

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  chatHistory: ChatMessage[];
  modelMetadata: ModelMetadata;
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
