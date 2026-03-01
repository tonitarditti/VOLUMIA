import type { Theme } from "@/volumia/settings/types";

export type ThemeTokens = {
  bg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surfaceRaised: string;
  inputBg: string;
  inputBorder: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  successBg: string;
  warningBg: string;
  dangerBg: string;
  shadow: string;
  shadowPanel: string;
  focusRing: string;
  glassBg: string;
  glassBgStrong: string;
  glassBorder: string;
  glassShadow: string;
  shellTopbar: string;
  shellToolbar: string;
  shellPanel: string;
  shellViewport: string;
  shellTag: string;
  shellOverlay: string;
  shellContrastPanel: string;
  shellContrastSurface: string;
  shellContrastBorder: string;
  shellContrastText: string;
  shellContrastTextMuted: string;
  shellContrastTag: string;
};

export const themeTokens: Record<Theme, ThemeTokens> = {
  light: {
    bg: "#ede8e0",
    surface1: "rgba(246, 241, 233, 0.94)",
    surface2: "rgba(251, 248, 243, 0.97)",
    surface3: "#ffffff",
    surfaceRaised: "#f8f3ec",
    inputBg: "rgba(255, 255, 255, 0.72)",
    inputBorder: "rgba(183, 172, 150, 0.38)",
    border: "rgba(183, 172, 150, 0.28)",
    borderStrong: "rgba(164, 150, 125, 0.42)",
    text: "#2a2927",
    textMuted: "rgba(114, 110, 103, 0.92)",
    textFaint: "rgba(160, 155, 147, 0.92)",
    accent: "#9a6e3a",
    accent2: "#b8874a",
    accentSoft: "rgba(154, 110, 58, 0.09)",
    success: "#3d8f5f",
    warning: "#b87030",
    danger: "#c0404a",
    successBg: "rgba(61, 143, 95, 0.12)",
    warningBg: "rgba(184, 112, 48, 0.12)",
    dangerBg: "rgba(192, 64, 74, 0.1)",
    shadow: "0 2px 12px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04)",
    shadowPanel:
      "0 18px 48px rgba(62, 51, 38, 0.08), 0 2px 12px rgba(0, 0, 0, 0.05)",
    focusRing: "rgba(154, 110, 58, 0.22)",
    glassBg: "rgba(255, 255, 255, 0.58)",
    glassBgStrong: "rgba(255, 255, 255, 0.74)",
    glassBorder: "rgba(183, 172, 150, 0.28)",
    glassShadow: "0 10px 26px rgba(78, 65, 50, 0.08)",
    shellTopbar: "rgba(251, 248, 243, 0.97)",
    shellToolbar: "rgba(246, 242, 236, 0.96)",
    shellPanel: "rgba(246, 241, 233, 0.93)",
    shellViewport: "#edeae3",
    shellTag: "rgba(183, 172, 150, 0.18)",
    shellOverlay: "rgba(42, 41, 39, 0.08)",
    shellContrastPanel: "rgba(68, 63, 57, 0.94)",
    shellContrastSurface: "rgba(255, 246, 233, 0.05)",
    shellContrastBorder: "rgba(255, 240, 222, 0.1)",
    shellContrastText: "rgba(248, 241, 233, 0.96)",
    shellContrastTextMuted: "rgba(217, 205, 193, 0.78)",
    shellContrastTag: "rgba(255, 246, 233, 0.08)",
  },
  dark: {
    bg: "#1e1e20",
    surface1: "rgba(40, 40, 43, 0.97)",
    surface2: "rgba(28, 28, 30, 0.98)",
    surface3: "#2b2b2f",
    surfaceRaised: "#242428",
    inputBg: "rgba(255, 255, 255, 0.04)",
    inputBorder: "rgba(58, 58, 61, 0.6)",
    border: "rgba(58, 58, 61, 0.72)",
    borderStrong: "rgba(86, 86, 92, 0.88)",
    text: "#e8e4de",
    textMuted: "rgba(138, 134, 128, 0.96)",
    textFaint: "rgba(82, 80, 80, 0.96)",
    accent: "#a47c45",
    accent2: "#b88e55",
    accentSoft: "rgba(164, 124, 69, 0.14)",
    success: "#4caf7d",
    warning: "#d4924a",
    danger: "#d05060",
    successBg: "rgba(76, 175, 125, 0.12)",
    warningBg: "rgba(212, 146, 74, 0.13)",
    dangerBg: "rgba(208, 80, 96, 0.14)",
    shadow: "0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.36)",
    shadowPanel:
      "0 18px 52px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3)",
    focusRing: "rgba(164, 124, 69, 0.28)",
    glassBg: "rgba(40, 40, 43, 0.72)",
    glassBgStrong: "rgba(28, 28, 30, 0.84)",
    glassBorder: "rgba(58, 58, 61, 0.68)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.3)",
    shellTopbar: "rgba(24, 24, 26, 0.99)",
    shellToolbar: "rgba(22, 22, 24, 0.99)",
    shellPanel: "rgba(40, 40, 43, 0.97)",
    shellViewport: "#141416",
    shellTag: "rgba(58, 58, 61, 0.5)",
    shellOverlay: "rgba(255, 255, 255, 0.06)",
    shellContrastPanel: "rgba(32, 32, 35, 0.98)",
    shellContrastSurface: "rgba(255, 255, 255, 0.04)",
    shellContrastBorder: "rgba(255, 255, 255, 0.08)",
    shellContrastText: "rgba(232, 228, 222, 0.96)",
    shellContrastTextMuted: "rgba(169, 163, 155, 0.76)",
    shellContrastTag: "rgba(255, 255, 255, 0.06)",
  },
};
