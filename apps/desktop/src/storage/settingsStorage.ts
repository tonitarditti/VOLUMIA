import type { AppSettings, ThemeMode } from "@/projects/types";
import { STORAGE_KEYS } from "./keys";

type SettingsStorageEnvelope = {
  schemaVersion: 1;
  theme: ThemeMode;
  aiApiKeyPlaceholder: string;
};

const defaultSettings: AppSettings = {
  theme: "dark",
  aiApiKeyPlaceholder: "",
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isTheme(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function loadAppSettings(): AppSettings {
  const storage = getStorage();
  if (!storage) return defaultSettings;

  const raw = storage.getItem(STORAGE_KEYS.settings);
  if (!raw) return defaultSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<SettingsStorageEnvelope>;
    if (parsed.schemaVersion !== 1) {
      return defaultSettings;
    }

    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultSettings.theme,
      aiApiKeyPlaceholder:
        typeof parsed.aiApiKeyPlaceholder === "string"
          ? parsed.aiApiKeyPlaceholder
          : defaultSettings.aiApiKeyPlaceholder,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveAppSettings(settings: AppSettings) {
  const storage = getStorage();
  if (!storage) return;

  const payload: SettingsStorageEnvelope = {
    schemaVersion: 1,
    theme: settings.theme,
    aiApiKeyPlaceholder: settings.aiApiKeyPlaceholder,
  };

  storage.setItem(STORAGE_KEYS.settings, JSON.stringify(payload));
}
