import { DEFAULT_TIME_THEME, sanitizeTimeTheme } from "./resolvers";
import type {
  AppSettings,
  Colorway,
  Language,
  LanguageMode,
  AutoGenerationProfile,
  PerformancePreset,
  StudioProfile,
  Theme,
  ThemeMode,
  WindowMode,
} from "./types";

export const SETTINGS_STORAGE_KEY = "volumia.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  languageMode: "system",
  language: "es",
  themeMode: "manual",
  theme: "dark",
  colorway: "neutral",
  studioProfile: "neutral",
  timeTheme: { ...DEFAULT_TIME_THEME },
  glassStyle: false,
  windowMode: "windowed",
  rememberWindowBounds: true,
  performancePreset: "balanced",
  fpsLimit: 60,
  antialias: true,
  reduceMotion: false,
  autoGenerationProfile: "auto",
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

const LANGUAGE_MODE_SET = new Set<LanguageMode>(["system", "manual"]);
const LANGUAGE_SET = new Set<Language>(["es", "en", "pt"]);
const THEME_MODE_SET = new Set<ThemeMode>(["system", "time", "manual"]);
const THEME_SET = new Set<Theme>(["light", "dark"]);
const COLORWAY_SET = new Set<Colorway>(["atelier", "neutral"]);
const STUDIO_PROFILE_SET = new Set<StudioProfile>(["neutral", "atelier"]);
const WINDOW_MODE_SET = new Set<WindowMode>([
  "windowed",
  "maximized",
  "fullscreen",
]);
const PRESET_SET = new Set<PerformancePreset>([
  "quality",
  "balanced",
  "performance",
]);
const AUTO_PROFILE_SET = new Set<AutoGenerationProfile>([
  "auto",
  "hard_surface",
  "organic",
]);
const FPS_SET = new Set<AppSettings["fpsLimit"]>([30, 60, 120]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLanguageMode(value: unknown): value is LanguageMode {
  return (
    typeof value === "string" && LANGUAGE_MODE_SET.has(value as LanguageMode)
  );
}

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_SET.has(value as Language);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODE_SET.has(value as ThemeMode);
}

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_SET.has(value as Theme);
}

function isColorway(value: unknown): value is Colorway {
  return typeof value === "string" && COLORWAY_SET.has(value as Colorway);
}

function isStudioProfile(value: unknown): value is StudioProfile {
  return (
    typeof value === "string" && STUDIO_PROFILE_SET.has(value as StudioProfile)
  );
}

function migrateLegacyTheme(value: unknown): Theme | null {
  if (value === "light" || value === "dark") {
    return value;
  }

  if (value === "volumia_warm" || value === "volumia_mono") {
    return "dark";
  }

  return null;
}

function isWindowMode(value: unknown): value is WindowMode {
  return typeof value === "string" && WINDOW_MODE_SET.has(value as WindowMode);
}

function migrateLegacyWindowMode(value: unknown): WindowMode | null {
  if (value === "remember") {
    return "windowed";
  }

  return isWindowMode(value) ? value : null;
}

function isPerformancePreset(value: unknown): value is PerformancePreset {
  return (
    typeof value === "string" && PRESET_SET.has(value as PerformancePreset)
  );
}

function isFpsLimit(value: unknown): value is AppSettings["fpsLimit"] {
  return (
    typeof value === "number" && FPS_SET.has(value as AppSettings["fpsLimit"])
  );
}

function isAutoGenerationProfile(
  value: unknown,
): value is AutoGenerationProfile {
  return (
    typeof value === "string" &&
    AUTO_PROFILE_SET.has(value as AutoGenerationProfile)
  );
}

function hasOwnKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function sanitizeAppSettings(
  value: unknown,
  fallback: AppSettings = DEFAULT_SETTINGS,
): AppSettings {
  if (!isRecord(value)) {
    return { ...fallback, timeTheme: { ...fallback.timeTheme } };
  }

  const hasLegacyLanguage = hasOwnKey(value, "language");
  const hasLegacyTheme = hasOwnKey(value, "theme");
  const migratedTheme = migrateLegacyTheme(value.theme);
  const migratedColorway = isColorway(value.colorway)
    ? value.colorway
    : isColorway(value.uiPalette)
      ? value.uiPalette
      : fallback.colorway;

  return {
    languageMode: isLanguageMode(value.languageMode)
      ? value.languageMode
      : hasLegacyLanguage
        ? "manual"
        : fallback.languageMode,
    language: isLanguage(value.language) ? value.language : fallback.language,
    themeMode: isThemeMode(value.themeMode)
      ? value.themeMode
      : hasLegacyTheme
        ? "manual"
        : fallback.themeMode,
    theme:
      migratedTheme ?? (isTheme(value.theme) ? value.theme : fallback.theme),
    colorway: migratedColorway,
    studioProfile: isStudioProfile(value.studioProfile)
      ? value.studioProfile
      : fallback.studioProfile,
    timeTheme: sanitizeTimeTheme(value.timeTheme, fallback.timeTheme),
    glassStyle:
      typeof value.glassStyle === "boolean"
        ? value.glassStyle
        : fallback.glassStyle,
    windowMode:
      migrateLegacyWindowMode(value.windowMode) ?? fallback.windowMode,
    rememberWindowBounds:
      typeof value.rememberWindowBounds === "boolean"
        ? value.rememberWindowBounds
        : fallback.rememberWindowBounds,
    performancePreset: isPerformancePreset(value.performancePreset)
      ? value.performancePreset
      : fallback.performancePreset,
    fpsLimit: isFpsLimit(value.fpsLimit) ? value.fpsLimit : fallback.fpsLimit,
    antialias:
      typeof value.antialias === "boolean"
        ? value.antialias
        : fallback.antialias,
    reduceMotion:
      typeof value.reduceMotion === "boolean"
        ? value.reduceMotion
        : fallback.reduceMotion,
    pythonPath:
      normalizeOptionalString(value.pythonPath) ?? fallback.pythonPath,
    autoGenerationProfile: isAutoGenerationProfile(value.autoGenerationProfile)
      ? value.autoGenerationProfile
      : fallback.autoGenerationProfile,
  };
}

export function loadAppSettings(): AppSettings {
  const storage = getStorage();
  if (!storage)
    return {
      ...DEFAULT_SETTINGS,
      timeTheme: { ...DEFAULT_SETTINGS.timeTheme },
    };

  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw)
    return {
      ...DEFAULT_SETTINGS,
      timeTheme: { ...DEFAULT_SETTINGS.timeTheme },
    };

  try {
    const parsed = JSON.parse(raw) as Partial<SettingsStorageEnvelope>;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
      return {
        ...DEFAULT_SETTINGS,
        timeTheme: { ...DEFAULT_SETTINGS.timeTheme },
      };
    }
    return sanitizeAppSettings(parsed.settings, DEFAULT_SETTINGS);
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      timeTheme: { ...DEFAULT_SETTINGS.timeTheme },
    };
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
  fpsLimit: AppSettings["fpsLimit"],
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
  preset: PerformancePreset,
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

export function createSettingsExportEnvelope(
  settings: AppSettings,
): SettingsExportEnvelope {
  return {
    schemaVersion: 1,
    app: "VOLUMIA",
    exportedAt: new Date().toISOString(),
    settings: sanitizeAppSettings(settings, DEFAULT_SETTINGS),
  };
}

export function parseSettingsImportEnvelope(
  rawContent: string,
): SettingsExportEnvelope {
  const parsed = JSON.parse(rawContent) as Partial<SettingsExportEnvelope>;
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.app !== "VOLUMIA" ||
    !parsed.settings
  ) {
    throw new Error("Invalid settings file.");
  }

  return {
    schemaVersion: 1,
    app: "VOLUMIA",
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    settings: sanitizeAppSettings(parsed.settings, DEFAULT_SETTINGS),
  };
}
