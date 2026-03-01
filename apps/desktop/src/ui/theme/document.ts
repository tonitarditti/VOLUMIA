import { resolveTheme } from "@/volumia/settings/resolvers";
import { loadAppSettings } from "@/volumia/settings/storage";
import type { AppSettings, Theme } from "@/volumia/settings/types";
import { themeTokens, type ThemeTokens } from "./tokens";

const cssVariableMap: Record<keyof ThemeTokens, string> = {
  bg: "--bg",
  surface1: "--surface-1",
  surface2: "--surface-2",
  surface3: "--surface-3",
  surfaceRaised: "--surface-raised",
  inputBg: "--input-bg",
  inputBorder: "--input-border",
  border: "--border",
  borderStrong: "--border-strong",
  text: "--text",
  textMuted: "--text-muted",
  textFaint: "--text-faint",
  accent: "--accent",
  accent2: "--accent-2",
  accentSoft: "--accent-soft",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  successBg: "--success-bg",
  warningBg: "--warning-bg",
  dangerBg: "--danger-bg",
  shadow: "--shadow",
  shadowPanel: "--shadow-panel",
  focusRing: "--focus-ring",
  glassBg: "--glass-bg",
  glassBgStrong: "--glass-bg-strong",
  glassBorder: "--glass-border",
  glassShadow: "--glass-shadow",
  shellTopbar: "--shell-topbar",
  shellToolbar: "--shell-toolbar",
  shellPanel: "--shell-panel",
  shellViewport: "--shell-viewport",
  shellTag: "--shell-tag",
  shellOverlay: "--shell-overlay",
  shellContrastPanel: "--shell-contrast-panel",
  shellContrastSurface: "--shell-contrast-surface",
  shellContrastBorder: "--shell-contrast-border",
  shellContrastText: "--shell-contrast-text",
  shellContrastTextMuted: "--shell-contrast-text-muted",
  shellContrastTag: "--shell-contrast-tag",
};

function detectSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeVariables(root: HTMLElement, theme: Theme) {
  const tokens = themeTokens[theme];
  for (const [tokenName, cssVar] of Object.entries(cssVariableMap) as Array<[keyof ThemeTokens, string]>) {
    root.style.setProperty(cssVar, tokens[tokenName]);
  }
}

export function applyResolvedThemeToDocument(
  resolvedTheme: Theme,
  options: { glassStyle?: boolean; reduceMotion?: boolean } = {}
) {
  if (typeof document === "undefined") {
    return resolvedTheme;
  }

  const root = document.documentElement;
  applyThemeVariables(root, resolvedTheme);
  root.dataset.theme = resolvedTheme;
  root.dataset.glass = options.glassStyle ? "on" : "off";
  root.style.colorScheme = resolvedTheme;
  root.classList.toggle("reduce-motion", Boolean(options.reduceMotion));
  return resolvedTheme;
}

export function applySettingsThemeToDocument(settings: AppSettings, systemTheme = detectSystemTheme()) {
  const resolvedTheme = resolveTheme(settings, systemTheme, new Date());
  applyResolvedThemeToDocument(resolvedTheme, {
    glassStyle: settings.glassStyle,
    reduceMotion: settings.reduceMotion,
  });
  return resolvedTheme;
}

export function bootstrapDocumentTheme() {
  const settings = loadAppSettings();
  return applySettingsThemeToDocument(settings);
}
