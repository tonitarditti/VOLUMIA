import fs from "fs";
import os from "os";
import path from "path";

type ElectronAppLike = {
  getPath: (name: string) => string;
  isReady?: () => boolean;
};

let cachedUserDataRoot: string | null = null;

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function tryGetElectronUserDataDir(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { app?: ElectronAppLike };
    const electronApp = electron?.app;
    if (!electronApp) {
      return null;
    }
    return electronApp.getPath("userData");
  } catch {
    return null;
  }
}

function resolveFallbackUserDataDir() {
  const runtimeRoot = process.env.VOLUMIA_RUNTIME_DIR?.trim();
  if (runtimeRoot) {
    return path.join(runtimeRoot, "userData");
  }
  const appData = process.env.APPDATA?.trim();
  if (appData) {
    return appData;
  }
  return path.join(os.homedir(), "AppData", "Roaming");
}

function resolveBaseUserDataDir() {
  return tryGetElectronUserDataDir() ?? resolveFallbackUserDataDir();
}

function resolveBackendRootCandidates() {
  return [
    path.resolve(process.cwd(), "backend"),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", "..", "backend"),
  ];
}

function resolveExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? process.cwd();
}

export function getUserDataRoot() {
  if (cachedUserDataRoot) {
    return cachedUserDataRoot;
  }

  const baseUserDataDir = resolveBaseUserDataDir();
  const root = baseUserDataDir;
  ensureDir(root);
  ensureDir(path.join(root, "config"));
  ensureDir(path.join(root, "state"));
  ensureDir(path.join(root, "projects"));
  ensureDir(path.join(root, "models"));
  ensureDir(path.join(root, "workflows"));
  ensureDir(path.join(root, "outputs"));
  ensureDir(path.join(root, "logs"));
  cachedUserDataRoot = root;
  return root;
}

export function getModelsDir() {
  const dir = path.join(getUserDataRoot(), "models");
  ensureDir(dir);
  return dir;
}

export function getWorkflowsDir() {
  const dir = path.join(getUserDataRoot(), "workflows");
  ensureDir(dir);
  return dir;
}

export function getOutputsDir() {
  const dir = path.join(getUserDataRoot(), "outputs");
  ensureDir(dir);
  return dir;
}

export function getLogsDir() {
  const dir = path.join(getUserDataRoot(), "logs");
  ensureDir(dir);
  return dir;
}

export function getRepoWorkflowDir() {
  const backendRoot = resolveExistingPath(resolveBackendRootCandidates());
  return path.join(backendRoot, "workflows");
}

export function getRepoConfigDir() {
  const backendRoot = resolveExistingPath(resolveBackendRootCandidates());
  return path.join(backendRoot, "config");
}

export function getBackendRootDir() {
  return resolveExistingPath(resolveBackendRootCandidates());
}

