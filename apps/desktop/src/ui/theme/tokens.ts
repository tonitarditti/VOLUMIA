import type { Theme } from "@/volumia/settings/types";

/* VOLUMIA Visual Identity v2.0 */

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

export const brandPalette = {
  neuralBlue: "#0A84FF",
  digitalCyan: "#00D4FF",
  deepLearningViolet: "#6C4DFF",
  graphiteBlack: "#0B0D12",
  technicalGrey: "#8A9199",
} as const;

const sharedTokens = {
  accentPrimary: brandPalette.neuralBlue,
  accentPrimaryHover: "#2492FF",
  accentPrimarySoft: "rgba(10, 132, 255, 0.16)",
  accentContrast: "#F4F8FF",
  statusReady: brandPalette.digitalCyan,
  statusBusy: brandPalette.deepLearningViolet,
  statusError: "#D6687A",
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
    bgApp: "#F2F6FD",
    bgSurface1: "#FCFDFF",
    bgSurface2: "#F6F9FF",
    bgPanelDark: "#0F1724",
    bg: "#F2F6FD",
    surface1: "#FCFDFF",
    surface2: "#F6F9FF",
    surface3: "#EDF3FD",
    surfaceRaised: "#FFFFFF",
    inputBg: "rgba(255, 255, 255, 0.86)",
    inputBorder: "rgba(43, 57, 78, 0.16)",
    border: "rgba(43, 57, 78, 0.14)",
    borderStrong: "rgba(43, 57, 78, 0.24)",
    text: "#111923",
    textMuted: "rgba(36, 48, 65, 0.72)",
    textFaint: "rgba(60, 74, 95, 0.58)",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: sharedTokens.accentPrimaryHover,
    accent2: brandPalette.digitalCyan,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: sharedTokens.statusReady,
    warning: sharedTokens.statusBusy,
    danger: sharedTokens.statusError,
    successBg: "rgba(0, 212, 255, 0.14)",
    warningBg: "rgba(108, 77, 255, 0.14)",
    dangerBg: "rgba(214, 104, 122, 0.13)",
    badgeNeutralBorder: "rgba(43, 57, 78, 0.16)",
    badgeNeutralBg: "rgba(43, 57, 78, 0.08)",
    badgeNeutralText: "rgba(52, 66, 86, 0.78)",
    badgeSuccessBorder: "rgba(0, 212, 255, 0.26)",
    badgeSuccessBg: "rgba(0, 212, 255, 0.13)",
    badgeSuccessText: "#008AA6",
    badgeWarningBorder: "rgba(108, 77, 255, 0.24)",
    badgeWarningBg: "rgba(108, 77, 255, 0.12)",
    badgeWarningText: "#5D46D4",
    badgeDangerBorder: "rgba(214, 104, 122, 0.24)",
    badgeDangerBg: "rgba(214, 104, 122, 0.12)",
    badgeDangerText: "#AD4256",
    shadow:
      "0 2px 10px rgba(11, 13, 18, 0.08), 0 1px 2px rgba(11, 13, 18, 0.05)",
    shadowPanel:
      "0 18px 42px rgba(11, 13, 18, 0.12), 0 2px 10px rgba(11, 13, 18, 0.06)",
    focusRing: "rgba(10, 132, 255, 0.32)",
    glassBg: "rgba(255, 255, 255, 0.58)",
    glassBgStrong: "rgba(255, 255, 255, 0.74)",
    glassBorder: "rgba(61, 76, 99, 0.16)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.08))",
    glassInset: "rgba(255, 255, 255, 0.06)",
    glassShadow: "0 10px 24px rgba(11, 13, 18, 0.12)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "rgba(246, 250, 255, 0.95)",
    shellToolbar: "rgba(242, 247, 255, 0.95)",
    shellPanel: "rgba(245, 249, 255, 0.96)",
    shellViewport: "#ECF2FC",
    shellTag: "rgba(56, 71, 92, 0.1)",
    shellOverlay: "rgba(11, 13, 18, 0.04)",
    shellContrastPanel: "#0F1724",
    shellContrastSurface: "rgba(255, 255, 255, 0.04)",
    shellContrastBorder: "rgba(234, 242, 255, 0.1)",
    shellContrastText: "rgba(236, 244, 255, 0.95)",
    shellContrastTextMuted: "rgba(194, 207, 226, 0.76)",
    shellContrastTag: "rgba(255, 255, 255, 0.06)",
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
      "radial-gradient(circle at 14% -10%, rgba(0, 212, 255, 0.12), transparent 48%), radial-gradient(circle at 92% 0%, rgba(108, 77, 255, 0.08), transparent 42%), linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0)), var(--bg)",
    appSceneBackground:
      "radial-gradient(circle at 14% -10%, rgba(0, 212, 255, 0.14), transparent 46%), radial-gradient(circle at 92% 0%, rgba(108, 77, 255, 0.09), transparent 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0)), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 50% 38%, rgba(0, 212, 255, 0.2), transparent 31%), radial-gradient(circle at 62% 54%, rgba(108, 77, 255, 0.14), transparent 42%)",
    projectPreviewGradient:
      "linear-gradient(132deg, #0F1724 0%, #12335E 52%, #2D2A63 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 38%, rgba(11, 13, 18, 0.42) 100%)",
    projectPreviewChipBg: "rgba(11, 13, 18, 0.3)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.22)",
    projectPreviewChipText: "rgba(245, 250, 255, 0.92)",
    viewportBackground: "#E7EDF7",
    viewportGround: "#B7C4D6",
    viewportGridMain: "#8FA0B9",
    viewportGridSub: "#A9B6C8",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(242, 247, 255, 0.07) 42%, rgba(11, 13, 18, 0.03) 100%)",
    viewportAmbientLight: "#DCE6F3",
    viewportHemisphereSky: "#E7F0FB",
    viewportHemisphereGround: "#8E9AAE",
    viewportKeyLight: "#F7FBFF",
    viewportFillLight: "#D5E0EF",
    viewportRimLight: "#F8FCFF",
    viewportFallbackMaterial: "#AEBFD4",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(117, 41, 55, 0.9)",
    viewportErrorText: "#FFE7EB",
    scrollbarThumb: "rgba(79, 96, 124, 0.34)",
  },
  dark: {
    bgApp: brandPalette.graphiteBlack,
    bgSurface1: "#10141C",
    bgSurface2: "#141B25",
    bgPanelDark: "#080A0F",
    bg: brandPalette.graphiteBlack,
    surface1: "#10141C",
    surface2: "#141B25",
    surface3: "#192230",
    surfaceRaised: "#202B3B",
    inputBg: "rgba(255, 255, 255, 0.04)",
    inputBorder: "rgba(138, 145, 153, 0.32)",
    border: "rgba(138, 145, 153, 0.24)",
    borderStrong: "rgba(185, 194, 208, 0.34)",
    text: "#E6EDF8",
    textMuted: "rgba(216, 225, 239, 0.72)",
    textFaint: "rgba(167, 181, 201, 0.58)",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: sharedTokens.accentPrimaryHover,
    accent2: brandPalette.digitalCyan,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: sharedTokens.statusReady,
    warning: sharedTokens.statusBusy,
    danger: sharedTokens.statusError,
    successBg: "rgba(0, 212, 255, 0.18)",
    warningBg: "rgba(108, 77, 255, 0.18)",
    dangerBg: "rgba(214, 104, 122, 0.18)",
    badgeNeutralBorder: "rgba(194, 205, 221, 0.18)",
    badgeNeutralBg: "rgba(194, 205, 221, 0.08)",
    badgeNeutralText: "rgba(197, 210, 230, 0.82)",
    badgeSuccessBorder: "rgba(0, 212, 255, 0.28)",
    badgeSuccessBg: "rgba(0, 212, 255, 0.16)",
    badgeSuccessText: "#6FE7FF",
    badgeWarningBorder: "rgba(108, 77, 255, 0.28)",
    badgeWarningBg: "rgba(108, 77, 255, 0.16)",
    badgeWarningText: "#B8A5FF",
    badgeDangerBorder: "rgba(214, 104, 122, 0.28)",
    badgeDangerBg: "rgba(214, 104, 122, 0.16)",
    badgeDangerText: "#F3A1AF",
    shadow: "0 10px 28px rgba(0, 0, 0, 0.38)",
    shadowPanel:
      "0 20px 56px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.24)",
    focusRing: "rgba(10, 132, 255, 0.5)",
    glassBg: "rgba(16, 20, 28, 0.7)",
    glassBgStrong: "rgba(20, 27, 37, 0.84)",
    glassBorder: "rgba(138, 145, 153, 0.22)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
    glassInset: "rgba(255, 255, 255, 0.03)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.34)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "#10141C",
    shellToolbar: "#0F1520",
    shellPanel: "#10141C",
    shellViewport: brandPalette.graphiteBlack,
    shellTag: "rgba(255, 255, 255, 0.045)",
    shellOverlay: "rgba(255, 255, 255, 0.018)",
    shellContrastPanel: "#080A0F",
    shellContrastSurface: "rgba(255, 255, 255, 0.045)",
    shellContrastBorder: "rgba(184, 197, 216, 0.17)",
    shellContrastText: "#E6EDF8",
    shellContrastTextMuted: "rgba(174, 189, 210, 0.76)",
    shellContrastTag: "rgba(255, 255, 255, 0.05)",
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
      "radial-gradient(circle at 12% -8%, rgba(0, 212, 255, 0.12), transparent 48%), radial-gradient(circle at 92% 0%, rgba(108, 77, 255, 0.1), transparent 44%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--bg)",
    appSceneBackground:
      "radial-gradient(circle at 12% -8%, rgba(0, 212, 255, 0.14), transparent 46%), radial-gradient(circle at 92% 0%, rgba(108, 77, 255, 0.12), transparent 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 50% 38%, rgba(0, 212, 255, 0.18), transparent 33%), radial-gradient(circle at 64% 54%, rgba(108, 77, 255, 0.16), transparent 42%)",
    projectPreviewGradient:
      "linear-gradient(132deg, #070A11 0%, #0A2A4B 52%, #221C51 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.44) 100%)",
    projectPreviewChipBg: "rgba(0, 0, 0, 0.34)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.18)",
    projectPreviewChipText: "rgba(239, 246, 255, 0.92)",
    viewportBackground: "#090D14",
    viewportGround: "#2F3B4E",
    viewportGridMain: "#2A374A",
    viewportGridSub: "#212C3D",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, rgba(9, 13, 20, 0.01) 42%, rgba(0, 0, 0, 0.06) 100%)",
    viewportAmbientLight: "#D2E3FF",
    viewportHemisphereSky: "#DDEBFF",
    viewportHemisphereGround: "#4C5E76",
    viewportKeyLight: "#F4FAFF",
    viewportFillLight: "#C9DAEE",
    viewportRimLight: "#EFF7FF",
    viewportFallbackMaterial: "#7E93AE",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(80, 31, 42, 0.9)",
    viewportErrorText: "#FFDCE2",
    scrollbarThumb: "rgba(171, 187, 208, 0.28)",
  },
};
