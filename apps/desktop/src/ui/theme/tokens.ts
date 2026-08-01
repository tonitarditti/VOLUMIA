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
  // Warm palette for architecture identity
  warmBg: "#F8F5F1",
  warmPanel: "#FFFCF8",
  warmTextPrimary: "#4D4842",
  warmTextSecondary: "#8F877E",
  warmAccent: "#B59A76",
  warmAccentAlt: "#C8AD87",
} as const;

const sharedTokens = {
  accentPrimary: brandPalette.neuralBlue,
  accentPrimaryHover: "#4A92FF",
  accentPrimarySoft: "rgba(10, 132, 255, 0.18)",
  accentContrast: "#F1F6FF",
  statusReady: brandPalette.digitalCyan,
  statusBusy: brandPalette.deepLearningViolet,
  statusError: "#D36A9A",
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
    bgPanelDark: "#11192A",
    bg: "#F2F6FD",
    surface1: "#FCFDFF",
    surface2: "#F6F9FF",
    surface3: "#EDF3FD",
    surfaceRaised: "#FFFFFF",
    inputBg: "rgba(255, 255, 255, 0.86)",
    inputBorder: "rgba(44, 66, 102, 0.18)",
    border: "rgba(44, 66, 102, 0.16)",
    borderStrong: "rgba(44, 66, 102, 0.26)",
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
    shellContrastPanel: "#0B1327",
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
      "linear-gradient(132deg, #0A1123 0%, #113164 52%, #2E2B76 100%)",
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
    bgApp: "#111318",
    bgSurface1: "#1A1D24",
    bgSurface2: "#222631",
    bgPanelDark: "#222631",
    bg: "#111318",
    surface1: "#1A1D24",
    surface2: "#222631",
    surface3: "#222631",
    surfaceRaised: "#222631",
    inputBg: "rgba(243,240,234,0.04)",
    inputBorder: "rgba(163,146,117,0.18)",
    border: "rgba(255,255,255,0.04)",
    borderStrong: "rgba(255,255,255,0.06)",
    text: "#F3F0EA",
    textMuted: "#A8A39A",
    textFaint: "rgba(168,163,154,0.68)",
    textInverse: sharedTokens.textInverse,
    accentPrimary: "#C9A45D",
    accentPrimaryHover: "#E7C778",
    accentPrimarySoft: "rgba(201,164,93,0.12)",
    accentContrast: sharedTokens.accentContrast,
    accent: "#C9A45D",
    accentHover: "#E7C778",
    accent2: "#E7C778",
    accentSoft: "rgba(231,199,120,0.12)",
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: sharedTokens.statusReady,
    warning: sharedTokens.statusBusy,
    danger: sharedTokens.statusError,
    successBg: "rgba(34,139,95,0.08)",
    warningBg: "rgba(201,164,93,0.10)",
    dangerBg: "rgba(211, 106, 154, 0.14)",
    badgeNeutralBorder: "rgba(255,255,255,0.06)",
    badgeNeutralBg: "rgba(255,255,255,0.02)",
    badgeNeutralText: "rgba(243,240,234,0.86)",
    badgeSuccessBorder: "rgba(0, 212, 255, 0.22)",
    badgeSuccessBg: "rgba(0, 212, 255, 0.12)",
    badgeSuccessText: "#8FF3FF",
    badgeWarningBorder: "rgba(201,164,93,0.28)",
    badgeWarningBg: "rgba(201,164,93,0.12)",
    badgeWarningText: "#E7C778",
    badgeDangerBorder: "rgba(211, 106, 154, 0.22)",
    badgeDangerBg: "rgba(211, 106, 154, 0.12)",
    badgeDangerText: "#F1ACCF",
    shadow: "0 10px 28px rgba(0, 0, 0, 0.38)",
    shadowPanel:
      "0 20px 56px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.24)",
    focusRing: "rgba(201,164,93,0.28)",
    glassBg: "rgba(18,20,26,0.72)",
    glassBgStrong: "rgba(20,24,34,0.86)",
    glassBorder: "rgba(255,255,255,0.04)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
    glassInset: "rgba(255, 255, 255, 0.03)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.34)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "#0D1015",
    shellToolbar: "#0C1013",
    shellPanel: "#0D1015",
    shellViewport: "#111318",
    shellTag: "rgba(255, 255, 255, 0.045)",
    shellOverlay: "rgba(255, 255, 255, 0.018)",
    shellContrastPanel: "#060A10",
    shellContrastSurface: "rgba(255, 255, 255, 0.045)",
    shellContrastBorder: "rgba(255,255,255,0.06)",
    shellContrastText: "#F3F0EA",
    shellContrastTextMuted: "rgba(168,163,154,0.78)",
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
      "radial-gradient(circle at 12% -8%, rgba(231,199,120,0.06), transparent 50%), radial-gradient(circle at 92% 0%, rgba(142,109,53,0.04), transparent 44%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--bg)",
    appSceneBackground:
      "radial-gradient(circle at 12% -8%, rgba(231,199,120,0.07), transparent 46%), radial-gradient(circle at 92% 0%, rgba(142,109,53,0.05), transparent 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 50% 38%, rgba(201,164,93,0.14), transparent 33%), radial-gradient(circle at 64% 54%, rgba(142,109,53,0.08), transparent 42%)",
    projectPreviewGradient:
      "linear-gradient(132deg, #0B0E12 0%, #131623 52%, #241F2D 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.44) 100%)",
    projectPreviewChipBg: "rgba(0, 0, 0, 0.34)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.18)",
    projectPreviewChipText: "rgba(243,240,234,0.92)",
    viewportBackground: "#060B18",
    viewportGround: "#283451",
    viewportGridMain: "#23324D",
    viewportGridSub: "#1D2941",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, rgba(9, 13, 20, 0.01) 42%, rgba(0, 0, 0, 0.06) 100%)",
    viewportAmbientLight: "#D2E3FF",
    viewportHemisphereSky: "#DDEBFF",
    viewportHemisphereGround: "#435573",
    viewportKeyLight: "#F4FAFF",
    viewportFillLight: "#C9DAEE",
    viewportRimLight: "#EFF7FF",
    viewportFallbackMaterial: "#7089AB",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(80, 31, 42, 0.9)",
    viewportErrorText: "#FFDCE2",
    scrollbarThumb: "rgba(171, 187, 208, 0.28)",
  },
};


