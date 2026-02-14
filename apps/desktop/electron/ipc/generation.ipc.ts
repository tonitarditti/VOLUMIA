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
  type GenerationRunResult,
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
};

const PYTHON = "F:\\MINICONDA\\envs\\volumia\\python.exe";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeJobs = new Map<string, GenerationJobState>();
const latestOutputByProject = new Map<string, string>();

function runPython(
  scriptPath: string,
  args: string[],
  spawnEnv: NodeJS.ProcessEnv,
  onProcess?: (process: ChildProcess) => void
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolvePromise) => {
    console.log("[VOLUMIA] Using Python:", PYTHON);
    const p = spawn(PYTHON, [scriptPath, ...args], { windowsHide: true, env: spawnEnv });
    onProcess?.(p);

    let stdout = "";
    let stderr = "";

    p.stdout?.on("data", (d) => (stdout += d.toString()));
    p.stderr?.on("data", (d) => (stderr += d.toString()));
    p.on("error", (error) => {
      stderr += `\n${error.message}`;
    });

    p.on("close", (code) => resolvePromise({ stdout, stderr, code: code ?? -1 }));
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

function resolveGenerationMode(imagePath: string): "furniture" | "generic" {
  const lower = path.basename(imagePath).toLowerCase();
  if (lower.includes("table")) {
    return "furniture";
  }
  return "generic";
}

function parseProgressLine(rawLine: string) {
  const line = rawLine.trim();
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as {
      stage?: unknown;
      percent?: unknown;
      message?: unknown;
    };

    if (typeof parsed.stage !== "string" || typeof parsed.message !== "string") {
      return null;
    }

    const numericPercent =
      typeof parsed.percent === "number" ? parsed.percent : Number.parseFloat(String(parsed.percent ?? ""));

    if (!Number.isFinite(numericPercent)) {
      return null;
    }

    return {
      stage: parsed.stage,
      percent: Math.max(0, Math.min(100, Math.round(numericPercent))),
      message: parsed.message,
    };
  } catch {
    return null;
  }
}

function parseDeviceLine(rawLine: string): GenerationDevice | null {
  const line = rawLine.trim();
  const match = line.match(/^\[VOLUMIA_DEVICE\]\s+device=(cuda|cpu)\s+index=-?\d+\s+name="([^"]*)"$/);
  if (!match) {
    return null;
  }

  return {
    device: match[1] as "cuda" | "cpu",
    name: match[2],
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
      VOLUMIA_CACHE_DIR: assetsDir,
      HF_HOME: modelsDir,
      TRANSFORMERS_CACHE: modelsDir,
      TORCH_HOME: modelsDir,
      PIP_CACHE_DIR: pipDir,
    };

    const { stdout, stderr, code } = await runPython(scriptPath, [
      "--in", imagePath,
      "--out", outGlb,
      "--quality", mapPresetToQuality(payload.preset),
      "--models-dir", modelsDir,
    ], spawnEnv, (process) => {
      job.process = process;
    });
    job.process = null;

    console.log("[PY] exit:", code);
    console.log("[PY] stdout:", stdout);
    console.error("[PY] stderr:", stderr);

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
        });
      }

      const parsedProgress = parseProgressLine(line);
      if (parsedProgress) {
        sendProgress(getWindow, {
          projectId: payload.projectId,
          stage: parsedProgress.stage,
          percent: parsedProgress.percent,
          message: parsedProgress.message,
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

    if (code !== 0) {
      return {
        ok: false,
        logs,
        error: `El generador local finalizo con error (code: ${code}).`,
      };
    }

    await ensureGlbOk(outGlb);

    return {
      ok: true,
      logs,
      outGlbPath: outGlb,
      device,
    };
  } catch (error) {
    return {
      ok: false,
      logs,
      error: error instanceof Error ? error.message : "No se pudo ejecutar el generador local.",
    };
  }
}

async function runGenerationJob(payload: GenerationRunPayload, getWindow: WindowGetter, job: GenerationJobState) {
  const projectId = payload.projectId;
  const safeProjectId = sanitizeProjectId(payload.projectId);
  const userDataPath = app.getPath("userData");
  const baseDir = path.join(userDataPath, "project-assets", safeProjectId);
  const imagesDir = path.join(baseDir, "images");
  const outGlbPath = path.join(ensureAssetsDir(), "latest.glb");
  const copiedImages: string[] = [];

  fs.mkdirSync(imagesDir, { recursive: true });
  console.log("[gen] userData:", userDataPath);
  console.log("[gen] outGlb:", outGlbPath);

  sendProgress(getWindow, {
    projectId,
    stage: "preprocess",
    percent: 5,
    message: "Preparando archivos...",
  });

  for (let index = 0; index < payload.imagePaths.length; index += 1) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      return;
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
    return;
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
      return;
    }
    throw new Error(localResult.error ?? "Fallo la generacion Image->3D.");
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
    "generator_mode_switch: filename contains 'table' -> furniture",
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

  ipcMain.handle(IPC_CHANNELS.generationRun, async (_event, payload: unknown): Promise<GenerationRunResult> => {
    if (!validateRunPayload(payload)) {
      return { ok: false, error: "Invalid generation payload." };
    }

    if (activeJobs.has(payload.projectId)) {
      return { ok: false, error: "A generation job is already running for this project." };
    }

    const hasAtLeastOneImage = payload.imagePaths.some((imagePath) => {
      return IMAGE_EXTENSIONS.has(extname(imagePath).toLowerCase());
    });

    if (!hasAtLeastOneImage) {
      return { ok: false, error: "No valid images were selected." };
    }

    const job: GenerationJobState = { canceled: false, process: null };
    activeJobs.set(payload.projectId, job);

    void runGenerationJob(payload, getWindow, job)
      .catch((error) => {
        sendError(getWindow, {
          projectId: payload.projectId,
          message: error instanceof Error ? error.message : "Generation failed unexpectedly.",
        });
      })
      .finally(() => {
        activeJobs.delete(payload.projectId);
      });

    return { ok: true };
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
