import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../channels";

type WindowGetter = () => BrowserWindow | null;

export function registerWindowControlHandlers(getWindow: WindowGetter) {
  ipcMain.handle(IPC_CHANNELS.minimizeWindow, () => {
    const window = getWindow();
    if (!window) return false;
    window.minimize();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, () => {
    const window = getWindow();
    if (!window) return false;

    if (window.isMaximized()) {
      window.unmaximize();
      return false;
    }

    window.maximize();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.closeWindow, () => {
    const window = getWindow();
    if (!window) return false;
    window.close();
    return true;
  });
}
