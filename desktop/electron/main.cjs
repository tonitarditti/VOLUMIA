const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let mainWindow = null;
let engineProc = null;

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 7860;
const ENGINE_HEALTH_URL = `http://${ENGINE_HOST}:${ENGINE_PORT}/health`;

function checkHealth(timeoutMs = 800) {
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

async function ensureEngineRunning() {
  if (!app.isPackaged) return;

  const ok = await checkHealth();
  if (ok) return;

  const engineCmd = path.join(process.resourcesPath, "engine", "volumia-engine.exe");
  const engineArgs = ["--host", ENGINE_HOST, "--port", String(ENGINE_PORT)];

  engineProc = spawn(engineCmd, engineArgs, {
    stdio: "pipe",
    windowsHide: true,
  });

  engineProc.on("error", (err) => console.error("[engine:error]", err.message));
  engineProc.stdout.on("data", (d) => console.log("[engine]", d.toString()));
  engineProc.stderr.on("data", (d) => console.error("[engine:err]", d.toString()));
  engineProc.on("exit", (code) => console.log("[engine] exited", code));

  const start = Date.now();
  while (Date.now() - start < 10_000) {
    const alive = await checkHealth(800);
    if (alive) return;
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureEngineRunning();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (engineProc && !engineProc.killed) {
    try {
      engineProc.kill();
    } catch {
      // no-op
    }
  }
});

ipcMain.handle("volumia:selectImages", async () => {
  const res = await dialog.showOpenDialog({
    title: "Select image(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (res.canceled) return { canceled: true, paths: [] };
  return { canceled: false, paths: res.filePaths };
});

ipcMain.handle("volumia:openFolder", async (_evt, folderPath) => {
  if (!folderPath) return { ok: false };
  await shell.openPath(folderPath);
  return { ok: true };
});
