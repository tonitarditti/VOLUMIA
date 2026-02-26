import fs from "fs";
import path from "path";
import { getRepoConfigDir } from "./paths";

export type ComfyRuntimeConfig = {
  host: string;
  port: number;
  rootDir: string;
  pythonExe: string;
  args: string[];
  startupTimeoutMs: number;
};

export type BackendRuntimeConfig = {
  comfy: ComfyRuntimeConfig;
};

const DEFAULT_CONFIG: BackendRuntimeConfig = {
  comfy: {
    host: "127.0.0.1",
    port: 8188,
    rootDir: "C:\\AI\\ComfyUI_VOL",
    pythonExe: "F:\\MINICONDA\\envs\\volumia\\python.exe",
    args: ["main.py", "--listen", "127.0.0.1", "--port", "8188"],
    startupTimeoutMs: 60_000,
  },
};

let cachedConfig: BackendRuntimeConfig | null = null;

function ensureValidComfyConfig(config: ComfyRuntimeConfig) {
  if (!config.host || typeof config.host !== "string") {
    throw new Error("config.comfy.host invalido.");
  }
  if (!Number.isFinite(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error("config.comfy.port invalido.");
  }
  if (!config.rootDir || typeof config.rootDir !== "string") {
    throw new Error("config.comfy.rootDir invalido.");
  }
  if (!config.pythonExe || typeof config.pythonExe !== "string") {
    throw new Error("config.comfy.pythonExe invalido.");
  }
  if (!Array.isArray(config.args) || config.args.length === 0 || config.args.some((arg) => typeof arg !== "string")) {
    throw new Error("config.comfy.args invalido.");
  }
  if (!Number.isFinite(config.startupTimeoutMs) || config.startupTimeoutMs < 1_000) {
    throw new Error("config.comfy.startupTimeoutMs invalido.");
  }
}

function mergeConfig(rawConfig: unknown): BackendRuntimeConfig {
  if (!rawConfig || typeof rawConfig !== "object") {
    return DEFAULT_CONFIG;
  }

  const root = rawConfig as Record<string, unknown>;
  const rawComfy = (root.comfy ?? {}) as Record<string, unknown>;

  const merged: BackendRuntimeConfig = {
    comfy: {
      host: typeof rawComfy.host === "string" ? rawComfy.host : DEFAULT_CONFIG.comfy.host,
      port: typeof rawComfy.port === "number" ? rawComfy.port : DEFAULT_CONFIG.comfy.port,
      rootDir: typeof rawComfy.rootDir === "string" ? rawComfy.rootDir : DEFAULT_CONFIG.comfy.rootDir,
      pythonExe: typeof rawComfy.pythonExe === "string" ? rawComfy.pythonExe : DEFAULT_CONFIG.comfy.pythonExe,
      args:
        Array.isArray(rawComfy.args) && rawComfy.args.every((item) => typeof item === "string")
          ? (rawComfy.args as string[])
          : DEFAULT_CONFIG.comfy.args,
      startupTimeoutMs:
        typeof rawComfy.startupTimeoutMs === "number"
          ? rawComfy.startupTimeoutMs
          : DEFAULT_CONFIG.comfy.startupTimeoutMs,
    },
  };

  ensureValidComfyConfig(merged.comfy);
  return merged;
}

export function getBackendConfigPath() {
  return path.join(getRepoConfigDir(), "default.json");
}

export function loadBackendConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const configPath = getBackendConfigPath();
  if (!fs.existsSync(configPath)) {
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }

  const rawText = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(rawText) as unknown;
  cachedConfig = mergeConfig(parsed);
  return cachedConfig;
}

export function getComfyBaseUrl(config = loadBackendConfig()) {
  return `http://${config.comfy.host}:${config.comfy.port}`;
}

