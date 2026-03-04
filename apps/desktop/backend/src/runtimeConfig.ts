import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { getRepoConfigDir, getUserDataRoot } from "./paths";

export type ComfyRuntimeConfig = {
  host: string;
  port: number;
  baseUrl: string;
  comfyDir: string;
  condaHook: string;
  condaEnvName: string;
  pythonExeOverride: string;
  args: string[];
  startupTimeoutMs: number;
};

export type BackendRuntimeConfig = {
  comfy: ComfyRuntimeConfig;
};

export type ComfyLaunchPlan = {
  command: string;
  args: string[];
  cwd: string;
  mode: "python-direct" | "conda-activate";
  details: string;
};

type PartialComfyConfig = Partial<ComfyRuntimeConfig>;

const DEFAULT_CONFIG: BackendRuntimeConfig = {
  comfy: {
    host: "127.0.0.1",
    port: 8188,
    baseUrl: "http://127.0.0.1:8188",
    comfyDir: "C:\\AI\\ComfyUI_VOL",
    condaHook: "C:\\ProgramData\\miniconda3\\Scripts\\activate.bat",
    condaEnvName: "volumia",
    pythonExeOverride: "",
    args: ["main.py", "--listen", "127.0.0.1", "--port", "8188"],
    startupTimeoutMs: 90_000,
  },
};

let cachedConfig: BackendRuntimeConfig | null = null;

function readJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const rawText = fs.readFileSync(filePath, "utf8");
  return JSON.parse(rawText) as unknown;
}

function normalizePort(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 65535) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeBaseUrl(host: string, port: number, maybeBaseUrl?: string) {
  if (typeof maybeBaseUrl === "string" && maybeBaseUrl.trim().length > 0) {
    try {
      const parsed = new URL(maybeBaseUrl);
      const parsedHost = parsed.hostname || host;
      const parsedPort = normalizePort(parsed.port, port);
      return {
        host: parsedHost,
        port: parsedPort,
        baseUrl: `${parsed.protocol}//${parsedHost}:${parsedPort}`,
      };
    } catch {
      // Fallback to host/port below.
    }
  }
  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
  };
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function pickStringArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value as string[];
    }
  }
  return [] as string[];
}

function normalizeLegacyComfyConfig(rawComfy: Record<string, unknown>): PartialComfyConfig {
  return {
    host: typeof rawComfy.host === "string" ? rawComfy.host : undefined,
    port: normalizePort(rawComfy.port, DEFAULT_CONFIG.comfy.port),
    baseUrl: typeof rawComfy.baseUrl === "string" ? rawComfy.baseUrl : undefined,
    comfyDir: typeof rawComfy.rootDir === "string" ? rawComfy.rootDir : undefined,
    pythonExeOverride: typeof rawComfy.pythonExe === "string" ? rawComfy.pythonExe : undefined,
    args: Array.isArray(rawComfy.args) ? (rawComfy.args as string[]) : undefined,
    startupTimeoutMs:
      typeof rawComfy.startupTimeoutMs === "number" ? Math.max(1_000, Math.floor(rawComfy.startupTimeoutMs)) : undefined,
  };
}

function normalizeCurrentComfyConfig(rawComfy: Record<string, unknown>): PartialComfyConfig {
  return {
    host: typeof rawComfy.host === "string" ? rawComfy.host : undefined,
    port: normalizePort(rawComfy.port, DEFAULT_CONFIG.comfy.port),
    baseUrl: typeof rawComfy.baseUrl === "string" ? rawComfy.baseUrl : undefined,
    comfyDir: typeof rawComfy.comfyDir === "string" ? rawComfy.comfyDir : undefined,
    condaHook: typeof rawComfy.condaHook === "string" ? rawComfy.condaHook : undefined,
    condaEnvName: typeof rawComfy.condaEnvName === "string" ? rawComfy.condaEnvName : undefined,
    pythonExeOverride: typeof rawComfy.pythonExeOverride === "string" ? rawComfy.pythonExeOverride : undefined,
    args: Array.isArray(rawComfy.args) ? (rawComfy.args as string[]) : undefined,
    startupTimeoutMs:
      typeof rawComfy.startupTimeoutMs === "number" ? Math.max(1_000, Math.floor(rawComfy.startupTimeoutMs)) : undefined,
  };
}

function toComfyPartial(rawConfig: unknown) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return {} as PartialComfyConfig;
  }
  const root = rawConfig as Record<string, unknown>;
  const rawComfy = root.comfy;
  if (!rawComfy || typeof rawComfy !== "object") {
    return {} as PartialComfyConfig;
  }
  const comfyRecord = rawComfy as Record<string, unknown>;
  if ("comfyDir" in comfyRecord || "condaHook" in comfyRecord || "condaEnvName" in comfyRecord || "pythonExeOverride" in comfyRecord) {
    return normalizeCurrentComfyConfig(comfyRecord);
  }
  return normalizeLegacyComfyConfig(comfyRecord);
}

function mergeComfyConfig(partials: PartialComfyConfig[]) {
  const merged = { ...DEFAULT_CONFIG.comfy };
  for (const partial of partials) {
    if (partial.host) merged.host = partial.host;
    if (partial.port) merged.port = partial.port;
    if (partial.baseUrl) merged.baseUrl = partial.baseUrl;
    if (partial.comfyDir) merged.comfyDir = partial.comfyDir;
    if (partial.condaHook) merged.condaHook = partial.condaHook;
    if (partial.condaEnvName) merged.condaEnvName = partial.condaEnvName;
    if (typeof partial.pythonExeOverride === "string") merged.pythonExeOverride = partial.pythonExeOverride;
    if (Array.isArray(partial.args) && partial.args.length > 0) merged.args = [...partial.args];
    if (partial.startupTimeoutMs) merged.startupTimeoutMs = partial.startupTimeoutMs;
  }

  const normalizedHost = merged.host.trim() || DEFAULT_CONFIG.comfy.host;
  const normalizedPort = normalizePort(merged.port, DEFAULT_CONFIG.comfy.port);
  const baseUrlParts = normalizeBaseUrl(normalizedHost, normalizedPort, merged.baseUrl);
  merged.host = baseUrlParts.host;
  merged.port = baseUrlParts.port;
  merged.baseUrl = baseUrlParts.baseUrl;
  merged.args =
    merged.args.length > 0 ? merged.args : ["main.py", "--listen", merged.host, "--port", String(merged.port)];
  merged.startupTimeoutMs = Math.max(1_000, merged.startupTimeoutMs);
  merged.condaEnvName = merged.condaEnvName.trim() || DEFAULT_CONFIG.comfy.condaEnvName;
  return merged;
}

function quoteCmdArg(value: string) {
  if (value.length === 0) {
    return "\"\"";
  }
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function condaHookFromWhereConda() {
  try {
    const probe = spawnSync("where", ["conda"], {
      windowsHide: true,
      shell: false,
      encoding: "utf8",
    });
    const output = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`.trim();
    if (!output) {
      return "";
    }
    const firstPath = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!firstPath) {
      return "";
    }
    const normalized = firstPath.replace(/\//g, "\\");
    const fromCondabin = path.resolve(path.dirname(normalized), "..", "Scripts", "activate.bat");
    if (fs.existsSync(fromCondabin)) {
      return fromCondabin;
    }
  } catch {
    // No-op by design.
  }
  return "";
}

export function detectCondaHookPath() {
  const userProfile = process.env.USERPROFILE?.trim() ?? "";
  const candidates = [
    condaHookFromWhereConda(),
    path.join(userProfile, "miniconda3", "Scripts", "activate.bat"),
    path.join(userProfile, "anaconda3", "Scripts", "activate.bat"),
    "C:\\ProgramData\\miniconda3\\Scripts\\activate.bat",
    "C:\\ProgramData\\anaconda3\\Scripts\\activate.bat",
    "F:\\MINICONDA\\Scripts\\activate.bat",
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function resolveCondaEnvPython(condaHookPath: string, envName: string) {
  if (!condaHookPath || !envName) {
    return "";
  }
  const condaRoot = path.resolve(path.dirname(condaHookPath), "..");
  const pythonPath = path.join(condaRoot, "envs", envName, "python.exe");
  if (fs.existsSync(pythonPath)) {
    return pythonPath;
  }
  return "";
}

function resolveComfyConfig(rawDefault: unknown, rawLegacy: unknown, rawUser: unknown): BackendRuntimeConfig {
  const mergedComfy = mergeComfyConfig([toComfyPartial(rawDefault), toComfyPartial(rawLegacy), toComfyPartial(rawUser)]);
  if (!mergedComfy.condaHook || !fs.existsSync(mergedComfy.condaHook)) {
    mergedComfy.condaHook = detectCondaHookPath();
  }
  return { comfy: mergedComfy };
}

export function getComfyDefaultConfigPath() {
  return path.join(getRepoConfigDir(), "comfy.default.json");
}

export function getLegacyBackendConfigPath() {
  return path.join(getRepoConfigDir(), "default.json");
}

export function getComfyUserConfigPath() {
  return path.join(getUserDataRoot(), "config", "comfy.user.json");
}

export function loadBackendConfig(options?: { reload?: boolean }) {
  if (!options?.reload && cachedConfig) {
    return cachedConfig;
  }
  const rawDefault = readJsonFile(getComfyDefaultConfigPath());
  const rawLegacy = readJsonFile(getLegacyBackendConfigPath());
  const rawUser = readJsonFile(getComfyUserConfigPath());
  cachedConfig = resolveComfyConfig(rawDefault, rawLegacy, rawUser);
  return cachedConfig;
}

export function saveComfyUserConfig(patch: Partial<ComfyRuntimeConfig>) {
  const current = loadBackendConfig({ reload: true });
  const currentPatch: PartialComfyConfig = {
    host: pickString(patch.host),
    port: normalizePort(patch.port, current.comfy.port),
    baseUrl: pickString(patch.baseUrl),
    comfyDir: pickString(patch.comfyDir),
    condaHook: pickString(patch.condaHook),
    condaEnvName: pickString(patch.condaEnvName),
    pythonExeOverride: typeof patch.pythonExeOverride === "string" ? patch.pythonExeOverride : current.comfy.pythonExeOverride,
    args: pickStringArray(patch.args),
    startupTimeoutMs:
      typeof patch.startupTimeoutMs === "number" ? Math.max(1_000, Math.floor(patch.startupTimeoutMs)) : current.comfy.startupTimeoutMs,
  };

  const merged = resolveComfyConfig(current, null, { comfy: currentPatch });
  const userConfigPath = getComfyUserConfigPath();
  fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
  fs.writeFileSync(
    userConfigPath,
    `${JSON.stringify(
      {
        comfy: {
          host: merged.comfy.host,
          port: merged.comfy.port,
          baseUrl: merged.comfy.baseUrl,
          comfyDir: merged.comfy.comfyDir,
          condaHook: merged.comfy.condaHook,
          condaEnvName: merged.comfy.condaEnvName,
          pythonExeOverride: merged.comfy.pythonExeOverride,
          args: merged.comfy.args,
          startupTimeoutMs: merged.comfy.startupTimeoutMs,
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  cachedConfig = merged;
  return merged;
}

export function getComfyBaseUrl(config = loadBackendConfig()) {
  return config.comfy.baseUrl;
}

export function resolveComfyLaunchPlan(config = loadBackendConfig()): ComfyLaunchPlan {
  const pythonOverride = config.comfy.pythonExeOverride.trim();
  if (pythonOverride && fs.existsSync(pythonOverride)) {
    return {
      mode: "python-direct",
      command: pythonOverride,
      args: [...config.comfy.args],
      cwd: config.comfy.comfyDir,
      details: `pythonExeOverride=${pythonOverride}`,
    };
  }

  const condaEnvPython = resolveCondaEnvPython(config.comfy.condaHook, config.comfy.condaEnvName);
  if (condaEnvPython) {
    return {
      mode: "python-direct",
      command: condaEnvPython,
      args: [...config.comfy.args],
      cwd: config.comfy.comfyDir,
      details: `conda-env-python=${condaEnvPython}`,
    };
  }

  const condaHook = config.comfy.condaHook.trim();
  if (!condaHook || !fs.existsSync(condaHook)) {
    throw new Error(
      [
        "No se encontro condaHook para iniciar ComfyUI.",
        `Config esperado: ${getComfyDefaultConfigPath()}`,
        "Define comfy.pythonExeOverride o instala/expone activate.bat (miniconda/anaconda).",
      ].join("\n")
    );
  }

  const cmdExe = process.env.ComSpec?.trim() || "C:\\Windows\\System32\\cmd.exe";
  const pythonCommand = ["python", ...config.comfy.args].map(quoteCmdArg).join(" ");
  const commandLine = `call ${quoteCmdArg(condaHook)} ${quoteCmdArg(config.comfy.condaEnvName)} && ${pythonCommand}`;
  return {
    mode: "conda-activate",
    command: cmdExe,
    args: ["/d", "/s", "/c", commandLine],
    cwd: config.comfy.comfyDir,
    details: `condaHook=${condaHook}; env=${config.comfy.condaEnvName}`,
  };
}
