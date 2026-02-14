import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC_CHANNELS, type RememberWindowBoundsPayload, type WindowModePayload } from "../channels";
import type { WindowStateController } from "../window-state";

type WindowGetter = () => BrowserWindow | null;

export function registerWindowSettingsHandlers(getWindow: WindowGetter, windowState: WindowStateController) {
  ipcMain.handle(IPC_CHANNELS.setWindowMode, (_event, payload: WindowModePayload) => {
    return windowState.setMode(payload.mode, getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.setWindowBoundsRemember, (_event, payload: RememberWindowBoundsPayload) => {
    return windowState.setRememberWindowBounds(payload.remember, getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.getWindowState, () => {
    return windowState.getState(getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.resetWindowLayout, () => {
    return windowState.resetLayout(getWindow());
  });
}
