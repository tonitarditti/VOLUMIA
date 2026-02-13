import { create } from "zustand";
import { desktopApi } from "@/api/desktopApi";
import type {
  AppLanguage,
  AppTheme,
  ExportDefaults,
  PerformanceDefaults,
  ServiceStatus,
  StoredAppSettings,
  UiScale,
  WindowSizePreset
} from "@/state/settings.types";

const defaultSettings: StoredAppSettings = {
  language: "system",
  theme: "system",
  workspace: {
    windowSizePreset: "medium",
    rememberLastWindowBounds: true,
    alwaysOnTop: false,
    uiScale: 100,
    startMaximized: false,
  },
  exportDefaults: {
    units: "cm",
    textureResolution: "2k",
    includeLow: true,
    lowTextureDownscale: 50,
  },
  performanceDefaults: {
    maxFacesHigh: 120000,
    maxFacesLow: 45000,
  },
};

function mergeSettings(payload?: Partial<StoredAppSettings>): StoredAppSettings {
  if (!payload) return defaultSettings;
  return {
    ...defaultSettings,
    ...payload,
    workspace: { ...defaultSettings.workspace, ...(payload.workspace ?? {}) },
    exportDefaults: { ...defaultSettings.exportDefaults, ...(payload.exportDefaults ?? {}) },
    performanceDefaults: { ...defaultSettings.performanceDefaults, ...(payload.performanceDefaults ?? {}) },
  };
}

type SettingsState = {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  appVersion: string;
  gpuInfo: string;
  serviceStatus: ServiceStatus;
  settings: StoredAppSettings;
  load: () => Promise<void>;
  setLanguage: (value: AppLanguage) => Promise<void>;
  setTheme: (value: AppTheme) => Promise<void>;
  setWindowSizePreset: (value: WindowSizePreset) => Promise<void>;
  setRememberLastWindowBounds: (value: boolean) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setUiScale: (value: UiScale) => Promise<void>;
  setStartMaximized: (value: boolean) => Promise<void>;
  setExportDefaults: (patch: Partial<ExportDefaults>) => Promise<void>;
  setPerformanceDefaults: (patch: Partial<PerformanceDefaults>) => Promise<void>;
  openLogsFolder: () => Promise<void>;
  restartService: () => Promise<boolean>;
  refreshServiceStatus: () => Promise<void>;
};

async function persistSettings(settings: StoredAppSettings) {
  await desktopApi.saveSettings(settings);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  initialized: false,
  loading: false,
  saving: false,
  error: null,
  appVersion: "-",
  gpuInfo: "GPU info unavailable",
  serviceStatus: {
    ok: false,
    managed: true,
    url: "http://127.0.0.1:7860",
    detail: "Unknown",
  },
  settings: defaultSettings,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const [stored, appVersion, gpuInfo, serviceStatus] = await Promise.all([
        desktopApi.getSettings(),
        desktopApi.getAppVersion().catch(() => "-"),
        desktopApi.getGpuInfo().catch(() => "GPU info unavailable"),
        desktopApi.getServiceStatus().catch(() => ({
          ok: false,
          managed: true,
          url: "http://127.0.0.1:7860",
          detail: "Service status unavailable",
        })),
      ]);

      set({
        settings: mergeSettings(stored),
        appVersion,
        gpuInfo,
        serviceStatus,
        loading: false,
        initialized: true,
      });
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "Failed to load settings.",
      });
    }
  },

  setLanguage: async (language) => {
    const settings = { ...get().settings, language };
    set({ settings, saving: true });
    try {
      await persistSettings(settings);
    } finally {
      set({ saving: false });
    }
  },

  setTheme: async (theme) => {
    const settings = { ...get().settings, theme };
    set({ settings, saving: true });
    try {
      await persistSettings(settings);
    } finally {
      set({ saving: false });
    }
  },

  setWindowSizePreset: async (windowSizePreset) => {
    const settings = {
      ...get().settings,
      workspace: { ...get().settings.workspace, windowSizePreset },
    };
    set({ settings, saving: true });
    try {
      await Promise.all([persistSettings(settings), desktopApi.applyWindowSizePreset(windowSizePreset)]);
    } finally {
      set({ saving: false });
    }
  },

  setRememberLastWindowBounds: async (rememberLastWindowBounds) => {
    const settings = {
      ...get().settings,
      workspace: { ...get().settings.workspace, rememberLastWindowBounds },
    };
    set({ settings, saving: true });
    try {
      await persistSettings(settings);
    } finally {
      set({ saving: false });
    }
  },

  setAlwaysOnTop: async (alwaysOnTop) => {
    const settings = {
      ...get().settings,
      workspace: { ...get().settings.workspace, alwaysOnTop },
    };
    set({ settings, saving: true });
    try {
      await Promise.all([persistSettings(settings), desktopApi.setAlwaysOnTop(alwaysOnTop)]);
    } finally {
      set({ saving: false });
    }
  },

  setUiScale: async (uiScale) => {
    const settings = {
      ...get().settings,
      workspace: { ...get().settings.workspace, uiScale },
    };
    set({ settings, saving: true });
    try {
      await Promise.all([persistSettings(settings), desktopApi.setZoomFactor(uiScale / 100)]);
    } finally {
      set({ saving: false });
    }
  },

  setStartMaximized: async (startMaximized) => {
    const settings = {
      ...get().settings,
      workspace: { ...get().settings.workspace, startMaximized },
    };
    set({ settings, saving: true });
    try {
      await Promise.all([persistSettings(settings), desktopApi.setMaximized(startMaximized)]);
    } finally {
      set({ saving: false });
    }
  },

  setExportDefaults: async (patch) => {
    const settings = {
      ...get().settings,
      exportDefaults: { ...get().settings.exportDefaults, ...patch },
    };
    set({ settings, saving: true });
    try {
      await persistSettings(settings);
    } finally {
      set({ saving: false });
    }
  },

  setPerformanceDefaults: async (patch) => {
    const settings = {
      ...get().settings,
      performanceDefaults: { ...get().settings.performanceDefaults, ...patch },
    };
    set({ settings, saving: true });
    try {
      await persistSettings(settings);
    } finally {
      set({ saving: false });
    }
  },

  openLogsFolder: async () => {
    await desktopApi.openLogsFolder();
  },

  restartService: async () => {
    const ok = await desktopApi.restartPythonService();
    await get().refreshServiceStatus();
    return ok;
  },

  refreshServiceStatus: async () => {
    const serviceStatus = await desktopApi.getServiceStatus().catch(() => ({
      ok: false,
      managed: true,
      url: "http://127.0.0.1:7860",
      detail: "Service status unavailable",
    }));
    set({ serviceStatus });
  },
}));
