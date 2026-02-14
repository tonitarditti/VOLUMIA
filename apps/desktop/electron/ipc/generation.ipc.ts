import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import { copyFile } from "fs/promises";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join, resolve } from "path";
import {
  IPC_CHANNELS,
  type GenerationCheckResult,
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

type PythonCommand = {
  command: string;
  prefixArgs: string[];
  label: string;
};

type GeneratorRuntime = {
  scriptPath?: string;
  pythonCommand?: PythonCommand;
  venvPath?: string;
  logs: string[];
};

type LocalGenerationResult = {
  ok: boolean;
  logs: string[];
  error?: string;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeJobs = new Map<string, GenerationJobState>();
const latestOutputByProject = new Map<string, string>();

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
    resolve(process.cwd(), "tools", "local_generator", "run_triposr.py"),
    resolve(process.cwd(), "..", "..", "tools", "local_generator", "run_triposr.py"),
    resolve(app.getAppPath(), "tools", "local_generator", "run_triposr.py"),
    resolve(app.getAppPath(), "..", "..", "tools", "local_generator", "run_triposr.py"),
    resolve(process.resourcesPath, "tools", "local_generator", "run_triposr.py"),
    resolve(process.resourcesPath, "app.asar.unpacked", "tools", "local_generator", "run_triposr.py"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveSampleImagePath(scriptPath?: string) {
  const candidates = [
    scriptPath ? resolve(scriptPath, "..", "sample.jpg") : "",
    resolve(process.cwd(), "tools", "local_generator", "sample.jpg"),
    resolve(process.cwd(), "..", "..", "tools", "local_generator", "sample.jpg"),
    resolve(app.getAppPath(), "tools", "local_generator", "sample.jpg"),
    resolve(app.getAppPath(), "..", "..", "tools", "local_generator", "sample.jpg"),
    resolve(process.resourcesPath, "tools", "local_generator", "sample.jpg"),
    resolve(process.resourcesPath, "app.asar.unpacked", "tools", "local_generator", "sample.jpg"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveTemplateGlbPath() {
  const candidates = [
    join(process.cwd(), "apps", "desktop", "assets", "templates", "box.glb"),
    join(process.cwd(), "assets", "templates", "box.glb"),
    join(app.getAppPath(), "assets", "templates", "box.glb"),
    join(process.resourcesPath, "assets", "templates", "box.glb"),
    join(process.resourcesPath, "app.asar.unpacked", "assets", "templates", "box.glb"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function inferVenvPath(pythonPath: string) {
  const normalized = pythonPath.replace(/\\/g, "/").toLowerCase();

  if (normalized.endsWith("/scripts/python.exe")) {
    return resolve(pythonPath, "..", "..");
  }

  if (normalized.endsWith("/bin/python") || normalized.endsWith("/bin/python3")) {
    return resolve(pythonPath, "..", "..");
  }

  return undefined;
}

function detectPythonCommand() {
  const logs: string[] = [];
  const envPython = process.env.VOLUMIA_PYTHON_PATH?.trim();

  const candidates: PythonCommand[] = [];

  if (envPython) {
    candidates.push({ command: envPython, prefixArgs: [], label: envPython });
  }

  candidates.push({ command: "python", prefixArgs: [], label: "python" });

  if (process.platform === "win32") {
    candidates.push({ command: "py", prefixArgs: ["-3"], label: "py -3" });
  }

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefixArgs, "--version"], {
      encoding: "utf-8",
      timeout: 8_000,
    });

    if (result.error) {
      logs.push(`${candidate.label}: ${result.error.message}`);
      continue;
    }

    if (result.status !== 0) {
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      logs.push(`${candidate.label}: ${output || `exit ${result.status}`}`);
      continue;
    }

    const versionOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    logs.push(`${candidate.label}: ${versionOutput || "ok"}`);

    return {
      command: candidate,
      logs,
      venvPath: inferVenvPath(candidate.command),
    };
  }

  return { logs };
}

function resolveGeneratorRuntime(): GeneratorRuntime {
  const logs: string[] = [];
  const scriptPath = resolveGeneratorScriptPath();
  const python = detectPythonCommand();

  if (scriptPath) {
    logs.push(`script: ${scriptPath}`);
  } else {
    logs.push("script: not found");
  }

  logs.push(...python.logs);

  return {
    scriptPath,
    pythonCommand: python.command,
    venvPath: python.venvPath,
    logs,
  };
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

async function runLocalPythonGeneration(
  payload: GenerationRunPayload,
  imagePath: string,
  outGlbPath: string,
  job: GenerationJobState,
  getWindow: WindowGetter,
  runtime: Required<Pick<GeneratorRuntime, "scriptPath" | "pythonCommand">>
): Promise<LocalGenerationResult> {
  const args = [
    ...runtime.pythonCommand.prefixArgs,
    runtime.scriptPath,
    "--out_glb",
    outGlbPath,
    "--image",
    imagePath,
    "--preset",
    payload.preset,
    "--device",
    "cuda",
  ];

  return new Promise<LocalGenerationResult>((resolvePromise) => {
    const logs: string[] = [];
    let settled = false;

    const finish = (result: LocalGenerationResult) => {
      if (settled) return;
      settled = true;
      job.process = null;
      resolvePromise(result);
    };

    const child = spawn(runtime.pythonCommand.command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    job.process = child;

    const stdoutInterface = createInterface({ input: child.stdout });
    const stderrInterface = createInterface({ input: child.stderr });

    stdoutInterface.on("line", (line) => {
      if (!line.trim()) return;

      logs.push(`[stdout] ${line}`);

      const parsedProgress = parseProgressLine(line);
      if (!parsedProgress) {
        return;
      }

      sendProgress(getWindow, {
        projectId: payload.projectId,
        stage: parsedProgress.stage,
        percent: parsedProgress.percent,
        message: parsedProgress.message,
      });
    });

    stderrInterface.on("line", (line) => {
      if (!line.trim()) return;
      logs.push(`[stderr] ${line}`);
    });

    child.once("error", (error) => {
      finish({
        ok: false,
        logs,
        error: `No se pudo iniciar Python: ${error.message}`,
      });
    });

    child.once("close", (code, signal) => {
      stdoutInterface.close();
      stderrInterface.close();

      if (job.canceled) {
        finish({ ok: false, logs, error: "Generacion cancelada." });
        return;
      }

      if (code === 0) {
        if (!existsSync(outGlbPath)) {
          finish({ ok: false, logs, error: "El generador local no produjo un archivo GLB." });
          return;
        }

        const generatedStat = statSync(outGlbPath);
        if (generatedStat.size < 10_000) {
          finish({ ok: false, logs, error: "El GLB generado por Python es invalido (<10KB)." });
          return;
        }

        finish({ ok: true, logs });
        return;
      }

      const signalSuffix = signal ? ` (${signal})` : "";
      finish({
        ok: false,
        logs,
        error: `El generador local finalizo con codigo ${code ?? "desconocido"}${signalSuffix}.`,
      });
    });
  });
}

async function copyFallbackGlb(outGlbPath: string) {
  const templateGlbPath = resolveTemplateGlbPath();

  if (!templateGlbPath) {
    throw new Error("Fallback template GLB is missing at assets/templates/box.glb");
  }

  await copyFile(templateGlbPath, outGlbPath);

  if (!existsSync(outGlbPath)) {
    throw new Error("Failed to create result.glb");
  }

  const stat = statSync(outGlbPath);
  if (stat.size < 10_000) {
    throw new Error("Invalid fallback GLB");
  }
}

async function runGenerationJob(payload: GenerationRunPayload, getWindow: WindowGetter, job: GenerationJobState) {
  const projectId = payload.projectId;
  const safeProjectId = sanitizeProjectId(payload.projectId);
  const userDataPath = app.getPath("userData");
  const baseDir = join(userDataPath, "project-assets", safeProjectId);
  const imagesDir = join(baseDir, "images");
  const outputDir = join(baseDir, "generated", String(Date.now()));
  const outGlbPath = join(outputDir, "result.glb");
  const copiedImages: string[] = [];

  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
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
    const targetPath = join(imagesDir, filename);
    copyFileSync(resolve(imagePath), targetPath);
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

  const runtime = resolveGeneratorRuntime();
  let usedFallback = false;

  if (runtime.pythonCommand && runtime.scriptPath) {
    sendProgress(getWindow, {
      projectId,
      stage: "infer",
      percent: 55,
      message: "Ejecutando generador local...",
    });

    const localResult = await runLocalPythonGeneration(
      payload,
      copiedImages[0],
      outGlbPath,
      job,
      getWindow,
      { scriptPath: runtime.scriptPath, pythonCommand: runtime.pythonCommand }
    );

    if (!localResult.ok) {
      if (job.canceled) {
        sendError(getWindow, { projectId, message: "Generacion cancelada." });
        return;
      }

      usedFallback = true;
      sendProgress(getWindow, {
        projectId,
        stage: "infer",
        percent: 70,
        message: "Generador local no disponible, usando fallback GLB.",
      });
    }
  } else {
    usedFallback = true;
    sendProgress(getWindow, {
      projectId,
      stage: "infer",
      percent: 70,
      message: "Generador local no detectado, usando fallback GLB.",
    });
  }

  if (usedFallback) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      return;
    }

    sendProgress(getWindow, {
      projectId,
      stage: "export",
      percent: 90,
      message: "Exportando fallback GLB...",
    });

    await copyFallbackGlb(outGlbPath);
  }

  latestOutputByProject.set(projectId, outGlbPath);

  sendProgress(getWindow, {
    projectId,
    stage: "done",
    percent: 100,
    message: usedFallback ? "Modelo 3D listo (fallback)." : "Modelo 3D listo.",
  });

  sendDone(getWindow, {
    projectId,
    glbPath: outGlbPath,
    sourceImages: copiedImages,
    preset: payload.preset,
  });
}

function buildGeneratorCheckResult(): GenerationCheckResult {
  const runtime = resolveGeneratorRuntime();

  return {
    pythonFound: Boolean(runtime.pythonCommand),
    pythonPath: runtime.pythonCommand?.label,
    venvPath: runtime.venvPath,
    scriptFound: Boolean(runtime.scriptPath),
    scriptPath: runtime.scriptPath,
    logs: runtime.logs,
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
    const runtime = resolveGeneratorRuntime();

    if (!runtime.scriptPath || !runtime.pythonCommand) {
      return {
        ok: false,
        error: "No se encontro un generador local valido.",
        logs: runtime.logs,
      };
    }

    const sampleImagePath = resolveSampleImagePath(runtime.scriptPath);
    if (!sampleImagePath) {
      return {
        ok: false,
        error: "No se encontro tools/local_generator/sample.jpg.",
        logs: runtime.logs,
      };
    }

    const testProjectId = "_generator-test";
    const userDataPath = app.getPath("userData");
    const testOutputDir = join(
      userDataPath,
      "project-assets",
      testProjectId,
      "generated",
      String(Date.now())
    );
    const outGlbPath = join(testOutputDir, "result.glb");
    mkdirSync(testOutputDir, { recursive: true });

    const testPayload: GenerationRunPayload = {
      projectId: testProjectId,
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
      outGlbPath,
      testJob,
      getWindow,
      { scriptPath: runtime.scriptPath, pythonCommand: runtime.pythonCommand }
    );

    const logs = [...runtime.logs, ...localResult.logs];

    if (!localResult.ok) {
      return {
        ok: false,
        error: localResult.error ?? "El test del generador local fallo.",
        logs,
      };
    }

    return {
      ok: true,
      glbPath: outGlbPath,
      logs,
    };
  });

  ipcMain.handle("gen:read-glb", async (_event, glbPath: string) => {
    if (!existsSync(glbPath)) {
      throw new Error("GLB file not found");
    }

    const buffer = readFileSync(glbPath);
    return buffer;
  });

  ipcMain.handle("gen:open-output-folder", async (_event, payload: { glbPath?: string } | undefined) => {
    const fallbackPath = join(app.getPath("userData"), "project-assets");
    const outGlbPath =
      payload?.glbPath
        ? payload.glbPath
        : fallbackPath;
    shell.showItemInFolder(outGlbPath);

    return {
      ok: true,
      path: outGlbPath,
    };
  });
}
