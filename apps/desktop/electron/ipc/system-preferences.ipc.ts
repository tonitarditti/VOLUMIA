import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { IPC_CHANNELS, type Theme } from "../channels";

type WindowGetter = () => BrowserWindow | null;

function getSystemTheme(): Theme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function registerSystemPreferencesHandlers(getWindow: WindowGetter) {
  ipcMain.handle(IPC_CHANNELS.getSystemLocale, () => {
    return app.getLocale();
  });

  ipcMain.handle(IPC_CHANNELS.getSystemTheme, () => {
    return getSystemTheme();
  });

  const handleThemeUpdate = () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(IPC_CHANNELS.systemThemeChanged, {
      theme: getSystemTheme(),
    });
  };

  nativeTheme.on("updated", handleThemeUpdate);

  return () => {
    nativeTheme.off("updated", handleThemeUpdate);
  };
}

