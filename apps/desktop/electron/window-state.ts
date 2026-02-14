import { app, type BrowserWindow } from "electron";
import { dirname, join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { BrowserWindowConstructorOptions, Rectangle } from "electron";
import type { WindowBounds, WindowMode, WindowStateSnapshot } from "./channels";

type PersistedWindowState = {
  schemaVersion: 1;
  mode: WindowMode;
  rememberWindowBounds: boolean;
  bounds: WindowBounds;
  isMaximized: boolean;
  isFullScreen: boolean;
};

const DEFAULT_BOUNDS: WindowBounds = {
  x: 100,
  y: 80,
  width: 1520,
  height: 940,
};

const MIN_WIDTH = 1180;
const MIN_HEIGHT = 760;

const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  schemaVersion: 1,
  mode: "remember",
  rememberWindowBounds: true,
  bounds: DEFAULT_BOUNDS,
  isMaximized: false,
  isFullScreen: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function parseWindowMode(value: unknown): WindowMode | null {
  return value === "remember" || value === "maximized" || value === "fullscreen" ? value : null;
}

function sanitizeBounds(bounds: unknown): WindowBounds {
  if (!isRecord(bounds)) return { ...DEFAULT_BOUNDS };

  const width = toInteger(bounds.width);
  const height = toInteger(bounds.height);
  const x = toInteger(bounds.x);
  const y = toInteger(bounds.y);

  return {
    x: x ?? DEFAULT_BOUNDS.x,
    y: y ?? DEFAULT_BOUNDS.y,
    width: width && width >= MIN_WIDTH ? width : DEFAULT_BOUNDS.width,
    height: height && height >= MIN_HEIGHT ? height : DEFAULT_BOUNDS.height,
  };
}

function sanitizeWindowState(input: unknown): PersistedWindowState {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    return { ...DEFAULT_WINDOW_STATE };
  }

  return {
    schemaVersion: 1,
    mode: parseWindowMode(input.mode) ?? DEFAULT_WINDOW_STATE.mode,
    rememberWindowBounds:
      typeof input.rememberWindowBounds === "boolean"
        ? input.rememberWindowBounds
        : DEFAULT_WINDOW_STATE.rememberWindowBounds,
    bounds: sanitizeBounds(input.bounds),
    isMaximized: typeof input.isMaximized === "boolean" ? input.isMaximized : DEFAULT_WINDOW_STATE.isMaximized,
    isFullScreen: typeof input.isFullScreen === "boolean" ? input.isFullScreen : DEFAULT_WINDOW_STATE.isFullScreen,
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
    if (!existsSync(filePath)) return { ...DEFAULT_WINDOW_STATE };

    try {
      const raw = readFileSync(filePath, "utf-8");
      return sanitizeWindowState(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_WINDOW_STATE };
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

  const captureFromWindow = (window: BrowserWindow) => {
    const currentBounds = toWindowBounds(window.getBounds());

    if (!window.isMaximized() && !window.isFullScreen()) {
      persisted.bounds = sanitizeBounds(currentBounds);
    }

    persisted.isMaximized = window.isMaximized();
    persisted.isFullScreen = window.isFullScreen();
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
      isMaximized: persisted.isMaximized,
      isFullScreen: persisted.isFullScreen,
      mode: persisted.mode,
      rememberWindowBounds: persisted.rememberWindowBounds,
    };
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

    if (persisted.rememberWindowBounds) {
      window.setBounds(sanitizeBounds(persisted.bounds));
    }
  };

  return {
    getLaunchBounds: () => {
      const bounds = sanitizeBounds(persisted.bounds);
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    applyLaunchMode: (window) => {
      if (persisted.mode === "remember") {
        if (persisted.isFullScreen) {
          window.setFullScreen(true);
        } else if (persisted.isMaximized) {
          window.maximize();
        }
        return;
      }

      applyModeToWindow(persisted.mode, window);
    },
    attachTracking: (window) => {
      const persistWhenNeeded = () => {
        if (!persisted.rememberWindowBounds || window.isDestroyed()) {
          return;
        }

        captureFromWindow(window);
        save();
      };

      window.on("resize", persistWhenNeeded);
      window.on("move", persistWhenNeeded);
      window.on("maximize", persistWhenNeeded);
      window.on("unmaximize", persistWhenNeeded);
      window.on("enter-full-screen", persistWhenNeeded);
      window.on("leave-full-screen", persistWhenNeeded);
      window.on("close", persistWhenNeeded);
    },
    setMode: (mode, window) => {
      persisted.mode = mode;
      if (window && !window.isDestroyed()) {
        applyModeToWindow(mode, window);
        captureFromWindow(window);
      }
      save();
      return toSnapshot(window);
    },
    setRememberWindowBounds: (remember, window) => {
      persisted.rememberWindowBounds = remember;

      if (window && !window.isDestroyed() && remember) {
        captureFromWindow(window);
      }

      save();
      return toSnapshot(window);
    },
    getState: (window) => {
      return toSnapshot(window);
    },
    resetLayout: (window) => {
      persisted = { ...DEFAULT_WINDOW_STATE, bounds: { ...DEFAULT_BOUNDS } };

      if (window && !window.isDestroyed()) {
        window.setFullScreen(false);
        if (window.isMaximized()) {
          window.unmaximize();
        }

        window.setBounds(DEFAULT_BOUNDS);
        window.center();
        captureFromWindow(window);
      }

      save();
      return toSnapshot(window);
    },
  };
}
