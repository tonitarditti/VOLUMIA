import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { EventEmitter } from "events";

// Increase default max listeners slightly to avoid spurious MaxListenersExceededWarning
// while guarding against the real leak. This reduces noise during development.
EventEmitter.defaultMaxListeners = 20;

// Capture Node 'warning' events (like MaxListenersExceededWarning) and print stack traces
process.on("warning", (warning) => {
  try {
    console.warn("[VOLUMIA][warning]", warning.name, warning.message);
    if (warning.stack) {
      console.warn(warning.stack);
    }
  } catch (err) {
    // swallow
  }
});
import { existsSync } from "fs";
import path from "path";
import {
  IPC_CHANNELS,
  type BackendRunDefaultPayload,
  type BackendImportWorkflowResult,
  type BackendRunDefaultResult,
  type BackendStatusResponse,
  type ComfyConfigPatch,
  type ComfyConfigResponse,
  type ComfyJobOutputs,
  type ComfyJobStatusResponse,
  type ComfyRunWorkflowPayload,
  type ComfyRunWorkflowResult,
  type ComfySubmitJobPayload,
  type ComfySubmitJobResult,
  type ComfyStatusResponse,
} from "./channels";
import { registerProjectsFileHandlers } from "./ipc/projects-file.ipc";
import { registerGenerationHandlers } from "./ipc/generation.ipc";
import { registerSettingsFileHandlers } from "./ipc/settings-file.ipc";
import { processPendingCacheClearOnStart, registerSystemPreferencesHandlers } from "./ipc/system-preferences.ipc";
import { registerSystemPythonHandlers } from "./ipc/system-python.ipc";
import { registerWindowControlHandlers } from "./ipc/window-controls.ipc";
import { registerWindowSettingsHandlers } from "./ipc/window-settings.ipc";
import { ensureRuntimeLayout, resolveRuntimePaths } from "./runtime-paths";
import { UnifiedBackendClient } from "./unified-backend";
import { createWindowStateController } from "./window-state";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
const runtimePaths = ensureRuntimeLayout(resolveRuntimePaths());

function configureRuntimePaths() {
  process.env.VOLUMIA_RUNTIME_DIR = runtimePaths.root;
  process.env.VOLUMIA_RUNTIME_USERDATA_DIR = runtimePaths.userData;
  process.env.VOLUMIA_RUNTIME_SESSION_DIR = runtimePaths.sessionData;
  process.env.VOLUMIA_RUNTIME_BACKEND_DIR = runtimePaths.backend;
  process.env.VOLUMIA_RUNTIME_LOGS_DIR = runtimePaths.logs;
  process.env.VOLUMIA_RUNTIME_CRASH_DIR = runtimePaths.crashDumps;

  app.setPath("userData", runtimePaths.userData);
  app.setPath("sessionData", runtimePaths.sessionData);
  app.setPath("crashDumps", runtimePaths.crashDumps);
  app.setAppLogsPath(runtimePaths.logs);
}

configureRuntimePaths();

let mainWindow: BrowserWindow | null = null;
let windowStateController: ReturnType<typeof createWindowStateController> | null = null;
let disposeSystemPreferencesHandlers: (() => void) | null = null;
let backendModule: BackendRuntimeModule | null = null;
const unifiedBackend = new UnifiedBackendClient();
const useUnifiedBackend = process.env.USE_UNIFIED_BACKEND !== "0";

type BackendRuntimeModule = {
  initBackend: () => Promise<unknown>;
  startBackend: (mode?: "dev" | "prod") => Promise<BackendStatusResponse>;
  stopBackend: () => Promise<unknown>;
  getBackendStatus: () => Promise<BackendStatusResponse>;
  runDefaultWorkflow: (payload?: { imagePath?: string; imageBase64?: string }) => Promise<{
    promptId: string;
    workflowName: string;
    workflowPath: string;
    message: string;
    outputGlbPath?: string;
  }>;
  importWorkflowFromPath: (sourcePath: string) => Promise<{
    workflowName: string;
    workflowPath: string;
    message: string;
  }>;
  getComfyStatus: () => Promise<ComfyStatusResponse>;
  startComfy: () => Promise<ComfyStatusResponse>;
  stopComfy: () => Promise<ComfyStatusResponse>;
  getComfyLogs: (limit?: number) => Promise<string[]>;
  runWorkflow: (
    workflowName?: string,
    payload?: { imagePath?: string; imageBase64?: string; projectId?: string; preset?: "fast" | "balanced" | "high" | "quality" }
  ) => Promise<{
    promptId: string;
    workflowName: string;
    workflowPath: string;
    message: string;
    outputGlbPath?: string;
  }>;
  submitWorkflow: (
    workflowName?: string,
    payload?: { imagePath?: string; imageBase64?: string; projectId?: string; preset?: "fast" | "balanced" | "high" | "quality" }
  ) => Promise<ComfySubmitJobResult>;
  getWorkflowJobStatus: (jobId: string) => Promise<ComfyJobStatusResponse>;
  cancelWorkflowJob: (jobId: string) => Promise<void>;
  resolveWorkflowJobOutputs: (jobId: string) => Promise<ComfyJobOutputs>;
  getComfyConfig: () => Promise<ComfyConfigResponse>;
  saveComfyConfig: (patch: ComfyConfigPatch) => Promise<ComfyConfigResponse>;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getBackendModulePath() {
  return path.resolve(process.cwd(), "backend", "dist", "index.js");
}

function loadBackendModule() {
  if (backendModule) {
    return backendModule;
  }
  const backendPath = getBackendModulePath();
  if (!existsSync(backendPath)) {
    throw new Error(`Backend compilado no encontrado en: ${backendPath}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  backendModule = require(backendPath) as BackendRuntimeModule;
  return backendModule;
}

function defaultBackendStatus(message: string): BackendStatusResponse {
  return {
    mode: isDev ? "dev" : "prod",
    startedAt: null,
    workflows: {
      sourceDir: path.resolve(process.cwd(), "backend", "workflows"),
      targetDir: path.resolve(process.cwd(), "backend", "workflows"),
      copied: 0,
      replaced: 0,
      backups: 0,
      lastSyncAt: null,
      error: message,
      activeName: null,
      activePath: null,
    },
    models: {
      ok: false,
      totalFiles: 0,
      installedFiles: 0,
      message,
      error: message,
    },
    comfy: {
      running: false,
      url: "http://127.0.0.1:8188",
      lastError: message,
      state: "error",
      host: "127.0.0.1",
      port: 8188,
      pid: null,
      python: null,
      comfyRoot: null,
      healthy: false,
      external: false,
      message,
    },
    activeProcesses: [],
    notes: [message],
  };
}

function defaultComfyStatus(message: string): ComfyStatusResponse {
  return {
    state: "ERROR",
    running: false,
    url: "http://127.0.0.1:8188",
    pid: null,
    startedByApp: false,
    lastError: message,
    lastLogs: [message],
    message,
    host: "127.0.0.1",
    port: 8188,
    config: {
      comfyDir: "C:\\AI\\ComfyUI_VOL",
      condaHook: "",
      condaEnvName: "volumia",
      pythonExeOverride: "",
      startupTimeoutMs: 90000,
    },
  };
}

async function getBackendStatusSafe() {
  try {
    if (useUnifiedBackend) {
      return await unifiedBackend.getBackendStatus();
    }
    const legacy = loadBackendModule();
    return await legacy.getBackendStatus();
  } catch (error) {
    const message = toErrorMessage(error);
    return defaultBackendStatus(message);
  }
}

async function getComfyStatusSafe() {
  try {
    if (useUnifiedBackend) {
      return await unifiedBackend.getComfyStatus();
    }
    const legacy = loadBackendModule();
    return await legacy.getComfyStatus();
  } catch (error) {
    const message = toErrorMessage(error);
    return defaultComfyStatus(message);
  }
}

async function startBackendSafe() {
  try {
    const status = useUnifiedBackend
      ? await unifiedBackend.startBackend()
      : await (async () => {
          const legacy = loadBackendModule();
          await legacy.initBackend();
          return await legacy.startBackend("dev");
        })();
    console.log("[VOLUMIA][backend] startBackend(dev):", status.comfy.message);
  } catch (error) {
    console.warn("[VOLUMIA][backend] startBackend(dev) failed:", toErrorMessage(error));
  }
}

async function stopBackendSafe() {
  try {
    if (useUnifiedBackend) {
      await unifiedBackend.stopBackend();
      return;
    }
    const legacy = loadBackendModule();
    await legacy.stopBackend();
  } catch {
    // No-op by design.
  }
}

function createMainWindow() {
  if (!windowStateController) {
    windowStateController = createWindowStateController();
  }

  const cwdPreloadPath = path.join(process.cwd(), "electron-dist", "preload.js");
  const fallbackPreloadPath = path.join(__dirname, "preload.js");
  const preloadPath = existsSync(cwdPreloadPath) ? cwdPreloadPath : fallbackPreloadPath;
  const iconPathCandidates = [
    path.resolve(process.cwd(), "src", "assets", "branding", "VOLUMIA-V-dorado.ico"),
    path.resolve(process.cwd(), "src", "assets", "branding", "VOLUMIA-dorado-transparente.png"),
    path.resolve(__dirname, "../src/assets/branding/VOLUMIA-dorado-transparente.png"),
  ];
  const iconPath = iconPathCandidates.find((candidate) => existsSync(candidate));
  const launchBounds = windowStateController.getLaunchBounds();

  const windowInstance = new BrowserWindow({
    width: launchBounds.width,
    height: launchBounds.height,
    x: launchBounds.x,
    y: launchBounds.y,
    show: false,
    minWidth: 1180,
    minHeight: 760,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0B0D12",
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windowStateController.attachTracking(windowInstance);
  windowStateController.applyLaunchMode(windowInstance);
  windowInstance.once("ready-to-show", () => {
    if (!windowInstance.isDestroyed()) {
      windowInstance.show();
    }
  });

  if (isDev) {
    void windowInstance.loadURL(devServerUrl);
  } else {
    void windowInstance.loadFile(path.resolve(__dirname, "../dist/index.html"));
  }

  windowInstance.on("closed", () => {
    if (mainWindow === windowInstance) {
      mainWindow = null;
    }
  });

  return windowInstance;
}

function registerBackendHandlers() {
  ipcMain.handle(IPC_CHANNELS.backendStatus, async () => {
    return await getBackendStatusSafe();
  });

  ipcMain.handle(
    IPC_CHANNELS.backendRunDefault,
    async (_event, payload: BackendRunDefaultPayload | undefined): Promise<BackendRunDefaultResult> => {
      try {
        const runResult = useUnifiedBackend
          ? await unifiedBackend.runWorkflow({
              imagePath: payload?.imagePath,
              imageBase64: payload?.imageBase64,
            })
          : await (async () => {
              const legacy = loadBackendModule();
              return await legacy.runDefaultWorkflow(payload);
            })();
        const status = await getBackendStatusSafe();
        return {
          ok: true,
          promptId: runResult.promptId,
          workflowName: runResult.workflowName,
          workflowPath: runResult.workflowPath,
          outputGlbPath: runResult.outputGlbPath,
          message: runResult.message,
          status,
        };
      } catch (error) {
        const message = toErrorMessage(error);
        const status = await getBackendStatusSafe();
        return {
          ok: false,
          message,
          error: message,
          status,
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.backendImportWorkflow, async (): Promise<BackendImportWorkflowResult> => {
    try {
      const picker = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          { name: "Workflow JSON", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
        title: "Import workflow JSON",
      });
      if (picker.canceled || picker.filePaths.length === 0) {
        return {
          ok: false,
          canceled: true,
          message: "Import canceled.",
          status: await getBackendStatusSafe(),
        };
      }

      const backend = loadBackendModule();
      const importResult = await backend.importWorkflowFromPath(picker.filePaths[0]!);
      const status = await backend.getBackendStatus();
      return {
        ok: true,
        canceled: false,
        workflowName: importResult.workflowName,
        workflowPath: importResult.workflowPath,
        message: importResult.message,
        status,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      return {
        ok: false,
        canceled: false,
        message,
        error: message,
        status: await getBackendStatusSafe(),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfyStatus, async () => {
    return await getComfyStatusSafe();
  });

  ipcMain.handle(IPC_CHANNELS.comfyStart, async () => {
    try {
      if (useUnifiedBackend) {
        return await unifiedBackend.startComfy();
      }
      const backend = loadBackendModule();
      return await backend.startComfy();
    } catch (error) {
      return defaultComfyStatus(toErrorMessage(error));
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfyStop, async () => {
    try {
      if (useUnifiedBackend) {
        return await unifiedBackend.stopComfy();
      }
      const backend = loadBackendModule();
      return await backend.stopComfy();
    } catch (error) {
      return defaultComfyStatus(toErrorMessage(error));
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfyLogs, async (_event, payload?: { limit?: number }) => {
    try {
      const limit = typeof payload?.limit === "number" ? payload.limit : undefined;
      if (useUnifiedBackend) {
        return await unifiedBackend.getComfyLogs(limit);
      }
      const backend = loadBackendModule();
      return await backend.getComfyLogs(limit);
    } catch (error) {
      return [toErrorMessage(error)];
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfyRunWorkflow, async (_event, payload: ComfyRunWorkflowPayload | undefined): Promise<ComfyRunWorkflowResult> => {
    try {
      const runResult = useUnifiedBackend
        ? await unifiedBackend.runWorkflow({
            workflowId: payload?.workflowId,
            imagePath: payload?.imagePath,
            imageBase64: payload?.imageBase64,
            projectId: payload?.projectId,
            preset: payload?.preset,
          })
        : await (async () => {
            const backend = loadBackendModule();
            return await backend.runWorkflow(payload?.workflowId, {
              imagePath: payload?.imagePath,
              imageBase64: payload?.imageBase64,
              projectId: payload?.projectId,
              preset: payload?.preset,
            });
          })();
      const comfy = await getComfyStatusSafe();
      return {
        ok: true,
        promptId: runResult.promptId,
        workflowName: runResult.workflowName,
        workflowPath: runResult.workflowPath,
        outputGlbPath: runResult.outputGlbPath,
        message: runResult.message,
        comfy,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      return {
        ok: false,
        message,
        error: message,
        comfy: await getComfyStatusSafe(),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfySubmitJob, async (_event, payload: ComfySubmitJobPayload | undefined): Promise<ComfySubmitJobResult> => {
    if (useUnifiedBackend) {
      return await unifiedBackend.submitWorkflow({
        workflowId: payload?.workflowId,
        imagePath: payload?.imagePath,
        imageBase64: payload?.imageBase64,
        projectId: payload?.projectId,
        preset: payload?.preset,
      });
    }
    const backend = loadBackendModule();
    return await backend.submitWorkflow(payload?.workflowId, {
      imagePath: payload?.imagePath,
      imageBase64: payload?.imageBase64,
      projectId: payload?.projectId,
      preset: payload?.preset,
    });
  });

  ipcMain.handle(IPC_CHANNELS.comfyJobStatus, async (_event, payload: { jobId?: string } | undefined): Promise<ComfyJobStatusResponse> => {
    if (!payload?.jobId) {
      throw new Error("Missing ComfyUI jobId.");
    }
    if (useUnifiedBackend) {
      return await unifiedBackend.getWorkflowJobStatus(payload.jobId);
    }
    const backend = loadBackendModule();
    return await backend.getWorkflowJobStatus(payload.jobId);
  });

  ipcMain.handle(IPC_CHANNELS.comfyCancelJob, async (_event, payload: { jobId?: string } | undefined): Promise<void> => {
    if (!payload?.jobId) {
      return;
    }
    if (useUnifiedBackend) {
      await unifiedBackend.cancelWorkflowJob(payload.jobId);
      return;
    }
    const backend = loadBackendModule();
    await backend.cancelWorkflowJob(payload.jobId);
  });

  ipcMain.handle(IPC_CHANNELS.comfyResolveOutputs, async (_event, payload: { jobId?: string } | undefined): Promise<ComfyJobOutputs> => {
    if (!payload?.jobId) {
      return {};
    }
    if (useUnifiedBackend) {
      return await unifiedBackend.resolveWorkflowJobOutputs(payload.jobId);
    }
    const backend = loadBackendModule();
    return await backend.resolveWorkflowJobOutputs(payload.jobId);
  });

  ipcMain.handle(IPC_CHANNELS.comfyGetConfig, async (): Promise<ComfyConfigResponse> => {
    try {
      if (useUnifiedBackend) {
        return await unifiedBackend.getComfyConfig();
      }
      const backend = loadBackendModule();
      return await backend.getComfyConfig();
    } catch (error) {
      const status = await getComfyStatusSafe();
      return {
        host: status.host,
        port: status.port,
        baseUrl: status.url,
        comfyDir: status.config.comfyDir,
        condaHook: status.config.condaHook,
        condaEnvName: status.config.condaEnvName,
        pythonExeOverride: status.config.pythonExeOverride,
        args: ["main.py", "--listen", status.host, "--port", String(status.port)],
        startupTimeoutMs: status.config.startupTimeoutMs,
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.comfySaveConfig, async (_event, patch: ComfyConfigPatch | undefined): Promise<ComfyConfigResponse> => {
    if (useUnifiedBackend) {
      return await unifiedBackend.saveComfyConfig(patch ?? {});
    }
    const backend = loadBackendModule();
    const saved = await backend.saveComfyConfig(patch ?? {});
    return saved;
  });
}

app.whenReady().then(() => {
  console.log("[VOLUMIA][runtime] root:", runtimePaths.root);
  console.log("[VOLUMIA][runtime] userData:", app.getPath("userData"));
  console.log("[VOLUMIA][runtime] sessionData:", app.getPath("sessionData"));
  console.log("[VOLUMIA][runtime] crashDumps:", app.getPath("crashDumps"));
  console.log("[VOLUMIA][runtime] logs:", app.getPath("logs"));
  console.log("[VOLUMIA][runtime] backend:", runtimePaths.backend);

  processPendingCacheClearOnStart();

  windowStateController = createWindowStateController();
  mainWindow = createMainWindow();
  if (!windowStateController) {
    throw new Error("Window state controller is unavailable.");
  }

  registerProjectsFileHandlers();
  registerGenerationHandlers(() => mainWindow);
  registerSettingsFileHandlers();
  registerWindowControlHandlers(() => mainWindow);
  registerWindowSettingsHandlers(() => mainWindow, windowStateController);
  disposeSystemPreferencesHandlers = registerSystemPreferencesHandlers(() => mainWindow);
  registerSystemPythonHandlers(() => mainWindow);
  registerBackendHandlers();

  void startBackendSafe();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopBackendSafe();
});

app.on("will-quit", () => {
  if (disposeSystemPreferencesHandlers) {
    disposeSystemPreferencesHandlers();
    disposeSystemPreferencesHandlers = null;
  }
});
