import type { Theme } from "@/volumia/settings/types";

/* VOLUMIA Design System v1.0 (Frozen Baseline) */

export type ThemeTokens = {
  bgApp: string;
  bgSurface1: string;
  bgSurface2: string;
  bgPanelDark: string;
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
  textInverse: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentPrimarySoft: string;
  accentContrast: string;
  accent: string;
  accentHover: string;
  accent2: string;
  accentSoft: string;
  statusReady: string;
  statusBusy: string;
  statusError: string;
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
  glassHighlight: string;
  glassInset: string;
  glassShadow: string;
  glassBlur: string;
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
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  space4: string;
  space8: string;
  space12: string;
  space16: string;
  space24: string;
  space32: string;
  bodyBackgroundImage: string;
  appSceneBackground: string;
  bootGlow: string;
  projectPreviewGradient: string;
  projectPreviewOverlay: string;
  projectPreviewChipBg: string;
  projectPreviewChipBorder: string;
  projectPreviewChipText: string;
  viewportBackground: string;
  viewportGround: string;
  viewportGridMain: string;
  viewportGridSub: string;
  viewportOverlayGradient: string;
  viewportAmbientLight: string;
  viewportHemisphereSky: string;
  viewportHemisphereGround: string;
  viewportKeyLight: string;
  viewportFillLight: string;
  viewportRimLight: string;
  viewportFallbackMaterial: string;
  viewportErrorBorder: string;
  viewportErrorBg: string;
  viewportErrorText: string;
  scrollbarThumb: string;
};

const sharedTokens = {
  accentPrimary: "#B7925F",
  accentPrimaryHover: "#C9A16E",
  accentPrimarySoft: "rgba(183, 146, 95, 0.14)",
  accentContrast: "#1A1714",
  statusReady: "#5C7C63",
  statusBusy: "#A9864A",
  statusError: "#A35A4F",
  textInverse: "#FFFFFF",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "14px",
  space4: "4px",
  space8: "8px",
  space12: "12px",
  space16: "16px",
  space24: "24px",
  space32: "32px",
  glassBlur: "18px",
} as const;

export const themeTokens: Record<Theme, ThemeTokens> = {
  light: {
    bgApp: "#E8E3DC",
    bgSurface1: "#F0ECE6",
    bgSurface2: "#F5F1EC",
    bgPanelDark: "#26221E",
    bg: "#E8E3DC",
    surface1: "#F0ECE6",
    surface2: "#F5F1EC",
    surface3: "#FBF7F2",
    surfaceRaised: "#FFFDFC",
    inputBg: "rgba(255, 252, 248, 0.84)",
    inputBorder: "rgba(90, 81, 72, 0.15)",
    border: "rgba(90, 81, 72, 0.14)",
    borderStrong: "rgba(90, 81, 72, 0.24)",
    text: "#241F1A",
    textMuted: "rgba(86, 78, 70, 0.72)",
    textFaint: "rgba(104, 95, 86, 0.66)",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: sharedTokens.accentPrimaryHover,
    accent2: sharedTokens.accentPrimaryHover,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: sharedTokens.statusReady,
    warning: sharedTokens.statusBusy,
    danger: sharedTokens.statusError,
    successBg: "rgba(92, 124, 99, 0.14)",
    warningBg: "rgba(169, 134, 74, 0.14)",
    dangerBg: "rgba(163, 90, 79, 0.13)",
    badgeNeutralBorder: "rgba(90, 81, 72, 0.16)",
    badgeNeutralBg: "rgba(90, 81, 72, 0.08)",
    badgeNeutralText: "rgba(86, 78, 70, 0.78)",
    badgeSuccessBorder: "rgba(92, 124, 99, 0.22)",
    badgeSuccessBg: "rgba(92, 124, 99, 0.12)",
    badgeSuccessText: sharedTokens.statusReady,
    badgeWarningBorder: "rgba(169, 134, 74, 0.22)",
    badgeWarningBg: "rgba(169, 134, 74, 0.12)",
    badgeWarningText: sharedTokens.statusBusy,
    badgeDangerBorder: "rgba(163, 90, 79, 0.22)",
    badgeDangerBg: "rgba(163, 90, 79, 0.12)",
    badgeDangerText: sharedTokens.statusError,
    shadow:
      "0 2px 10px rgba(24, 20, 16, 0.06), 0 1px 2px rgba(24, 20, 16, 0.04)",
    shadowPanel:
      "0 18px 42px rgba(30, 25, 20, 0.08), 0 2px 10px rgba(24, 20, 16, 0.05)",
    focusRing: "rgba(176, 137, 90, 0.28)",
    glassBg: "rgba(255, 252, 248, 0.56)",
    glassBgStrong: "rgba(255, 252, 248, 0.74)",
    glassBorder: "rgba(90, 81, 72, 0.16)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08))",
    glassInset: "rgba(255, 255, 255, 0.05)",
    glassShadow: "0 10px 24px rgba(30, 25, 20, 0.08)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "rgba(244, 239, 232, 0.94)",
    shellToolbar: "rgba(238, 233, 226, 0.94)",
    shellPanel: "rgba(240, 235, 228, 0.95)",
    shellViewport: "#E6E1DA",
    shellTag: "rgba(90, 81, 72, 0.11)",
    shellOverlay: "rgba(38, 34, 30, 0.04)",
    shellContrastPanel: "#26221E",
    shellContrastSurface: "rgba(255, 255, 255, 0.035)",
    shellContrastBorder: "rgba(255, 247, 238, 0.085)",
    shellContrastText: "rgba(245, 240, 234, 0.95)",
    shellContrastTextMuted: "rgba(208, 201, 192, 0.7)",
    shellContrastTag: "rgba(255, 255, 255, 0.045)",
    radiusSm: sharedTokens.radiusSm,
    radiusMd: sharedTokens.radiusMd,
    radiusLg: sharedTokens.radiusLg,
    space4: sharedTokens.space4,
    space8: sharedTokens.space8,
    space12: sharedTokens.space12,
    space16: sharedTokens.space16,
    space24: sharedTokens.space24,
    space32: sharedTokens.space32,
    bodyBackgroundImage:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.2), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0)), linear-gradient(180deg, rgba(176, 137, 90, 0.02), rgba(176, 137, 90, 0)), var(--bg)",
    appSceneBackground:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.28), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0)), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 50% 38%, rgba(176, 137, 90, 0.14), transparent 30%)",
    projectPreviewGradient: "linear-gradient(135deg, #26221E 0%, #5F4A31 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 40%, rgba(20, 18, 16, 0.34) 100%)",
    projectPreviewChipBg: "rgba(20, 18, 16, 0.24)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.18)",
    projectPreviewChipText: "rgba(255, 255, 255, 0.9)",
    viewportBackground: "#E6E1DA",
    viewportGround: "#9A9085",
    viewportGridMain: "#7D756C",
    viewportGridSub: "#90877D",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.17) 0%, rgba(238, 233, 226, 0.05) 40%, rgba(38, 34, 30, 0.02) 100%)",
    viewportAmbientLight: "#EFE6DA",
    viewportHemisphereSky: "#F4ECE0",
    viewportHemisphereGround: "#82786E",
    viewportKeyLight: "#F9F0E4",
    viewportFillLight: "#E7DECF",
    viewportRimLight: "#FFF7EE",
    viewportFallbackMaterial: "#C7BCB0",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(74, 29, 25, 0.9)",
    viewportErrorText: "#FFE2DE",
    scrollbarThumb: "rgba(108, 95, 82, 0.32)",
  },
  dark: {
    bgApp: "#151311",
    bgSurface1: "#1C1916",
    bgSurface2: "#231F1B",
    bgPanelDark: "#12110F",
    bg: "#151311",
    surface1: "#1C1916",
    surface2: "#231F1B",
    surface3: "#292621",
    surfaceRaised: "#302C27",
    inputBg: "rgba(255, 255, 255, 0.035)",
    inputBorder: "#2E2A24",
    border: "rgba(255, 255, 255, 0.10)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    text: "#F3EFEA",
    textMuted: "rgba(243, 239, 234, 0.68)",
    textFaint: "rgba(243, 239, 234, 0.5)",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: sharedTokens.accentPrimaryHover,
    accent2: sharedTokens.accentPrimaryHover,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: sharedTokens.statusReady,
    warning: sharedTokens.statusBusy,
    danger: sharedTokens.statusError,
    successBg: "rgba(92, 124, 99, 0.16)",
    warningBg: "rgba(169, 134, 74, 0.16)",
    dangerBg: "rgba(163, 90, 79, 0.16)",
    badgeNeutralBorder: "rgba(242, 238, 232, 0.1)",
    badgeNeutralBg: "rgba(242, 238, 232, 0.05)",
    badgeNeutralText: "rgba(224, 217, 208, 0.76)",
    badgeSuccessBorder: "rgba(92, 124, 99, 0.24)",
    badgeSuccessBg: "rgba(92, 124, 99, 0.14)",
    badgeSuccessText: "#87A08A",
    badgeWarningBorder: "rgba(169, 134, 74, 0.24)",
    badgeWarningBg: "rgba(169, 134, 74, 0.14)",
    badgeWarningText: "#C2A06B",
    badgeDangerBorder: "rgba(163, 90, 79, 0.24)",
    badgeDangerBg: "rgba(163, 90, 79, 0.14)",
    badgeDangerText: "#C88F86",
    shadow: "0 10px 28px rgba(0, 0, 0, 0.35)",
    shadowPanel:
      "0 20px 56px rgba(0, 0, 0, 0.35), 0 2px 10px rgba(0, 0, 0, 0.2)",
    focusRing: "#D7B27A",
    glassBg: "rgba(255, 255, 255, 0.06)",
    glassBgStrong: "rgba(255, 255, 255, 0.08)",
    glassBorder: "rgba(255, 255, 255, 0.10)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
    glassInset: "rgba(255, 255, 255, 0.03)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "#1C1916",
    shellToolbar: "#1C1916",
    shellPanel: "#1C1916",
    shellViewport: "#151311",
    shellTag: "rgba(255, 255, 255, 0.04)",
    shellOverlay: "rgba(255, 255, 255, 0.02)",
    shellContrastPanel: "#12110F",
    shellContrastSurface: "rgba(255, 255, 255, 0.04)",
    shellContrastBorder: "rgba(242, 238, 232, 0.08)",
    shellContrastText: "#F3EFEA",
    shellContrastTextMuted: "rgba(243, 239, 234, 0.68)",
    shellContrastTag: "rgba(255, 255, 255, 0.04)",
    radiusSm: sharedTokens.radiusSm,
    radiusMd: sharedTokens.radiusMd,
    radiusLg: sharedTokens.radiusLg,
    space4: sharedTokens.space4,
    space8: sharedTokens.space8,
    space12: sharedTokens.space12,
    space16: sharedTokens.space16,
    space24: sharedTokens.space24,
    space32: sharedTokens.space32,
    bodyBackgroundImage:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.025), transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), linear-gradient(180deg, rgba(183, 146, 95, 0.025), rgba(183, 146, 95, 0)), var(--bg)",
    appSceneBackground:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 50% 38%, rgba(176, 137, 90, 0.12), transparent 30%)",
    projectPreviewGradient: "linear-gradient(135deg, #12110F 0%, #4A3929 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.36) 100%)",
    projectPreviewChipBg: "rgba(0, 0, 0, 0.24)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.14)",
    projectPreviewChipText: "rgba(255, 255, 255, 0.88)",
    viewportBackground: "#151311",
    viewportGround: "#403D39",
    viewportGridMain: "#34312E",
    viewportGridSub: "#2A2825",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(21, 20, 17, 0.008) 42%, rgba(0, 0, 0, 0.05) 100%)",
    viewportAmbientLight: "#EEE3D4",
    viewportHemisphereSky: "#F1E7D9",
    viewportHemisphereGround: "#6A645B",
    viewportKeyLight: "#F7EDD9",
    viewportFillLight: "#D6CCBE",
    viewportRimLight: "#FFF2E3",
    viewportFallbackMaterial: "#BCAE9E",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(62, 24, 21, 0.9)",
    viewportErrorText: "#FFD8D3",
    scrollbarThumb: "rgba(255, 255, 255, 0.18)",
  },
};
