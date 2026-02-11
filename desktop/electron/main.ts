import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f2ede5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("volumia:selectImages", async () => {
  const selection = await dialog.showOpenDialog({
    title: "Select reference images",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });

  return selection.canceled ? [] : selection.filePaths;
});

ipcMain.handle("volumia:openFolder", async (_event, folderPath: string) => {
  if (!folderPath) return false;
  await shell.openPath(folderPath);
  return true;
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
