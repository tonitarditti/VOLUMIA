import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import axios from "axios";
import { constants as fsConstants } from "fs";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

type AppLanguage = "system" | "en" | "es";
type AppTheme = "system" | "light" | "dark";
type WindowSizePreset = "small" | "medium" | "large";
type UiScale = 90 | 100 | 110 | 125;

type AppSettings = {
  language: AppLanguage;
  theme: AppTheme;
  workspace: {
    windowSizePreset: WindowSizePreset;
    rememberLastWindowBounds: boolean;
    alwaysOnTop: boolean;
    uiScale: UiScale;
    startMaximized: boolean;
    windowBounds?: {
      x?: number;
      y?: number;
      width: number;
      height: number;
    };
  };
  exportDefaults: {
    units: "cm" | "m";
    textureResolution: "2k" | "4k";
    includeLow: boolean;
    lowTextureDownscale: 25 | 50 | 75;
  };
  performanceDefaults: {
    maxFacesHigh: number;
    maxFacesLow: number;
  };
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
const servicePort = Number(process.env.VOLUMIA_SERVICE_PORT ?? "7860");
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const serviceExternallyManaged = process.env.VOLUMIA_SERVICE_MANAGED_EXTERNALLY === "1";

const windowPresetMap: Record<WindowSizePreset, { width: number; height: number }> = {
  small: { width: 1280, height: 760 },
  medium: { width: 1480, height: 920 },
  large: { width: 1680, height: 1020 },
};

const uiScaleValues: UiScale[] = [90, 100, 110, 125];

const defaultSettings: AppSettings = {
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

let mainWindow: BrowserWindow | null = null;
let serviceProcess: ChildProcessWithoutNullStreams | null = null;
let serviceReadyPromise: Promise<void> | null = null;
let settingsCache: AppSettings | null = null;

const serviceHttp = axios.create({
  baseURL: serviceBaseUrl,
  timeout: 120000,
});

app.disableHardwareAcceleration();

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toUiScale(value: number): UiScale {
  const nearest = uiScaleValues.reduce((best, current) => {
    return Math.abs(current - value) < Math.abs(best - value) ? current : best;
  }, 100 as UiScale);
  return nearest;
}

function mergeSettings(base: AppSettings, patch?: DeepPartial<AppSettings>): AppSettings {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    workspace: {
      ...base.workspace,
      ...(patch.workspace ?? {}),
      windowBounds: patch.workspace?.windowBounds ?? base.workspace.windowBounds,
      uiScale: patch.workspace?.uiScale ? toUiScale(patch.workspace.uiScale) : base.workspace.uiScale,
    },
    exportDefaults: {
      ...base.exportDefaults,
      ...(patch.exportDefaults ?? {}),
    },
    performanceDefaults: {
      ...base.performanceDefaults,
      ...(patch.performanceDefaults ?? {}),
    },
  };
}

async function loadSettingsFromDisk() {
  const settingsPath = getSettingsPath();
  try {
    if (!(await fileExists(settingsPath))) {
      return defaultSettings;
    }
    const raw = await readFile(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as DeepPartial<AppSettings>;
    return mergeSettings(defaultSettings, parsed);
  } catch {
    return defaultSettings;
  }
}

async function saveSettingsToDisk(settings: AppSettings) {
  const settingsPath = getSettingsPath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

async function getSettings() {
  if (settingsCache) return settingsCache;
  settingsCache = await loadSettingsFromDisk();
  return settingsCache;
}

async function patchSettings(patch: DeepPartial<AppSettings>) {
  const current = await getSettings();
  const next = mergeSettings(current, patch);
  settingsCache = next;
  await saveSettingsToDisk(next);
  return next;
}

function resolveServiceEntry() {
  return [
    path.resolve(process.resourcesPath, "service/main.py"),
    path.resolve(process.resourcesPath, "apps/service/main.py"),
    path.resolve(process.cwd(), "apps/service/main.py"),
    path.resolve(process.cwd(), "../service/main.py"),
    path.resolve(__dirname, "../../service/main.py"),
    path.resolve(__dirname, "../../../apps/service/main.py"),
  ];
}

async function resolvePythonBinary() {
  const candidates = [
    process.env.VOLUMIA_PYTHON_BIN,
    path.resolve(process.cwd(), ".venv/Scripts/python.exe"),
    path.resolve(__dirname, "../../../.venv/Scripts/python.exe"),
    "python",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === "python") return candidate;
    if (await fileExists(candidate)) return candidate;
  }

  return "python";
}

async function waitForServiceReady() {
  const maxAttempts = 36;
  let delayMs = 250;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await serviceHttp.get("/health");
      if (response.status === 200 && response.data?.ok) {
        return;
      }
    } catch {
      // keep retrying
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(1200, Math.round(delayMs * 1.2));
  }

  throw new Error(`Service did not become ready at ${serviceBaseUrl}`);
}

async function stopManagedService() {
  if (!serviceProcess) {
    serviceReadyPromise = null;
    return;
  }

  const child = serviceProcess;
  serviceProcess = null;
  serviceReadyPromise = null;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve();
    }, 2500);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      child.kill();
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

async function startServiceIfNeeded() {
  if (serviceReadyPromise) return serviceReadyPromise;

  serviceReadyPromise = (async () => {
    if (serviceExternallyManaged) {
      await waitForServiceReady();
      return;
    }

    const entries = resolveServiceEntry();
    const serviceEntry = (await Promise.all(entries.map(async (entry) => ((await fileExists(entry)) ? entry : null)))).find(
      (entry): entry is string => Boolean(entry)
    );

    if (!serviceEntry) {
      throw new Error("FastAPI service entrypoint was not found.");
    }

    const pythonBin = await resolvePythonBinary();

    serviceProcess = spawn(pythonBin, [serviceEntry], {
      cwd: path.dirname(serviceEntry),
      env: {
        ...process.env,
        VOLUMIA_SERVICE_PORT: String(servicePort),
      },
      stdio: "pipe",
    });

    serviceProcess.stdout.on("data", (chunk) => {
      console.log(`[service] ${String(chunk).trimEnd()}`);
    });

    serviceProcess.stderr.on("data", (chunk) => {
      console.warn(`[service] ${String(chunk).trimEnd()}`);
    });

    serviceProcess.on("exit", (code) => {
      console.warn(`[service] exited with code ${code}`);
      serviceProcess = null;
      serviceReadyPromise = null;
    });

    await waitForServiceReady();
  })();

  return serviceReadyPromise;
}

async function restartService() {
  if (serviceExternallyManaged) {
    serviceReadyPromise = null;
    await waitForServiceReady();
    return true;
  }

  await stopManagedService();
  await startServiceIfNeeded();
  return true;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchServiceHealthWithRetry(attempts = 10, intervalMs = 500) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await serviceHttp.get("/health", { timeout: 2500 });
      if (response.status === 200 && response.data?.ok) {
        return {
          ok: true,
          detail: response.data?.service ?? "Service healthy",
        };
      }
      lastError = new Error(`Unexpected health response (${response.status}).`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await delay(intervalMs);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "Service unavailable";
  return {
    ok: false,
    detail,
  };
}

async function getServiceStatus() {
  const status = await fetchServiceHealthWithRetry(10, 500);
  return {
    ok: status.ok,
    managed: !serviceExternallyManaged,
    url: serviceBaseUrl,
    detail: status.detail,
  };
}

function toServiceError(action: string, error: unknown): Error {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return new Error(`[SERVICE_TIMEOUT] ${action} timed out.`);
    }

    if (!error.response) {
      return new Error(`[SERVICE_UNAVAILABLE] ${action} failed because the service is unreachable.`);
    }

    if (error.response.status === 422) {
      const detail = typeof error.response.data?.detail === "string" ? error.response.data.detail : "Validation failed.";
      return new Error(`[VALIDATION_ERROR] ${detail}`);
    }

    const detail =
      typeof error.response.data?.detail === "string"
        ? error.response.data.detail
        : error.message || `${action} failed with status ${error.response.status}.`;
    return new Error(`[SERVICE_ERROR] ${detail}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`[SERVICE_ERROR] ${action} failed.`);
}

function getPresetStoragePath() {
  return path.join(app.getPath("userData"), "presets");
}

async function listStudioPresets() {
  const dir = getPresetStoragePath();
  await mkdir(dir, { recursive: true });

  const files = await readdir(dir);
  const presets = [];

  for (const fileName of files) {
    if (!fileName.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, fileName), "utf-8");
      presets.push(JSON.parse(raw));
    } catch (error) {
      console.error(`Failed to parse preset ${fileName}`, error);
    }
  }

  return presets;
}

async function saveStudioPreset(payload: {
  presetName: string;
  basePreset: string;
  structureLocked: boolean;
  materialDefaults: Array<{ materialName: string; roughness: number; normalStrength: number }>;
  exportDefaults: { textureSize: "2k" | "4k"; includeLightweight: boolean };
}) {
  const dir = getPresetStoragePath();
  await mkdir(dir, { recursive: true });

  const now = new Date().toISOString();
  const slug = payload.presetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const id = `${slug || "studio"}-${Date.now()}`;

  const preset = {
    id,
    presetName: payload.presetName,
    basePreset: payload.basePreset,
    structureLocked: payload.structureLocked,
    materialDefaults: payload.materialDefaults,
    exportDefaults: payload.exportDefaults,
    createdAt: now,
    updatedAt: now,
  };

  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(preset, null, 2), "utf-8");
  return preset;
}

function getInitialWindowOptions(settings: AppSettings) {
  const preset = windowPresetMap[settings.workspace.windowSizePreset] ?? windowPresetMap.medium;
  const bounds = settings.workspace.rememberLastWindowBounds ? settings.workspace.windowBounds : undefined;

  return {
    width: bounds?.width ?? preset.width,
    height: bounds?.height ?? preset.height,
    x: bounds?.x,
    y: bounds?.y,
  };
}

function applyWindowRuntimeSettings(settings: AppSettings, options?: { applySizePreset?: boolean; applyMaximize?: boolean }) {
  if (!mainWindow) return;

  mainWindow.setAlwaysOnTop(settings.workspace.alwaysOnTop);
  mainWindow.webContents.setZoomFactor(settings.workspace.uiScale / 100);

  if (options?.applySizePreset) {
    const preset = windowPresetMap[settings.workspace.windowSizePreset] ?? windowPresetMap.medium;
    mainWindow.setSize(preset.width, preset.height);
  }

  if (options?.applyMaximize ?? true) {
    if (settings.workspace.startMaximized && !mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
    if (!settings.workspace.startMaximized && mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
  }
}

async function persistCurrentWindowBounds() {
  if (!mainWindow) return;
  const settings = await getSettings();
  if (!settings.workspace.rememberLastWindowBounds) return;

  await patchSettings({
    workspace: {
      windowBounds: mainWindow.getBounds(),
    },
  });
}

function bindWindowStatePersistence() {
  if (!mainWindow) return;

  let timer: NodeJS.Timeout | null = null;
  const schedulePersist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void persistCurrentWindowBounds();
    }, 250);
  };

  mainWindow.on("move", schedulePersist);
  mainWindow.on("resize", schedulePersist);
  mainWindow.on("close", () => {
    if (timer) clearTimeout(timer);
    void persistCurrentWindowBounds();
  });
}

async function createWindow() {
  const settings = await getSettings();
  const initial = getInitialWindowOptions(settings);

  mainWindow = new BrowserWindow({
    ...initial,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#F2EFEA",
    alwaysOnTop: settings.workspace.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  applyWindowRuntimeSettings(settings);
  bindWindowStatePersistence();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getWindowState() {
  if (!mainWindow) {
    return {
      bounds: windowPresetMap.medium,
      isMaximized: false,
      alwaysOnTop: false,
      zoomFactor: 1,
    };
  }

  return {
    bounds: mainWindow.getBounds(),
    isMaximized: mainWindow.isMaximized(),
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    zoomFactor: mainWindow.webContents.getZoomFactor(),
  };
}

app.whenReady().then(async () => {
  void startServiceIfNeeded().catch((error) => {
    console.error("Failed to initialize service", error);
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

ipcMain.handle("volumia:analyze-images", async (_event, payload) => {
  try {
    await startServiceIfNeeded();
    const response = await serviceHttp.post("/analyze-images", payload);
    return response.data;
  } catch (error) {
    throw toServiceError("Analyze images", error);
  }
});

ipcMain.handle("volumia:generate-model", async (_event, payload) => {
  try {
    await startServiceIfNeeded();
    const response = await serviceHttp.post("/generate-model", payload);
    return response.data;
  } catch (error) {
    throw toServiceError("Generate model", error);
  }
});

ipcMain.handle("volumia:export-package", async (_event, payload) => {
  try {
    await startServiceIfNeeded();
    const response = await serviceHttp.post("/export-package", payload);
    return response.data;
  } catch (error) {
    throw toServiceError("Export package", error);
  }
});

ipcMain.handle("volumia:save-export-dialog", async (_event, payload: { suggestedFileName: string; sourceZipPath: string }) => {
  const dialogResult = await dialog.showSaveDialog({
    title: "Save SketchUp Package",
    defaultPath: payload.suggestedFileName,
    filters: [{ name: "SketchUp Package", extensions: ["zip"] }],
  });

  if (dialogResult.canceled || !dialogResult.filePath) {
    return { ok: true, canceled: true };
  }

  await copyFile(payload.sourceZipPath, dialogResult.filePath);
  return { ok: true, canceled: false, savedPath: dialogResult.filePath };
});

ipcMain.handle("volumia:studio-preset:list", async () => {
  return listStudioPresets();
});

ipcMain.handle("volumia:studio-preset:save", async (_event, payload) => {
  return saveStudioPreset(payload);
});

ipcMain.handle("volumia:settings:get", async () => {
  return getSettings();
});

ipcMain.handle("volumia:settings:set", async (_event, payload: DeepPartial<AppSettings>) => {
  const next = await patchSettings(payload);
  applyWindowRuntimeSettings(next, {
    applySizePreset: Boolean(payload.workspace?.windowSizePreset),
  });
  return next;
});

ipcMain.handle("volumia:window:get-state", () => {
  return getWindowState();
});

ipcMain.handle("volumia:window:get-bounds", () => {
  return mainWindow?.getBounds() ?? windowPresetMap.medium;
});

ipcMain.handle("volumia:window:set-bounds", async (_event, bounds: { x?: number; y?: number; width: number; height: number }) => {
  if (!mainWindow) return getWindowState();
  mainWindow.setBounds(bounds);
  await patchSettings({ workspace: { windowBounds: mainWindow.getBounds() } });
  return getWindowState();
});

ipcMain.handle("volumia:window:set-always-on-top", async (_event, value: boolean) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(value);
  await patchSettings({ workspace: { alwaysOnTop: value } });
  return true;
});

ipcMain.handle("volumia:window:set-maximized", async (_event, value: boolean) => {
  if (mainWindow) {
    if (value) {
      mainWindow.maximize();
    } else {
      mainWindow.unmaximize();
    }
  }
  await patchSettings({ workspace: { startMaximized: value } });
  return true;
});

ipcMain.handle("volumia:window:set-zoom-factor", async (_event, factor: number) => {
  if (mainWindow) {
    mainWindow.webContents.setZoomFactor(factor);
  }
  await patchSettings({ workspace: { uiScale: toUiScale(Math.round(factor * 100)) } });
  return true;
});

ipcMain.handle("volumia:window:apply-size-preset", async (_event, preset: WindowSizePreset) => {
  const validPreset: WindowSizePreset = windowPresetMap[preset] ? preset : "medium";
  const size = windowPresetMap[validPreset];
  if (mainWindow) {
    mainWindow.setSize(size.width, size.height);
  }
  await patchSettings({ workspace: { windowSizePreset: validPreset, windowBounds: mainWindow?.getBounds() } });
  return true;
});

ipcMain.handle("volumia:diagnostics:gpu-info", () => {
  try {
    const status = app.getGPUFeatureStatus();
    return JSON.stringify(status);
  } catch {
    return "GPU info placeholder";
  }
});

ipcMain.handle("volumia:diagnostics:open-logs-folder", async () => {
  const logsPath = app.getPath("logs");
  await mkdir(logsPath, { recursive: true });
  await shell.openPath(logsPath);
  return logsPath;
});

ipcMain.handle("volumia:diagnostics:restart-service", async () => {
  try {
    await restartService();
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("volumia:diagnostics:service-status", async () => {
  return getServiceStatus();
});

ipcMain.handle("volumia:getAppVersion", () => app.getVersion());

app.on("before-quit", () => {
  if (serviceProcess) {
    serviceProcess.kill();
    serviceProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
