"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let mainWindow = null;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1360,
        height: 880,
        minWidth: 1100,
        minHeight: 760,
        backgroundColor: "#f2ede5",
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    if (electron_1.app.isPackaged) {
        void mainWindow.loadFile(path_1.default.join(__dirname, "../dist/index.html"));
    }
    else {
        void mainWindow.loadURL(DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
electron_1.ipcMain.handle("volumia:selectImages", async () => {
    const selection = await electron_1.dialog.showOpenDialog({
        title: "Select reference images",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    return selection.canceled ? [] : selection.filePaths;
});
electron_1.ipcMain.handle("volumia:openFolder", async (_event, folderPath) => {
    if (!folderPath)
        return false;
    await electron_1.shell.openPath(folderPath);
    return true;
});
electron_1.app.whenReady().then(() => {
    createMainWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
