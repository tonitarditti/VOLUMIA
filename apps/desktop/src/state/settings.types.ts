export type AppLanguage = "system" | "en" | "es";
export type AppTheme = "system" | "light" | "dark";
export type WindowSizePreset = "small" | "medium" | "large";
export type UiScale = 90 | 100 | 110 | 125;

export type ExportDefaults = {
  units: "cm" | "m";
  textureResolution: "2k" | "4k";
  includeLow: boolean;
  lowTextureDownscale: 25 | 50 | 75;
};

export type PerformanceDefaults = {
  maxFacesHigh: number;
  maxFacesLow: number;
};

export type WorkspaceDefaults = {
  windowSizePreset: WindowSizePreset;
  rememberLastWindowBounds: boolean;
  alwaysOnTop: boolean;
  uiScale: UiScale;
  startMaximized: boolean;
  windowBounds?: WindowBounds;
};

export type StoredAppSettings = {
  language: AppLanguage;
  theme: AppTheme;
  workspace: WorkspaceDefaults;
  exportDefaults: ExportDefaults;
  performanceDefaults: PerformanceDefaults;
};

export type WindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export type WindowRuntimeState = {
  bounds: WindowBounds;
  isMaximized: boolean;
  alwaysOnTop: boolean;
  zoomFactor: number;
};

export type ServiceStatus = {
  ok: boolean;
  managed: boolean;
  url: string;
  detail: string;
};
