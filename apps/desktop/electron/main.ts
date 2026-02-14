import { BrowserWindow, app } from "electron";
import { existsSync } from "fs";
import path from "path";
import { registerProjectsFileHandlers } from "./ipc/projects-file.ipc";
import { registerGenerationHandlers } from "./ipc/generation.ipc";
import { registerSettingsFileHandlers } from "./ipc/settings-file.ipc";
import { processPendingCacheClearOnStart, registerSystemPreferencesHandlers } from "./ipc/system-preferences.ipc";
import { registerSystemPythonHandlers } from "./ipc/system-python.ipc";
import { registerWindowControlHandlers } from "./ipc/window-controls.ipc";
import { registerWindowSettingsHandlers } from "./ipc/window-settings.ipc";
import { createWindowStateController } from "./window-state";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let windowStateController: ReturnType<typeof createWindowStateController> | null = null;
let disposeSystemPreferencesHandlers: (() => void) | null = null;

function createMainWindow() {
  if (!windowStateController) {
    windowStateController = createWindowStateController();
  }

  const cwdPreloadPath = path.join(process.cwd(), "electron-dist", "preload.js");
  const fallbackPreloadPath = path.join(__dirname, "preload.js");
  const preloadPath = existsSync(cwdPreloadPath) ? cwdPreloadPath : fallbackPreloadPath;
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
    backgroundColor: "#0f1113",
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

app.whenReady().then(() => {
  if (process.env.NODE_ENV === "development") {
    console.log("UserData path:", app.getPath("userData"));
  }

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

app.on("will-quit", () => {
  if (disposeSystemPreferencesHandlers) {
    disposeSystemPreferencesHandlers();
    disposeSystemPreferencesHandlers = null;
  }
});
