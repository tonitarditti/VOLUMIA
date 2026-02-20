import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { basename, extname, resolve } from "path";
import {
  IPC_CHANNELS,
  type GenerationCheckResult,
  type GenerationAutoEngine,
  type GenerationAutoProfile,
  type GenerationAutoPreset,
  type GenerationDevice,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationMode,
  type GenerationMultiviewPreset,
  type GenerationPipeline,
  type GenerationProgressPayload,
  type GenerationPreset,
  type GenerationRunPayload,
  type GenerationSkpQuality,
  type GenerationTestResult,
} from "../channels";
import { generateComfyMultiviewViews } from "../generation/comfyui-client";

type WindowGetter = () => BrowserWindow | null;
type GenerationJobState = {
  canceled: boolean;
  process: ChildProcess | null;
};

type LocalGenerationResult = {
  ok: boolean;
  logs: string[];
  error?: string;
  outGlbPath?: string;
  device?: GenerationDevice;
  autoUsed?: GenerationAutoEngine;
  autoPreset?: GenerationAutoPreset;
  stdout?: string;
  stderr?: string;
  logPath?: string;
};

type PythonRunError = Error & {
  code?: number;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  logPath?: string;
  structuredMessage?: string;
};

type GenerationRunErrorResult = {
  ok: false;
  error: string;
  stderr?: string;
  stdout?: string;
  logFile: string;
  logPath?: string;
};

type GenerationRunSuccessResult = {
  ok: true;
  outPath: string;
  device?: GenerationDevice;
  logFile: string;
  logPath?: string;
};

type GenerationRunHandlerResult = GenerationRunSuccessResult | GenerationRunErrorResult;
type ResolvedPythonCommand = {
  cmd: string;
  prefixArgs: string[];
  source: "env" | "conda_prefix" | "common_path" | "requested" | "path_fallback";
};
type GenerationRunPayloadDepth = GenerationRunPayload & {
  pipeline?: "depth_glb";
};
type GenerationRunPayloadGenSkp = GenerationRunPayload & {
  pipeline: "gen_skp";
  inputs: string[];
  projectName: string;
  workDir: string;
  outputDir: string;
  quality: GenerationSkpQuality;
  sketchupExe?: string;
};
type GenSkpPythonResult = {
  ok: boolean;
  logs: string[];
  skpPath?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
  logPath?: string;
};

type LocalGenerationContext = {
  multiviewEnabled: boolean;
  multiviewPreset: GenerationMultiviewPreset;
  multiviewViewsDir?: string;
  multiviewLogs: string[];
  multiviewFallbackReason?: string;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeJobs = new Map<string, GenerationJobState>();
const latestOutputByProject = new Map<string, string>();
const MAX_STDOUT_CHARS = 10_000_000;
const MAX_STDERR_CHARS = 10_000_000;
const TRUNCATION_SUFFIX = "\n...truncated";
const STDOUT_TAIL_LINES = 8;
const STDERR_PREVIEW_CHARS = 2_000;
const DEFAULT_CONDA_PYTHON = "F:\\MINICONDA\\envs\\volumia\\python.exe";
const COMFYUI_BASE_URL = "http://127.0.0.1:8188";
let generationLogFilePath: string | null = null;

function formatLogArg(value: unknown) {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getGenerationLogFilePath() {
  if (generationLogFilePath) {
    return generationLogFilePath;
  }

  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    generationLogFilePath = path.join(logDir, "generation.log");
    return generationLogFilePath;
  } catch {
    generationLogFilePath = path.join(process.cwd(), "generation.log");
    return generationLogFilePath;
  }
}

function logLine(level: "INFO" | "ERR", msg: string) {
  try {
    fs.appendFileSync(getGenerationLogFilePath(), `[${new Date().toISOString()}] [${level}] ${msg}\n`, "utf8");
  } catch {
    // No-op by design.
  }
}

function logInfo(...args: unknown[]) {
  try {
    logLine("INFO", args.map(formatLogArg).join(" "));
  } catch {
    // No-op by design.
  }
}

function logErr(...args: unknown[]) {
  try {
    logLine("ERR", args.map(formatLogArg).join(" "));
  } catch {
    // No-op by design.
  }
}

function capOutput(current: string, nextChunk: string, maxChars: number) {
  if (!nextChunk) {
    return current;
  }
  if (current.endsWith(TRUNCATION_SUFFIX)) {
    return current;
  }

  const combined = `${current}${nextChunk}`;
  if (combined.length <= maxChars) {
    return combined;
  }

  if (maxChars <= TRUNCATION_SUFFIX.length) {
    return TRUNCATION_SUFFIX.slice(0, maxChars);
  }

  return `${combined.slice(0, maxChars - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

function lastNonEmptyLines(text: string, count: number) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "";
  }
  return lines.slice(-count).join("\n");
}

type ParsedPythonError = {
  message: string;
  traceback?: string;
};

function parsePythonErrorLine(rawLine: string): ParsedPythonError | null {
  const line = rawLine.trim();
  if (!line.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed.type !== "error" || typeof parsed.message !== "string") {
      return null;
    }
    return {
      message: parsed.message,
      traceback: typeof parsed.traceback === "string" ? parsed.traceback : undefined,
    };
  } catch {
    return null;
  }
}

function extractPythonStructuredError(stdout: string, stderr: string): ParsedPythonError | null {
  const stdoutLines = stdout.split(/\r?\n/);
  for (let index = stdoutLines.length - 1; index >= 0; index -= 1) {
    const parsed = parsePythonErrorLine(stdoutLines[index] ?? "");
    if (parsed) {
      return parsed;
    }
  }
  const stderrLines = stderr.split(/\r?\n/);
  for (let index = stderrLines.length - 1; index >= 0; index -= 1) {
    const parsed = parsePythonErrorLine(stderrLines[index] ?? "");
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function buildPythonRunLog(stdout: string, stderr: string, preflight?: string) {
  const preflightSection = preflight?.trim() ? `[PREFLIGHT]\n${preflight}\n\n` : "";
  return `${preflightSection}[STDOUT]\n${stdout || "(empty)"}\n\n[STDERR]\n${stderr || "(empty)"}\n`;
}

function writePythonRunLog(logDir: string, stdout: string, stderr: string, preflight?: string) {
  const fallbackPath = getGenerationLogFilePath();
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const combinedLogPath = path.join(logDir, "python-last-run.log");
    const stderrLogPath = path.join(logDir, "python-last-run.stderr.log");
    fs.writeFileSync(combinedLogPath, buildPythonRunLog(stdout, stderr, preflight), "utf8");
    fs.writeFileSync(stderrLogPath, stderr || "(empty)\n", "utf8");
    return combinedLogPath;
  } catch {
    try {
      fs.appendFileSync(fallbackPath, `\n${buildPythonRunLog(stdout, stderr, preflight)}`, "utf8");
    } catch {
      // No-op by design.
    }
    return fallbackPath;
  }
}

function buildCombinedRunLog(
  stdout: string,
  stderr: string,
  preflight: string | undefined,
  contextSections: Array<{ title: string; content: string }>
) {
  const sectionTexts: string[] = [];
  for (const section of contextSections) {
    const cleanContent = section.content.trim();
    if (!cleanContent) {
      continue;
    }
    sectionTexts.push(`[${section.title}]\n${cleanContent}`);
  }
  sectionTexts.push(buildPythonRunLog(stdout, stderr, preflight).trimEnd());
  return `${sectionTexts.join("\n\n")}\n`;
}

function writeSharedRunLogs(projectId: string, content: string) {
  try {
    const assetsDir = ensureAssetsDir();
    const lastRunPath = path.join(assetsDir, "python-last-run.log");
    const projectLogPath = path.join(assetsDir, `${sanitizeProjectId(projectId)}.log`);
    fs.writeFileSync(lastRunPath, content, "utf8");
    fs.writeFileSync(projectLogPath, content, "utf8");
    return {
      lastRunPath,
      projectLogPath,
    };
  } catch {
    const fallbackPath = getGenerationLogFilePath();
    fs.appendFileSync(fallbackPath, `\n${content}`, "utf8");
    return {
      lastRunPath: fallbackPath,
      projectLogPath: fallbackPath,
    };
  }
}

function asErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function createPythonError(
  code: number,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
  structuredError?: ParsedPythonError | null
): PythonRunError {
  const shortMessage = structuredError?.message?.trim() || "";
  const stderrText = stderr.trim() || "(empty)";
  const stdoutTail = lastNonEmptyLines(stdout, STDOUT_TAIL_LINES);
  const detailParts = [
    shortMessage || `Python exited with code ${code}${signal ? `, signal ${signal}` : ""}.`,
    `stderr:\n${stderrText}`,
  ];
  if (structuredError?.traceback?.trim()) {
    detailParts.push(`traceback:\n${structuredError.traceback}`);
  }
  if (stdoutTail) {
    detailParts.push(`stdout tail:\n${stdoutTail}`);
  }
  const error = new Error(detailParts.join("\n")) as PythonRunError;
  error.code = code;
  error.signal = signal;
  error.stdout = stdout;
  error.stderr = stderr;
  if (shortMessage) {
    error.structuredMessage = shortMessage;
  }
  return error;
}

function createGenerationRunErrorResult(error: unknown): GenerationRunErrorResult {
  const pyError = error as PythonRunError;
  const stderr = typeof pyError?.stderr === "string" ? pyError.stderr : undefined;
  const stdout =
    typeof pyError?.stdout === "string"
      ? lastNonEmptyLines(pyError.stdout, STDOUT_TAIL_LINES) || pyError.stdout
      : undefined;
  const logPath = typeof pyError?.logPath === "string" ? pyError.logPath : undefined;
  const rawMessage = pyError?.structuredMessage?.trim() || asErrorMessage(error);
  const messageHaystack = `${rawMessage}\n${stdout ?? ""}\n${stderr ?? ""}`.toLowerCase();
  const hasMissingDeps =
    messageHaystack.includes("missing dependencies")
    || messageHaystack.includes("missing dependency")
    || messageHaystack.includes("faltan deps");
  const missingPkgs = [
    messageHaystack.includes("einops") ? "einops" : "",
    messageHaystack.includes("omegaconf") ? "omegaconf" : "",
    messageHaystack.includes("pymcubes") || messageHaystack.includes("mcubes") ? "PyMCubes" : "",
    messageHaystack.includes("pillow") || messageHaystack.includes("no module named 'pil'") ? "pillow" : "",
  ].filter(Boolean);
  const dependencyCommand =
    missingPkgs.length > 0
      ? `conda activate volumia && pip install -U ${Array.from(new Set(missingPkgs)).join(" ")}`
      : "conda activate volumia && pip install -U einops omegaconf PyMCubes pillow";
  let shortMessage = rawMessage;
  if (
    messageHaystack.includes("missing dependency: pymcubes")
    || messageHaystack.includes("no module named 'mcubes'")
    || messageHaystack.includes("pymcubes is required when torchmcubes is unavailable")
  ) {
    shortMessage = "TripoSR unavailable: install PyMCubes (pip install PyMCubes)";
  } else if (hasMissingDeps) {
    shortMessage = `Faltan deps para TripoSR. Ejecuta: ${dependencyCommand}`;
  } else if (
    messageHaystack.includes("triposr not available")
    || messageHaystack.includes("no module named 'tsr'")
    || messageHaystack.includes("github.com/vast-ai-research/triposr")
  ) {
    shortMessage = "TripoSR unavailable: instala runtime en el entorno volumia (pip install git+https://github.com/VAST-AI-Research/TripoSR.git)";
  }

  return {
    ok: false,
    error: shortMessage,
    stderr,
    stdout,
    logFile: logPath ?? getGenerationLogFilePath(),
    logPath,
  };
}

function getArgValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    return "";
  }
  return args[index + 1];
}

function runPython(
  pythonPath: string,
  scriptPath: string,
  args: string[],
  spawnEnv: NodeJS.ProcessEnv,
  onProcess?: (process: ChildProcess) => void,
  prefixArgs: string[] = []
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolvePromise, rejectPromise) => {
    logInfo("[VOLUMIA] Using Python:", pythonPath);
    const outPath = getArgValue(args, "--out");
    const commandArgs = [...prefixArgs, scriptPath, ...args];
    logInfo(
      "[VOLUMIA][PY] spawn",
      `python=${pythonPath}`,
      `prefix=${JSON.stringify(prefixArgs)}`,
      `script=${scriptPath}`,
      `args=${JSON.stringify(args)}`,
      `out=${outPath || "n/a"}`
    );
    const p = spawn(pythonPath, commandArgs, {
      windowsHide: true,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    onProcess?.(p);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const resolveOnce = (value: { stdout: string; stderr: string; code: number }) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };

    const rejectOnce = (error: PythonRunError) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };

    p.on("error", (error) => {
      stderr = capOutput(stderr, `\n${asErrorMessage(error)}`, MAX_STDERR_CHARS);
      logErr("[VOLUMIA][PY] spawn error", `python=${pythonPath}`, `script=${scriptPath}`, `out=${outPath || "n/a"}`);
      rejectOnce(createPythonError(-1, null, stdout, stderr, extractPythonStructuredError(stdout, stderr)));
    });

    p.stdout?.on("data", (data) => {
      stdout = capOutput(stdout, data.toString(), MAX_STDOUT_CHARS);
    });

    p.stderr?.on("data", (data) => {
      stderr = capOutput(stderr, data.toString(), MAX_STDERR_CHARS);
    });

    p.on("close", (code, signal) => {
      const exitCode = code ?? -1;
      logInfo(
        "[VOLUMIA][PY]",
        `python=${pythonPath}`,
        `script=${scriptPath}`,
        `out=${outPath || "n/a"}`,
        `exit=${exitCode}`
      );
      if (exitCode !== 0) {
        const stderrPreview = stderr.slice(0, STDERR_PREVIEW_CHARS);
        if (stderrPreview.trim()) {
          logErr("[VOLUMIA][PY] stderr preview:", stderrPreview);
        }
        rejectOnce(createPythonError(exitCode, signal, stdout, stderr, extractPythonStructuredError(stdout, stderr)));
        return;
      }
      resolveOnce({ stdout, stderr, code: exitCode });
    });
  });
}

function ensureAssetsDir() {
  const assetsDir = path.join(app.getPath("userData"), "project-assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  return assetsDir;
}

function ensureProjectAssetsDir(projectId: string) {
  const safeProjectId = sanitizeProjectId(projectId);
  const projectAssetsDir = path.join(app.getPath("userData"), "project-assets", safeProjectId);
  fs.mkdirSync(projectAssetsDir, { recursive: true });
  return projectAssetsDir;
}

function ensureProjectLogsDir(projectAssetsDir: string) {
  const logsDir = path.join(projectAssetsDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  return logsDir;
}

async function ensureGlbOk(outPath: string) {
  if (!fs.existsSync(outPath)) throw new Error(`GLB not created: ${outPath}`);
  const size = fs.statSync(outPath).size;
  if (size < 4000) throw new Error(`GLB too small (< 4000 bytes, got ${size}): ${outPath}`);
  return size;
}

function sanitizeProjectId(projectId: string) {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe || "project";
}

function isPreset(value: unknown): value is GenerationPreset {
  return value === "fast" || value === "balanced" || value === "quality";
}

function isGenerationPipeline(value: unknown): value is GenerationPipeline {
  return value === "depth_glb" || value === "gen_skp";
}

function isGenerationSkpQuality(value: unknown): value is GenerationSkpQuality {
  return value === "fast" || value === "high";
}

function isGenerationMode(value: unknown): value is GenerationMode {
  return value === "auto" || value === "neural" || value === "architectural";
}

function isGenerationAutoProfile(value: unknown): value is GenerationAutoProfile {
  return value === "auto" || value === "hard_surface" || value === "organic";
}

function isGenerationMultiviewPreset(value: unknown): value is GenerationMultiviewPreset {
  return value === "hard_surface" || value === "balanced" || value === "organic";
}

function resolveGenerationAutoProfile(value: GenerationAutoProfile | undefined): GenerationAutoProfile {
  if (value === "hard_surface" || value === "organic" || value === "auto") {
    return value;
  }
  return "auto";
}

function resolveGenerationMultiviewPreset(
  value: GenerationMultiviewPreset | undefined,
  autoProfile: GenerationAutoProfile
): GenerationMultiviewPreset {
  if (value === "hard_surface" || value === "balanced" || value === "organic") {
    return value;
  }
  if (autoProfile === "hard_surface") {
    return "hard_surface";
  }
  if (autoProfile === "organic") {
    return "organic";
  }
  return "balanced";
}

function isPathLikePython(value: string) {
  return (
    value.includes("\\") ||
    value.includes("/") ||
    /^[a-zA-Z]:/.test(value) ||
    value.toLowerCase().endsWith(".exe")
  );
}

function isValidPythonCommand(cmd: string, prefixArgs: string[], spawnEnv?: NodeJS.ProcessEnv) {
  try {
    const result = spawnSync(cmd, [...prefixArgs, "--version"], {
      windowsHide: true,
      shell: false,
      encoding: "utf8",
      env: spawnEnv,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    return result.status === 0 && output.includes("Python");
  } catch {
    return false;
  }
}

function sanitizeCandidatePath(candidate: string) {
  const trimmed = candidate.trim();
  const quoteWrapped = trimmed.match(/^"(.*)"$/);
  return quoteWrapped ? quoteWrapped[1] : trimmed;
}

function collectPythonPathCandidates(requestedPath?: string) {
  const candidates: Array<{ path: string; source: ResolvedPythonCommand["source"] }> = [];
  const seen = new Set<string>();
  const userProfile = (process.env.USERPROFILE ?? "").trim();
  const condaPrefix = (process.env.CONDA_PREFIX ?? "").trim();
  const preferredEnvPath = (process.env.VOLUMIA_PYTHON ?? "").trim();
  const requested = typeof requestedPath === "string" ? requestedPath.trim() : "";
  const commonPaths = [
    DEFAULT_CONDA_PYTHON,
    userProfile ? path.join(userProfile, "miniconda3", "envs", "volumia", "python.exe") : "",
    userProfile ? path.join(userProfile, "anaconda3", "envs", "volumia", "python.exe") : "",
  ];

  const addPathCandidate = (value: string, source: ResolvedPythonCommand["source"]) => {
    if (!value.trim()) {
      return;
    }
    const cleanPath = sanitizeCandidatePath(value);
    const normalized = path.normalize(cleanPath);
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    candidates.push({ path: normalized, source });
  };

  addPathCandidate(preferredEnvPath, "env");
  if (condaPrefix) {
    addPathCandidate(path.join(condaPrefix, "python.exe"), "conda_prefix");
  }
  for (const candidatePath of commonPaths) {
    addPathCandidate(candidatePath, "common_path");
  }
  addPathCandidate(requested, "requested");

  return candidates;
}

function resolvePythonCommand(pythonPath?: string): ResolvedPythonCommand | null {
  for (const candidate of collectPythonPathCandidates(pythonPath)) {
    if (!fs.existsSync(candidate.path)) {
      logErr("[gen] python candidate missing", `source=${candidate.source}`, `path=${candidate.path}`);
      continue;
    }
    if (!isValidPythonCommand(candidate.path, [])) {
      logErr("[gen] python candidate invalid", `source=${candidate.source}`, `path=${candidate.path}`);
      continue;
    }
    return { cmd: candidate.path, prefixArgs: [], source: candidate.source };
  }

  if (isValidPythonCommand("python", [])) {
    logErr(
      "[gen] WARNING: falling back to PATH python. Set VOLUMIA_PYTHON or activate the conda env 'volumia' to force the correct interpreter."
    );
    return { cmd: "python", prefixArgs: [], source: "path_fallback" };
  }

  return null;
}

function formatPythonCommand(command: ResolvedPythonCommand | null, requestedPath?: string) {
  if (!command) {
    const trimmed = typeof requestedPath === "string" ? requestedPath.trim() : "";
    return trimmed || "python";
  }
  if (command.prefixArgs.length > 0) {
    return `${command.cmd} ${command.prefixArgs.join(" ")}`.trim();
  }
  return command.cmd;
}

function runPythonPreflight(command: ResolvedPythonCommand, spawnEnv: NodeJS.ProcessEnv) {
  const preflightArgs = [
    ...command.prefixArgs,
    "-c",
    "import sys, torch; print('PY',sys.executable); print('TORCH',torch.__version__); print('CUDA',torch.cuda.is_available())",
  ];
  const commandLabel = formatPythonCommand(command);
  try {
    const result = spawnSync(command.cmd, preflightArgs, {
      windowsHide: true,
      shell: false,
      encoding: "utf8",
      env: spawnEnv,
    });
    const stdout = `${result.stdout ?? ""}`.trim();
    const stderr = `${result.stderr ?? ""}`.trim();
    const status = result.status ?? -1;
    const combined = [stdout, stderr].filter(Boolean).join("\n");
    const output = `cmd=${commandLabel}\nsource=${command.source}\nstatus=${status}\n${combined || "(empty)"}`;
    const logLineText = `[VOLUMIA][PY][PREFLIGHT]\n${output}`;
    if (status === 0) {
      logInfo(logLineText);
      console.log(logLineText);
    } else {
      logErr(logLineText);
      console.error(logLineText);
    }
    return {
      ok: status === 0,
      output,
    };
  } catch (error) {
    const output = `cmd=${commandLabel}\nsource=${command.source}\nstatus=-1\n${asErrorMessage(error)}`;
    const logLineText = `[VOLUMIA][PY][PREFLIGHT]\n${output}`;
    logErr(logLineText);
    console.error(logLineText);
    return {
      ok: false,
      output,
    };
  }
}

function validateRunPayload(payload: unknown): payload is GenerationRunPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Partial<GenerationRunPayload>;
  if (!isGenerationPipeline(candidate.pipeline ?? "depth_glb")) {
    return false;
  }
  if (candidate.pipeline === "gen_skp") {
    return (
      typeof candidate.projectId === "string" &&
      Array.isArray(candidate.inputs) &&
      candidate.inputs.length >= 1 &&
      candidate.inputs.length <= 4 &&
      candidate.inputs.every((item) => typeof item === "string") &&
      typeof candidate.projectName === "string" &&
      candidate.projectName.trim().length > 0 &&
      typeof candidate.workDir === "string" &&
      candidate.workDir.trim().length > 0 &&
      typeof candidate.outputDir === "string" &&
      candidate.outputDir.trim().length > 0 &&
      isGenerationSkpQuality(candidate.quality) &&
      (typeof candidate.sketchupExe === "undefined" || typeof candidate.sketchupExe === "string") &&
      (typeof candidate.pythonPath === "undefined" || typeof candidate.pythonPath === "string")
    );
  }
  return (
    typeof candidate.projectId === "string" &&
    Array.isArray(candidate.imagePaths) &&
    candidate.imagePaths.every((item) => typeof item === "string") &&
    isPreset(candidate.preset) &&
    (typeof candidate.mode === "undefined" || isGenerationMode(candidate.mode)) &&
    (typeof candidate.autoProfile === "undefined" || isGenerationAutoProfile(candidate.autoProfile)) &&
    (typeof candidate.multiviewEnabled === "undefined" || typeof candidate.multiviewEnabled === "boolean") &&
    (typeof candidate.multiviewPreset === "undefined" || isGenerationMultiviewPreset(candidate.multiviewPreset)) &&
    (typeof candidate.pythonPath === "undefined" || typeof candidate.pythonPath === "string")
  );
}

function sendProgress(getWindow: WindowGetter, payload: GenerationProgressPayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationProgress, payload);
}

function sendDone(getWindow: WindowGetter, payload: GenerationDonePayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationDone, payload);
}

function sendError(getWindow: WindowGetter, payload: GenerationErrorPayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationError, payload);
}

function resolveGeneratorScriptPath() {
  const candidates = [
    resolve(process.cwd(), "apps", "desktop", "python", "image_to_3d_depth_glb.py"),
    resolve(process.cwd(), "python", "image_to_3d_depth_glb.py"),
    resolve(app.getAppPath(), "python", "image_to_3d_depth_glb.py"),
    resolve(process.resourcesPath, "python", "image_to_3d_depth_glb.py"),
    resolve(process.resourcesPath, "app.asar.unpacked", "python", "image_to_3d_depth_glb.py"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveFurnitureScriptPath() {
  const candidates = [
    resolve(process.cwd(), "apps", "desktop", "python", "image_to_3d_furniture_tables.py"),
    resolve(process.cwd(), "python", "image_to_3d_furniture_tables.py"),
    resolve(app.getAppPath(), "python", "image_to_3d_furniture_tables.py"),
    resolve(process.resourcesPath, "python", "image_to_3d_furniture_tables.py"),
    resolve(process.resourcesPath, "app.asar.unpacked", "python", "image_to_3d_furniture_tables.py"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveGenSkpScriptPath() {
  const candidates = [
    resolve(process.cwd(), "apps", "desktop", "python", "image_to_3d_gen_dae_skp.py"),
    resolve(process.cwd(), "python", "image_to_3d_gen_dae_skp.py"),
    resolve(app.getAppPath(), "python", "image_to_3d_gen_dae_skp.py"),
    resolve(process.resourcesPath, "python", "image_to_3d_gen_dae_skp.py"),
    resolve(process.resourcesPath, "app.asar.unpacked", "python", "image_to_3d_gen_dae_skp.py"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveSampleImagePath(scriptPath?: string) {
  const candidates = [
    scriptPath ? resolve(scriptPath, "..", "sample.jpg") : "",
    resolve(process.cwd(), "apps", "desktop", "python", "sample.jpg"),
    resolve(process.cwd(), "tools", "local_generator", "sample.jpg"),
    resolve(process.cwd(), "..", "..", "tools", "local_generator", "sample.jpg"),
    resolve(app.getAppPath(), "python", "sample.jpg"),
    resolve(process.resourcesPath, "python", "sample.jpg"),
    resolve(process.resourcesPath, "app.asar.unpacked", "python", "sample.jpg"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function mapPresetToQuality(preset: GenerationPreset): "fast" | "balanced" | "high" {
  if (preset === "quality") {
    return "high";
  }
  return preset;
}

function resolveGenerationMode(mode: GenerationMode | undefined): GenerationMode {
  if (mode === "architectural" || mode === "neural" || mode === "auto") {
    return mode;
  }
  return "auto";
}

function parseAutoEngine(value: unknown): GenerationAutoEngine | undefined {
  if (value === "instantmesh" || value === "triposr" || value === "arch" || value === "blockout") {
    return value;
  }
  return undefined;
}

function parseAutoPreset(value: unknown): GenerationAutoPreset | undefined {
  if (value === "hard_surface" || value === "organic") {
    return value;
  }
  return undefined;
}

function readAutoMeta(outGlbPath: string): { used?: GenerationAutoEngine; preset?: GenerationAutoPreset } {
  const metaPath = path.join(path.dirname(outGlbPath), "auto-meta.json");
  if (!fs.existsSync(metaPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    return {
      used: parseAutoEngine(parsed.used),
      preset: parseAutoPreset(parsed.preset),
    };
  } catch {
    return {};
  }
}

type ParsedProgressLine = {
  stage: string;
  percent: number;
  message: string;
  device?: "cuda" | "cpu";
};

function parseProgressLine(rawLine: string): ParsedProgressLine | null {
  const line = rawLine.trim();
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as {
      type?: unknown;
      stage?: unknown;
      percent?: unknown;
      pct?: unknown;
      message?: unknown;
      device?: unknown;
    };

    if (parsed.type && parsed.type !== "progress") {
      return null;
    }

    if (typeof parsed.stage !== "string" || typeof parsed.message !== "string") {
      return null;
    }

    const numericPercent =
      typeof parsed.percent === "number"
        ? parsed.percent
        : typeof parsed.pct === "number"
          ? parsed.pct
          : Number.parseFloat(String(parsed.percent ?? parsed.pct ?? ""));

    if (!Number.isFinite(numericPercent)) {
      return null;
    }

    const progressDevice =
      parsed.device === "cuda" || parsed.device === "cpu"
        ? (parsed.device as "cuda" | "cpu")
        : undefined;

    return {
      stage: parsed.stage,
      percent: Math.max(0, Math.min(100, Math.round(numericPercent))),
      message: parsed.message,
      device: progressDevice,
    };
  } catch {
    return null;
  }
}

function parseDeviceLine(rawLine: string): GenerationDevice | null {
  const line = rawLine.trim();
  const fullMatch = line.match(/^\[VOLUMIA_DEVICE\]\s+device=(cuda|cpu)\s+index=-?\d+\s+name="([^"]*)"$/);
  if (fullMatch) {
    return {
      device: fullMatch[1] as "cuda" | "cpu",
      name: fullMatch[2],
    };
  }

  const shortMatch = line.match(/^\[VOLUMIA_DEVICE\]\s+device=(cuda|cpu)$/);
  if (!shortMatch) {
    return null;
  }

  return {
    device: shortMatch[1] as "cuda" | "cpu",
    name: shortMatch[1] === "cuda" ? "CUDA" : "CPU",
  };
}

type ParsedGenSkpLine =
  | {
      type: "progress";
      stage: string;
      pct: number;
      message: string;
    }
  | {
      type: "done";
      skpPath: string;
    }
  | {
      type: "error";
      message: string;
      detail?: string;
      traceback?: string;
    };

function parseGenSkpLine(rawLine: string): ParsedGenSkpLine | null {
  const line = rawLine.trim();
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = parsed.type;
    if (type === "progress") {
      if (
        typeof parsed.stage === "string" &&
        (typeof parsed.pct === "number" || typeof parsed.percent === "number") &&
        typeof parsed.message === "string"
      ) {
        const rawPct = typeof parsed.pct === "number" ? parsed.pct : (parsed.percent as number);
        return {
          type: "progress",
          stage: parsed.stage,
          pct: Math.max(0, Math.min(100, Math.round(rawPct))),
          message: parsed.message,
        };
      }
      return null;
    }
    if (type === "done" && typeof parsed.skpPath === "string") {
      return { type: "done", skpPath: parsed.skpPath };
    }
    if (type === "error" && typeof parsed.message === "string") {
      return {
        type: "error",
        message: parsed.message,
        detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
        traceback: typeof parsed.traceback === "string" ? parsed.traceback : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function runLocalPythonGeneration(
  payload: GenerationRunPayload,
  imagePath: string,
  job: GenerationJobState,
  getWindow: WindowGetter,
  scriptPath: string,
  pythonCommand: ResolvedPythonCommand,
  projectAssetsDir: string,
  context?: LocalGenerationContext
): Promise<LocalGenerationResult> {
  const logs: string[] = [];
  let device: GenerationDevice | undefined;
  let outGlb = "";
  let preflightOutput = "";
  const logsDir = ensureProjectLogsDir(projectAssetsDir);

  try {
    outGlb = path.join(projectAssetsDir, "latest.glb");
    const modelsDir = path.join(projectAssetsDir, "models");
    const pipDir = path.join(projectAssetsDir, "pip");
    const tmpDir = path.join(projectAssetsDir, "tmp");
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(pipDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      KMP_DUPLICATE_LIB_OK: "TRUE",
      PYTHONUNBUFFERED: "1",
      TQDM_DISABLE: "1",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      VOLUMIA_CACHE_DIR: projectAssetsDir,
      HF_HOME: modelsDir,
      TRANSFORMERS_CACHE: modelsDir,
      TORCH_HOME: modelsDir,
      PIP_CACHE_DIR: pipDir,
      VOLUMIA_FORCE_DEVICE: "cuda",
    };
    const preflight = runPythonPreflight(pythonCommand, spawnEnv);
    preflightOutput = preflight.output;
    logInfo("[VOLUMIA] OpenMP duplicate workaround enabled");
    const generationMode = resolveGenerationMode(payload.mode);
    const autoProfile = resolveGenerationAutoProfile(payload.autoProfile);
    logInfo("[gen] autoProfile:", autoProfile);

    const pythonArgs = [
      "--in",
      imagePath,
      "--out",
      outGlb,
      "--quality",
      mapPresetToQuality(payload.preset),
      "--mode",
      generationMode,
      "--auto-profile",
      autoProfile,
      "--models-dir",
      modelsDir,
    ];
    if (context?.multiviewViewsDir) {
      pythonArgs.push("--multiview-dir", context.multiviewViewsDir);
    }

    const { stdout, stderr, code } = await runPython(
      pythonCommand.cmd,
      scriptPath,
      pythonArgs,
      spawnEnv,
      (process) => {
        job.process = process;
      },
      pythonCommand.prefixArgs
    ).finally(() => {
      job.process = null;
    });

    logInfo("[PY] exit:", code);
    logInfo("[PY] stdout:", stdout);
    logErr("[PY] stderr:", stderr);
    const projectLogPath = writePythonRunLog(logsDir, stdout, stderr, preflightOutput);

    logs.push(`[py] exit: ${code}`);
    logs.push(...preflightOutput.split(/\r?\n/).filter(Boolean).map((line) => `[preflight] ${line}`));
    if (stdout.trim()) {
      logs.push(...stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (stderr.trim()) {
      logs.push(...stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

    const contextSections: Array<{ title: string; content: string }> = [];
    if (context?.multiviewEnabled) {
      const multiviewDetails = [
        `preset=${context.multiviewPreset}`,
        context.multiviewViewsDir ? `views_dir=${context.multiviewViewsDir}` : "",
        context.multiviewFallbackReason ? `fallback_reason=${context.multiviewFallbackReason}` : "",
        context.multiviewLogs.join("\n"),
      ]
        .filter(Boolean)
        .join("\n");
      contextSections.push({
        title: "MULTIVIEW",
        content: multiviewDetails,
      });
    }
    contextSections.push({
      title: "PROJECT_LOG",
      content: `project_log=${projectLogPath}`,
    });
    const combinedLog = buildCombinedRunLog(stdout, stderr, preflightOutput, contextSections);
    const sharedLogs = writeSharedRunLogs(payload.projectId, combinedLog);

    for (const line of stdout.split(/\r?\n/)) {
      const parsedDevice = parseDeviceLine(line);
      if (parsedDevice) {
        device = parsedDevice;
        sendProgress(getWindow, {
          projectId: payload.projectId,
          stage: "infer",
          percent: 56,
          message: line.trim(),
          device: parsedDevice.device,
        });
      }

      const parsedProgress = parseProgressLine(line);
      if (parsedProgress) {
        if (parsedProgress.device) {
          device = {
            device: parsedProgress.device,
            name: parsedProgress.device === "cuda" ? "CUDA" : "CPU",
          };
        }
        sendProgress(getWindow, {
          projectId: payload.projectId,
          stage: parsedProgress.stage,
          percent: parsedProgress.percent,
          message: parsedProgress.message,
          device: parsedProgress.device,
        });
        continue;
      }

      if (line.startsWith("[BOOT]") || line.startsWith("[MODEL]")) {
        sendProgress(getWindow, {
          projectId: payload.projectId,
          stage: "infer",
          percent: 58,
          message: line,
        });
      }
    }

    if (job.canceled) {
      return { ok: false, logs, error: "Generacion cancelada." };
    }

    await ensureGlbOk(outGlb);
    const autoMeta = readAutoMeta(outGlb);

    return {
      ok: true,
      logs,
      outGlbPath: outGlb,
      device,
      autoUsed: autoMeta.used,
      autoPreset: autoMeta.preset,
      logPath: sharedLogs.projectLogPath,
    };
  } catch (error) {
    const pyError = error as PythonRunError;
    const stdoutText = typeof pyError.stdout === "string" ? pyError.stdout : "";
    const stderrText = typeof pyError.stderr === "string" ? pyError.stderr : "";
    const fallbackLogsDir = ensureProjectLogsDir(projectAssetsDir);
    const projectLogPath = writePythonRunLog(fallbackLogsDir, stdoutText, stderrText, preflightOutput);
    if (preflightOutput.trim()) {
      logs.push(...preflightOutput.split(/\r?\n/).filter(Boolean).map((line) => `[preflight] ${line}`));
    }
    if (typeof pyError.stdout === "string" && pyError.stdout.trim()) {
      logs.push(...pyError.stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (typeof pyError.stderr === "string" && pyError.stderr.trim()) {
      logs.push(...pyError.stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

    const contextSections: Array<{ title: string; content: string }> = [];
    if (context?.multiviewEnabled) {
      const multiviewDetails = [
        `preset=${context.multiviewPreset}`,
        context.multiviewViewsDir ? `views_dir=${context.multiviewViewsDir}` : "",
        context.multiviewFallbackReason ? `fallback_reason=${context.multiviewFallbackReason}` : "",
        context.multiviewLogs.join("\n"),
      ]
        .filter(Boolean)
        .join("\n");
      contextSections.push({
        title: "MULTIVIEW",
        content: multiviewDetails,
      });
    }
    contextSections.push({
      title: "PROJECT_LOG",
      content: `project_log=${projectLogPath}`,
    });
    const combinedLog = buildCombinedRunLog(stdoutText, stderrText, preflightOutput, contextSections);
    const sharedLogs = writeSharedRunLogs(payload.projectId, combinedLog);

    return {
      ok: false,
      logs,
      error: pyError.structuredMessage || "Fallo el generador local.",
      stdout: stdoutText,
      stderr: stderrText,
      logPath: sharedLogs.projectLogPath,
    };
  }
}

async function runGenSkpPythonGeneration(
  payload: GenerationRunPayloadGenSkp,
  job: GenerationJobState,
  getWindow: WindowGetter,
  scriptPath: string,
  pythonCommand: ResolvedPythonCommand
): Promise<GenSkpPythonResult> {
  const logs: string[] = [];
  const outputDir = resolve(payload.outputDir);
  const logDir = outputDir || ensureAssetsDir();
  let preflightOutput = "";

  try {
    const inputs = payload.inputs.map((value) => resolve(value));
    const args: string[] = [
      "--inputs",
      ...inputs,
      "--project_name",
      payload.projectName,
      "--work_dir",
      resolve(payload.workDir),
      "--output_dir",
      resolve(payload.outputDir),
      "--quality",
      payload.quality,
    ];
    if (typeof payload.sketchupExe === "string" && payload.sketchupExe.trim().length > 0) {
      args.push("--sketchup_exe", payload.sketchupExe.trim());
    }

    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      KMP_DUPLICATE_LIB_OK: "TRUE",
      PYTHONUNBUFFERED: "1",
      TQDM_DISABLE: "1",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      VOLUMIA_FORCE_DEVICE: "cuda",
    };
    const preflight = runPythonPreflight(pythonCommand, spawnEnv);
    preflightOutput = preflight.output;

    const { stdout, stderr } = await runPython(
      pythonCommand.cmd,
      scriptPath,
      args,
      spawnEnv,
      (process) => {
        job.process = process;
      },
      pythonCommand.prefixArgs
    ).finally(() => {
      job.process = null;
    });
    const logPath = writePythonRunLog(logDir, stdout, stderr, preflightOutput);

    if (preflightOutput.trim()) {
      logs.push(...preflightOutput.split(/\r?\n/).filter(Boolean).map((line) => `[preflight] ${line}`));
    }
    if (stdout.trim()) {
      logs.push(...stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (stderr.trim()) {
      logs.push(...stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

    let doneSkpPath: string | undefined;
    let parserError: string | undefined;
    for (const line of stdout.split(/\r?\n/)) {
      const parsed = parseGenSkpLine(line);
      if (!parsed) {
        continue;
      }
      if (parsed.type === "progress") {
        sendProgress(getWindow, {
          projectId: payload.projectId,
          stage: parsed.stage,
          percent: parsed.pct,
          message: parsed.message,
        });
      } else if (parsed.type === "done") {
        doneSkpPath = resolve(parsed.skpPath);
      } else if (parsed.type === "error") {
        const detailParts = [parsed.detail, parsed.traceback].filter((item): item is string => Boolean(item));
        parserError = detailParts.length > 0 ? `${parsed.message}\n${detailParts.join("\n")}` : parsed.message;
      }
    }

    if (parserError) {
      return {
        ok: false,
        logs,
        error: parserError,
        stdout,
        stderr,
        logPath,
      };
    }

    const fallbackSkpPath = path.join(resolve(payload.outputDir), `${payload.projectName}.skp`);
    const resolvedSkpPath = doneSkpPath ?? fallbackSkpPath;
    if (!fs.existsSync(resolvedSkpPath)) {
      return {
        ok: false,
        logs,
        error: `No se encontro SKP generado en: ${resolvedSkpPath}`,
        stdout,
        stderr,
        logPath,
      };
    }

    return {
      ok: true,
      logs,
      skpPath: resolvedSkpPath,
      stdout,
      stderr,
      logPath,
    };
  } catch (error) {
    const pyError = error as PythonRunError;
    const stdoutText = typeof pyError.stdout === "string" ? pyError.stdout : "";
    const stderrText = typeof pyError.stderr === "string" ? pyError.stderr : "";
    const logPath = writePythonRunLog(logDir, stdoutText, stderrText, preflightOutput);
    if (preflightOutput.trim()) {
      logs.push(...preflightOutput.split(/\r?\n/).filter(Boolean).map((line) => `[preflight] ${line}`));
    }
    if (typeof pyError.stdout === "string" && pyError.stdout.trim()) {
      logs.push(...pyError.stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (typeof pyError.stderr === "string" && pyError.stderr.trim()) {
      logs.push(...pyError.stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

    return {
      ok: false,
      logs,
      error: pyError.structuredMessage || "Fallo el generador SKP IA.",
      stdout: stdoutText,
      stderr: stderrText,
      logPath,
    };
  }
}

async function runGenerationJob(
  payload: GenerationRunPayload,
  getWindow: WindowGetter,
  job: GenerationJobState
): Promise<{ outPath: string; device?: GenerationDevice; logPath?: string }> {
  if ((payload.pipeline ?? "depth_glb") === "gen_skp") {
    const genPayload = payload as GenerationRunPayloadGenSkp;
    const projectId = genPayload.projectId;
    const scriptPath = resolveGenSkpScriptPath();
    if (!scriptPath) {
      throw new Error("No se encontro apps/desktop/python/image_to_3d_gen_dae_skp.py");
    }

    const resolvedPython = resolvePythonCommand(genPayload.pythonPath);
    if (!resolvedPython) {
      const message =
        "No se encontro Python valido. Configure VOLUMIA_PYTHON o instale/active el entorno conda 'volumia'.";
      logErr("[gen] python resolve failed", `requested=${genPayload.pythonPath ?? ""}`);
      sendError(getWindow, { projectId, message });
      throw new Error(message);
    }

    sendProgress(getWindow, {
      projectId,
      stage: "preprocess",
      percent: 5,
      message: "Preparando pipeline SKP IA...",
    });

    const skpResult = await runGenSkpPythonGeneration(genPayload, job, getWindow, scriptPath, resolvedPython);
    if (!skpResult.ok || !skpResult.skpPath) {
      const generationError = new Error(skpResult.error ?? "Fallo la generacion SKP IA.") as PythonRunError;
      if (typeof skpResult.stdout === "string") {
        generationError.stdout = skpResult.stdout;
      }
      if (typeof skpResult.stderr === "string") {
        generationError.stderr = skpResult.stderr;
      }
      if (typeof skpResult.logPath === "string") {
        generationError.logPath = skpResult.logPath;
      }
      throw generationError;
    }

    sendProgress(getWindow, {
      projectId,
      stage: "done",
      percent: 100,
      message: `SKP generado: ${skpResult.skpPath}`,
    });

    sendDone(getWindow, {
      projectId,
      pipeline: "gen_skp",
      skpPath: skpResult.skpPath,
      sourceImages: genPayload.inputs,
    });

    return {
      outPath: skpResult.skpPath,
      logPath: skpResult.logPath,
    };
  }

  const depthPayload = payload as GenerationRunPayloadDepth;
  const projectId = payload.projectId;
  const userDataPath = app.getPath("userData");
  const baseDir = ensureProjectAssetsDir(payload.projectId);
  const imagesDir = path.join(baseDir, "images");
  const copiedImages: string[] = [];

  fs.mkdirSync(imagesDir, { recursive: true });
  logInfo("[gen] userData:", userDataPath);
  logInfo("[gen] outGlb:", path.join(baseDir, "latest.glb"));

  sendProgress(getWindow, {
    projectId,
    stage: "preprocess",
    percent: 5,
    message: "Preparando archivos...",
  });

  for (let index = 0; index < depthPayload.imagePaths.length; index += 1) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      throw new Error("Generacion cancelada.");
    }

    const imagePath = depthPayload.imagePaths[index];
    const extension = extname(imagePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue;
    }

    const filename = `${Date.now()}-${index + 1}-${basename(imagePath)}`;
    const targetPath = path.join(imagesDir, filename);
    fs.copyFileSync(resolve(imagePath), targetPath);
    copiedImages.push(targetPath);

    const copyPercent = 10 + Math.round(((index + 1) / Math.max(1, depthPayload.imagePaths.length)) * 35);
    sendProgress(getWindow, {
      projectId,
      stage: "preprocess",
      percent: copyPercent,
      message: `Procesando imagen ${index + 1}/${depthPayload.imagePaths.length}`,
    });
  }

  if (copiedImages.length === 0) {
    throw new Error("No se encontraron imagenes validas para generar el modelo.");
  }

  if (job.canceled) {
    sendError(getWindow, { projectId, message: "Generacion cancelada." });
    throw new Error("Generacion cancelada.");
  }

  const mode = resolveGenerationMode(depthPayload.mode);
  const autoProfile = resolveGenerationAutoProfile(depthPayload.autoProfile);
  const multiviewPreset = resolveGenerationMultiviewPreset(depthPayload.multiviewPreset, autoProfile);
  const multiviewEnabled = Boolean(depthPayload.multiviewEnabled);
  const scriptPath = resolveGeneratorScriptPath();
  if (!scriptPath) {
    throw new Error("No se encontro apps/desktop/python/image_to_3d_depth_glb.py");
  }

  const resolvedPython = resolvePythonCommand(depthPayload.pythonPath);
  if (!resolvedPython) {
    const message =
      "No se encontro Python valido. Configure VOLUMIA_PYTHON o instale/active el entorno conda 'volumia'.";
    logErr("[gen] python resolve failed", `requested=${depthPayload.pythonPath ?? ""}`);
    sendError(getWindow, { projectId, message });
    throw new Error(message);
  }

  const localContext: LocalGenerationContext = {
    multiviewEnabled,
    multiviewPreset,
    multiviewLogs: [],
  };
  const shouldAttemptMultiview = multiviewEnabled && (mode === "auto" || multiviewPreset === "hard_surface");
  if (shouldAttemptMultiview) {
    const viewsDir = path.join(baseDir, "views");
    try {
      sendProgress(getWindow, {
        projectId,
        stage: "multiview",
        percent: 8,
        message: "Generando multivistas (1/2): iniciando ComfyUI local...",
      });
      const multiviewResult = await generateComfyMultiviewViews({
        baseUrl: COMFYUI_BASE_URL,
        imagePath: copiedImages[0],
        outputDir: viewsDir,
        preset: multiviewPreset,
        isCanceled: () => job.canceled,
        onProgress: (progress) => {
          sendProgress(getWindow, {
            projectId,
            stage: "multiview",
            percent: Math.max(8, Math.min(52, progress.percent)),
            message: progress.message,
          });
        },
      });
      localContext.multiviewViewsDir = multiviewResult.viewsDir;
      localContext.multiviewLogs.push(...multiviewResult.logs);
      sendProgress(getWindow, {
        projectId,
        stage: "multiview",
        percent: 52,
        message: "Generando multivistas (1/2): completado.",
      });
    } catch (error) {
      const reason = asErrorMessage(error);
      if (job.canceled || reason.toLowerCase().includes("cancelada")) {
        sendError(getWindow, { projectId, message: "Generacion cancelada." });
        throw new Error("Generacion cancelada.");
      }
      localContext.multiviewFallbackReason = reason;
      localContext.multiviewLogs.push(`[error] ${reason}`);
      sendProgress(getWindow, {
        projectId,
        stage: "multiview",
        percent: 52,
        message: `Multiview (Local) fallo, continuando sin multiview: ${reason}`,
      });
      logErr("[gen][multiview] fallback to single-view:", reason);
    }
  }

  sendProgress(getWindow, {
    projectId,
    stage: "infer",
    percent: 55,
    message: "Reconstruyendo 3D (2/2)...",
  });

  const localResult = await runLocalPythonGeneration(
    depthPayload,
    copiedImages[0],
    job,
    getWindow,
    scriptPath,
    resolvedPython,
    baseDir,
    localContext
  );

  if (!localResult.ok || !localResult.outGlbPath) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      throw new Error("Generacion cancelada.");
    }
    const generationError = new Error(localResult.error ?? "Fallo la generacion Image->3D.") as PythonRunError;
    if (typeof localResult.stdout === "string") {
      generationError.stdout = localResult.stdout;
    }
    if (typeof localResult.stderr === "string") {
      generationError.stderr = localResult.stderr;
    }
    if (typeof localResult.logPath === "string") {
      generationError.logPath = localResult.logPath;
      generationError.structuredMessage = localResult.error;
    }
    throw generationError;
  }

  latestOutputByProject.set(projectId, localResult.outGlbPath);

  sendProgress(getWindow, {
    projectId,
    stage: "done",
    percent: 100,
    message: "Modelo 3D listo.",
  });

  sendDone(getWindow, {
    projectId,
    pipeline: "depth_glb",
    glbPath: localResult.outGlbPath,
    outGlbPath: localResult.outGlbPath,
    sourceImages: copiedImages,
    preset: depthPayload.preset,
    mode,
    autoUsed: localResult.autoUsed,
    autoPreset: localResult.autoPreset,
    device: localResult.device,
    warnings: localContext.multiviewFallbackReason ? [localContext.multiviewFallbackReason] : undefined,
  });

  return {
    outPath: localResult.outGlbPath,
    device: localResult.device,
    logPath: localResult.logPath,
  };
}

function buildGeneratorCheckResult(pythonPath?: string): GenerationCheckResult {
  const scriptPath = resolveGeneratorScriptPath();
  const furnitureScriptPath = resolveFurnitureScriptPath();
  const genSkpScriptPath = resolveGenSkpScriptPath();
  const resolvedPython = resolvePythonCommand(pythonPath);
  const pythonFound = Boolean(resolvedPython);
  const pythonCommand = formatPythonCommand(resolvedPython, pythonPath);
  const venvPath =
    resolvedPython && isPathLikePython(resolvedPython.cmd) ? path.dirname(path.dirname(resolvedPython.cmd)) : "";
  const source = resolvedPython?.source ?? "none";
  const logs = [
    `script: ${scriptPath ?? "not found"}`,
    `furniture_script: ${furnitureScriptPath ?? "not found"}`,
    `gen_skp_script: ${genSkpScriptPath ?? "not found"}`,
    `python: ${pythonCommand}`,
    `pythonSource: ${source}`,
    `pythonFound: ${pythonFound}`,
    "generator: image_to_3d_depth_glb.py",
    "generator_modes: auto | neural | architectural",
  ];
  if (resolvedPython?.source === "path_fallback") {
    logs.push("warning: using PATH python fallback. Set VOLUMIA_PYTHON for deterministic conda runtime.");
  }

  return {
    pythonFound,
    pythonPath: pythonCommand,
    venvPath,
    scriptFound: Boolean(scriptPath || genSkpScriptPath),
    scriptPath,
    logs,
  };
}

export function registerGenerationHandlers(getWindow: WindowGetter) {
  ipcMain.handle(IPC_CHANNELS.generationSelectImages, async () => {
    const response = await dialog.showOpenDialog({
      title: "Seleccionar imagenes",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });

    if (response.canceled || response.filePaths.length === 0) {
      return [];
    }

    return response.filePaths.map((filePath) => resolve(filePath));
  });

  ipcMain.handle(IPC_CHANNELS.generationRun, async (_event, payload: unknown): Promise<GenerationRunHandlerResult> => {
    let projectId: string | null = null;
    try {
      if (!validateRunPayload(payload)) {
        return { ok: false, error: "Invalid generation payload.", logFile: getGenerationLogFilePath() };
      }

      projectId = payload.projectId;
      if (activeJobs.has(projectId)) {
        return {
          ok: false,
          error: "A generation job is already running for this project.",
          logFile: getGenerationLogFilePath(),
        };
      }

      const inputImages =
        (payload.pipeline ?? "depth_glb") === "gen_skp"
          ? ((payload as GenerationRunPayloadGenSkp).inputs ?? [])
          : payload.imagePaths;
      const hasAtLeastOneImage = inputImages.some((imagePath) => {
        return IMAGE_EXTENSIONS.has(extname(imagePath).toLowerCase());
      });

      if (!hasAtLeastOneImage) {
        return { ok: false, error: "No valid images were selected.", logFile: getGenerationLogFilePath() };
      }

      const job: GenerationJobState = { canceled: false, process: null };
      activeJobs.set(projectId, job);

      const jobResult = await runGenerationJob(payload, getWindow, job);
      return {
        ok: true,
        outPath: jobResult.outPath,
        device: jobResult.device,
        logFile: getGenerationLogFilePath(),
        logPath: jobResult.logPath,
      };
    } catch (error) {
      const runError = createGenerationRunErrorResult(error);
      logErr("[gen:run] handler error:", runError.error);
      if (projectId) {
        sendError(getWindow, {
          projectId,
          message: runError.error,
          logPath: runError.logPath,
        });
      }
      return runError;
    } finally {
      if (projectId) {
        activeJobs.delete(projectId);
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.generationCancel, async (_event, payload: { projectId?: string } | undefined) => {
    if (!payload?.projectId) {
      return;
    }

    const job = activeJobs.get(payload.projectId);
    if (job) {
      job.canceled = true;
      if (job.process && !job.process.killed) {
        job.process.kill();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.generationCheck, async (_event, args?: { pythonPath?: string }) => {
    return buildGeneratorCheckResult(args?.pythonPath);
  });

  ipcMain.handle(IPC_CHANNELS.generationTest, async (): Promise<GenerationTestResult> => {
    const scriptPath = resolveGeneratorScriptPath();
    const resolvedPython = resolvePythonCommand();

    if (!scriptPath || !resolvedPython) {
      return {
        ok: false,
        error: "No se encontro un generador local valido.",
        logs: buildGeneratorCheckResult().logs,
      };
    }

    const sampleImagePath = resolveSampleImagePath(scriptPath);
    if (!sampleImagePath) {
      return {
        ok: false,
        error: "No se encontro tools/local_generator/sample.jpg.",
        logs: buildGeneratorCheckResult().logs,
      };
    }

    const testPayload: GenerationRunPayload = {
      projectId: "_generator-test",
      imagePaths: [sampleImagePath],
      preset: "balanced",
    };

    const testJob: GenerationJobState = {
      canceled: false,
      process: null,
    };

    const localResult = await runLocalPythonGeneration(
      testPayload,
      sampleImagePath,
      testJob,
      getWindow,
      scriptPath,
      resolvedPython,
      ensureProjectAssetsDir(testPayload.projectId)
    );

    if (!localResult.ok || !localResult.outGlbPath) {
      return {
        ok: false,
        error: localResult.error ?? "El test del generador local fallo.",
        logs: localResult.logs,
      };
    }

    return {
      ok: true,
      glbPath: localResult.outGlbPath,
      logs: localResult.logs,
    };
  });

  ipcMain.handle("gen:read-glb", async (_event, glbPath: string) => {
    if (!fs.existsSync(glbPath)) {
      throw new Error("GLB file not found");
    }

    const buffer = fs.readFileSync(glbPath);
    return buffer;
  });

  ipcMain.handle("gen:read-image-data-url", async (_event, imagePath: string) => {
    const absolutePath = resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error("Image file not found");
    }
    const extension = extname(absolutePath).toLowerCase();
    const mimeByExtension: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".gif": "image/gif",
    };
    const mime = mimeByExtension[extension] ?? "application/octet-stream";
    const buffer = fs.readFileSync(absolutePath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  });

  ipcMain.handle("gen:open-output-folder", async (_event, payload: { glbPath?: string } | undefined) => {
    const fallbackPath = path.join(app.getPath("userData"), "project-assets");
    const targetPath = payload?.glbPath ? resolve(payload.glbPath) : fallbackPath;
    let folderPath = targetPath;
    try {
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        folderPath = path.dirname(folderPath);
      }
    } catch {
      folderPath = fallbackPath;
    }
    const openError = await shell.openPath(folderPath);

    return {
      ok: openError.length === 0,
      path: folderPath,
      error: openError || undefined,
    };
  });

  ipcMain.handle("gen:open-log-path", async (_event, payload: { logPath?: string } | undefined) => {
    const targetPath = payload?.logPath ? resolve(payload.logPath) : "";
    if (!targetPath || !fs.existsSync(targetPath)) {
      return {
        ok: false,
        path: targetPath,
        error: "Log file not found.",
      };
    }

    const openError = await shell.openPath(targetPath);
    return {
      ok: openError.length === 0,
      path: targetPath,
      error: openError || undefined,
    };
  });
}
