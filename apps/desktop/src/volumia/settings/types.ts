export type Language = "es" | "en" | "pt";
export type Theme = "light" | "dark";
export type WindowMode = "remember" | "maximized" | "fullscreen";
export type PerformancePreset = "quality" | "balanced" | "performance";

export interface AppSettings {
  language: Language;
  theme: Theme;
  windowMode: WindowMode;
  rememberWindowBounds: boolean;
  performancePreset: PerformancePreset;
  fpsLimit: 30 | 60 | 120;
  antialias: boolean;
  reduceMotion: boolean;
}
