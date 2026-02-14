import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { desktopApi } from "@/electron/desktopApi";
import {
  DEFAULT_SETTINGS,
  defaultsForPreset,
  derivePresetFromPerformance,
  loadAppSettings,
  sanitizeAppSettings,
  saveAppSettings,
} from "./storage";
import type { AppSettings, Language, PerformancePreset, Theme, WindowMode } from "./types";

type SettingsContextValue = {
  settings: AppSettings;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setWindowMode: (windowMode: WindowMode) => void;
  setRememberWindowBounds: (rememberWindowBounds: boolean) => void;
  setPerformancePreset: (performancePreset: PerformancePreset) => void;
  setFpsLimit: (fpsLimit: AppSettings["fpsLimit"]) => void;
  setAntialias: (antialias: boolean) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  applyImportedSettings: (settings: AppSettings) => void;
  resetSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((previous) => sanitizeAppSettings({ ...previous, ...patch }, DEFAULT_SETTINGS));
  }, []);

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [settings.reduceMotion]);

  useEffect(() => {
    void desktopApi.setWindowMode(settings.windowMode).catch(() => undefined);
  }, [settings.windowMode]);

  useEffect(() => {
    void desktopApi.setWindowBoundsRemember(settings.rememberWindowBounds).catch(() => undefined);
  }, [settings.rememberWindowBounds]);

  const value = useMemo<SettingsContextValue>(() => {
    return {
      settings,
      setLanguage: (language) => updateSettings({ language }),
      setTheme: (theme) => updateSettings({ theme }),
      setWindowMode: (windowMode) => updateSettings({ windowMode }),
      setRememberWindowBounds: (rememberWindowBounds) => updateSettings({ rememberWindowBounds }),
      setPerformancePreset: (performancePreset) => {
        const defaults = defaultsForPreset(performancePreset);
        updateSettings(defaults);
      },
      setFpsLimit: (fpsLimit) => {
        setSettings((previous) =>
          sanitizeAppSettings(
            {
              ...previous,
              fpsLimit,
              performancePreset: derivePresetFromPerformance(previous.antialias, fpsLimit),
            },
            DEFAULT_SETTINGS
          )
        );
      },
      setAntialias: (antialias) => {
        setSettings((previous) =>
          sanitizeAppSettings(
            {
              ...previous,
              antialias,
              performancePreset: derivePresetFromPerformance(antialias, previous.fpsLimit),
            },
            DEFAULT_SETTINGS
          )
        );
      },
      setReduceMotion: (reduceMotion) => updateSettings({ reduceMotion }),
      applyImportedSettings: (incomingSettings) => {
        setSettings(sanitizeAppSettings(incomingSettings, DEFAULT_SETTINGS));
      },
      resetSettings: () => {
        setSettings({ ...DEFAULT_SETTINGS });
      },
    };
  }, [settings, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider.");
  }
  return context;
}
