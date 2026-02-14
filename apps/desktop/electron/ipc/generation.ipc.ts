import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { basename, extname, resolve } from "path";
import {
  IPC_CHANNELS,
  type GenerationCheckResult,
  type GenerationDevice,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationProgressPayload,
  type GenerationPreset,
  type GenerationRunPayload,
  type GenerationTestResult,
} from "../channels";

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
  stdout?: string;
  stderr?: string;
};

type PythonRunError = Error & {
  code?: number;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
};

type GenerationRunErrorResult = {
  ok: false;
  error: string;
  stderr?: string;
  stdout?: string;
  logFile: string;
};

type GenerationRunSuccessResult = {
  ok: true;
  outPath: string;
  device?: GenerationDevice;
  logFile: string;
};

type GenerationRunHandlerResult = GenerationRunSuccessResult | GenerationRunErrorResult;

const PYTHON = "F:\\MINICONDA\\envs\\volumia\\python.exe";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeJobs = new Map<string, GenerationJobState>();
const latestOutputByProject = new Map<string, string>();
const MAX_STDOUT_CHARS = 200_000;
const MAX_STDERR_CHARS = 200_000;
const TRUNCATION_SUFFIX = "\n...truncated";
const STDOUT_TAIL_LINES = 8;
const STDERR_PREVIEW_CHARS = 2_000;
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
  stderr: string
): PythonRunError {
  const stderrText = stderr.trim() || "(empty)";
  const stdoutTail = lastNonEmptyLines(stdout, STDOUT_TAIL_LINES);
  const detailParts = [
    `Python exited with code ${code}${signal ? `, signal ${signal}` : ""}.`,
    `stderr:\n${stderrText}`,
  ];
  if (stdoutTail) {
    detailParts.push(`stdout tail:\n${stdoutTail}`);
  }
  const error = new Error(detailParts.join("\n")) as PythonRunError;
  error.code = code;
  error.signal = signal;
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

function createGenerationRunErrorResult(error: unknown): GenerationRunErrorResult {
  const pyError = error as PythonRunError;
  const stderr = typeof pyError?.stderr === "string" ? pyError.stderr : undefined;
  const stdout =
    typeof pyError?.stdout === "string"
      ? lastNonEmptyLines(pyError.stdout, STDOUT_TAIL_LINES) || pyError.stdout
      : undefined;

  return {
    ok: false,
    error: asErrorMessage(error),
    stderr,
    stdout,
    logFile: getGenerationLogFilePath(),
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
  scriptPath: string,
  args: string[],
  spawnEnv: NodeJS.ProcessEnv,
  onProcess?: (process: ChildProcess) => void
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolvePromise, rejectPromise) => {
    logInfo("[VOLUMIA] Using Python:", PYTHON);
    const outPath = getArgValue(args, "--out");
    logInfo(
      "[VOLUMIA][PY] spawn",
      `python=${PYTHON}`,
      `script=${scriptPath}`,
      `args=${JSON.stringify(args)}`,
      `out=${outPath || "n/a"}`
    );
    const p = spawn(PYTHON, [scriptPath, ...args], {
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
      logErr("[VOLUMIA][PY] spawn error", `python=${PYTHON}`, `script=${scriptPath}`, `out=${outPath || "n/a"}`);
      rejectOnce(createPythonError(-1, null, stdout, stderr));
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
        `python=${PYTHON}`,
        `script=${scriptPath}`,
        `out=${outPath || "n/a"}`,
        `exit=${exitCode}`
      );
      if (exitCode !== 0) {
        const stderrPreview = stderr.slice(0, STDERR_PREVIEW_CHARS);
        if (stderrPreview.trim()) {
          logErr("[VOLUMIA][PY] stderr preview:", stderrPreview);
        }
        rejectOnce(createPythonError(exitCode, signal, stdout, stderr));
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

async function ensureGlbOk(outPath: string) {
  if (!fs.existsSync(outPath)) throw new Error(`GLB not created: ${outPath}`);
  const size = fs.statSync(outPath).size;
  if (size < 2000) throw new Error(`GLB too small (${size} bytes): ${outPath}`);
  return size;
}

function sanitizeProjectId(projectId: string) {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe || "project";
}

function isPreset(value: unknown): value is GenerationPreset {
  return value === "fast" || value === "balanced" || value === "quality";
}

function validateRunPayload(payload: unknown): payload is GenerationRunPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Partial<GenerationRunPayload>;
  return (
    typeof candidate.projectId === "string" &&
    Array.isArray(candidate.imagePaths) &&
    candidate.imagePaths.every((item) => typeof item === "string") &&
    isPreset(candidate.preset)
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

function resolveGenerationMode(_imagePath: string): "furniture" | "generic" {
  return "generic";
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
      stage?: unknown;
      percent?: unknown;
      message?: unknown;
      device?: unknown;
    };

    if (typeof parsed.stage !== "string" || typeof parsed.message !== "string") {
      return null;
    }

    const numericPercent =
      typeof parsed.percent === "number" ? parsed.percent : Number.parseFloat(String(parsed.percent ?? ""));

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

async function runLocalPythonGeneration(
  payload: GenerationRunPayload,
  imagePath: string,
  job: GenerationJobState,
  getWindow: WindowGetter,
  scriptPath: string
): Promise<LocalGenerationResult> {
  const logs: string[] = [];
  let device: GenerationDevice | undefined;

  try {
    const assetsDir = ensureAssetsDir();
    const outGlb = path.join(assetsDir, "latest.glb");
    const modelsDir = path.join(assetsDir, "models");
    const pipDir = path.join(assetsDir, "pip");
    const tmpDir = path.join(assetsDir, "tmp");
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(pipDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      KMP_DUPLICATE_LIB_OK: "TRUE",
      VOLUMIA_CACHE_DIR: assetsDir,
      HF_HOME: modelsDir,
      TRANSFORMERS_CACHE: modelsDir,
      TORCH_HOME: modelsDir,
      PIP_CACHE_DIR: pipDir,
      VOLUMIA_FORCE_DEVICE: "cuda",
    };
    logInfo("[VOLUMIA] OpenMP duplicate workaround enabled");

    const { stdout, stderr, code } = await runPython(scriptPath, [
      "--in", imagePath,
      "--out", outGlb,
      "--quality", mapPresetToQuality(payload.preset),
      "--models-dir", modelsDir,
    ], spawnEnv, (process) => {
      job.process = process;
    }).finally(() => {
      job.process = null;
    });

    logInfo("[PY] exit:", code);
    logInfo("[PY] stdout:", stdout);
    logErr("[PY] stderr:", stderr);

    logs.push(`[py] exit: ${code}`);
    if (stdout.trim()) {
      logs.push(...stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (stderr.trim()) {
      logs.push(...stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

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

    return {
      ok: true,
      logs,
      outGlbPath: outGlb,
      device,
    };
  } catch (error) {
    const pyError = error as PythonRunError;
    if (typeof pyError.stdout === "string" && pyError.stdout.trim()) {
      logs.push(...pyError.stdout.split(/\r?\n/).filter(Boolean).map((line) => `[stdout] ${line}`));
    }
    if (typeof pyError.stderr === "string" && pyError.stderr.trim()) {
      logs.push(...pyError.stderr.split(/\r?\n/).filter(Boolean).map((line) => `[stderr] ${line}`));
    }

    return {
      ok: false,
      logs,
      error: asErrorMessage(error) || "No se pudo ejecutar el generador local.",
      stdout: typeof pyError.stdout === "string" ? pyError.stdout : undefined,
      stderr: typeof pyError.stderr === "string" ? pyError.stderr : undefined,
    };
  }
}

async function runGenerationJob(
  payload: GenerationRunPayload,
  getWindow: WindowGetter,
  job: GenerationJobState
): Promise<{ outPath: string; device?: GenerationDevice }> {
  const projectId = payload.projectId;
  const safeProjectId = sanitizeProjectId(payload.projectId);
  const userDataPath = app.getPath("userData");
  const baseDir = path.join(userDataPath, "project-assets", safeProjectId);
  const imagesDir = path.join(baseDir, "images");
  const outGlbPath = path.join(ensureAssetsDir(), "latest.glb");
  const copiedImages: string[] = [];

  fs.mkdirSync(imagesDir, { recursive: true });
  logInfo("[gen] userData:", userDataPath);
  logInfo("[gen] outGlb:", outGlbPath);

  sendProgress(getWindow, {
    projectId,
    stage: "preprocess",
    percent: 5,
    message: "Preparando archivos...",
  });

  for (let index = 0; index < payload.imagePaths.length; index += 1) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      throw new Error("Generacion cancelada.");
    }

    const imagePath = payload.imagePaths[index];
    const extension = extname(imagePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue;
    }

    const filename = `${Date.now()}-${index + 1}-${basename(imagePath)}`;
    const targetPath = path.join(imagesDir, filename);
    fs.copyFileSync(resolve(imagePath), targetPath);
    copiedImages.push(targetPath);

    const copyPercent = 10 + Math.round(((index + 1) / Math.max(1, payload.imagePaths.length)) * 35);
    sendProgress(getWindow, {
      projectId,
      stage: "preprocess",
      percent: copyPercent,
      message: `Procesando imagen ${index + 1}/${payload.imagePaths.length}`,
    });
  }

  if (copiedImages.length === 0) {
    throw new Error("No se encontraron imagenes validas para generar el modelo.");
  }

  if (job.canceled) {
    sendError(getWindow, { projectId, message: "Generacion cancelada." });
    throw new Error("Generacion cancelada.");
  }

  const mode = resolveGenerationMode(copiedImages[0]);
  const scriptPath = mode === "furniture" ? resolveFurnitureScriptPath() : resolveGeneratorScriptPath();
  if (!scriptPath) {
    if (mode === "furniture") {
      throw new Error("No se encontro apps/desktop/python/image_to_3d_furniture_tables.py");
    }
    throw new Error("No se encontro apps/desktop/python/image_to_3d_depth_glb.py");
  }
  if (!fs.existsSync(PYTHON)) {
    throw new Error(`No se encontro Python en: ${PYTHON}`);
  }

  sendProgress(getWindow, {
    projectId,
    stage: "infer",
    percent: 55,
    message: mode === "furniture"
      ? "Ejecutando reconstructor parametrico de mesas..."
      : "Ejecutando generador de profundidad local...",
  });

  const localResult = await runLocalPythonGeneration(
    payload,
    copiedImages[0],
    job,
    getWindow,
    scriptPath
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
    glbPath: localResult.outGlbPath,
    outGlbPath: localResult.outGlbPath,
    sourceImages: copiedImages,
    preset: payload.preset,
    device: localResult.device,
  });

  return {
    outPath: localResult.outGlbPath,
    device: localResult.device,
  };
}

function buildGeneratorCheckResult(): GenerationCheckResult {
  const scriptPath = resolveGeneratorScriptPath();
  const furnitureScriptPath = resolveFurnitureScriptPath();
  const pythonFound = fs.existsSync(PYTHON);
  const logs = [
    `script: ${scriptPath ?? "not found"}`,
    `furniture_script: ${furnitureScriptPath ?? "not found"}`,
    `python: ${PYTHON}`,
    `pythonFound: ${pythonFound}`,
    "generator: image_to_3d_depth_glb.py",
    "generator_mode_switch: handled inside image_to_3d_depth_glb.py via object detection",
  ];

  return {
    pythonFound,
    pythonPath: PYTHON,
    venvPath: path.dirname(path.dirname(PYTHON)),
    scriptFound: Boolean(scriptPath),
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

      const hasAtLeastOneImage = payload.imagePaths.some((imagePath) => {
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
      };
    } catch (error) {
      const runError = createGenerationRunErrorResult(error);
      logErr("[gen:run] handler error:", runError.error);
      if (projectId) {
        sendError(getWindow, {
          projectId,
          message: runError.error,
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

  ipcMain.handle(IPC_CHANNELS.generationCheck, async () => {
    return buildGeneratorCheckResult();
  });

  ipcMain.handle(IPC_CHANNELS.generationTest, async (): Promise<GenerationTestResult> => {
    const scriptPath = resolveGeneratorScriptPath();

    if (!scriptPath || !fs.existsSync(PYTHON)) {
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
      scriptPath
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

  ipcMain.handle("gen:open-output-folder", async (_event, payload: { glbPath?: string } | undefined) => {
    const fallbackPath = path.join(app.getPath("userData"), "project-assets");
    const outGlbPath = payload?.glbPath ? payload.glbPath : fallbackPath;
    shell.showItemInFolder(outGlbPath);

    return {
      ok: true,
      path: outGlbPath,
    };
  });
}
