import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { applyResolvedThemeToDocument } from "@/ui/theme";
import { resolveLanguage, resolveTheme, sanitizeTimeTheme } from "./resolvers";
import {
  DEFAULT_SETTINGS,
  defaultsForPreset,
  derivePresetFromPerformance,
  loadAppSettings,
  sanitizeAppSettings,
  saveAppSettings,
} from "./storage";
import type {
  AppSettings,
  Colorway,
  Language,
  LanguageMode,
  PerformancePreset,
  AutoGenerationProfile,
  Theme,
  ThemeMode,
  StudioProfile,
  TimeTheme,
  WindowMode,
} from "./types";

type SettingsContextValue = {
  settings: AppSettings;
  resolvedLanguage: Language;
  resolvedTheme: Theme;
  systemLocale: string;
  systemTheme: Theme;
  setLanguageMode: (languageMode: LanguageMode) => void;
  setLanguage: (language: Language) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setTheme: (theme: Theme) => void;
  setColorway: (colorway: Colorway) => void;
  setStudioProfile: (studioProfile: StudioProfile) => void;
  setTimeTheme: (timeTheme: Partial<TimeTheme>) => void;
  setGlassStyle: (glassStyle: boolean) => void;
  setWindowMode: (windowMode: WindowMode) => void;
  setRememberWindowBounds: (rememberWindowBounds: boolean) => void;
  setPerformancePreset: (performancePreset: PerformancePreset) => void;
  setFpsLimit: (fpsLimit: AppSettings["fpsLimit"]) => void;
  setAntialias: (antialias: boolean) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setPythonPath: (pythonPath: string | undefined) => void;
  setAutoGenerationProfile: (
    autoGenerationProfile: AutoGenerationProfile,
  ) => void;
  resetToRecommended: () => void;
  applyImportedSettings: (settings: AppSettings) => void;
  resetSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function detectBrowserTheme(): Theme {
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

function detectBrowserLocale() {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.language !== "string"
  ) {
    return "en-US";
  }

  return navigator.language;
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadAppSettings(),
  );
  const [systemLocale, setSystemLocale] = useState<string>(() =>
    detectBrowserLocale(),
  );
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    detectBrowserTheme(),
  );
  const [clock, setClock] = useState<number>(() => Date.now());

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((previous) =>
      sanitizeAppSettings({ ...previous, ...patch }, DEFAULT_SETTINGS),
    );
  }, []);

  const resolvedLanguage = useMemo(
    () => resolveLanguage(settings, systemLocale),
    [settings, systemLocale],
  );

  const resolvedTheme = useMemo(() => {
    return resolveTheme(settings, systemTheme, new Date(clock));
  }, [clock, settings, systemTheme]);

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyResolvedThemeToDocument(resolvedTheme, {
      colorway: settings.colorway,
      glassStyle: settings.glassStyle,
      reduceMotion: settings.reduceMotion,
    });
  }, [
    resolvedTheme,
    settings.colorway,
    settings.glassStyle,
    settings.reduceMotion,
  ]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      setSystemLocale(detectBrowserLocale());
      setSystemTheme(detectBrowserTheme());
      if (typeof window.matchMedia !== "function") {
        return undefined;
      }

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleThemeChange = () => setSystemTheme(detectBrowserTheme());
      mediaQuery.addEventListener("change", handleThemeChange);
      return () => mediaQuery.removeEventListener("change", handleThemeChange);
    }

    let active = true;

    void desktopApi
      .getSystemLocale()
      .then((locale) => {
        if (active && locale) {
          setSystemLocale(locale);
        }
      })
      .catch(() => undefined);

    void desktopApi
      .getSystemTheme()
      .then((theme) => {
        if (active) {
          setSystemTheme(theme);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopBridge() || settings.themeMode !== "system") {
      return;
    }

    return desktopApi.onSystemThemeChanged((theme) => {
      setSystemTheme(theme);
    });
  }, [settings.themeMode]);

  useEffect(() => {
    if (settings.themeMode !== "time") {
      return;
    }

    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [
    settings.themeMode,
    settings.timeTheme.darkFrom,
    settings.timeTheme.lightFrom,
  ]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }

    let active = true;

    void desktopApi
      .getWindowState()
      .then((windowState) => {
        if (!active) return;

        setSettings((previous) =>
          sanitizeAppSettings(
            {
              ...previous,
              windowMode: windowState.mode,
              rememberWindowBounds: windowState.rememberWindowBounds,
            },
            DEFAULT_SETTINGS,
          ),
        );
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }

    void desktopApi.setWindowMode(settings.windowMode).catch(() => undefined);
  }, [settings.windowMode]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }

    void desktopApi
      .setWindowBoundsRemember(settings.rememberWindowBounds)
      .catch(() => undefined);
  }, [settings.rememberWindowBounds]);

  const value = useMemo<SettingsContextValue>(() => {
    return {
      settings,
      resolvedLanguage,
      resolvedTheme,
      systemLocale,
      systemTheme,
      setLanguageMode: (languageMode) => updateSettings({ languageMode }),
      setLanguage: (language) =>
        updateSettings({ languageMode: "manual", language }),
      setThemeMode: (themeMode) => updateSettings({ themeMode }),
      setTheme: (theme) => updateSettings({ themeMode: "manual", theme }),
      setColorway: (colorway) => updateSettings({ colorway }),
      setStudioProfile: (studioProfile) => updateSettings({ studioProfile }),
      setTimeTheme: (timeTheme) => {
        setSettings((previous) =>
          sanitizeAppSettings(
            {
              ...previous,
              timeTheme: sanitizeTimeTheme(
                { ...previous.timeTheme, ...timeTheme },
                previous.timeTheme,
              ),
            },
            DEFAULT_SETTINGS,
          ),
        );
      },
      setGlassStyle: (glassStyle) => updateSettings({ glassStyle }),
      setWindowMode: (windowMode) => updateSettings({ windowMode }),
      setRememberWindowBounds: (rememberWindowBounds) =>
        updateSettings({ rememberWindowBounds }),
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
              performancePreset: derivePresetFromPerformance(
                previous.antialias,
                fpsLimit,
              ),
            },
            DEFAULT_SETTINGS,
          ),
        );
      },
      setAntialias: (antialias) => {
        setSettings((previous) =>
          sanitizeAppSettings(
            {
              ...previous,
              antialias,
              performancePreset: derivePresetFromPerformance(
                antialias,
                previous.fpsLimit,
              ),
            },
            DEFAULT_SETTINGS,
          ),
        );
      },
      setReduceMotion: (reduceMotion) => updateSettings({ reduceMotion }),
      setPythonPath: (pythonPath) => updateSettings({ pythonPath }),
      setAutoGenerationProfile: (autoGenerationProfile) =>
        updateSettings({ autoGenerationProfile }),
      resetToRecommended: () => {
        updateSettings({ languageMode: "system", themeMode: "system" });
      },
      applyImportedSettings: (incomingSettings) => {
        setSettings(sanitizeAppSettings(incomingSettings, DEFAULT_SETTINGS));
      },
      resetSettings: () => {
        setSettings({
          ...DEFAULT_SETTINGS,
          timeTheme: { ...DEFAULT_SETTINGS.timeTheme },
        });
      },
    };
  }, [
    resolvedLanguage,
    resolvedTheme,
    settings,
    systemLocale,
    systemTheme,
    updateSettings,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider.");
  }
  return context;
}
