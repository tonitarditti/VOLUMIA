import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC_CHANNELS, type RememberWindowBoundsPayload, type WindowModePayload } from "../channels";
import type { WindowStateController } from "../window-state";

type WindowGetter = () => BrowserWindow | null;

export function registerWindowSettingsHandlers(getWindow: WindowGetter, windowState: WindowStateController) {
  ipcMain.handle(IPC_CHANNELS.setWindowMode, (_event, payload: WindowModePayload) => {
    if (!payload || (payload.mode !== "remember" && payload.mode !== "maximized" && payload.mode !== "fullscreen")) {
      return windowState.getState(getWindow());
    }
    return windowState.setMode(payload.mode, getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.setWindowBoundsRemember, (_event, payload: RememberWindowBoundsPayload) => {
    if (!payload || typeof payload.remember !== "boolean") {
      return windowState.getState(getWindow());
    }
    return windowState.setRememberWindowBounds(payload.remember, getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.getWindowState, () => {
    return windowState.getState(getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.resetWindowLayout, () => {
    return windowState.resetLayout(getWindow());
  });
}
