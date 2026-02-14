import type { AppSettings, Language, PerformancePreset, Theme, WindowMode } from "./types";

export const SETTINGS_STORAGE_KEY = "volumia.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "es",
  theme: "dark",
  windowMode: "remember",
  rememberWindowBounds: true,
  performancePreset: "balanced",
  fpsLimit: 60,
  antialias: true,
  reduceMotion: false,
};

export type SettingsExportEnvelope = {
  schemaVersion: 1;
  app: "VOLUMIA";
  exportedAt: string;
  settings: AppSettings;
};

type SettingsStorageEnvelope = {
  schemaVersion: 1;
  settings: AppSettings;
};

const LANGUAGE_SET = new Set<Language>(["es", "en", "pt"]);
const THEME_SET = new Set<Theme>(["light", "dark"]);
const WINDOW_MODE_SET = new Set<WindowMode>(["remember", "maximized", "fullscreen"]);
const PRESET_SET = new Set<PerformancePreset>(["quality", "balanced", "performance"]);
const FPS_SET = new Set<AppSettings["fpsLimit"]>([30, 60, 120]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_SET.has(value as Language);
}

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_SET.has(value as Theme);
}

function migrateLegacyTheme(value: unknown): Theme | null {
  if (value === "light" || value === "dark") {
    return value;
  }

  if (value === "volumia_warm") {
    return "dark";
  }

  if (value === "volumia_mono") {
    return "light";
  }

  return null;
}

function isWindowMode(value: unknown): value is WindowMode {
  return typeof value === "string" && WINDOW_MODE_SET.has(value as WindowMode);
}

function isPerformancePreset(value: unknown): value is PerformancePreset {
  return typeof value === "string" && PRESET_SET.has(value as PerformancePreset);
}

function isFpsLimit(value: unknown): value is AppSettings["fpsLimit"] {
  return typeof value === "number" && FPS_SET.has(value as AppSettings["fpsLimit"]);
}

function getStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function sanitizeAppSettings(value: unknown, fallback: AppSettings = DEFAULT_SETTINGS): AppSettings {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const migratedTheme = migrateLegacyTheme(value.theme);

  return {
    language: isLanguage(value.language) ? value.language : fallback.language,
    theme: migratedTheme ?? (isTheme(value.theme) ? value.theme : fallback.theme),
    windowMode: isWindowMode(value.windowMode) ? value.windowMode : fallback.windowMode,
    rememberWindowBounds:
      typeof value.rememberWindowBounds === "boolean"
        ? value.rememberWindowBounds
        : fallback.rememberWindowBounds,
    performancePreset: isPerformancePreset(value.performancePreset)
      ? value.performancePreset
      : fallback.performancePreset,
    fpsLimit: isFpsLimit(value.fpsLimit) ? value.fpsLimit : fallback.fpsLimit,
    antialias: typeof value.antialias === "boolean" ? value.antialias : fallback.antialias,
    reduceMotion: typeof value.reduceMotion === "boolean" ? value.reduceMotion : fallback.reduceMotion,
  };
}

export function loadAppSettings(): AppSettings {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };

  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<SettingsStorageEnvelope>;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
      return { ...DEFAULT_SETTINGS };
    }
    return sanitizeAppSettings(parsed.settings, DEFAULT_SETTINGS);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings) {
  const storage = getStorage();
  if (!storage) return;

  const payload: SettingsStorageEnvelope = {
    schemaVersion: 1,
    settings: sanitizeAppSettings(settings, DEFAULT_SETTINGS),
  };

  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function clearAppSettings() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(SETTINGS_STORAGE_KEY);
}

export function derivePresetFromPerformance(
  antialias: boolean,
  fpsLimit: AppSettings["fpsLimit"]
): PerformancePreset {
  if (antialias && fpsLimit === 120) {
    return "quality";
  }

  if (!antialias || fpsLimit === 30) {
    return "performance";
  }

  return "balanced";
}

export function defaultsForPreset(
  preset: PerformancePreset
): Pick<AppSettings, "performancePreset" | "fpsLimit" | "antialias"> {
  if (preset === "quality") {
    return {
      performancePreset: "quality",
      fpsLimit: 120,
      antialias: true,
    };
  }

  if (preset === "performance") {
    return {
      performancePreset: "performance",
      fpsLimit: 60,
      antialias: false,
    };
  }

  return {
    performancePreset: "balanced",
    fpsLimit: 60,
    antialias: true,
  };
}

export function createSettingsExportEnvelope(settings: AppSettings): SettingsExportEnvelope {
  return {
    schemaVersion: 1,
    app: "VOLUMIA",
    exportedAt: new Date().toISOString(),
    settings: sanitizeAppSettings(settings, DEFAULT_SETTINGS),
  };
}

export function parseSettingsImportEnvelope(rawContent: string): SettingsExportEnvelope {
  const parsed = JSON.parse(rawContent) as Partial<SettingsExportEnvelope>;
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || parsed.app !== "VOLUMIA" || !parsed.settings) {
    throw new Error("Invalid settings file.");
  }

  return {
    schemaVersion: 1,
    app: "VOLUMIA",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    settings: sanitizeAppSettings(parsed.settings, DEFAULT_SETTINGS),
  };
}
