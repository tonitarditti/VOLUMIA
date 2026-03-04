import type { AppSettings, Language, Theme, TimeTheme } from "./types";

export const DEFAULT_TIME_THEME: TimeTheme = {
  lightFrom: "07:00",
  darkFrom: "18:00",
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function isValidTime(value: string) {
  return toMinutes(value) !== null;
}

export function sanitizeTimeTheme(value: unknown, fallback: TimeTheme = DEFAULT_TIME_THEME): TimeTheme {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const candidate = value as Partial<TimeTheme>;
  const lightFrom = typeof candidate.lightFrom === "string" ? candidate.lightFrom : fallback.lightFrom;
  const darkFrom = typeof candidate.darkFrom === "string" ? candidate.darkFrom : fallback.darkFrom;

  const lightMinutes = toMinutes(lightFrom);
  const darkMinutes = toMinutes(darkFrom);

  if (lightMinutes === null || darkMinutes === null || lightMinutes === darkMinutes) {
    return { ...DEFAULT_TIME_THEME };
  }

  return { lightFrom, darkFrom };
}

export function resolveLanguage(settings: AppSettings, systemLocale: string): Language {
  if (settings.languageMode === "manual") {
    return settings.language;
  }

  const locale = systemLocale.toLowerCase();
  if (locale.startsWith("es")) return "es";
  if (locale.startsWith("pt")) return "pt";
  return "en";
}

export function resolveTheme(settings: AppSettings, systemTheme: Theme, now: Date): Theme {
  if (settings.themeMode === "system") {
    return systemTheme;
  }

  if (settings.themeMode === "manual") {
    return settings.theme;
  }

  const timeTheme = sanitizeTimeTheme(settings.timeTheme, DEFAULT_TIME_THEME);
  const lightMinutes = toMinutes(timeTheme.lightFrom);
  const darkMinutes = toMinutes(timeTheme.darkFrom);
  if (lightMinutes === null || darkMinutes === null || lightMinutes === darkMinutes) {
    return resolveTheme({ ...settings, timeTheme: DEFAULT_TIME_THEME }, systemTheme, now);
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (lightMinutes < darkMinutes) {
    return currentMinutes >= lightMinutes && currentMinutes < darkMinutes ? "light" : "dark";
  }

  return currentMinutes >= lightMinutes || currentMinutes < darkMinutes ? "light" : "dark";
}

