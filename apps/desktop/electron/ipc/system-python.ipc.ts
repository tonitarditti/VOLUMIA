import { spawn } from "child_process";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import {
  IPC_CHANNELS,
  type PythonCandidate,
  type PythonCandidateSource,
  type PythonDetectPayload,
  type PythonDetectResult,
  type PythonInstallDonePayload,
  type PythonInstallLogPayload,
  type PythonInstallTorchCudaPayload,
  type PythonInstallTorchCudaResult,
  type PythonProbePayload,
  type PythonProbeResult,
} from "../channels";

type WindowGetter = () => BrowserWindow | null;

type RunCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
};

type RunCommandOptions = {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DETECT_COMMAND_TIMEOUT_MS = 10_000;
const INSTALL_COMMAND_TIMEOUT_MS = 10 * 60_000;
const MAX_CAPTURE_CHARS = 3_000_000;
const DEFAULT_CONDA_PYTHON = "F:\\MINICONDA\\envs\\volumia\\python.exe";
const DEBUG_GENERATION = process.env.VOLUMIA_DEBUG_GENERATION === "1";

const TORCH_PROBE_CODE = [
  "import torch",
  "print(torch.__version__)",
  "print(torch.cuda.is_available())",
  "print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU')",
].join("; ");

function sanitizePath(rawPath: string) {
  const trimmed = rawPath.trim().replace(/^"(.*)"$/, "$1");
  if (!trimmed) {
    return "";
  }
  return path.normalize(path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed));
}

function isExistingFile(filePath: string) {
  if (!filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function truncateAppend(current: string, chunk: string) {
  if (!chunk) return current;
  if (current.length >= MAX_CAPTURE_CHARS) return current;
  const remaining = MAX_CAPTURE_CHARS - current.length;
  if (chunk.length <= remaining) {
    return `${current}${chunk}`;
  }
  return `${current}${chunk.slice(0, remaining)}`;
}

function normalizeDedupeKey(filePath: string) {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function createLineStreamer(onLine?: (line: string) => void) {
  let pending = "";

  return {
    push(chunk: string) {
      if (!onLine || !chunk) return;
      const combined = `${pending}${chunk}`;
      const parts = combined.split(/\r?\n/);
      pending = parts.pop() ?? "";
      for (const part of parts) {
        onLine(part);
      }
    },
    flush() {
      if (!onLine) return;
      if (pending.length > 0) {
        onLine(pending);
      }
      pending = "";
    },
  };
}

function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  return new Promise<RunCommandResult>((resolvePromise) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const stdoutStreamer = createLineStreamer(options.onStdoutLine);
    const stderrStreamer = createLineStreamer(options.onStderrLine);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
      shell: false,
    });

    const settle = (result: RunCommandResult) => {
      if (settled) return;
      settled = true;
      stdoutStreamer.flush();
      stderrStreamer.flush();
      clearTimeout(timeoutId);
      resolvePromise(result);
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (buffer) => {
      const chunk = buffer.toString();
      stdout = truncateAppend(stdout, chunk);
      stdoutStreamer.push(chunk);
    });

    child.stderr?.on("data", (buffer) => {
      const chunk = buffer.toString();
      stderr = truncateAppend(stderr, chunk);
      stderrStreamer.push(chunk);
    });

    child.on("error", (error) => {
      settle({
        code: -1,
        stdout,
        stderr,
        timedOut,
        error: error.message,
      });
    });

    child.on("close", (code) => {
      settle({
        code: code ?? -1,
        stdout,
        stderr,
        timedOut,
        error: timedOut ? `Command timed out after ${timeoutMs}ms.` : undefined,
      });
    });
  });
}

function firstLineOrUndefined(value: string) {
  const lines = splitLines(value);
  return lines.length > 0 ? lines[0] : undefined;
}

function parseBooleanLike(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function formatCommandError(result: RunCommandResult) {
  const parts: string[] = [];
  if (result.error) {
    parts.push(result.error);
  }
  if (result.stderr.trim().length > 0) {
    parts.push(result.stderr.trim());
  }
  if (result.stdout.trim().length > 0) {
    parts.push(result.stdout.trim());
  }
  if (parts.length === 0) {
    return `Command exited with code ${result.code}.`;
  }
  return parts.join("\n");
}

type PythonPathCandidate = {
  pythonPath: string;
  source: PythonCandidateSource;
  priority: number;
  order: number;
};

type ValidatedPythonCandidate = {
  candidate: PythonCandidate;
  priority: number;
  order: number;
};

function logPythonDebug(...args: unknown[]) {
  if (!DEBUG_GENERATION) {
    return;
  }
  console.log("[VOLUMIA][PY]", ...args);
}

function isVolumiaEnvPath(candidatePath: string) {
  const normalized = path.normalize(candidatePath).toLowerCase();
  return normalized.includes(`${path.sep}envs${path.sep}volumia${path.sep}`);
}

function addPathCandidate(
  candidates: PythonPathCandidate[],
  seen: Set<string>,
  rawPath: string,
  source: PythonCandidateSource,
  priority: number
) {
  const normalizedPath = sanitizePath(rawPath);
  if (!isExistingFile(normalizedPath)) {
    return;
  }
  const dedupeKey = normalizeDedupeKey(normalizedPath);
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);
  candidates.push({
    pythonPath: normalizedPath,
    source,
    priority,
    order: candidates.length,
  });
}

function parsePyLauncherPaths(output: string) {
  const paths: string[] = [];
  for (const line of splitLines(output)) {
    const match = line.match(/([A-Za-z]:\\.*python(?:\.exe)?)/i);
    if (match?.[1]) {
      paths.push(match[1].trim());
    }
  }
  return paths;
}

async function detectFromWhereOrWhich() {
  if (process.platform === "win32") {
    const whereResult = await runCommand("where", ["python"], { timeoutMs: DETECT_COMMAND_TIMEOUT_MS });
    if (whereResult.code !== 0) {
      return [] as string[];
    }
    return splitLines(whereResult.stdout);
  }

  const whichResult = await runCommand("which", ["-a", "python"], { timeoutMs: DETECT_COMMAND_TIMEOUT_MS });
  if (whichResult.code === 0) {
    return splitLines(whichResult.stdout);
  }

  const fallbackWhichResult = await runCommand("which", ["python"], { timeoutMs: DETECT_COMMAND_TIMEOUT_MS });
  if (fallbackWhichResult.code !== 0) {
    return [] as string[];
  }
  return splitLines(fallbackWhichResult.stdout);
}

async function detectFromPyLauncher() {
  if (process.platform !== "win32") {
    return [] as string[];
  }
  const pyLauncherResult = await runCommand("py", ["-0p"], { timeoutMs: DETECT_COMMAND_TIMEOUT_MS });
  if (pyLauncherResult.code !== 0) {
    return [] as string[];
  }
  return parsePyLauncherPaths(pyLauncherResult.stdout);
}

function detectFromCondaPrefix() {
  const condaPrefix = process.env.CONDA_PREFIX;
  if (!condaPrefix || condaPrefix.trim().length === 0) {
    return [] as string[];
  }

  if (process.platform === "win32") {
    return [path.join(condaPrefix, "python.exe")];
  }
  return [path.join(condaPrefix, "bin", "python"), path.join(condaPrefix, "python")];
}

function detectFromCustomEnv() {
  const envCandidates = [process.env.VOLUMIA_PYTHON_PATH, process.env.PYTHON].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return envCandidates;
}

function isCondaVolumiaActive() {
  const condaPrefix = (process.env.CONDA_PREFIX ?? "").trim();
  if (!condaPrefix) {
    return false;
  }
  const activeEnvName = (process.env.CONDA_DEFAULT_ENV ?? "").trim().toLowerCase();
  if (activeEnvName === "volumia") {
    return true;
  }
  return path.basename(condaPrefix).trim().toLowerCase() === "volumia";
}

function detectFromCondaVolumiaCommonLocations() {
  const userProfile = (process.env.USERPROFILE ?? "").trim();
  const candidates: string[] = [
    DEFAULT_CONDA_PYTHON,
    userProfile ? path.join(userProfile, "miniconda3", "envs", "volumia", "python.exe") : "",
    userProfile ? path.join(userProfile, "anaconda3", "envs", "volumia", "python.exe") : "",
  ];
  if (isCondaVolumiaActive()) {
    const condaPrefix = (process.env.CONDA_PREFIX ?? "").trim();
    if (condaPrefix) {
      candidates.push(process.platform === "win32" ? path.join(condaPrefix, "python.exe") : path.join(condaPrefix, "bin", "python"));
    }
  }
  return candidates.filter((value) => value.trim().length > 0);
}

function getRejectionReason(result: PythonProbeResult) {
  const errorText = result.error ?? "";
  const torchMissing = /No module named ['"]torch['"]|ModuleNotFoundError:.*torch/i.test(errorText);
  if (torchMissing) {
    return "torch missing";
  }
  if (!result.torchInstalled) {
    return firstLineOrUndefined(errorText) ?? "torch probe failed";
  }
  if (result.cudaAvailable !== true) {
    return "CUDA not available";
  }
  return "";
}

function selectFinalCandidate(validated: ValidatedPythonCandidate[]) {
  if (validated.length === 0) {
    return undefined;
  }
  const minPriority = Math.min(...validated.map((entry) => entry.priority));
  const topPriority = validated.filter((entry) => entry.priority === minPriority);
  return topPriority.find((entry) => isVolumiaEnvPath(entry.candidate.pythonPath)) ?? topPriority[0];
}

async function detectPythonCandidates(preferredPath?: string): Promise<PythonDetectResult> {
  const rawCandidates: PythonPathCandidate[] = [];
  const seen = new Set<string>();

  const envPath = (process.env.VOLUMIA_PYTHON ?? "").trim();
  if (envPath) {
    addPathCandidate(rawCandidates, seen, envPath, "env", 1);
  }

  if (preferredPath?.trim()) {
    addPathCandidate(rawCandidates, seen, preferredPath, "stored", 2);
  }

  for (const condaCandidate of detectFromCondaVolumiaCommonLocations()) {
    addPathCandidate(rawCandidates, seen, condaCandidate, "conda", 3);
  }

  for (const condaCandidate of detectFromCondaPrefix()) {
    addPathCandidate(rawCandidates, seen, condaCandidate, "conda", 4);
  }

  for (const customCandidate of detectFromCustomEnv()) {
    addPathCandidate(rawCandidates, seen, customCandidate, "custom", 4);
  }

  const whereCandidates = await detectFromWhereOrWhich();
  for (const whereCandidate of whereCandidates) {
    addPathCandidate(rawCandidates, seen, whereCandidate, "where", 4);
  }

  const pyLauncherCandidates = await detectFromPyLauncher();
  for (const pyLauncherCandidate of pyLauncherCandidates) {
    addPathCandidate(rawCandidates, seen, pyLauncherCandidate, "py-launcher", 4);
  }

  rawCandidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.order - right.order;
  });

  logPythonDebug(
    "discovered candidates:",
    rawCandidates.map((candidate) => `${candidate.source}:${candidate.pythonPath}`)
  );

  const validCandidates: ValidatedPythonCandidate[] = [];
  const rejectedCandidates: PythonCandidate[] = [];

  for (const rawCandidate of rawCandidates) {
    const probe = await probeInterpreter(rawCandidate.pythonPath);
    const rejectionReason = getRejectionReason(probe);
    const isValid = rejectionReason.length === 0;
    const candidate: PythonCandidate = {
      pythonPath: rawCandidate.pythonPath,
      source: rawCandidate.source,
      isValid,
      rejectionReason: isValid ? undefined : rejectionReason,
    };

    if (isValid) {
      validCandidates.push({ candidate, priority: rawCandidate.priority, order: rawCandidate.order });
      logPythonDebug("validation:", `${candidate.pythonPath} => valid`);
    } else {
      rejectedCandidates.push(candidate);
      logPythonDebug("validation:", `${candidate.pythonPath} => rejected (${rejectionReason})`);
    }
  }

  validCandidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.order - right.order;
  });

  const selected = selectFinalCandidate(validCandidates);
  const selectedPath = selected?.candidate.pythonPath;

  const candidates = validCandidates.map((entry) => ({
    ...entry.candidate,
    recommended: selectedPath ? entry.candidate.pythonPath === selectedPath : false,
  }));

  logPythonDebug("final selected interpreter:", selectedPath ?? "(none)");

  return {
    candidates,
    rejectedCandidates,
    selectedPythonPath: selectedPath,
  };
}

function getPreferredPathFromDetectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as Partial<PythonDetectPayload>;
  if (typeof candidate.preferredPath !== "string") return "";
  return sanitizePath(candidate.preferredPath);
}

function getPythonPathFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as Partial<PythonProbePayload>;
  if (typeof candidate.pythonPath !== "string") return "";
  return sanitizePath(candidate.pythonPath);
}

async function probeInterpreter(pythonPath: string): Promise<PythonProbeResult> {
  if (!pythonPath || !isExistingFile(pythonPath)) {
    return {
      pythonPath,
      ok: false,
      torchInstalled: false,
      error: "Python interpreter not found.",
    };
  }

  const executableCheck = await runCommand(pythonPath, ["-c", "import sys; print(sys.executable)"], {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
  });

  if (executableCheck.code !== 0) {
    return {
      pythonPath,
      ok: false,
      torchInstalled: false,
      error: formatCommandError(executableCheck),
    };
  }

  const executable = firstLineOrUndefined(executableCheck.stdout) ?? pythonPath;

  const pipCheck = await runCommand(pythonPath, ["-m", "pip", "--version"], {
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
  });

  const baseResult: PythonProbeResult = {
    pythonPath,
    ok: pipCheck.code === 0,
    executable,
    pip: firstLineOrUndefined(pipCheck.stdout),
    torchInstalled: false,
  };

  if (pipCheck.code !== 0) {
    baseResult.error = formatCommandError(pipCheck);
  }

  const torchCheck = await runCommand(
    pythonPath,
    ["-c", TORCH_PROBE_CODE],
    { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS }
  );

  if (torchCheck.code !== 0) {
    const torchError = formatCommandError(torchCheck);
    const isMissingTorch = /No module named ['"]torch['"]|ModuleNotFoundError:.*torch/i.test(torchError);

    if (!isMissingTorch) {
      baseResult.ok = false;
    }

    baseResult.error = baseResult.error ? `${baseResult.error}\n${torchError}` : torchError;
    return baseResult;
  }

  const torchLines = splitLines(torchCheck.stdout);
  const torchVersion = torchLines[0];
  const cudaAvailable = parseBooleanLike(torchLines[1]);
  const deviceName = torchLines[2];

  return {
    ...baseResult,
    torchInstalled: true,
    torchVersion,
    cudaAvailable,
    deviceName: cudaAvailable ? deviceName : undefined,
  };
}

function removeIndexBlockingEnv(baseEnv: NodeJS.ProcessEnv) {
  const env = { ...baseEnv };
  delete env.PIP_NO_INDEX;
  return env;
}

function sendInstallLog(getWindow: WindowGetter, line: string) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  const payload: PythonInstallLogPayload = { line };
  window.webContents.send(IPC_CHANNELS.pyInstallLog, payload);
}

function sendInstallDone(getWindow: WindowGetter, ok: boolean) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  const payload: PythonInstallDonePayload = { ok };
  window.webContents.send(IPC_CHANNELS.pyInstallDone, payload);
}

function lineCollector(getWindow: WindowGetter) {
  const lines: string[] = [];
  return {
    push(line: string) {
      lines.push(line);
      sendInstallLog(getWindow, line);
    },
    toText() {
      return lines.join(os.EOL);
    },
  };
}

async function runInstallTorchCuda(
  payload: PythonInstallTorchCudaPayload,
  getWindow: WindowGetter
): Promise<PythonInstallTorchCudaResult> {
  const pythonPath = sanitizePath(payload.pythonPath);
  const logs = lineCollector(getWindow);

  if (!pythonPath || !isExistingFile(pythonPath)) {
    logs.push("Interpreter not found on disk.");
    return {
      ok: false,
      logs: logs.toText(),
      error: "Python interpreter not found.",
    };
  }

  const pipEnv = removeIndexBlockingEnv(process.env);
  logs.push(`[setup] Python: ${pythonPath}`);
  logs.push("[setup] Step 1/3: uninstalling torch, torchvision, torchaudio");

  const uninstallResult = await runCommand(
    pythonPath,
    ["-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"],
    {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      env: pipEnv,
      onStdoutLine: (line) => logs.push(`[pip] ${line}`),
      onStderrLine: (line) => logs.push(`[pip] ${line}`),
    }
  );

  if (uninstallResult.code !== 0) {
    logs.push(`[setup] Uninstall finished with code ${uninstallResult.code}; continuing.`);
  } else {
    logs.push("[setup] Uninstall completed.");
  }

  const installArgs = ["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio"];

  logs.push("[setup] Step 2/3: installing CUDA wheels from cu121");
  const cu121Result = await runCommand(
    pythonPath,
    [...installArgs, "--index-url", "https://download.pytorch.org/whl/cu121"],
    {
      timeoutMs: INSTALL_COMMAND_TIMEOUT_MS,
      env: pipEnv,
      onStdoutLine: (line) => logs.push(`[cu121] ${line}`),
      onStderrLine: (line) => logs.push(`[cu121] ${line}`),
    }
  );

  if (cu121Result.code === 0) {
    logs.push("[setup] cu121 installation succeeded.");
    return { ok: true, logs: logs.toText() };
  }

  logs.push(`[setup] cu121 installation failed with code ${cu121Result.code}. Trying cu124.`);
  logs.push("[setup] Step 3/3: installing CUDA wheels from cu124");

  const cu124Result = await runCommand(
    pythonPath,
    [...installArgs, "--index-url", "https://download.pytorch.org/whl/cu124"],
    {
      timeoutMs: INSTALL_COMMAND_TIMEOUT_MS,
      env: pipEnv,
      onStdoutLine: (line) => logs.push(`[cu124] ${line}`),
      onStderrLine: (line) => logs.push(`[cu124] ${line}`),
    }
  );

  if (cu124Result.code === 0) {
    logs.push("[setup] cu124 installation succeeded.");
    return { ok: true, logs: logs.toText() };
  }

  const failureMessage = formatCommandError(cu124Result);
  logs.push(`[setup] cu124 installation failed with code ${cu124Result.code}.`);
  return {
    ok: false,
    logs: logs.toText(),
    error: failureMessage,
  };
}

export function registerSystemPythonHandlers(getWindow: WindowGetter) {
  let isInstallRunning = false;

  ipcMain.handle(IPC_CHANNELS.pyDetect, async (_event, payload?: PythonDetectPayload) => {
    const preferredPath = getPreferredPathFromDetectPayload(payload);
    return detectPythonCandidates(preferredPath);
  });

  ipcMain.handle(IPC_CHANNELS.pyProbe, async (_event, payload: PythonProbePayload) => {
    const pythonPath = getPythonPathFromPayload(payload);
    return probeInterpreter(pythonPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.pyInstallTorchCuda,
    async (_event, payload: PythonInstallTorchCudaPayload): Promise<PythonInstallTorchCudaResult> => {
      const pythonPath = getPythonPathFromPayload(payload);
      if (isInstallRunning) {
        return {
          ok: false,
          logs: "",
          error: "Another installation is already running.",
        };
      }

      isInstallRunning = true;
      let installOk = false;

      try {
        const result = await runInstallTorchCuda({ pythonPath }, getWindow);
        installOk = result.ok;
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          logs: errorMessage,
          error: errorMessage,
        };
      } finally {
        sendInstallDone(getWindow, installOk);
        isInstallRunning = false;
      }
    }
  );
}
