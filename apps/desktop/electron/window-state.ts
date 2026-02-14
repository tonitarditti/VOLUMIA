import { app, screen, type BrowserWindow } from "electron";
import { dirname, join } from "path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import type { BrowserWindowConstructorOptions, Rectangle } from "electron";
import type { WindowBounds, WindowMode, WindowStateSnapshot } from "./channels";

type PersistedWindowState = {
  schemaVersion: 2;
  mode: WindowMode;
  rememberWindowBounds: boolean;
  hasSavedBounds: boolean;
  bounds: WindowBounds;
};

const MIN_WIDTH = 1180;
const MIN_HEIGHT = 760;

function defaultCenteredBounds() {
  const display = screen.getPrimaryDisplay();
  const width = Math.round(Math.min(1280, display.workAreaSize.width * 0.9));
  const height = Math.round(Math.min(800, display.workAreaSize.height * 0.9));

  return {
    x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.round((display.workArea.height - height) / 2),
    width,
    height,
  } as WindowBounds;
}

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  schemaVersion: 2,
  mode: "windowed",
  rememberWindowBounds: true,
  hasSavedBounds: false,
  bounds: defaultCenteredBounds(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function parseWindowMode(value: unknown): WindowMode | null {
  if (value === "remember") {
    return "windowed";
  }

  return value === "windowed" || value === "maximized" || value === "fullscreen" ? value : null;
}

function sanitizeBounds(bounds: unknown): WindowBounds {
  const fallback = defaultCenteredBounds();
  if (!isRecord(bounds)) return fallback;

  const width = toInteger(bounds.width);
  const height = toInteger(bounds.height);
  const x = toInteger(bounds.x);
  const y = toInteger(bounds.y);

  return {
    x: x ?? fallback.x,
    y: y ?? fallback.y,
    width: width && width >= MIN_WIDTH ? width : fallback.width,
    height: height && height >= MIN_HEIGHT ? height : fallback.height,
  };
}

function sanitizeWindowState(input: unknown): PersistedWindowState {
  if (!isRecord(input) || (input.schemaVersion !== 1 && input.schemaVersion !== 2)) {
    return { ...DEFAULT_WINDOW_STATE, bounds: { ...DEFAULT_WINDOW_STATE.bounds } };
  }

  const hasSavedBounds =
    typeof input.hasSavedBounds === "boolean"
      ? input.hasSavedBounds
      : Boolean(input.bounds);

  return {
    schemaVersion: 2,
    mode: parseWindowMode(input.mode) ?? DEFAULT_WINDOW_STATE.mode,
    rememberWindowBounds:
      typeof input.rememberWindowBounds === "boolean"
        ? input.rememberWindowBounds
        : DEFAULT_WINDOW_STATE.rememberWindowBounds,
    hasSavedBounds,
    bounds: sanitizeBounds(input.bounds),
  };
}

function toWindowBounds(bounds: Rectangle): WindowBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function stateFilePath() {
  return join(app.getPath("userData"), "window-state.json");
}

function centeredBoundsForWindow(window: BrowserWindow): WindowBounds {
  const display = screen.getDisplayMatching(window.getBounds());
  const width = Math.round(Math.min(1280, display.workAreaSize.width * 0.9));
  const height = Math.round(Math.min(800, display.workAreaSize.height * 0.9));

  return {
    x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.round((display.workArea.height - height) / 2),
    width,
    height,
  };
}

export type WindowStateController = {
  getLaunchBounds: () => Pick<BrowserWindowConstructorOptions, "x" | "y" | "width" | "height">;
  applyLaunchMode: (window: BrowserWindow) => void;
  attachTracking: (window: BrowserWindow) => void;
  setMode: (mode: WindowMode, window: BrowserWindow | null) => WindowStateSnapshot;
  setRememberWindowBounds: (remember: boolean, window: BrowserWindow | null) => WindowStateSnapshot;
  getState: (window: BrowserWindow | null) => WindowStateSnapshot;
  resetLayout: (window: BrowserWindow | null) => WindowStateSnapshot;
};

export function createWindowStateController(): WindowStateController {
  const filePath = stateFilePath();

  const load = (): PersistedWindowState => {
    if (!existsSync(filePath)) {
      return { ...DEFAULT_WINDOW_STATE, bounds: { ...DEFAULT_WINDOW_STATE.bounds } };
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      return sanitizeWindowState(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_WINDOW_STATE, bounds: { ...DEFAULT_WINDOW_STATE.bounds } };
    }
  };

  let persisted = load();

  const save = () => {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(persisted, null, 2), "utf-8");
    } catch {
      // best effort
    }
  };

  const captureWindowedBounds = (window: BrowserWindow) => {
    if (!persisted.rememberWindowBounds || window.isMaximized() || window.isFullScreen()) {
      return;
    }

    persisted.bounds = sanitizeBounds(toWindowBounds(window.getBounds()));
    persisted.hasSavedBounds = true;
  };

  const applyBaseBounds = (window: BrowserWindow) => {
    if (persisted.rememberWindowBounds && persisted.hasSavedBounds) {
      window.setBounds(sanitizeBounds(persisted.bounds));
      return;
    }

    const bounds = centeredBoundsForWindow(window);
    window.setBounds(bounds);
    window.center();
  };

  const applyModeToWindow = (mode: WindowMode, window: BrowserWindow) => {
    if (mode === "fullscreen") {
      window.setFullScreen(true);
      return;
    }

    window.setFullScreen(false);

    if (mode === "maximized") {
      window.maximize();
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
    }
  };

  const toSnapshot = (window: BrowserWindow | null): WindowStateSnapshot => {
    if (window && !window.isDestroyed()) {
      const bounds = toWindowBounds(window.getBounds());
      return {
        bounds: sanitizeBounds(bounds),
        isMaximized: window.isMaximized(),
        isFullScreen: window.isFullScreen(),
        mode: persisted.mode,
        rememberWindowBounds: persisted.rememberWindowBounds,
      };
    }

    return {
      bounds: sanitizeBounds(persisted.bounds),
      isMaximized: false,
      isFullScreen: false,
      mode: persisted.mode,
      rememberWindowBounds: persisted.rememberWindowBounds,
    };
  };

  return {
    getLaunchBounds: () => {
      const bounds =
        persisted.rememberWindowBounds && persisted.hasSavedBounds
          ? sanitizeBounds(persisted.bounds)
          : defaultCenteredBounds();

      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    applyLaunchMode: (window) => {
      applyBaseBounds(window);
      applyModeToWindow(persisted.mode, window);
    },
    attachTracking: (window) => {
      const persistWhenNeeded = () => {
        if (window.isDestroyed()) {
          return;
        }

        captureWindowedBounds(window);
        save();
      };

      window.on("resize", persistWhenNeeded);
      window.on("move", persistWhenNeeded);
      window.on("unmaximize", persistWhenNeeded);
      window.on("leave-full-screen", persistWhenNeeded);
      window.on("close", persistWhenNeeded);
    },
    setMode: (mode, window) => {
      persisted.mode = mode;
      if (window && !window.isDestroyed()) {
        applyModeToWindow(mode, window);
        captureWindowedBounds(window);
      }
      save();
      return toSnapshot(window);
    },
    setRememberWindowBounds: (remember, window) => {
      persisted.rememberWindowBounds = remember;

      if (window && !window.isDestroyed()) {
        captureWindowedBounds(window);
      }

      save();
      return toSnapshot(window);
    },
    getState: (window) => {
      return toSnapshot(window);
    },
    resetLayout: (window) => {
      persisted.hasSavedBounds = false;
      persisted.bounds = defaultCenteredBounds();

      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch {
        // best effort
      }

      if (window && !window.isDestroyed()) {
        window.setFullScreen(false);
        if (window.isMaximized()) {
          window.unmaximize();
        }

        const bounds = centeredBoundsForWindow(window);
        window.setBounds(bounds);
        window.center();
      }

      save();
      return toSnapshot(window);
    },
  };
}
