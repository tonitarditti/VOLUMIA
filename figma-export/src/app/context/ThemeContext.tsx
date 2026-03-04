import React, { createContext, useContext, useState } from 'react';

export const lightTheme = {
  bg: '#F5F2ED',
  panelBg: 'rgba(246, 241, 233, 0.93)',
  panelBorder: 'rgba(183, 172, 150, 0.32)',
  topbarBg: 'rgba(251, 248, 243, 0.97)',
  toolbarBg: 'rgba(246, 242, 236, 0.96)',
  viewportBg: '#EDEAE3',
  textPrimary: '#2A2927',
  textSecondary: '#726E67',
  textMuted: '#A09B93',
  accent: '#9A6E3A',
  accentLight: '#B8874A',
  accentBg: 'rgba(154, 110, 58, 0.09)',
  accentBgHover: 'rgba(154, 110, 58, 0.17)',
  btnBg: 'rgba(188, 179, 161, 0.20)',
  btnBgHover: 'rgba(188, 179, 161, 0.36)',
  btnBgActive: 'rgba(154, 110, 58, 0.14)',
  divider: 'rgba(183, 172, 150, 0.28)',
  inputBg: 'rgba(255, 255, 255, 0.60)',
  inputBorder: 'rgba(183, 172, 150, 0.38)',
  shadow: '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
  shadowPanel: '0 8px 40px rgba(0,0,0,0.07), 0 2px 10px rgba(0,0,0,0.04)',
  tagBg: 'rgba(183, 172, 150, 0.18)',
  success: '#3D8F5F',
  warning: '#B87030',
  error: '#C0404A',
  gridBg: '#E8E4DC',
  threeBg: 0xEDEAE3,
  threeGrid: 0xC8BFB0,
  threeGridCenter: 0xB0A898,
};

export const darkTheme = {
  bg: '#1E1E20',
  panelBg: 'rgba(40, 40, 43, 0.97)',
  panelBorder: 'rgba(58, 58, 61, 0.75)',
  topbarBg: 'rgba(24, 24, 26, 0.99)',
  toolbarBg: 'rgba(22, 22, 24, 0.99)',
  viewportBg: '#141416',
  textPrimary: '#E8E4DE',
  textSecondary: '#8A8680',
  textMuted: '#525050',
  accent: '#A47C45',
  accentLight: '#B88E55',
  accentBg: 'rgba(164, 124, 69, 0.14)',
  accentBgHover: 'rgba(164, 124, 69, 0.24)',
  btnBg: 'rgba(60, 58, 55, 0.32)',
  btnBgHover: 'rgba(60, 58, 55, 0.54)',
  btnBgActive: 'rgba(164, 124, 69, 0.18)',
  divider: 'rgba(58, 58, 61, 0.65)',
  inputBg: 'rgba(255, 255, 255, 0.04)',
  inputBorder: 'rgba(58, 58, 61, 0.60)',
  shadow: '0 2px 12px rgba(0,0,0,0.50), 0 1px 3px rgba(0,0,0,0.36)',
  shadowPanel: '0 8px 40px rgba(0,0,0,0.50), 0 2px 10px rgba(0,0,0,0.30)',
  tagBg: 'rgba(58, 58, 61, 0.50)',
  success: '#4CAF7D',
  warning: '#D4924A',
  error: '#D05060',
  gridBg: '#181618',
  threeBg: 0x141416,
  threeGrid: 0x2E2E32,
  threeGridCenter: 0x424248,
};

export type ThemeType = typeof lightTheme;

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  t: ThemeType;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
  t: lightTheme,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const t = isDark ? darkTheme : lightTheme;
  const toggleTheme = () => setIsDark((d) => !d);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, t }}>
      {children}
    </ThemeContext.Provider>
  );
}