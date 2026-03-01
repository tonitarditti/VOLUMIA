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
  badgeNeutralBorder: string;
  badgeNeutralBg: string;
  badgeNeutralText: string;
  badgeSuccessBorder: string;
  badgeSuccessBg: string;
  badgeSuccessText: string;
  badgeWarningBorder: string;
  badgeWarningBg: string;
  badgeWarningText: string;
  badgeDangerBorder: string;
  badgeDangerBg: string;
  badgeDangerText: string;
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
    bg: "#e4e2de",
    surface1: "rgba(241, 239, 235, 0.94)",
    surface2: "rgba(245, 243, 239, 0.97)",
    surface3: "#faf9f6",
    surfaceRaised: "#f1efeb",
    inputBg: "rgba(255, 255, 255, 0.72)",
    inputBorder: "rgba(137, 130, 119, 0.24)",
    border: "rgba(137, 130, 119, 0.18)",
    borderStrong: "rgba(137, 130, 119, 0.28)",
    text: "#272624",
    textMuted: "rgba(102, 99, 95, 0.78)",
    textFaint: "rgba(138, 133, 127, 0.72)",
    accent: "#906c43",
    accent2: "#a27f57",
    accentSoft: "rgba(144, 108, 67, 0.08)",
    success: "#5a7868",
    warning: "#987654",
    danger: "#9c6469",
    successBg: "rgba(90, 120, 104, 0.12)",
    warningBg: "rgba(152, 118, 84, 0.12)",
    dangerBg: "rgba(156, 100, 105, 0.11)",
    badgeNeutralBorder: "rgba(137, 130, 119, 0.2)",
    badgeNeutralBg: "rgba(137, 130, 119, 0.08)",
    badgeNeutralText: "rgba(92, 88, 83, 0.82)",
    badgeSuccessBorder: "rgba(90, 120, 104, 0.22)",
    badgeSuccessBg: "rgba(90, 120, 104, 0.1)",
    badgeSuccessText: "#587564",
    badgeWarningBorder: "rgba(152, 118, 84, 0.22)",
    badgeWarningBg: "rgba(152, 118, 84, 0.1)",
    badgeWarningText: "#8f6f50",
    badgeDangerBorder: "rgba(156, 100, 105, 0.22)",
    badgeDangerBg: "rgba(156, 100, 105, 0.1)",
    badgeDangerText: "#956268",
    shadow:
      "0 2px 10px rgba(21, 19, 17, 0.06), 0 1px 2px rgba(21, 19, 17, 0.04)",
    shadowPanel:
      "0 16px 42px rgba(49, 43, 35, 0.07), 0 2px 10px rgba(21, 19, 17, 0.05)",
    focusRing: "rgba(144, 108, 67, 0.18)",
    glassBg: "rgba(255, 255, 255, 0.58)",
    glassBgStrong: "rgba(255, 255, 255, 0.74)",
    glassBorder: "rgba(137, 130, 119, 0.22)",
    glassShadow: "0 10px 24px rgba(49, 43, 35, 0.08)",
    shellTopbar: "rgba(245, 243, 239, 0.97)",
    shellToolbar: "rgba(242, 240, 236, 0.96)",
    shellPanel: "rgba(240, 238, 234, 0.94)",
    shellViewport: "#e7e4de",
    shellTag: "rgba(137, 130, 119, 0.14)",
    shellOverlay: "rgba(39, 38, 36, 0.06)",
    shellContrastPanel: "rgba(84, 80, 74, 0.95)",
    shellContrastSurface: "rgba(255, 250, 244, 0.035)",
    shellContrastBorder: "rgba(250, 244, 236, 0.08)",
    shellContrastText: "rgba(244, 239, 233, 0.94)",
    shellContrastTextMuted: "rgba(205, 198, 190, 0.72)",
    shellContrastTag: "rgba(255, 250, 244, 0.05)",
  },
  dark: {
    bg: "#1e1e20",
    surface1: "rgba(40, 40, 43, 0.97)",
    surface2: "rgba(28, 28, 30, 0.98)",
    surface3: "#2b2b2f",
    surfaceRaised: "#242428",
    inputBg: "rgba(255, 255, 255, 0.04)",
    inputBorder: "rgba(58, 58, 61, 0.52)",
    border: "rgba(58, 58, 61, 0.62)",
    borderStrong: "rgba(86, 86, 92, 0.76)",
    text: "#e8e4de",
    textMuted: "rgba(138, 134, 128, 0.84)",
    textFaint: "rgba(92, 89, 87, 0.86)",
    accent: "#a47c45",
    accent2: "#b88e55",
    accentSoft: "rgba(164, 124, 69, 0.14)",
    success: "#6d957e",
    warning: "#b48b60",
    danger: "#bd7b81",
    successBg: "rgba(109, 149, 126, 0.12)",
    warningBg: "rgba(180, 139, 96, 0.13)",
    dangerBg: "rgba(189, 123, 129, 0.14)",
    badgeNeutralBorder: "rgba(255, 255, 255, 0.1)",
    badgeNeutralBg: "rgba(255, 255, 255, 0.045)",
    badgeNeutralText: "rgba(196, 190, 182, 0.78)",
    badgeSuccessBorder: "rgba(109, 149, 126, 0.24)",
    badgeSuccessBg: "rgba(109, 149, 126, 0.12)",
    badgeSuccessText: "#87a794",
    badgeWarningBorder: "rgba(180, 139, 96, 0.24)",
    badgeWarningBg: "rgba(180, 139, 96, 0.12)",
    badgeWarningText: "#bc976c",
    badgeDangerBorder: "rgba(189, 123, 129, 0.24)",
    badgeDangerBg: "rgba(189, 123, 129, 0.12)",
    badgeDangerText: "#c58f96",
    shadow: "0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.36)",
    shadowPanel:
      "0 18px 52px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3)",
    focusRing: "rgba(164, 124, 69, 0.28)",
    glassBg: "rgba(40, 40, 43, 0.72)",
    glassBgStrong: "rgba(28, 28, 30, 0.84)",
    glassBorder: "rgba(58, 58, 61, 0.58)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.3)",
    shellTopbar: "rgba(24, 24, 26, 0.99)",
    shellToolbar: "rgba(22, 22, 24, 0.99)",
    shellPanel: "rgba(40, 40, 43, 0.97)",
    shellViewport: "#141416",
    shellTag: "rgba(58, 58, 61, 0.5)",
    shellOverlay: "rgba(255, 255, 255, 0.06)",
    shellContrastPanel: "rgba(32, 32, 35, 0.98)",
    shellContrastSurface: "rgba(255, 255, 255, 0.04)",
    shellContrastBorder: "rgba(255, 255, 255, 0.07)",
    shellContrastText: "rgba(232, 228, 222, 0.96)",
    shellContrastTextMuted: "rgba(169, 163, 155, 0.7)",
    shellContrastTag: "rgba(255, 255, 255, 0.06)",
  },
};
