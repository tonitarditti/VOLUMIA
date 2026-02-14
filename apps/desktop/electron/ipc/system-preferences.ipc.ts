import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { IPC_CHANNELS, type ClearCacheResult, type Theme } from "../channels";

type WindowGetter = () => BrowserWindow | null;
type CacheFolderName = "Cache" | "Code Cache" | "GPUCache" | "DawnCache" | "ShaderCache";
type CacheClearMarkerPayload = {
  folders: CacheFolderName[];
};

const CACHE_FOLDERS: readonly CacheFolderName[] = ["Cache", "Code Cache", "GPUCache", "DawnCache", "ShaderCache"];
const CLEAR_CACHE_MARKER_FILE = "__clear_cache_on_next_start__.json";

function getSystemTheme(): Theme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function isCacheFolderName(value: string): value is CacheFolderName {
  return (CACHE_FOLDERS as readonly string[]).includes(value);
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unknown error";
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) {
      return maybeCode;
    }
  }
  return undefined;
}

function isRetryableCacheError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EBUSY" || code === "EPERM";
}

function clearAllowedCacheFolders(
  userDataPath: string,
  folders: readonly CacheFolderName[],
  scheduleLockedFolders: boolean
): ClearCacheResult {
  const deleted: string[] = [];
  const missing: string[] = [];
  const errors: ClearCacheResult["errors"] = [];
  const retryOnNextStart: CacheFolderName[] = [];

  for (const folderName of folders) {
    const folderPath = path.join(userDataPath, folderName);
    if (!existsSync(folderPath)) {
      missing.push(folderName);
      continue;
    }

    try {
      rmSync(folderPath, { recursive: true, force: true });
      deleted.push(folderName);
    } catch (error) {
      errors.push({
        name: folderName,
        message: extractErrorMessage(error),
      });

      if (scheduleLockedFolders && isRetryableCacheError(error)) {
        retryOnNextStart.push(folderName);
      }
    }
  }

  if (scheduleLockedFolders && retryOnNextStart.length > 0) {
    const markerPath = path.join(userDataPath, CLEAR_CACHE_MARKER_FILE);
    try {
      const markerPayload: CacheClearMarkerPayload = { folders: retryOnNextStart };
      writeFileSync(markerPath, JSON.stringify(markerPayload, null, 2), "utf-8");
      errors.push({
        name: CLEAR_CACHE_MARKER_FILE,
        message: "Some cache files were in use and were scheduled for deletion on next start.",
      });
    } catch (error) {
      errors.push({
        name: CLEAR_CACHE_MARKER_FILE,
        message: `Failed to create retry marker: ${extractErrorMessage(error)}`,
      });
    }
  } else if (scheduleLockedFolders) {
    const markerPath = path.join(userDataPath, CLEAR_CACHE_MARKER_FILE);
    if (existsSync(markerPath)) {
      try {
        unlinkSync(markerPath);
      } catch {
        // best effort
      }
    }
  }

  return {
    deleted,
    missing,
    errors,
  };
}

export function processPendingCacheClearOnStart() {
  const userDataPath = app.getPath("userData");
  const markerPath = path.join(userDataPath, CLEAR_CACHE_MARKER_FILE);
  if (!existsSync(markerPath)) {
    return;
  }

  let foldersToDelete: CacheFolderName[] = [...CACHE_FOLDERS];

  try {
    const raw = readFileSync(markerPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CacheClearMarkerPayload>;
    if (Array.isArray(parsed.folders)) {
      const filtered = parsed.folders.filter((entry): entry is CacheFolderName => {
        return typeof entry === "string" && isCacheFolderName(entry);
      });
      foldersToDelete = filtered.length > 0 ? filtered : foldersToDelete;
    }
  } catch {
    // Keep fallback list if marker cannot be parsed.
  }

  const result = clearAllowedCacheFolders(userDataPath, foldersToDelete, false);
  if (result.errors.length > 0) {
    return;
  }

  try {
    unlinkSync(markerPath);
  } catch {
    // best effort
  }
}

export function registerSystemPreferencesHandlers(getWindow: WindowGetter) {
  ipcMain.handle(IPC_CHANNELS.getSystemLocale, () => {
    return app.getLocale();
  });

  ipcMain.handle(IPC_CHANNELS.getSystemTheme, () => {
    return getSystemTheme();
  });

  ipcMain.handle(IPC_CHANNELS.getUserDataPath, () => {
    return app.getPath("userData");
  });

  ipcMain.handle(IPC_CHANNELS.openUserDataFolder, async () => {
    const userData = app.getPath("userData");
    await shell.openPath(userData);
    return userData;
  });

  ipcMain.handle(IPC_CHANNELS.clearCache, (): ClearCacheResult => {
    const userDataPath = app.getPath("userData");
    return clearAllowedCacheFolders(userDataPath, CACHE_FOLDERS, true);
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
