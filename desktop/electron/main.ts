import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let engineProc: ChildProcessWithoutNullStreams | null = null;

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 7860;
const ENGINE_HEALTH_URL = `http://${ENGINE_HOST}:${ENGINE_PORT}/health`;

/**
 * Check if engine is already running
 */
function checkHealth(timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(ENGINE_HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start engine process (local)
 * - For dev: you might spawn "python run_engine.py"
 * - For release: spawn "volumia-engine.exe"
 */
async function ensureEngineRunning() {
  const ok = await checkHealth();
  if (ok) return;

  // ✅ Choose one (DEV vs RELEASE)
  // ---- DEV (Python) example:
  // const engineCmd = "python";
  // const engineArgs = [path.join(__dirname, "..", "..", "engine", "run_engine.py"), "--host", ENGINE_HOST, "--port", String(ENGINE_PORT)];

  // ---- RELEASE (.exe) example:
  const engineCmd = path.join(process.resourcesPath, "engine", "volumia-engine.exe");
  const engineArgs = ["--host", ENGINE_HOST, "--port", String(ENGINE_PORT)];

  engineProc = spawn(engineCmd, engineArgs, {
    stdio: "pipe",
    windowsHide: true,
  });

  engineProc.stdout.on("data", (d) => console.log("[engine]", d.toString()));
  engineProc.stderr.on("data", (d) => console.error("[engine:err]", d.toString()));
  engineProc.on("exit", (code) => console.log("[engine] exited", code));

  // Wait until health responds (max ~10s)
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    // eslint-disable-next-line no-await-in-loop
    const alive = await checkHealth(800);
    if (alive) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 400));
  }

  console.warn("Engine did not become healthy in time.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    backgroundColor: "#f0ede7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // build output
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ Dev (Vite)
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // ✅ Prod
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", async () => {
  // Optional: auto-start engine
  await ensureEngineRunning();

  createWindow();
});

app.on("window-all-closed", () => {
  // On Windows/Linux, quit when all windows closed
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // Gracefully stop engine if we started it
  if (engineProc && !engineProc.killed) {
    try {
      engineProc.kill();
    } catch {}
  }
});

/**
 * IPC: open file picker for images
 */
ipcMain.handle("volumia:selectImages", async () => {
  const res = await dialog.showOpenDialog({
    title: "Select image(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (res.canceled) return { canceled: true, paths: [] as string[] };
  return { canceled: false, paths: res.filePaths };
});

/**
 * IPC: open outputs folder (or any folder)
 */
ipcMain.handle("volumia:openFolder", async (_evt, folderPath: string) => {
  if (!folderPath) return { ok: false };
  await shell.openPath(folderPath);
  return { ok: true };
});
