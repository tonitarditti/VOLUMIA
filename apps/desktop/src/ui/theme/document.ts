import { resolveTheme } from "@/volumia/settings/resolvers";
import { loadAppSettings } from "@/volumia/settings/storage";
import type { AppSettings, Colorway, Theme } from "@/volumia/settings/types";
import { themeTokens, type ThemeTokens } from "./tokens";

const cssVariableMap: Record<keyof ThemeTokens, string> = {
  bgApp: "--bg-app",
  bgSurface1: "--bg-surface-1",
  bgSurface2: "--bg-surface-2",
  bgPanelDark: "--bg-panel-dark",
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
  textInverse: "--text-inverse",
  accentPrimary: "--accent-primary",
  accentPrimaryHover: "--accent-primary-hover",
  accentPrimarySoft: "--accent-primary-soft",
  accentContrast: "--accent-contrast",
  accent: "--accent",
  accentHover: "--accent-hover",
  accent2: "--accent-2",
  accentSoft: "--accent-soft",
  statusReady: "--status-ready",
  statusBusy: "--status-busy",
  statusError: "--status-error",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  successBg: "--success-bg",
  warningBg: "--warning-bg",
  dangerBg: "--danger-bg",
  badgeNeutralBorder: "--badge-neutral-border",
  badgeNeutralBg: "--badge-neutral-bg",
  badgeNeutralText: "--badge-neutral-text",
  badgeSuccessBorder: "--badge-success-border",
  badgeSuccessBg: "--badge-success-bg",
  badgeSuccessText: "--badge-success-text",
  badgeWarningBorder: "--badge-warning-border",
  badgeWarningBg: "--badge-warning-bg",
  badgeWarningText: "--badge-warning-text",
  badgeDangerBorder: "--badge-danger-border",
  badgeDangerBg: "--badge-danger-bg",
  badgeDangerText: "--badge-danger-text",
  shadow: "--shadow",
  shadowPanel: "--shadow-panel",
  focusRing: "--focus-ring",
  glassBg: "--glass-bg",
  glassBgStrong: "--glass-bg-strong",
  glassBorder: "--glass-border",
  glassHighlight: "--glass-highlight",
  glassInset: "--glass-inset",
  glassShadow: "--glass-shadow",
  glassBlur: "--glass-blur",
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
  radiusSm: "--radius-sm",
  radiusMd: "--radius-md",
  radiusLg: "--radius-lg",
  space4: "--space-4",
  space8: "--space-8",
  space12: "--space-12",
  space16: "--space-16",
  space24: "--space-24",
  space32: "--space-32",
  bodyBackgroundImage: "--body-background-image",
  appSceneBackground: "--app-scene-background",
  bootGlow: "--boot-glow",
  projectPreviewGradient: "--project-preview-gradient",
  projectPreviewOverlay: "--project-preview-overlay",
  projectPreviewChipBg: "--project-preview-chip-bg",
  projectPreviewChipBorder: "--project-preview-chip-border",
  projectPreviewChipText: "--project-preview-chip-text",
  viewportBackground: "--viewport-background",
  viewportGround: "--viewport-ground",
  viewportGridMain: "--viewport-grid-main",
  viewportGridSub: "--viewport-grid-sub",
  viewportOverlayGradient: "--viewport-overlay-gradient",
  viewportAmbientLight: "--viewport-ambient-light",
  viewportHemisphereSky: "--viewport-hemisphere-sky",
  viewportHemisphereGround: "--viewport-hemisphere-ground",
  viewportKeyLight: "--viewport-key-light",
  viewportFillLight: "--viewport-fill-light",
  viewportRimLight: "--viewport-rim-light",
  viewportFallbackMaterial: "--viewport-fallback-material",
  viewportErrorBorder: "--viewport-error-border",
  viewportErrorBg: "--viewport-error-bg",
  viewportErrorText: "--viewport-error-text",
  scrollbarThumb: "--scrollbar-thumb",
};

const paletteSourceVariableMap: Partial<Record<keyof ThemeTokens, string>> = {
  bgApp: "--theme-bg-app",
  bgSurface1: "--theme-bg-surface-1",
  bgSurface2: "--theme-bg-surface-2",
  bgPanelDark: "--theme-bg-panel-dark",
  bg: "--theme-bg",
  surface1: "--theme-surface-1",
  surface2: "--theme-surface-2",
  surface3: "--theme-surface-3",
  surfaceRaised: "--theme-surface-raised",
  inputBg: "--theme-input-bg",
  inputBorder: "--theme-input-border",
  border: "--theme-border",
  borderStrong: "--theme-border-strong",
  textMuted: "--theme-text-muted",
  accentPrimary: "--theme-accent-primary",
  accentPrimaryHover: "--theme-accent-primary-hover",
  accentPrimarySoft: "--theme-accent-primary-soft",
  accent: "--theme-accent",
  accentHover: "--theme-accent-hover",
  accent2: "--theme-accent-2",
  accentSoft: "--theme-accent-soft",
  glassBg: "--theme-glass-bg",
  glassBgStrong: "--theme-glass-bg-strong",
  glassBorder: "--theme-glass-border",
  shellTopbar: "--theme-shell-topbar",
  shellToolbar: "--theme-shell-toolbar",
  shellPanel: "--theme-shell-panel",
  shellContrastPanel: "--theme-shell-contrast-panel",
  shellContrastSurface: "--theme-shell-contrast-surface",
  shellContrastBorder: "--theme-shell-contrast-border",
  shellContrastTag: "--theme-shell-contrast-tag",
};

let lastDebugSignature = "";

function detectSystemTheme(): Theme {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeVariables(root: HTMLElement, theme: Theme) {
  const tokens = themeTokens[theme];
  for (const [tokenName, cssVar] of Object.entries(cssVariableMap) as Array<
    [keyof ThemeTokens, string]
  >) {
    root.style.setProperty(cssVar, tokens[tokenName]);
    const sourceCssVar = paletteSourceVariableMap[tokenName];
    if (sourceCssVar) {
      root.style.setProperty(sourceCssVar, tokens[tokenName]);
    }
  }
}

function getColorwayExpressions(theme: Theme, colorway: Colorway) {
  const isDark = theme === "dark";
  const brightRef = isDark ? "white" : "var(--text-inverse)";
  const dimRef = isDark ? "var(--theme-text-muted)" : "black";

  if (colorway === "atelier") {
    return {
      "--app-bg": `color-mix(in srgb, var(--theme-bg-app) ${isDark ? 90 : 90}%, var(--theme-accent-primary) ${isDark ? 10 : 10}%)`,
      "--app-background-image":
        "radial-gradient(circle at top, color-mix(in srgb, var(--theme-accent-primary) 16%, transparent) 0%, transparent 46%), linear-gradient(180deg, color-mix(in srgb, var(--theme-accent-primary) 5%, transparent), transparent 54%)",
      "--panel-bg": `color-mix(in srgb, var(--theme-bg-surface-1) ${isDark ? 92 : 91}%, var(--theme-accent-primary) ${isDark ? 8 : 9}%)`,
      "--panel-bg-soft": `color-mix(in srgb, var(--theme-bg-surface-2) ${isDark ? 88 : 88}%, var(--theme-accent-primary) ${isDark ? 12 : 12}%)`,
      "--panel-border": "color-mix(in srgb, var(--theme-border) 76%, var(--theme-accent-primary) 24%)",
      "--panel-border-strong": "color-mix(in srgb, var(--theme-border-strong) 70%, var(--theme-accent-primary) 30%)",
      "--bg-app": "var(--app-bg)",
      "--bg": "var(--app-bg)",
      "--bg-surface-1": "var(--panel-bg)",
      "--bg-surface-2": "var(--panel-bg-soft)",
      "--bg-panel-dark": "color-mix(in srgb, var(--theme-bg-panel-dark) 92%, var(--theme-accent-primary) 8%)",
      "--surface-1": "var(--panel-bg)",
      "--surface-2": "var(--panel-bg-soft)",
      "--surface-3": `color-mix(in srgb, var(--panel-bg-soft) 86%, ${brightRef} 14%)`,
      "--surface-raised": `color-mix(in srgb, var(--panel-bg) 82%, ${brightRef} 18%)`,
      "--input-bg": `color-mix(in srgb, var(--panel-bg-soft) 86%, ${brightRef} 14%)`,
      "--input-border": "var(--panel-border)",
      "--border": "var(--panel-border)",
      "--border-strong": "var(--panel-border-strong)",
      "--text-muted": "color-mix(in srgb, var(--theme-text-muted) 86%, var(--theme-accent-primary) 14%)",
      "--accent-primary": "color-mix(in srgb, var(--theme-accent-primary-hover) 82%, var(--theme-accent-primary) 18%)",
      "--accent-primary-hover": `color-mix(in srgb, var(--theme-accent-primary-hover) 90%, ${brightRef} 10%)`,
      "--accent-primary-soft": "color-mix(in srgb, var(--theme-accent-primary) 14%, transparent)",
      "--accent": "var(--accent-primary)",
      "--accent-hover": "var(--accent-primary-hover)",
      "--accent-2": `color-mix(in srgb, var(--theme-accent-primary-hover) 72%, ${brightRef} 28%)`,
      "--accent-soft": "var(--accent-primary-soft)",
      "--glass-bg": `color-mix(in srgb, var(--theme-glass-bg) 84%, var(--theme-accent-primary) 16%)`,
      "--glass-bg-strong": `color-mix(in srgb, var(--theme-glass-bg-strong) 82%, var(--theme-accent-primary) 18%)`,
      "--glass-border": `color-mix(in srgb, var(--theme-glass-border) 74%, var(--theme-accent-primary) 26%)`,
      "--shell-topbar": `color-mix(in srgb, var(--panel-bg-soft) 92%, ${brightRef} 8%)`,
      "--shell-toolbar": `color-mix(in srgb, var(--panel-bg) 94%, ${brightRef} 6%)`,
      "--shell-panel": "var(--panel-bg)",
      "--shell-contrast-panel": `color-mix(in srgb, var(--theme-shell-contrast-panel) 92%, var(--theme-accent-primary) 8%)`,
      "--shell-contrast-surface": `color-mix(in srgb, var(--theme-shell-contrast-surface) 82%, var(--theme-accent-primary) 18%)`,
      "--shell-contrast-border": `color-mix(in srgb, var(--theme-shell-contrast-border) 76%, var(--theme-accent-primary) 24%)`,
      "--shell-contrast-tag": `color-mix(in srgb, var(--theme-shell-contrast-tag) 80%, var(--theme-accent-primary) 20%)`,
    } as const;
  }

  if (colorway === "warm") {
    return {
      "--app-bg": "#F8F5F1",
      "--app-background-image":
        "radial-gradient(circle at top, color-mix(in srgb, #B59A76 4%, transparent) 0%, transparent 48%), linear-gradient(180deg, color-mix(in srgb, #B59A76 2%, transparent), transparent 58%)",
      "--panel-bg": "#FFFCF8",
      "--panel-bg-soft": "color-mix(in srgb, #FFFCF8 92%, #B59A76 8%)",
      "--panel-border": "rgba(181, 154, 118, 0.14)",
      "--panel-border-strong": "rgba(181, 154, 118, 0.22)",
      "--bg-app": "var(--app-bg)",
      "--bg": "var(--app-bg)",
      "--bg-surface-1": "var(--panel-bg)",
      "--bg-surface-2": "var(--panel-bg-soft)",
      "--bg-panel-dark": "#F0EAE0",
      "--surface-1": "var(--panel-bg)",
      "--surface-2": "var(--panel-bg-soft)",
      "--surface-3": "color-mix(in srgb, var(--panel-bg-soft) 88%, white 12%)",
      "--surface-raised": "white",
      "--input-bg": "color-mix(in srgb, var(--panel-bg-soft) 90%, white 10%)",
      "--input-border": "rgba(181, 154, 118, 0.18)",
      "--border": "rgba(181, 154, 118, 0.14)",
      "--border-strong": "rgba(181, 154, 118, 0.22)",
      "--text": "#4D4842",
      "--text-muted": "#8F877E",
      "--text-faint": "rgba(77, 72, 66, 0.58)",
      "--accent-primary": "#B59A76",
      "--accent-primary-hover": "color-mix(in srgb, #B59A76 88%, #8B6F47 12%)",
      "--accent-primary-soft": "rgba(181, 154, 118, 0.16)",
      "--accent": "var(--accent-primary)",
      "--accent-hover": "var(--accent-primary-hover)",
      "--accent-2": "#C8AD87",
      "--accent-soft": "var(--accent-primary-soft)",
      "--glass-bg": "rgba(255, 252, 248, 0.72)",
      "--glass-bg-strong": "rgba(255, 252, 248, 0.86)",
      "--glass-border": "rgba(181, 154, 118, 0.2)",
      "--shell-topbar": "color-mix(in srgb, var(--panel-bg-soft) 92%, white 8%)",
      "--shell-toolbar": "color-mix(in srgb, var(--panel-bg) 94%, white 6%)",
      "--shell-panel": "var(--panel-bg)",
      "--shell-contrast-panel": "#F0EAE0",
      "--shell-contrast-surface": "rgba(77, 72, 66, 0.08)",
      "--shell-contrast-border": "rgba(181, 154, 118, 0.16)",
      "--shell-contrast-tag": "rgba(181, 154, 118, 0.1)",
    } as const;
  }

  return {
    "--app-bg": `color-mix(in srgb, var(--theme-bg-app) ${isDark ? 92 : 94}%, ${brightRef} ${isDark ? 8 : 6}%)`,
    "--app-background-image":
      `radial-gradient(circle at top, color-mix(in srgb, ${brightRef} 10%, transparent) 0%, transparent 48%), linear-gradient(180deg, color-mix(in srgb, ${brightRef} 4%, transparent), transparent 56%)`,
    "--panel-bg": `color-mix(in srgb, var(--theme-bg-surface-1) ${isDark ? 90 : 92}%, ${brightRef} ${isDark ? 10 : 8}%)`,
    "--panel-bg-soft": `color-mix(in srgb, var(--theme-bg-surface-2) ${isDark ? 86 : 89}%, ${brightRef} ${isDark ? 14 : 11}%)`,
    "--panel-border": `color-mix(in srgb, var(--theme-border) 80%, ${dimRef} 20%)`,
    "--panel-border-strong": `color-mix(in srgb, var(--theme-border-strong) 76%, ${dimRef} 24%)`,
    "--bg-app": "var(--app-bg)",
    "--bg": "var(--app-bg)",
    "--bg-surface-1": "var(--panel-bg)",
    "--bg-surface-2": "var(--panel-bg-soft)",
    "--bg-panel-dark": `color-mix(in srgb, var(--theme-bg-panel-dark) 96%, ${brightRef} 4%)`,
    "--surface-1": "var(--panel-bg)",
    "--surface-2": "var(--panel-bg-soft)",
    "--surface-3": `color-mix(in srgb, var(--panel-bg-soft) 90%, ${brightRef} 10%)`,
    "--surface-raised": `color-mix(in srgb, var(--panel-bg) 84%, ${brightRef} 16%)`,
    "--input-bg": `color-mix(in srgb, var(--panel-bg-soft) 88%, ${brightRef} 12%)`,
    "--input-border": "var(--panel-border)",
    "--border": "var(--panel-border)",
    "--border-strong": "var(--panel-border-strong)",
    "--text-muted": `color-mix(in srgb, var(--theme-text-muted) 90%, ${brightRef} 10%)`,
    "--accent-primary": `color-mix(in srgb, var(--theme-accent-primary) 62%, ${dimRef} 38%)`,
    "--accent-primary-hover": `color-mix(in srgb, var(--theme-accent-primary-hover) 64%, ${brightRef} 36%)`,
    "--accent-primary-soft": `color-mix(in srgb, var(--theme-accent-primary) 9%, transparent)`,
    "--accent": "var(--accent-primary)",
    "--accent-hover": "var(--accent-primary-hover)",
    "--accent-2": `color-mix(in srgb, var(--accent-primary) 76%, ${brightRef} 24%)`,
    "--accent-soft": "var(--accent-primary-soft)",
    "--glass-bg": `color-mix(in srgb, var(--theme-glass-bg) 84%, var(--panel-bg) 16%)`,
    "--glass-bg-strong": `color-mix(in srgb, var(--theme-glass-bg-strong) 80%, var(--panel-bg) 20%)`,
    "--glass-border": `color-mix(in srgb, var(--theme-glass-border) 74%, var(--panel-border) 26%)`,
    "--shell-topbar": `color-mix(in srgb, var(--panel-bg-soft) 92%, ${brightRef} 8%)`,
    "--shell-toolbar": `color-mix(in srgb, var(--panel-bg) 94%, ${brightRef} 6%)`,
    "--shell-panel": "var(--panel-bg)",
    "--shell-contrast-panel": `color-mix(in srgb, var(--theme-shell-contrast-panel) 94%, ${brightRef} 6%)`,
    "--shell-contrast-surface": `color-mix(in srgb, var(--theme-shell-contrast-surface) 78%, ${brightRef} 22%)`,
    "--shell-contrast-border": `color-mix(in srgb, var(--theme-shell-contrast-border) 74%, ${brightRef} 26%)`,
    "--shell-contrast-tag": `color-mix(in srgb, var(--theme-shell-contrast-tag) 78%, ${brightRef} 22%)`,
  } as const;
}

function applyColorwayVariables(
  root: HTMLElement,
  theme: Theme,
  colorway: Colorway,
) {
  const expressions = getColorwayExpressions(theme, colorway);
  for (const [cssVar, value] of Object.entries(expressions)) {
    root.style.setProperty(cssVar, value);
  }
}

export function applyResolvedThemeToDocument(
  resolvedTheme: Theme,
  options: {
    colorway?: Colorway;
    glassStyle?: boolean;
    reduceMotion?: boolean;
  } = {},
) {
  if (typeof document === "undefined") {
    return resolvedTheme;
  }

  const root = document.documentElement;
  const colorway = options.colorway ?? "neutral";
  applyThemeVariables(root, resolvedTheme);
  applyColorwayVariables(root, resolvedTheme, colorway);
  root.dataset.theme = resolvedTheme;
  root.dataset.colorway = colorway;
  delete root.dataset.palette;
  root.dataset.glass = options.glassStyle ? "on" : "off";
  root.style.colorScheme = resolvedTheme;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.toggle("reduce-motion", Boolean(options.reduceMotion));

  if (import.meta.env.DEV) {
    const signature = `${resolvedTheme}:${colorway}:${root.dataset.glass}:${root.classList.contains("dark")}`;
    if (signature !== lastDebugSignature) {
      lastDebugSignature = signature;
      console.debug("[theme] applied colorway", {
        theme: resolvedTheme,
        colorway,
        html: {
          className: root.className,
          dataset: { ...root.dataset },
        },
      });
    }
  }

  return resolvedTheme;
}

export function applySettingsThemeToDocument(
  settings: AppSettings,
  systemTheme = detectSystemTheme(),
) {
  const resolvedTheme = resolveTheme(settings, systemTheme, new Date());
  applyResolvedThemeToDocument(resolvedTheme, {
    colorway: settings.colorway,
    glassStyle: settings.glassStyle,
    reduceMotion: settings.reduceMotion,
  });
  return resolvedTheme;
}

export function bootstrapDocumentTheme() {
  const settings = loadAppSettings();
  return applySettingsThemeToDocument(settings);
}
