export type LanguageMode = "system" | "manual";
export type Language = "es" | "en" | "pt";
export type ThemeMode = "system" | "time" | "manual";
export type Theme = "light" | "dark";
export type WindowMode = "windowed" | "maximized" | "fullscreen";
export type PerformancePreset = "quality" | "balanced" | "performance";

export interface TimeTheme {
  lightFrom: string;
  darkFrom: string;
}

export interface AppSettings {
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
