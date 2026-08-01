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
  shadowBrand: string;
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
  neuralBlue: "#4C6FFF",
  digitalCyan: "#16C7E3",
  deepLearningViolet: "#7C5CFC",
  graphiteBlack: "#0D111B",
  technicalGrey: "#697386",
} as const;

const sharedTokens = {
  accentPrimary: brandPalette.neuralBlue,
  accentPrimaryHover: "#3954D9",
  accentPrimarySoft: "rgba(76, 111, 255, 0.14)",
  accentContrast: "#FFFFFF",
  statusReady: brandPalette.digitalCyan,
  statusBusy: "#F59E0B",
  statusError: "#D94A5A",
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
    bgApp: "#F5F7FB",
    bgSurface1: "#FFFFFF",
    bgSurface2: "#EEF2F7",
    bgPanelDark: "#171C2B",
    bg: "#F5F7FB",
    surface1: "#FFFFFF",
    surface2: "#EEF2F7",
    surface3: "#E8EDF5",
    surfaceRaised: "#FFFFFF",
    inputBg: "#FFFFFF",
    inputBorder: "#C5CFDD",
    border: "#D9E1EC",
    borderStrong: "#C5CFDD",
    text: "#20283A",
    textMuted: "#697386",
    textFaint: "#8B96A8",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: sharedTokens.accentPrimaryHover,
    accent2: brandPalette.deepLearningViolet,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: "#22A06B",
    warning: "#F59E0B",
    danger: "#D94A5A",
    successBg: "#E7F8EF",
    warningBg: "#FFF4D8",
    dangerBg: "#FDEBEC",
    badgeNeutralBorder: "#D9E1EC",
    badgeNeutralBg: "#EEF2F7",
    badgeNeutralText: "#697386",
    badgeSuccessBorder: "rgba(34, 160, 107, 0.24)",
    badgeSuccessBg: "#E7F8EF",
    badgeSuccessText: "#18794E",
    badgeWarningBorder: "rgba(245, 158, 11, 0.28)",
    badgeWarningBg: "#FFF4D8",
    badgeWarningText: "#9A6200",
    badgeDangerBorder: "rgba(217, 74, 90, 0.26)",
    badgeDangerBg: "#FDEBEC",
    badgeDangerText: "#B83244",
    shadow: "0 2px 8px rgba(23, 28, 43, 0.05)",
    shadowPanel: "0 8px 24px rgba(23, 28, 43, 0.08)",
    shadowBrand: "0 10px 28px rgba(76, 111, 255, 0.22)",
    focusRing: "rgba(76, 111, 255, 0.38)",
    glassBg: "rgba(255, 255, 255, 0.72)",
    glassBgStrong: "rgba(255, 255, 255, 0.9)",
    glassBorder: "rgba(76, 111, 255, 0.14)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.08))",
    glassInset: "rgba(255, 255, 255, 0.06)",
    glassShadow: "0 8px 24px rgba(23, 28, 43, 0.08)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "#FFFFFF",
    shellToolbar: "#F5F7FB",
    shellPanel: "#FFFFFF",
    shellViewport: "#F5F7FB",
    shellTag: "rgba(76, 111, 255, 0.08)",
    shellOverlay: "rgba(23, 28, 43, 0.04)",
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
      "radial-gradient(circle at 12% -12%, rgba(76, 111, 255, 0.08), transparent 42%), radial-gradient(circle at 92% 0%, rgba(22, 199, 227, 0.06), transparent 38%)",
    appSceneBackground:
      "radial-gradient(circle at 12% -12%, rgba(76, 111, 255, 0.08), transparent 42%), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 48% 38%, rgba(76, 111, 255, 0.2), transparent 32%), radial-gradient(circle at 62% 52%, rgba(124, 92, 252, 0.14), transparent 42%)",
    projectPreviewGradient:
      "linear-gradient(145deg, #171C2B 0%, #2A354D 100%)",
    projectPreviewOverlay:
      "linear-gradient(180deg, transparent 38%, rgba(11, 13, 18, 0.42) 100%)",
    projectPreviewChipBg: "rgba(11, 13, 18, 0.3)",
    projectPreviewChipBorder: "rgba(255, 255, 255, 0.22)",
    projectPreviewChipText: "rgba(245, 250, 255, 0.92)",
    viewportBackground: "#171C2B",
    viewportGround: "#2A354D",
    viewportGridMain: "#53627D",
    viewportGridSub: "#34415A",
    viewportOverlayGradient:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(248, 245, 241, 0.08) 42%, rgba(77, 72, 66, 0.03) 100%)",
    viewportAmbientLight: "#E6DCCF",
    viewportHemisphereSky: "#F2EAE0",
    viewportHemisphereGround: "#97897A",
    viewportKeyLight: "#FFFDF8",
    viewportFillLight: "#DED2C2",
    viewportRimLight: "#FFF9F0",
    viewportFallbackMaterial: "#7089AB",
    viewportErrorBorder: sharedTokens.statusError,
    viewportErrorBg: "rgba(117, 41, 55, 0.9)",
    viewportErrorText: "#FFE7EB",
    scrollbarThumb: "rgba(105, 115, 134, 0.34)",
  },
  dark: {
    bgApp: "#0D111B",
    bgSurface1: "#151B29",
    bgSurface2: "#1C2434",
    bgPanelDark: "#090D15",
    bg: "#0D111B",
    surface1: "#151B29",
    surface2: "#1C2434",
    surface3: "#242E41",
    surfaceRaised: "#242E41",
    inputBg: "#1C2434",
    inputBorder: "#3B475D",
    border: "#2B3548",
    borderStrong: "#3B475D",
    text: "#F4F7FC",
    textMuted: "#AAB4C6",
    textFaint: "#7F8A9E",
    textInverse: sharedTokens.textInverse,
    accentPrimary: sharedTokens.accentPrimary,
    accentPrimaryHover: sharedTokens.accentPrimaryHover,
    accentPrimarySoft: sharedTokens.accentPrimarySoft,
    accentContrast: sharedTokens.accentContrast,
    accent: sharedTokens.accentPrimary,
    accentHover: "#6F8BFF",
    accent2: brandPalette.deepLearningViolet,
    accentSoft: sharedTokens.accentPrimarySoft,
    statusReady: sharedTokens.statusReady,
    statusBusy: sharedTokens.statusBusy,
    statusError: sharedTokens.statusError,
    success: "#22A06B",
    warning: "#F59E0B",
    danger: "#D94A5A",
    successBg: "rgba(34, 160, 107, 0.16)",
    warningBg: "rgba(245, 158, 11, 0.16)",
    dangerBg: "rgba(217, 74, 90, 0.16)",
    badgeNeutralBorder: "#2B3548",
    badgeNeutralBg: "#1C2434",
    badgeNeutralText: "#AAB4C6",
    badgeSuccessBorder: "rgba(34, 160, 107, 0.3)",
    badgeSuccessBg: "rgba(34, 160, 107, 0.16)",
    badgeSuccessText: "#65D6A2",
    badgeWarningBorder: "rgba(245, 158, 11, 0.3)",
    badgeWarningBg: "rgba(245, 158, 11, 0.16)",
    badgeWarningText: "#FBC35C",
    badgeDangerBorder: "rgba(217, 74, 90, 0.3)",
    badgeDangerBg: "rgba(217, 74, 90, 0.16)",
    badgeDangerText: "#FF8F9B",
    shadow: "0 2px 10px rgba(0, 0, 0, 0.20)",
    shadowPanel: "0 10px 30px rgba(0, 0, 0, 0.28)",
    shadowBrand: "0 12px 32px rgba(76, 111, 255, 0.25)",
    focusRing: "rgba(22, 199, 227, 0.42)",
    glassBg: "rgba(21, 27, 41, 0.76)",
    glassBgStrong: "rgba(21, 27, 41, 0.9)",
    glassBorder: "rgba(76, 111, 255, 0.16)",
    glassHighlight:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
    glassInset: "rgba(255, 255, 255, 0.03)",
    glassShadow: "0 10px 28px rgba(0, 0, 0, 0.34)",
    glassBlur: sharedTokens.glassBlur,
    shellTopbar: "#151B29",
    shellToolbar: "#0D111B",
    shellPanel: "#151B29",
    shellViewport: "#0D111B",
    shellTag: "rgba(255, 255, 255, 0.045)",
    shellOverlay: "rgba(255, 255, 255, 0.018)",
    shellContrastPanel: "#090D15",
    shellContrastSurface: "rgba(255, 255, 255, 0.045)",
    shellContrastBorder: "rgba(255,255,255,0.06)",
    shellContrastText: "#F4F7FC",
    shellContrastTextMuted: "#AAB4C6",
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
      "radial-gradient(circle at 12% -10%, rgba(76, 111, 255, 0.1), transparent 44%), radial-gradient(circle at 94% 0%, rgba(22, 199, 227, 0.05), transparent 40%)",
    appSceneBackground:
      "radial-gradient(circle at 12% -10%, rgba(76, 111, 255, 0.1), transparent 44%), var(--bg)",
    bootGlow:
      "radial-gradient(circle at 48% 38%, rgba(76, 111, 255, 0.2), transparent 34%), radial-gradient(circle at 64% 54%, rgba(124, 92, 252, 0.12), transparent 42%)",
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
    scrollbarThumb: "rgba(127, 138, 158, 0.3)",
  },
};


