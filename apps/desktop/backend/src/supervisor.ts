import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { ComfyApi } from "./comfyApi";
import { logger } from "./logger";
import { checkModelsInstalled, ensureModels } from "./modelRegistry";
import {
  getBackendRootDir,
  getLogsDir,
  getOutputsDir,
  getWorkflowsDir,
} from "./paths";
import {
  killProcessTree,
  ProcessManager,
  waitForPort,
  type ManagedProcess,
} from "./processManager";
import {
  loadBackendConfig,
  resolveComfyLaunchPlan,
  saveComfyUserConfig,
  type ComfyRuntimeConfig,
} from "./runtimeConfig";
import {
  applyImageInputToWorkflow,
  getActiveWorkflowInfo,
  getCheckpointUsages,
  getWorkflowPath,
  importWorkflowFromDisk,
  loadWorkflowJson,
  patchWorkflowCheckpoints,
  syncWorkflows,
  type WorkflowCheckpointUsage,
} from "./workflowManager";

export type BackendMode = "dev" | "prod";
export type BackendServiceState = "stopped" | "starting" | "running" | "error";
export type ComfySupervisorState = "STOPPED" | "STARTING" | "READY" | "ERROR";

export type ComfyStatus = {
  state: ComfySupervisorState;
  running: boolean;
  url: string;
  pid: number | null;
  startedByApp: boolean;
  lastError: string | null;
  lastLogs: string[];
  message: string;
  host: string;
  port: number;
  config: {
    comfyDir: string;
    condaHook: string;
    condaEnvName: string;
    pythonExeOverride: string;
    startupTimeoutMs: number;
  };
};

export type BackendStatus = {
  mode: BackendMode;
  startedAt: string | null;
  workflows: {
    sourceDir: string;
    targetDir: string;
    copied: number;
    replaced: number;
    backups: number;
    lastSyncAt: string | null;
    error: string | null;
    activeName: string | null;
    activePath: string | null;
  };
  models: {
    ok: boolean;
    totalFiles: number;
    installedFiles: number;
    message: string;
    error: string | null;
  };
  comfy: {
    running: boolean;
    url: string;
    pid: number | null;
    lastError: string | null;
    state: BackendServiceState;
    host: string;
    port: number;
    python: string | null;
    comfyRoot: string | null;
    healthy: boolean;
    external: boolean;
    message: string;
  };
  activeProcesses: Array<{ name: string; pid: number }>;
  notes: string[];
};

export type RunWorkflowResult = {
  promptId: string;
  workflowName: string;
  workflowPath: string;
  message: string;
  outputGlbPath?: string;
};

export type ComfyWorkflowJobState =
  | "QUEUED"
  | "RUNNING"
  | "RESULT_READY"
  | "ERROR"
  | "CANCELED";

export type TextureStageStatus = "ready" | "failed" | "skipped";

export type TexgenDependencySnapshot = {
  moduleRoots: string[];
  validModuleRoots: string[];
  hasCustomRasterizer: boolean;
  hasDifferentiableRenderer: boolean;
  missingPaths: string[];
  pythonExecutable: string | null;
  pythonRunnerDetails: string | null;
  importChecks: Record<string, string>;
};

export type TexturedGlbValidation = {
  ok: boolean;
  hasMaterials: boolean;
  hasImages: boolean;
  hasTextures: boolean;
  hasMaterialTextureBinding: boolean;
  reason?: string;
};

export type ComfyWorkflowJobOutputs = {
  glbPath?: string;
  meshPath?: string;
  texturedGlbPath?: string;
  textureStatus?: TextureStageStatus;
  textureErrorLogPath?: string;
  textureMetadataPath?: string;
  textureDependencies?: TexgenDependencySnapshot;
  textureValidation?: TexturedGlbValidation;
  previewImages?: string[];
  raw?: unknown;
};

export type ComfyWorkflowJobStatus = {
  jobId: string;
  promptId: string;
  workflowName: string;
  workflowPath: string;
  state: ComfyWorkflowJobState;
  progress: number;
  message: string;
  queuePosition?: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  outputs?: ComfyWorkflowJobOutputs;
  error?: {
    code?: string;
    message: string;
  };
};

export type ImportWorkflowResult = {
  workflowName: string;
  workflowPath: string;
  message: string;
};

type RunWorkflowInput = {
  imagePath?: string;
  imageBase64?: string;
};

type PreparedWorkflowSubmission = {
  workflowName: string;
  workflowPath: string;
  workflowJson: unknown;
  comfyOutputDir: string;
  outputBefore: FileSnapshot[];
  startedAtMs: number;
  inputImagePath: string | null;
};

type WorkflowJobRecord = ComfyWorkflowJobStatus & {
  projectId?: string;
  inputImagePath?: string;
  outputDir: string;
  outputBefore: FileSnapshot[];
  history?: unknown;
  cancelRequested: boolean;
};

type PythonSnippetResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  runnerDetails: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function summarizeComfyIssue(error: unknown) {
  const raw = errorMessage(error).replace(/\r/g, "\n");
  const firstLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? raw.trim();
  if (firstLine.length <= 220) {
    return firstLine;
  }
  return `${firstLine.slice(0, 217)}...`;
}

function ensurePathExists(targetPath: string, label: string) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} no existe: ${targetPath}`);
  }
}

function quoteCmdArg(value: string) {
  if (value.length === 0) {
    return "\"\"";
  }
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toLegacyState(state: ComfySupervisorState): BackendServiceState {
  if (state === "READY") {
    return "running";
  }
  if (state === "STARTING") {
    return "starting";
  }
  if (state === "ERROR") {
    return "error";
  }
  return "stopped";
}

type FileSnapshot = {
  name: string;
  fullPath: string;
  mtimeMs: number;
  size: number;
};

function listFilesSafe(dirPath: string): FileSnapshot[] {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = fs.statSync(fullPath);
          return {
            name: entry.name,
            fullPath,
            mtimeMs: stats.mtimeMs,
            size: stats.size,
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is FileSnapshot => Boolean(item));
  } catch {
    return [];
  }
}

function newestGlb(files: FileSnapshot[]) {
  const candidates = files.filter(
    (file) => file.size > 0 && file.name.toLowerCase().endsWith(".glb"),
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
}

function findNewGlbFile(
  outputDir: string,
  before: FileSnapshot[],
  startedAtMs: number,
) {
  const beforeByName = new Map(before.map((item) => [item.name, item]));
  const startedThreshold = startedAtMs - 250;
  const nowFiles = listFilesSafe(outputDir);
  const candidates = nowFiles.filter((file) => {
    if (!file.name.toLowerCase().endsWith(".glb") || file.size <= 0) {
      return false;
    }
    if (file.mtimeMs < startedThreshold) {
      return false;
    }
    const previous = beforeByName.get(file.name);
    if (!previous) {
      return true;
    }
    return file.mtimeMs > previous.mtimeMs || file.size !== previous.size;
  });

  return newestGlb(candidates);
}

function waitForNewGlbFile(params: {
  outputDir: string;
  before: FileSnapshot[];
  startedAtMs: number;
  timeoutMs: number;
  pollMs: number;
}) {
  const { outputDir, before, startedAtMs, timeoutMs, pollMs } = params;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const newest = findNewGlbFile(outputDir, before, startedAtMs);
    if (newest) {
      return newest;
    }

    const end = Date.now() + pollMs;
    while (Date.now() < end) {
      // busy wait (sync-only requirement)
    }
  }

  return null;
}

function extractPreviewImagesFromHistory(
  historyEntry: unknown,
  comfyDir: string,
) {
  const previews = new Set<string>();

  const visit = (node: unknown) => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (typeof node !== "object") {
      return;
    }

    const recordNode = node as Record<string, unknown>;
    const filename =
      typeof recordNode.filename === "string" ? recordNode.filename.trim() : "";
    if (filename && /\.(png|jpe?g|webp)$/i.test(filename)) {
      const subfolder =
        typeof recordNode.subfolder === "string"
          ? recordNode.subfolder.trim()
          : "";
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(
            comfyDir,
            "output",
            subfolder.replace(/\//g, path.sep),
            filename,
          );
      previews.add(fullPath);
    }

    for (const value of Object.values(recordNode)) {
      visit(value);
    }
  };

  visit(historyEntry);
  return Array.from(previews.values());
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseGlbJsonChunk(glbPath: string): Record<string, unknown> | null {
  try {
    const file = fs.readFileSync(glbPath);
    if (file.length < 20) {
      return null;
    }
    const magic = file.readUInt32LE(0);
    const version = file.readUInt32LE(4);
    if (magic !== 0x46546c67 || version < 2) {
      return null;
    }
    const jsonChunkLength = file.readUInt32LE(12);
    const jsonChunkType = file.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) {
      return null;
    }
    const jsonStart = 20;
    const jsonEnd = jsonStart + jsonChunkLength;
    if (jsonEnd > file.length) {
      return null;
    }
    const jsonText = file.slice(jsonStart, jsonEnd).toString("utf8");
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validateTexturedGlb(glbPath: string): TexturedGlbValidation {
  const parsed = parseGlbJsonChunk(glbPath);
  if (!parsed) {
    return {
      ok: false,
      hasMaterials: false,
      hasImages: false,
      hasTextures: false,
      hasMaterialTextureBinding: false,
      reason: "No se pudo parsear GLB/JSON chunk para validar texturas.",
    };
  }

  const materials = Array.isArray(parsed.materials) ? parsed.materials : [];
  const images = Array.isArray(parsed.images) ? parsed.images : [];
  const textures = Array.isArray(parsed.textures) ? parsed.textures : [];

  const hasMaterialTextureBinding = materials.some((material) => {
    if (!material || typeof material !== "object" || Array.isArray(material)) {
      return false;
    }
    const node = material as Record<string, unknown>;
    const pbr =
      node.pbrMetallicRoughness &&
      typeof node.pbrMetallicRoughness === "object" &&
      !Array.isArray(node.pbrMetallicRoughness)
        ? (node.pbrMetallicRoughness as Record<string, unknown>)
        : null;

    const pbrTexture =
      pbr?.baseColorTexture ||
      pbr?.metallicRoughnessTexture ||
      pbr?.normalTexture ||
      pbr?.occlusionTexture;

    return Boolean(
      pbrTexture ||
        node.normalTexture ||
        node.occlusionTexture ||
        node.emissiveTexture,
    );
  });

  const validation: TexturedGlbValidation = {
    ok:
      materials.length > 0 &&
      images.length > 0 &&
      textures.length > 0 &&
      hasMaterialTextureBinding,
    hasMaterials: materials.length > 0,
    hasImages: images.length > 0,
    hasTextures: textures.length > 0,
    hasMaterialTextureBinding,
  };

  if (!validation.ok) {
    validation.reason =
      "GLB generado sin binding de texturas/materiales reales (solo color base o material uniforme).";
  }

  return validation;
}

const COMFY_HEALTH_FAILURE_THRESHOLD = 3;
const COMFY_AUTO_RESTART_DELAY_MS = 1_500;
const PREFERRED_TEXGEN_PYTHON_EXE = "F:\\MINICONDA\\envs\\volumia\\python.exe";

export class BackendSupervisor {
  private readonly processManager = new ProcessManager();
  private readonly comfyLogs: string[] = [];
  private readonly comfyLogLimit = 500;
  private readonly workflowJobs = new Map<string, WorkflowJobRecord>();
  private comfyState: ComfySupervisorState = "STOPPED";
  private comfyLastError: string | null = null;
  private config = loadBackendConfig();
  private readonly comfyApi = new ComfyApi({
    getBaseUrl: () => this.config.comfy.baseUrl,
  });

  private started = false;
  private comfyProcess: ManagedProcess | null = null;
  private stoppingComfy = false;
  private comfyHealthFailureCount = 0;
  private comfyAutoRestartConsumed = false;
  private comfyAutoRestartPromise: Promise<void> | null = null;
  private comfyStartPromise: Promise<ComfyStatus> | null = null;
  private comfyRuntimePythonPath: string | null = null;

  private status: BackendStatus = {
    mode: "dev",
    startedAt: null,
    workflows: {
      sourceDir: path.resolve(
        process.cwd(),
        "electron",
        "generation",
        "comfyui-workflows",
      ),
      targetDir: getWorkflowsDir(),
      copied: 0,
      replaced: 0,
      backups: 0,
      lastSyncAt: null,
      error: null,
      activeName: null,
      activePath: null,
    },
    models: {
      ok: false,
      totalFiles: 0,
      installedFiles: 0,
      message: "Model check no ejecutado.",
      error: null,
    },
    comfy: {
      running: false,
      url: this.config.comfy.baseUrl,
      pid: null,
      lastError: null,
      state: "stopped",
      host: this.config.comfy.host,
      port: this.config.comfy.port,
      python: null,
      comfyRoot: this.config.comfy.comfyDir,
      healthy: false,
      external: false,
      message: "ComfyUI no iniciado.",
    },
    activeProcesses: [],
    notes: [],
  };

  private refreshConfig(reload = false) {
    this.config = loadBackendConfig({ reload });
  }

  private appendComfyLog(line: string, level: "info" | "warn" = "info") {
    const formatted = `${new Date().toISOString()} [${level.toUpperCase()}] ${line}`;
    this.comfyLogs.push(formatted);
    if (this.comfyLogs.length > this.comfyLogLimit) {
      this.comfyLogs.splice(0, this.comfyLogs.length - this.comfyLogLimit);
    }
  }

  private logTexgenFallback(
    stageLabel: string,
    shapeGlbPath: string,
    reason?: string,
  ) {
    const suffix = reason ? ` reason=${reason}` : "";
    this.appendComfyLog(
      `[${stageLabel}] fallback used: shape_glb=${shapeGlbPath}${suffix}`,
      "warn",
    );
  }

  private refreshProcessSnapshot() {
    this.status.activeProcesses = this.processManager.getActiveProcesses();
  }

  private refreshActiveWorkflowStatus() {
    try {
      const active = getActiveWorkflowInfo();
      this.status.workflows.activeName = active.name;
      this.status.workflows.activePath = active.path;
      return active;
    } catch (error) {
      const message = errorMessage(error);
      this.status.workflows.activeName = null;
      this.status.workflows.activePath = null;
      this.status.workflows.error = message;
      return null;
    }
  }

  private pushNote(note: string) {
    this.status.notes = [...this.status.notes, note].slice(-25);
  }

  private updateLegacyComfyFromSnapshot(snapshot: ComfyStatus) {
    this.status.comfy.running = snapshot.running;
    this.status.comfy.url = snapshot.url;
    this.status.comfy.pid = snapshot.pid;
    this.status.comfy.lastError = snapshot.lastError;
    this.status.comfy.state = toLegacyState(snapshot.state);
    this.status.comfy.host = snapshot.host;
    this.status.comfy.port = snapshot.port;
    const configuredPython = snapshot.config.pythonExeOverride.trim();
    this.status.comfy.python =
      this.comfyRuntimePythonPath ?? (configuredPython.length > 0 ? configuredPython : null);
    this.status.comfy.comfyRoot = snapshot.config.comfyDir;
    this.status.comfy.healthy = snapshot.running;
    this.status.comfy.external = snapshot.running && !snapshot.startedByApp;
    this.status.comfy.message = snapshot.message;
  }

  private setComfyError(message: string) {
    const summary = summarizeComfyIssue(message);
    this.comfyState = "ERROR";
    this.comfyLastError = summary;
    this.status.comfy.message = summary;
    this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
    return summary;
  }

  private markComfyReady(message: string) {
    this.comfyState = "READY";
    this.comfyLastError = null;
    this.comfyHealthFailureCount = 0;
    this.comfyAutoRestartConsumed = false;
    this.status.comfy.message = message;
    this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
  }

  private scheduleComfyAutoRestart(reason: string) {
    if (
      this.stoppingComfy ||
      this.comfyAutoRestartConsumed ||
      this.comfyAutoRestartPromise
    ) {
      return;
    }

    this.comfyAutoRestartConsumed = true;
    this.appendComfyLog(
      `AI engine stopped. Scheduling one auto-restart in ${COMFY_AUTO_RESTART_DELAY_MS}ms. Reason: ${reason}`,
      "warn",
    );

    this.comfyAutoRestartPromise = (async () => {
      await sleep(COMFY_AUTO_RESTART_DELAY_MS);
      if (this.stoppingComfy) {
        return;
      }

      try {
        await this.startComfyUI();
        this.appendComfyLog("ComfyUI auto-restart completed successfully.");
      } catch (error) {
        const summary = summarizeComfyIssue(error);
        this.appendComfyLog(`ComfyUI auto-restart failed: ${summary}`, "warn");
        this.setComfyError(summary);
      }
    })().finally(() => {
      this.comfyAutoRestartPromise = null;
    });
  }

  private handleComfyFailure(
    message: string,
    options?: { autoRestart?: boolean },
  ) {
    const summary = this.setComfyError(message);
    this.appendComfyLog(summary, "warn");
    logger.warn(summary);

    if (options?.autoRestart) {
      this.scheduleComfyAutoRestart(summary);
    }
  }

  private async clearTrackedComfyProcess(reason: string) {
    if (!this.comfyProcess?.pid) {
      return;
    }

    const tracked = this.comfyProcess;
    this.appendComfyLog(
      `Clearing tracked ComfyUI process (${tracked.pid}) before restart. Reason: ${reason}`,
      "warn",
    );
    try {
      tracked.child.kill("SIGTERM");
    } catch {
      // best effort
    }
    await killProcessTree(tracked.pid);
    await Promise.race([tracked.exit.catch(() => undefined), sleep(1_500)]);
    if (this.comfyProcess?.pid === tracked.pid) {
      this.comfyProcess = null;
    }
    this.refreshProcessSnapshot();
  }

  private async resolvePortConflictBeforeStart() {
    const portOpen = await waitForPort(
      this.config.comfy.host,
      this.config.comfy.port,
      1_200,
    );
    if (!portOpen) {
      return;
    }

    const health = await this.comfyApi.health();
    if (health.ok) {
      this.markComfyReady(health.message);
      return;
    }

    if (this.comfyProcess?.pid) {
      await this.clearTrackedComfyProcess("non-responsive port occupant");
      return;
    }

    const message = [
      `Puerto ${this.config.comfy.host}:${this.config.comfy.port} ya esta en uso, pero ComfyUI no responde.`,
      "Cierra el proceso anterior o cambia el puerto configurado antes de reiniciar el engine.",
    ].join(" ");
    this.setComfyError(message);
    throw new Error(message);
  }

  private async refreshComfyHealth() {
    const health = await this.comfyApi.health();
    if (health.ok) {
      this.comfyHealthFailureCount = 0;
      if (this.comfyState !== "STARTING") {
        this.markComfyReady(health.message);
      } else {
        this.status.comfy.message = health.message;
      }
      return health;
    }

    const summary = summarizeComfyIssue(health.message);
    const shouldWatchHealth =
      this.comfyState === "READY" || Boolean(this.comfyProcess?.pid);
    if (shouldWatchHealth) {
      this.comfyHealthFailureCount += 1;
      if (this.comfyHealthFailureCount >= COMFY_HEALTH_FAILURE_THRESHOLD) {
        this.handleComfyFailure(health.message, {
          autoRestart: Boolean(this.comfyProcess?.pid),
        });
      } else {
        this.comfyLastError = summary;
        this.status.comfy.message = `Healthcheck failed (${this.comfyHealthFailureCount}/${COMFY_HEALTH_FAILURE_THRESHOLD}). ${summary}`;
        this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
      }
    } else if (this.comfyState === "ERROR") {
      this.comfyLastError = summary;
      this.status.comfy.message = summary;
      this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
    }
    return health;
  }

  private decodeBase64Image(base64Input: string) {
    const trimmed = base64Input.trim();
    const withoutDataUrl = trimmed.startsWith("data:")
      ? trimmed.slice(trimmed.indexOf(",") + 1)
      : trimmed;
    return Buffer.from(withoutDataUrl, "base64");
  }

  private async resolveWorkflowInputImagePath(input?: RunWorkflowInput) {
    if (input?.imagePath) {
      const imagePath = path.resolve(input.imagePath);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Imagen de entrada no encontrada: ${imagePath}`);
      }
      return imagePath;
    }

    if (input?.imageBase64 && input.imageBase64.trim().length > 0) {
      const uploadsDir = path.join(getOutputsDir(), "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      const tempFilePath = path.join(
        uploadsDir,
        `backend-upload-${Date.now()}.png`,
      );
      const buffer = this.decodeBase64Image(input.imageBase64);
      fs.writeFileSync(tempFilePath, buffer);
      return tempFilePath;
    }

    return null;
  }

  private async validateCheckpointsAfterPatch(
    checkpointUsages: WorkflowCheckpointUsage[],
    availableCheckpoints: string[],
  ) {
    if (checkpointUsages.length === 0 || availableCheckpoints.length === 0) {
      return;
    }

    const invalid = checkpointUsages.filter(
      (usage) => !availableCheckpoints.includes(usage.ckptName),
    );
    if (invalid.length === 0) {
      return;
    }

    const invalidSummary = invalid
      .map((usage) => `${usage.ckptName} (node ${usage.nodeId})`)
      .join(", ");
    const message = [
      `Workflow usa checkpoints no disponibles en ComfyUI: ${invalidSummary}`,
      `Disponibles: ${availableCheckpoints.join(", ")}`,
      "Corrige el workflow JSON exportado o instala el checkpoint faltante.",
    ].join("\n");
    throw new Error(message);
  }

  private extractGlbPathFromHistory(history: unknown): string | null {
    const candidates: string[] = [];

    const visit = (node: unknown) => {
      if (!node) {
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item);
        }
        return;
      }
      if (typeof node !== "object") {
        return;
      }

      const recordNode = node as Record<string, unknown>;
      const directPath =
        typeof recordNode.path === "string" ? recordNode.path.trim() : "";
      if (directPath.toLowerCase().endsWith(".glb")) {
        candidates.push(directPath);
      }

      const filename =
        typeof recordNode.filename === "string"
          ? recordNode.filename.trim()
          : "";
      if (filename.toLowerCase().endsWith(".glb")) {
        const subfolder =
          typeof recordNode.subfolder === "string"
            ? recordNode.subfolder.trim()
            : "";
        const combined = subfolder
          ? `${subfolder.replace(/\\/g, "/")}/${filename}`
          : filename;
        candidates.push(combined);
      }

      for (const value of Object.values(recordNode)) {
        visit(value);
      }
    };

    visit(history);
    return candidates[0] ?? null;
  }

  private buildOutputPathFromHistory(history: unknown) {
    const relativeOrAbsolute = this.extractGlbPathFromHistory(history);
    if (!relativeOrAbsolute) {
      return null;
    }

    if (path.isAbsolute(relativeOrAbsolute)) {
      return relativeOrAbsolute;
    }

    const normalized = relativeOrAbsolute.replace(/\//g, path.sep);
    return path.join(this.config.comfy.comfyDir, "output", normalized);
  }

  private runPythonSnippet(script: string, moduleRoots: string[] = [], timeoutMs = 25_000): PythonSnippetResult {
    const scriptLines: string[] = [];
    if (moduleRoots.length > 0) {
      const rootsJson = JSON.stringify(moduleRoots);
      scriptLines.push(
        "import os, sys",
        `__volumia_roots = ${rootsJson}`,
        "for __root in __volumia_roots:",
        "  if not isinstance(__root, str) or len(__root) == 0:",
        "    continue",
        "  __abs = os.path.abspath(__root)",
        "  __texgen = os.path.join(__abs, 'hy3dgen', 'texgen')",
        "  for __candidate in (__abs, __texgen):",
        "    if os.path.isdir(__candidate) and __candidate not in sys.path:",
        "      sys.path.insert(0, __candidate)",
      );
    }
    scriptLines.push(script);
    const runner = this.resolveTexgenRunner("-c", [scriptLines.join("\n")]);
    const result = spawnSync(runner.command, runner.args, {
      cwd: runner.cwd,
      env: process.env,
      windowsHide: true,
      shell: false,
      encoding: "utf8",
      timeout: timeoutMs,
    });

    return {
      ok: !result.error && result.status === 0,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
      status: result.status,
      signal: result.signal,
      runnerDetails: runner.details,
    };
  }

  private parseJsonFromPythonSnippetOutput(stdout: string) {
    const lines = stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      try {
        return JSON.parse(line) as unknown;
      } catch {
        // Continue scanning prior lines.
      }
    }
    return null;
  }

  private discoverTexgenModuleRootsFromPython() {
    const probe = this.runPythonSnippet(
      [
        "import json, os, sys",
        "payload = {'python': sys.executable, 'module_roots': [], 'error': None}",
        "try:",
        "  import hy3dgen, hy3dgen.texgen as texgen",
        "  hy3dgen_pkg = os.path.dirname(getattr(hy3dgen, '__file__', '') or '')",
        "  texgen_pkg = os.path.dirname(getattr(texgen, '__file__', '') or '')",
        "  roots = set()",
        "  if hy3dgen_pkg:",
        "    roots.add(os.path.abspath(os.path.dirname(hy3dgen_pkg)))",
        "  if texgen_pkg:",
        "    roots.add(os.path.abspath(os.path.join(texgen_pkg, '..', '..')))",
        "  payload['module_roots'] = sorted(item for item in roots if os.path.isdir(item))",
        "except Exception as exc:",
        "  payload['error'] = f'{type(exc).__name__}: {exc}'",
        "print(json.dumps(payload, ensure_ascii=False))",
      ].join("\n"),
      [],
      30_000,
    );

    const parsed = this.parseJsonFromPythonSnippetOutput(probe.stdout);
    let pythonExecutable: string | null = null;
    let moduleRoots: string[] = [];
    let error: string | null = null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const payload = parsed as Record<string, unknown>;
      pythonExecutable = typeof payload.python === "string" ? payload.python.trim() : null;
      if (Array.isArray(payload.module_roots)) {
        moduleRoots = payload.module_roots
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        error = payload.error.trim();
      }
    }

    if (!probe.ok && !error) {
      const details = [
        `status=${String(probe.status)}`,
        probe.signal ? `signal=${probe.signal}` : "",
        probe.stderr.trim() ? `stderr=${probe.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      error = details || "python discovery failed";
    }

    if (pythonExecutable && pythonExecutable.length > 0) {
      this.comfyRuntimePythonPath = pythonExecutable;
    }

    return {
      moduleRoots,
      pythonExecutable: pythonExecutable && pythonExecutable.length > 0 ? pythonExecutable : null,
      runnerDetails: probe.runnerDetails,
      error,
    };
  }

  private probeTexgenRequiredImports(moduleRoots: string[]) {
    const probe = this.runPythonSnippet(
      [
        "import importlib, json, sys",
        "modules = [",
        "  'torch',",
        "  'custom_rasterizer_kernel',",
        "  'custom_rasterizer',",
        "  'hy3dgen',",
        "  'hy3dgen.texgen',",
        "  'hy3dgen.texgen.differentiable_renderer.mesh_processor',",
        "  'hy3dgen.texgen.differentiable_renderer.mesh_render',",
        "  'segment_anything',",
        "]",
        "results = {}",
        "for module_name in modules:",
        "  try:",
        "    importlib.import_module(module_name)",
        "    results[module_name] = 'ok'",
        "  except Exception as exc:",
        "    results[module_name] = f'{type(exc).__name__}: {exc}'",
        "print(json.dumps({'python': sys.executable, 'results': results}, ensure_ascii=False))",
      ].join("\n"),
      moduleRoots,
      45_000,
    );

    const parsed = this.parseJsonFromPythonSnippetOutput(probe.stdout);
    const importChecks: Record<string, string> = {
      torch: "probe-not-run",
      hy3dgen: "probe-not-run",
      "hy3dgen.texgen": "probe-not-run",
      custom_rasterizer_kernel: "probe-not-run",
      custom_rasterizer: "probe-not-run",
      "hy3dgen.texgen.differentiable_renderer.mesh_processor": "probe-not-run",
      "hy3dgen.texgen.differentiable_renderer.mesh_render": "probe-not-run",
      segment_anything: "probe-not-run",
    };
    let pythonExecutable: string | null = this.comfyRuntimePythonPath;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const payload = parsed as Record<string, unknown>;
      if (typeof payload.python === "string" && payload.python.trim().length > 0) {
        pythonExecutable = payload.python.trim();
        this.comfyRuntimePythonPath = pythonExecutable;
      }
      if (payload.results && typeof payload.results === "object" && !Array.isArray(payload.results)) {
        for (const [moduleName, value] of Object.entries(payload.results as Record<string, unknown>)) {
          if (typeof value === "string") {
            importChecks[moduleName] = value;
          }
        }
      }
    } else if (!probe.ok) {
      const summary = [
        `status=${String(probe.status)}`,
        probe.signal ? `signal=${probe.signal}` : "",
        probe.stderr.trim() ? `stderr=${probe.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const message = summary || "python import probe failed";
      for (const key of Object.keys(importChecks)) {
        importChecks[key] = message;
      }
    }

    const requiredModules = [
      "torch",
      "hy3dgen",
      "hy3dgen.texgen",
      "custom_rasterizer_kernel",
      "hy3dgen.texgen.differentiable_renderer.mesh_processor",
      "hy3dgen.texgen.differentiable_renderer.mesh_render",
    ] as const;
    const optionalModules = ["custom_rasterizer", "segment_anything"] as const;
    const missingImports = requiredModules
      .filter((moduleName) => importChecks[moduleName] !== "ok")
      .map((moduleName) => `${moduleName}: ${importChecks[moduleName]}`);
    const optionalMissingImports = optionalModules
      .filter((moduleName) => importChecks[moduleName] !== "ok")
      .map((moduleName) => `${moduleName}: ${importChecks[moduleName]}`);

    return {
      pythonExecutable,
      runnerDetails: probe.runnerDetails,
      importChecks,
      missingImports,
      optionalMissingImports,
    };
  }

  private collectTexgenModuleRootCandidates() {
    const candidates = new Set<string>();
    const addCandidate = (value: string) => {
      const normalized = path.resolve(value);
      if (!fs.existsSync(normalized)) {
        return;
      }
      if (!fs.statSync(normalized).isDirectory()) {
        return;
      }
      candidates.add(normalized);
    };

    addCandidate(this.config.comfy.comfyDir);
    const customNodesDir = path.join(this.config.comfy.comfyDir, "custom_nodes");
    addCandidate(customNodesDir);

    if (fs.existsSync(customNodesDir) && fs.statSync(customNodesDir).isDirectory()) {
      const levelOne = fs.readdirSync(customNodesDir, { withFileTypes: true });
      for (const entry of levelOne) {
        if (!entry.isDirectory()) {
          continue;
        }
        const levelOnePath = path.join(customNodesDir, entry.name);
        addCandidate(levelOnePath);
        try {
          const levelTwo = fs.readdirSync(levelOnePath, { withFileTypes: true });
          for (const nested of levelTwo) {
            if (nested.isDirectory()) {
              addCandidate(path.join(levelOnePath, nested.name));
            }
          }
        } catch {
          // No-op by design.
        }
      }
    }

    return Array.from(candidates.values());
  }

  private resolveTexgenDependencies(): TexgenDependencySnapshot {
    const moduleRootSet = new Set<string>(this.collectTexgenModuleRootCandidates());
    const pythonDiscovery = this.discoverTexgenModuleRootsFromPython();
    for (const root of pythonDiscovery.moduleRoots) {
      moduleRootSet.add(path.resolve(root));
    }
    const moduleRoots = Array.from(moduleRootSet.values());
    const validModuleRoots: string[] = [];
    const missingPaths: string[] = [];
    let hasCustomRasterizer = false;
    let hasDifferentiableRenderer = false;

    for (const moduleRoot of moduleRoots) {
      const texgenRoot = path.join(moduleRoot, "hy3dgen", "texgen");
      const customRasterizerPath = path.join(texgenRoot, "custom_rasterizer");
      const differentiableRendererPath = path.join(
        texgenRoot,
        "differentiable_renderer",
      );

      const customOk = fs.existsSync(customRasterizerPath);
      const diffOk = fs.existsSync(differentiableRendererPath);
      hasCustomRasterizer = hasCustomRasterizer || customOk;
      hasDifferentiableRenderer = hasDifferentiableRenderer || diffOk;

      if (customOk && diffOk) {
        validModuleRoots.push(moduleRoot);
      } else if (fs.existsSync(texgenRoot)) {
        const missing = [];
        if (!customOk) {
          missing.push("custom_rasterizer");
        }
        if (!diffOk) {
          missing.push("differentiable_renderer");
        }
        missingPaths.push(`${moduleRoot}: missing ${missing.join(", ")}`);
      }
    }

    if (!hasCustomRasterizer) {
      missingPaths.push("hy3dgen/texgen/custom_rasterizer");
    }
    if (!hasDifferentiableRenderer) {
      missingPaths.push("hy3dgen/texgen/differentiable_renderer");
    }
    if (pythonDiscovery.error) {
      missingPaths.push(`python-discovery: ${pythonDiscovery.error}`);
    }

    return {
      moduleRoots,
      validModuleRoots,
      hasCustomRasterizer,
      hasDifferentiableRenderer,
      missingPaths: Array.from(new Set(missingPaths.values())),
      pythonExecutable: pythonDiscovery.pythonExecutable,
      pythonRunnerDetails: pythonDiscovery.runnerDetails,
      importChecks: {},
    };
  }

  private resolveTexgenScriptPath() {
    return path.join(getBackendRootDir(), "python", "hunyuan_texgen.py");
  }

  private resolveTexgenRunner(scriptPath: string, scriptArgs: string[]) {
    if (fs.existsSync(PREFERRED_TEXGEN_PYTHON_EXE)) {
      return {
        command: PREFERRED_TEXGEN_PYTHON_EXE,
        args: [scriptPath, ...scriptArgs],
        cwd: this.config.comfy.comfyDir,
        details: `preferred-texgen-python=${PREFERRED_TEXGEN_PYTHON_EXE}`,
      };
    }

    const pythonOverride = this.config.comfy.pythonExeOverride.trim();
    if (pythonOverride && fs.existsSync(pythonOverride)) {
      return {
        command: pythonOverride,
        args: [scriptPath, ...scriptArgs],
        cwd: this.config.comfy.comfyDir,
        details: `pythonExeOverride=${pythonOverride}`,
      };
    }

    const condaHook = this.config.comfy.condaHook.trim();
    const condaEnvName = this.config.comfy.condaEnvName.trim();
    if (condaHook && condaEnvName && fs.existsSync(condaHook)) {
      const condaRoot = path.resolve(path.dirname(condaHook), "..");
      const condaEnvPython = path.join(
        condaRoot,
        "envs",
        condaEnvName,
        "python.exe",
      );
      if (fs.existsSync(condaEnvPython)) {
        return {
          command: condaEnvPython,
          args: [scriptPath, ...scriptArgs],
          cwd: this.config.comfy.comfyDir,
          details: `conda-env-python=${condaEnvPython}`,
        };
      }

      const cmdExe =
        process.env.ComSpec?.trim() || "C:\\Windows\\System32\\cmd.exe";
      const pythonCommand = [
        "python",
        quoteCmdArg(scriptPath),
        ...scriptArgs.map(quoteCmdArg),
      ].join(" ");
      const commandLine = `call ${quoteCmdArg(condaHook)} ${quoteCmdArg(condaEnvName)} && ${pythonCommand}`;
      return {
        command: cmdExe,
        args: ["/d", "/s", "/c", commandLine],
        cwd: this.config.comfy.comfyDir,
        details: `condaHook=${condaHook}; env=${condaEnvName}`,
      };
    }

    return {
      command: "python",
      args: [scriptPath, ...scriptArgs],
      cwd: this.config.comfy.comfyDir,
      details: "python-from-path",
    };
  }

  private async runTexgenScriptProcess(
    scriptPath: string,
    scriptArgs: string[],
    stageLabel: string,
  ) {
    const runner = this.resolveTexgenRunner(scriptPath, scriptArgs);
    return await new Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
      runnerDetails: string;
      timedOut: boolean;
    }>((resolve, reject) => {
      const child = spawn(runner.command, runner.args, {
        cwd: runner.cwd,
        env: process.env,
        windowsHide: true,
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      let completed = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // No-op by design.
        }
      }, 8 * 60 * 1_000);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stdout += text;
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stderr += text;
      });

      child.on("error", (error) => {
        if (completed) {
          return;
        }
        completed = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        if (completed) {
          return;
        }
        completed = true;
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          runnerDetails: runner.details,
          timedOut,
        });
      });

      this.appendComfyLog(
        `[${stageLabel}] Launching texgen with ${runner.details}`,
      );
    });
  }

  private writeTextureMetadata(
    runDir: string,
    payload: Record<string, unknown>,
  ) {
    const textureStatus =
      typeof payload.texture_status === "string"
        ? payload.texture_status
        : typeof payload.textureStatus === "string"
          ? payload.textureStatus
          : "failed";
    const shapeGlbPath =
      typeof payload.shape_glb_path === "string"
        ? payload.shape_glb_path
        : typeof payload.shapeGlbPath === "string"
          ? payload.shapeGlbPath
          : typeof payload.meshPath === "string"
            ? payload.meshPath
            : null;
    const texturedGlbPath =
      typeof payload.textured_glb_path === "string"
        ? payload.textured_glb_path
        : typeof payload.texturedGlbPath === "string"
          ? payload.texturedGlbPath
          : null;
    const error =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.reason === "string"
          ? payload.reason
          : null;
    const normalizedPayload: Record<string, unknown> = {
      ...payload,
      texture_status: textureStatus,
      shape_glb_path: shapeGlbPath,
      textured_glb_path: texturedGlbPath,
      error,
    };
    const metadataPath = path.join(runDir, "texture-metadata.json");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      metadataPath,
      `${JSON.stringify(normalizedPayload, null, 2)}\n`,
      "utf8",
    );
    return metadataPath;
  }

  private async runTextureStage(job: WorkflowJobRecord, meshPath: string) {
    const runDir = path.dirname(meshPath);
    const stageLabel = `texgen:${job.promptId}`;
    const logPath = path.join(getLogsDir(), `${stageLabel}.log`);
    const dependencies = this.resolveTexgenDependencies();
    const nowIso = new Date().toISOString();
    const inputImagePath = job.inputImagePath?.trim() ?? "";
    this.appendComfyLog(`[${stageLabel}] shape output path: ${meshPath}`);

    if (!inputImagePath || !fs.existsSync(inputImagePath)) {
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath: null,
        textureStatus: "skipped",
        texture_status: "skipped",
        shape_glb_path: meshPath,
        textured_glb_path: null,
        error: "Input image path unavailable for texgen stage.",
        reason: "Input image path unavailable for texgen stage.",
        textureDependencies: dependencies,
      });
      this.appendComfyLog(
        `[${stageLabel}] skipped: input image missing (fallback mesh).`,
        "warn",
      );
      this.appendComfyLog(`[${stageLabel}] texture_status=skipped`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, "input image missing");
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath: undefined,
        textureStatus: "skipped" as TextureStageStatus,
        textureErrorLogPath: undefined,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: undefined,
      };
    }

    if (dependencies.validModuleRoots.length === 0) {
      const reason = `Texgen dependencies missing: ${dependencies.missingPaths.join(" | ")}`;
      fs.writeFileSync(logPath, `${reason}\n`, "utf8");
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath: null,
        textureStatus: "failed",
        texture_status: "failed",
        shape_glb_path: meshPath,
        textured_glb_path: null,
        error: reason,
        reason,
        textureDependencies: dependencies,
        textureErrorLogPath: logPath,
      });
      this.appendComfyLog(`[${stageLabel}] ${reason}`, "warn");
      this.appendComfyLog(`[${stageLabel}] texture_status=failed`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, reason);
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath: undefined,
        textureStatus: "failed" as TextureStageStatus,
        textureErrorLogPath: logPath,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: undefined,
      };
    }

    const importProbe = this.probeTexgenRequiredImports(
      dependencies.validModuleRoots,
    );
    dependencies.importChecks = importProbe.importChecks;
    if (importProbe.pythonExecutable) {
      dependencies.pythonExecutable = importProbe.pythonExecutable;
    }
    dependencies.pythonRunnerDetails = importProbe.runnerDetails;
    const importProbeSummary = [
      `python=${dependencies.pythonExecutable ?? "unknown"}`,
      `runner=${importProbe.runnerDetails}`,
      `missing=${importProbe.missingImports.length}`,
    ].join(" ");
    this.appendComfyLog(`[${stageLabel}] texgen import probe: ${importProbeSummary}`);
    const torchStatus = importProbe.importChecks.torch ?? "probe-not-run";
    const customStatus =
      importProbe.importChecks.custom_rasterizer ?? "probe-not-run";
    const meshProcessorStatus =
      importProbe.importChecks[
        "hy3dgen.texgen.differentiable_renderer.mesh_processor"
      ] ?? "probe-not-run";
    const meshRenderStatus =
      importProbe.importChecks[
        "hy3dgen.texgen.differentiable_renderer.mesh_render"
      ] ?? "probe-not-run";
    this.appendComfyLog(
      `[${stageLabel}] torch preload ${torchStatus === "ok" ? "OK" : "FAILED"} (${torchStatus})`,
      torchStatus === "ok" ? "info" : "warn",
    );
    this.appendComfyLog(
      `[${stageLabel}] custom_rasterizer import ${customStatus === "ok" ? "OK" : "FAILED"} (${customStatus})`,
      customStatus === "ok" ? "info" : "warn",
    );
    this.appendComfyLog(
      `[${stageLabel}] mesh_processor import ${meshProcessorStatus === "ok" ? "OK" : "FAILED"} (${meshProcessorStatus})`,
      meshProcessorStatus === "ok" ? "info" : "warn",
    );
    this.appendComfyLog(
      `[${stageLabel}] mesh_render import ${meshRenderStatus === "ok" ? "OK" : "FAILED"} (${meshRenderStatus})`,
      meshRenderStatus === "ok" ? "info" : "warn",
    );
    if (importProbe.optionalMissingImports.length > 0) {
      this.appendComfyLog(
        `[${stageLabel}] optional Python imports missing: ${importProbe.optionalMissingImports.join(" | ")}`,
        "warn",
      );
    }
    if (importProbe.missingImports.length > 0) {
      const reason = `Texgen Python imports missing: ${importProbe.missingImports.join(" | ")}`;
      fs.writeFileSync(logPath, `${reason}\n`, "utf8");
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath: null,
        textureStatus: "failed",
        texture_status: "failed",
        shape_glb_path: meshPath,
        textured_glb_path: null,
        error: reason,
        reason,
        textureDependencies: dependencies,
        textureErrorLogPath: logPath,
      });
      this.appendComfyLog(`[${stageLabel}] ${reason}`, "warn");
      this.appendComfyLog(`[${stageLabel}] texture_status=failed`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, reason);
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath: undefined,
        textureStatus: "failed" as TextureStageStatus,
        textureErrorLogPath: logPath,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: undefined,
      };
    }

    const scriptPath = this.resolveTexgenScriptPath();
    if (!fs.existsSync(scriptPath)) {
      const reason = `Texgen script not found: ${scriptPath}`;
      fs.writeFileSync(logPath, `${reason}\n`, "utf8");
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath: null,
        textureStatus: "failed",
        texture_status: "failed",
        shape_glb_path: meshPath,
        textured_glb_path: null,
        error: reason,
        reason,
        textureDependencies: dependencies,
        textureErrorLogPath: logPath,
      });
      this.appendComfyLog(`[${stageLabel}] ${reason}`, "warn");
      this.appendComfyLog(`[${stageLabel}] texture_status=failed`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, reason);
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath: undefined,
        textureStatus: "failed" as TextureStageStatus,
        textureErrorLogPath: logPath,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: undefined,
      };
    }

    const fallbackTexturedGlbPath = path.join(runDir, "textured.glb");
    const scriptMetadataPath = path.join(runDir, "texture-metadata.json");
    const scriptArgs: string[] = [
      "--mesh",
      meshPath,
      "--image",
      inputImagePath,
      "--output-dir",
      runDir,
    ];

    this.appendComfyLog(`[${stageLabel}] texgen started`);
    const processResult = await this.runTexgenScriptProcess(
      scriptPath,
      scriptArgs,
      stageLabel,
    );
    this.appendComfyLog(
      `[${stageLabel}] texgen completed (exit=${processResult.exitCode}, timed_out=${String(processResult.timedOut)})`,
    );
    const logLines = [
      `stage=${stageLabel}`,
      `runner=${processResult.runnerDetails}`,
      `exit_code=${processResult.exitCode}`,
      `timed_out=${String(processResult.timedOut)}`,
      "",
      "[stdout]",
      processResult.stdout.trim(),
      "",
      "[stderr]",
      processResult.stderr.trim(),
      "",
    ];
    fs.writeFileSync(logPath, `${logLines.join("\n")}\n`, "utf8");

    let texgenJson: Record<string, unknown> | null = null;
    if (fs.existsSync(scriptMetadataPath)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(scriptMetadataPath, "utf8"),
        ) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          texgenJson = parsed as Record<string, unknown>;
        }
      } catch {
        // No-op by design.
      }
    }

    const textureStatusFromScriptRaw =
      typeof texgenJson?.texture_status === "string"
        ? texgenJson.texture_status.trim().toLowerCase()
        : "";
    const textureStatusFromScript =
      textureStatusFromScriptRaw === "completed"
        ? "ready"
        : textureStatusFromScriptRaw;
    const texturedPathFromScript =
      typeof texgenJson?.textured_glb_path === "string"
        ? texgenJson.textured_glb_path.trim()
        : "";
    const texturedGlbPath =
      texturedPathFromScript.length > 0
        ? path.resolve(texturedPathFromScript)
        : fallbackTexturedGlbPath;
    const resolvedTextureStatus: TextureStageStatus =
      textureStatusFromScript === "ready" && fs.existsSync(texturedGlbPath)
        ? "ready"
        : "failed";
    const executionFailed =
      processResult.exitCode !== 0 ||
      processResult.timedOut ||
      resolvedTextureStatus !== "ready" ||
      !fs.existsSync(texturedGlbPath);
    if (executionFailed) {
      const reason =
        typeof texgenJson?.error === "string"
          ? texgenJson.error
          : `Texgen stage failed (exit=${processResult.exitCode}, timedOut=${String(processResult.timedOut)}).`;
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath: null,
        textureStatus: "failed",
        texture_status: "failed",
        shape_glb_path: meshPath,
        textured_glb_path: null,
        error: reason,
        reason,
        textureDependencies: dependencies,
        textureErrorLogPath: logPath,
        texgenResult: texgenJson,
      });
      this.appendComfyLog(`[${stageLabel}] ${reason}`, "warn");
      this.appendComfyLog(`[${stageLabel}] texture_status=failed`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, reason);
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath: undefined,
        textureStatus: "failed" as TextureStageStatus,
        textureErrorLogPath: logPath,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: undefined,
      };
    }

    const validation = validateTexturedGlb(texturedGlbPath);
    if (!validation.ok) {
      const reason = validation.reason ?? "Textured GLB validation failed.";
      const metadataPath = this.writeTextureMetadata(runDir, {
        createdAt: nowIso,
        promptId: job.promptId,
        meshPath,
        texturedGlbPath,
        textureStatus: "failed",
        texture_status: "failed",
        shape_glb_path: meshPath,
        textured_glb_path: texturedGlbPath,
        error: reason,
        reason,
        textureDependencies: dependencies,
        textureValidation: validation,
        textureErrorLogPath: logPath,
        texgenResult: texgenJson,
      });
      this.appendComfyLog(`[${stageLabel}] ${reason}`, "warn");
      this.appendComfyLog(`[${stageLabel}] textured glb path: ${texturedGlbPath}`);
      this.appendComfyLog(`[${stageLabel}] texture_status=failed`, "warn");
      this.logTexgenFallback(stageLabel, meshPath, reason);
      return {
        glbPath: meshPath,
        meshPath,
        texturedGlbPath,
        textureStatus: "failed" as TextureStageStatus,
        textureErrorLogPath: logPath,
        textureMetadataPath: metadataPath,
        textureDependencies: dependencies,
        textureValidation: validation,
      };
    }

    const metadataPath = this.writeTextureMetadata(runDir, {
      createdAt: nowIso,
      promptId: job.promptId,
      meshPath,
      texturedGlbPath,
      textureStatus: "ready",
      texture_status: "completed",
      shape_glb_path: meshPath,
      textured_glb_path: texturedGlbPath,
      error: null,
      textureDependencies: dependencies,
      textureValidation: validation,
      textureErrorLogPath: logPath,
      texgenResult: texgenJson,
    });
    this.appendComfyLog(
      `[${stageLabel}] ready. textured_glb=${texturedGlbPath}`,
    );
    this.appendComfyLog(`[${stageLabel}] textured glb path: ${texturedGlbPath}`);
    this.appendComfyLog(`[${stageLabel}] texture_status=completed`);
    return {
      glbPath: texturedGlbPath,
      meshPath,
      texturedGlbPath,
      textureStatus: "ready" as TextureStageStatus,
      textureErrorLogPath: undefined,
      textureMetadataPath: metadataPath,
      textureDependencies: dependencies,
      textureValidation: validation,
    };
  }

  private copyDetectedGlb(
    promptId: string,
    startedAtMs: number,
    detected: FileSnapshot,
  ) {
    const runId = `${promptId}-${startedAtMs}`;
    const projectAssetsRoot = path.join(
      getOutputsDir(),
      "..",
      "project-assets",
    );
    const runDir = path.join(projectAssetsRoot, runId);
    const runLatest = path.join(runDir, "latest.glb");
    const globalLatest = path.join(projectAssetsRoot, "latest.glb");

    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(projectAssetsRoot, { recursive: true });
    fs.copyFileSync(detected.fullPath, runLatest);
    fs.copyFileSync(detected.fullPath, globalLatest);
    logger.info("GLB detectado y copiado desde ComfyUI output.", {
      promptId,
      detected: detected.fullPath,
      runLatest,
      globalLatest,
    });
    return runLatest;
  }

  private async finalizeWorkflowJobSuccess(
    job: WorkflowJobRecord,
    history?: unknown,
  ) {
    if (history) {
      job.history = history;
    }

    const detected = findNewGlbFile(
      job.outputDir,
      job.outputBefore,
      job.startedAt,
    );
    const detectedGlbPath = detected
      ? this.copyDetectedGlb(job.promptId, job.startedAt, detected)
      : undefined;
    const historyOutputPath = history
      ? this.buildOutputPathFromHistory(history)
      : null;
    const resolvedMeshPath =
      detectedGlbPath || historyOutputPath || job.outputs?.glbPath;
    const previewImages = history
      ? extractPreviewImagesFromHistory(history, this.config.comfy.comfyDir)
      : job.outputs?.previewImages;

    let textureStage = {
      glbPath: resolvedMeshPath ?? undefined,
      meshPath: resolvedMeshPath ?? undefined,
      texturedGlbPath: undefined as string | undefined,
      textureStatus: "skipped" as TextureStageStatus,
      textureErrorLogPath: undefined as string | undefined,
      textureMetadataPath: undefined as string | undefined,
      textureDependencies: this.resolveTexgenDependencies(),
      textureValidation: undefined as TexturedGlbValidation | undefined,
    };

    if (resolvedMeshPath) {
      this.appendComfyLog(
        `[texgen:${job.promptId}] shape output path: ${resolvedMeshPath}`,
      );
      try {
        textureStage = await this.runTextureStage(job, resolvedMeshPath);
      } catch (error) {
        const fallbackReason = `Texgen runtime error: ${errorMessage(error)}`;
        this.appendComfyLog(
          `[texgen:${job.promptId}] ${fallbackReason}`,
          "warn",
        );
        this.appendComfyLog(`[texgen:${job.promptId}] texture_status=failed`, "warn");
        this.logTexgenFallback(
          `texgen:${job.promptId}`,
          resolvedMeshPath,
          fallbackReason,
        );
        textureStage = {
          glbPath: resolvedMeshPath,
          meshPath: resolvedMeshPath,
          texturedGlbPath: undefined,
          textureStatus: "failed",
          textureErrorLogPath: undefined,
          textureMetadataPath: undefined,
          textureDependencies: this.resolveTexgenDependencies(),
          textureValidation: undefined,
        };
      }
    }

    job.outputs = {
      glbPath: textureStage.glbPath,
      meshPath: textureStage.meshPath,
      texturedGlbPath: textureStage.texturedGlbPath,
      textureStatus: textureStage.textureStatus,
      textureErrorLogPath: textureStage.textureErrorLogPath,
      textureMetadataPath: textureStage.textureMetadataPath,
      textureDependencies: textureStage.textureDependencies,
      textureValidation: textureStage.textureValidation,
      previewImages,
      raw: history ?? job.outputs?.raw,
    };
    job.state = "RESULT_READY";
    job.progress = 100;
    job.updatedAt = Date.now();
    job.finishedAt = job.finishedAt ?? Date.now();
    if (textureStage.glbPath) {
      job.message = `Workflow completado. promptId=${job.promptId}. GLB=${textureStage.glbPath} (texture_status=${textureStage.textureStatus})`;
    } else {
      job.message = `Workflow completado. promptId=${job.promptId}.`;
    }
    return job;
  }

  private finalizeWorkflowJobError(
    job: WorkflowJobRecord,
    message: string,
    code?: string,
  ) {
    job.state = "ERROR";
    job.progress = Math.max(job.progress, 1);
    job.updatedAt = Date.now();
    job.finishedAt = Date.now();
    job.message = message;
    job.error = { code, message };
    return job;
  }

  private async prepareWorkflowSubmission(
    workflowName?: string,
    input?: RunWorkflowInput,
  ): Promise<PreparedWorkflowSubmission> {
    if (!this.started) {
      await this.startAll({ mode: "dev" });
    }

    await this.ensureComfyRunning("dev");
    if (!this.getComfyStatus().running) {
      throw new Error(
        [
          "ComfyUI no esta disponible para ejecutar workflow.",
          `URL esperada: ${this.config.comfy.baseUrl}`,
          this.comfyLastError ? `Detalle: ${this.comfyLastError}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    const targetWorkflow = this.resolveWorkflowByName(workflowName);
    let workflowJson = loadWorkflowJson(targetWorkflow.path);
    const imageInputPath = await this.resolveWorkflowInputImagePath(input);
    if (imageInputPath) {
      const uploaded = await this.comfyApi.uploadImage(imageInputPath);
      const injected = applyImageInputToWorkflow(
        workflowJson,
        uploaded.name,
        uploaded.subfolder,
      );
      workflowJson = injected.workflowJson;
      if (injected.appliedNodeIds.length > 0) {
        logger.info("Imagen de entrada aplicada en workflow.", {
          workflow: targetWorkflow.name,
          nodes: injected.appliedNodeIds,
          image: injected.imageValue,
        });
      } else {
        logger.warn(
          "Se subio imagen pero el workflow no tiene nodos LoadImage para aplicar entrada dinamica.",
          {
            workflow: targetWorkflow.name,
            image: uploaded.name,
          },
        );
      }
    }

    let availableCheckpoints: string[] = [];
    try {
      availableCheckpoints = await this.comfyApi.getAvailableCheckpoints();
    } catch (error) {
      this.appendComfyLog(
        `No se pudo leer checkpoints desde ComfyUI: ${errorMessage(error)}`,
        "warn",
      );
    }

    const patchResult = patchWorkflowCheckpoints(
      workflowJson,
      availableCheckpoints,
    );
    workflowJson = patchResult.workflowJson;
    for (const replacement of patchResult.replaced) {
      const line = `Patched ckpt_name -> ${replacement.to} (node=${replacement.nodeId}, from=${replacement.from})`;
      this.appendComfyLog(line, "warn");
      logger.warn(line);
    }

    await this.validateCheckpointsAfterPatch(
      getCheckpointUsages(workflowJson),
      patchResult.availableCheckpoints,
    );

    const comfyOutputDir = path.join(
      this.config.comfy.comfyDir,
      "output",
      "mesh",
    );
    const outputBefore = listFilesSafe(comfyOutputDir);

    return {
      workflowName: targetWorkflow.name,
      workflowPath: targetWorkflow.path,
      workflowJson,
      comfyOutputDir,
      outputBefore,
      startedAtMs: Date.now(),
      inputImagePath: imageInputPath,
    };
  }

  async stopComfyUI(reason = "manual-stop", force = false) {
    this.stoppingComfy = true;
    try {
      if (!this.comfyProcess?.pid) {
        this.comfyState = "STOPPED";
        this.comfyLastError = null;
        this.comfyHealthFailureCount = 0;
        this.comfyAutoRestartConsumed = false;
        this.comfyRuntimePythonPath = null;
        this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
        return this.getComfyStatus();
      }

      if (!force && !this.getComfyStatus().startedByApp) {
        return this.getComfyStatus();
      }

      try {
        this.comfyProcess.child.kill("SIGTERM");
      } catch {
        // best effort
      }
      await killProcessTree(this.comfyProcess.pid);
      await this.processManager.stopAll(`stop-comfyui:${reason}`);
      this.comfyProcess = null;
      this.refreshProcessSnapshot();
      this.comfyState = "STOPPED";
      this.comfyLastError = null;
      this.comfyHealthFailureCount = 0;
      this.comfyAutoRestartConsumed = false;
      this.comfyRuntimePythonPath = null;
      this.status.comfy.message = "ComfyUI detenido.";
      this.appendComfyLog(`ComfyUI detenido (${reason}).`);
      this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
      return this.getComfyStatus();
    } finally {
      this.stoppingComfy = false;
    }
  }

  async startComfyUI() {
    if (this.comfyStartPromise) {
      this.appendComfyLog(
        "ComfyUI start requested while another start is already in progress; reusing current startup promise.",
      );
      return await this.comfyStartPromise;
    }

    const startupPromise = this.startComfyUIInternal().finally(() => {
      if (this.comfyStartPromise === startupPromise) {
        this.comfyStartPromise = null;
      }
    });
    this.comfyStartPromise = startupPromise;
    return await startupPromise;
  }

  private async startComfyUIInternal() {
    this.refreshConfig(true);
    if (this.comfyState === "STARTING" && this.comfyProcess?.pid) {
      return this.getComfyStatus();
    }

    const health = await this.comfyApi.health();
    if (health.ok) {
      this.markComfyReady(health.message);
      return this.getComfyStatus();
    }

    await this.resolvePortConflictBeforeStart();
    if (this.getComfyStatus().running) {
      return this.getComfyStatus();
    }

    ensurePathExists(this.config.comfy.comfyDir, "Carpeta raiz de ComfyUI");
    ensurePathExists(
      path.join(this.config.comfy.comfyDir, "main.py"),
      "Archivo main.py de ComfyUI",
    );
    this.comfyState = "STARTING";
    this.comfyLastError = null;
    this.comfyHealthFailureCount = 0;
    this.status.comfy.message = `Iniciando ComfyUI en ${this.config.comfy.baseUrl}...`;
    this.updateLegacyComfyFromSnapshot(this.getComfyStatus());

    const launchPlan = resolveComfyLaunchPlan(this.config);
    const pythonProbe = this.runPythonSnippet("import sys; print(sys.executable)");
    const pythonProbeLine =
      pythonProbe.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .pop() ?? null;
    if (pythonProbeLine && !pythonProbeLine.startsWith("{")) {
      this.comfyRuntimePythonPath = pythonProbeLine;
    }

    logger.info("Starting ComfyUI process.", {
      command: launchPlan.command,
      args: launchPlan.args,
      cwd: launchPlan.cwd,
      mode: launchPlan.mode,
      details: launchPlan.details,
      pythonProbeRunner: pythonProbe.runnerDetails,
      pythonProbeStatus: pythonProbe.status,
      pythonExecutable: this.comfyRuntimePythonPath,
      shell: false,
    });
    this.appendComfyLog(
      `Launching ComfyUI (${launchPlan.mode}) ${launchPlan.details}`,
    );
    this.appendComfyLog(
      `ComfyUI python runtime probe: runner=${pythonProbe.runnerDetails} python=${this.comfyRuntimePythonPath ?? "unknown"} status=${String(pythonProbe.status)}`,
    );

    const managed = this.processManager.spawn(
      launchPlan.command,
      launchPlan.args,
      {
        name: "comfyui",
        cwd: launchPlan.cwd,
        env: process.env,
        windowsHide: true,
        shell: false,
        onStdoutLine: (line) => {
          this.appendComfyLog(`[ComfyUI][stdout] ${line}`);
          logger.info(`[ComfyUI][stdout] ${line}`);
        },
        onStderrLine: (line) => {
          this.appendComfyLog(`[ComfyUI][stderr] ${line}`, "warn");
          logger.warn(`[ComfyUI][stderr] ${line}`);
        },
      },
    );

    this.comfyProcess = managed;
    this.refreshProcessSnapshot();
    this.updateLegacyComfyFromSnapshot(this.getComfyStatus());

    void managed.exit.then(({ code, signal }) => {
      if (this.comfyProcess?.pid === managed.pid) {
        this.comfyProcess = null;
      }
      this.refreshProcessSnapshot();
      if (this.stoppingComfy) {
        return;
      }
      const message = `ComfyUI process exited (code=${String(code)} signal=${String(signal)})`;
      this.handleComfyFailure(message, { autoRestart: true });
    });

    const opened = await waitForPort(
      this.config.comfy.host,
      this.config.comfy.port,
      this.config.comfy.startupTimeoutMs,
    );
    if (!opened) {
      await this.stopComfyUI("startup-timeout", true);
      const message = `ComfyUI no abrio puerto ${this.config.comfy.host}:${this.config.comfy.port} dentro de ${this.config.comfy.startupTimeoutMs}ms.`;
      this.setComfyError(message);
      throw new Error(message);
    }

    const startedHealth = await this.comfyApi.health();
    if (!startedHealth.ok) {
      await this.stopComfyUI("healthcheck-failed-after-spawn", true);
      this.setComfyError(startedHealth.message);
      throw new Error(startedHealth.message);
    }
    this.markComfyReady(startedHealth.message);
    return this.getComfyStatus();
  }

  private async ensureComfyRunning(mode: BackendMode) {
    try {
      await this.startComfyUI();
      return;
    } catch (error) {
      const message = summarizeComfyIssue(error);
      this.setComfyError(message);
      this.appendComfyLog(message, "warn");
      logger.warn("ComfyUI start failed.", message);
      if (mode === "prod") {
        throw error;
      }
    }
  }

  async startAll({ mode }: { mode: BackendMode }) {
    this.status.mode = mode;
    this.status.startedAt = this.status.startedAt ?? new Date().toISOString();
    this.started = true;
    this.pushNote(`startAll(mode=${mode})`);

    try {
      const syncResult = await syncWorkflows();
      this.status.workflows.sourceDir = path.resolve(
        process.cwd(),
        "electron",
        "generation",
        "comfyui-workflows",
      );
      this.status.workflows.targetDir = getWorkflowsDir();
      this.status.workflows.copied = syncResult.copied.length;
      this.status.workflows.replaced = syncResult.replaced.length;
      this.status.workflows.backups = syncResult.backups.length;
      this.status.workflows.lastSyncAt = new Date().toISOString();
      this.status.workflows.error = null;
      this.refreshActiveWorkflowStatus();
    } catch (error) {
      const message = errorMessage(error);
      this.status.workflows.error = message;
      this.pushNote(`workflow-sync-error: ${message}`);
      if (mode === "prod") {
        throw error;
      }
      logger.warn("Workflow sync failed in dev.", message);
    }

    try {
      await ensureModels({
        onDownloadProgress: ({ targetPath, downloadedBytes, totalBytes }) => {
          logger.info("Model download progress.", {
            targetPath,
            downloadedBytes,
            totalBytes,
          });
        },
      });
      const modelCheck = await checkModelsInstalled();
      this.status.models.ok = modelCheck.ok;
      this.status.models.totalFiles = modelCheck.totalFiles;
      this.status.models.installedFiles = modelCheck.installedFiles;
      this.status.models.error = null;
      this.status.models.message = modelCheck.ok
        ? "Modelos listos."
        : `Modelos incompletos (${modelCheck.installedFiles}/${modelCheck.totalFiles}).`;
    } catch (error) {
      const message = errorMessage(error);
      this.status.models.ok = false;
      this.status.models.error = message;
      this.status.models.message = message;
      this.pushNote(`models-warning: ${message}`);
      if (mode === "prod") {
        throw error;
      }
      logger.warn("Model check warning in dev (continuing startup).", message);
    }

    await this.ensureComfyRunning(mode);
    this.refreshProcessSnapshot();
    return await this.getStatus();
  }

  async stopAll() {
    if (this.getComfyStatus().startedByApp) {
      await this.stopComfyUI("backend-stop", true);
    }
    this.refreshProcessSnapshot();
    return await this.getStatus();
  }

  private resolveWorkflowByName(workflowName?: string) {
    if (typeof workflowName === "string" && workflowName.trim().length > 0) {
      const normalizedName = workflowName.trim();
      const workflowPath = getWorkflowPath(normalizedName);
      if (!fs.existsSync(workflowPath)) {
        throw new Error(`Workflow no encontrado: ${workflowPath}`);
      }
      return {
        name: normalizedName,
        path: workflowPath,
      };
    }

    let activeWorkflow = this.refreshActiveWorkflowStatus();
    if (!activeWorkflow) {
      throw new Error("No hay workflow activo para ejecutar.");
    }
    return activeWorkflow;
  }

  async submitWorkflow(
    workflowName?: string,
    input?: RunWorkflowInput & { projectId?: string },
  ) {
    const prepared = await this.prepareWorkflowSubmission(workflowName, input);
    const queue = await this.comfyApi.queuePrompt(prepared.workflowJson);

    const job: WorkflowJobRecord = {
      jobId: queue.promptId,
      promptId: queue.promptId,
      projectId: input?.projectId,
      workflowName: prepared.workflowName,
      workflowPath: prepared.workflowPath,
      state: "QUEUED",
      progress: 8,
      message: `Workflow encolado en ComfyUI con promptId=${queue.promptId}`,
      startedAt: prepared.startedAtMs,
      updatedAt: prepared.startedAtMs,
      inputImagePath: prepared.inputImagePath ?? undefined,
      outputDir: prepared.comfyOutputDir,
      outputBefore: prepared.outputBefore,
      cancelRequested: false,
    };

    this.workflowJobs.set(job.jobId, job);
    logger.info(job.message, {
      workflowName: job.workflowName,
      workflowPath: job.workflowPath,
      promptId: job.promptId,
    });
    this.pushNote(job.message);
    this.appendComfyLog(job.message);

    return {
      jobId: job.jobId,
      promptId: job.promptId,
      workflowName: job.workflowName,
      workflowPath: job.workflowPath,
      message: job.message,
    };
  }

  async getWorkflowJobStatus(jobId: string): Promise<ComfyWorkflowJobStatus> {
    const job = this.workflowJobs.get(jobId);
    if (!job) {
      throw new Error(`ComfyUI job no encontrado: ${jobId}`);
    }

    if (
      job.state === "RESULT_READY" ||
      job.state === "ERROR" ||
      job.state === "CANCELED"
    ) {
      return JSON.parse(JSON.stringify(job)) as ComfyWorkflowJobStatus;
    }

    try {
      const [queue, historyEntry] = await Promise.all([
        this.comfyApi.getQueueSnapshot(),
        this.comfyApi.getHistoryEntry(job.promptId),
      ]);

      if (historyEntry) {
        await this.finalizeWorkflowJobSuccess(job, historyEntry);
        return JSON.parse(JSON.stringify(job)) as ComfyWorkflowJobStatus;
      }

      const runningIndex = queue.running.indexOf(job.promptId);
      if (runningIndex >= 0) {
        job.state = "RUNNING";
        job.progress = Math.max(job.progress, 65);
        job.queuePosition = runningIndex;
        job.updatedAt = Date.now();
        job.message = `Workflow ejecutandose en ComfyUI (promptId=${job.promptId})`;
        return JSON.parse(JSON.stringify(job)) as ComfyWorkflowJobStatus;
      }

      const pendingIndex = queue.pending.indexOf(job.promptId);
      if (pendingIndex >= 0) {
        job.state = "QUEUED";
        job.progress = Math.max(
          job.progress,
          Math.max(10, 30 - pendingIndex * 5),
        );
        job.queuePosition = pendingIndex;
        job.updatedAt = Date.now();
        job.message = `Workflow en cola en ComfyUI (posicion ${pendingIndex + 1})`;
        return JSON.parse(JSON.stringify(job)) as ComfyWorkflowJobStatus;
      }

      if (Date.now() - job.startedAt > 15_000) {
        this.finalizeWorkflowJobError(
          job,
          `ComfyUI no reporta el job ${job.promptId} en queue/history.`,
          "JOB_NOT_VISIBLE",
        );
      }
    } catch (error) {
      this.finalizeWorkflowJobError(
        job,
        errorMessage(error),
        "STATUS_POLL_FAILED",
      );
    }

    return JSON.parse(JSON.stringify(job)) as ComfyWorkflowJobStatus;
  }

  async cancelWorkflowJob(jobId: string) {
    const job = this.workflowJobs.get(jobId);
    if (!job) {
      return;
    }

    job.cancelRequested = true;
    job.updatedAt = Date.now();

    try {
      const queue = await this.comfyApi.getQueueSnapshot();
      if (queue.running.includes(job.promptId)) {
        try {
          await this.comfyApi.interrupt();
        } catch (error) {
          this.appendComfyLog(
            `ComfyUI interrupt fallo: ${errorMessage(error)}`,
            "warn",
          );
        }
      }
      if (queue.pending.includes(job.promptId)) {
        try {
          await this.comfyApi.deleteQueuedPrompt(job.promptId);
        } catch (error) {
          this.appendComfyLog(
            `ComfyUI queue delete fallo: ${errorMessage(error)}`,
            "warn",
          );
        }
      }
    } finally {
      job.state = "CANCELED";
      job.progress = 0;
      job.message = `Workflow cancelado. promptId=${job.promptId}`;
      job.finishedAt = Date.now();
      job.updatedAt = job.finishedAt;
    }
  }

  async resolveWorkflowJobOutputs(
    jobId: string,
  ): Promise<ComfyWorkflowJobOutputs> {
    const status = await this.getWorkflowJobStatus(jobId);
    return status.outputs ?? {};
  }

  async runWorkflow(
    workflowName?: string,
    input?: RunWorkflowInput,
  ): Promise<RunWorkflowResult> {
    const submitted = await this.submitWorkflow(workflowName, input);
    const deadline = Date.now() + 6 * 60 * 1000;

    while (Date.now() < deadline) {
      const status = await this.getWorkflowJobStatus(submitted.jobId);

      if (status.state === "RESULT_READY") {
        const message = status.outputs?.glbPath
          ? `Workflow encolado/completado. promptId=${status.promptId}. GLB=${status.outputs.glbPath}`
          : `Workflow encolado/completado. promptId=${status.promptId}`;
        return {
          promptId: status.promptId,
          workflowName: status.workflowName,
          workflowPath: status.workflowPath,
          message,
          outputGlbPath: status.outputs?.glbPath,
        };
      }

      if (status.state === "ERROR") {
        throw new Error(status.error?.message ?? status.message);
      }

      if (status.state === "CANCELED") {
        throw new Error(status.message);
      }

      await sleep(1_000);
    }

    throw new Error(
      `ComfyUI timeout esperando resultado para promptId=${submitted.promptId}.`,
    );
  }

  async runDefaultWorkflow(
    input?: RunWorkflowInput,
  ): Promise<RunWorkflowResult> {
    return await this.runWorkflow(undefined, input);
  }

  importWorkflowFromPath(sourcePath: string): ImportWorkflowResult {
    const imported = importWorkflowFromDisk(sourcePath);
    this.refreshActiveWorkflowStatus();
    const message = `Workflow importado y activado: ${imported.workflowName}`;
    this.pushNote(message);
    logger.info(message, imported);
    return {
      workflowName: imported.workflowName,
      workflowPath: imported.workflowPath,
      message,
    };
  }

  getComfyStatus(): ComfyStatus {
    this.refreshConfig();
    const startedByApp = Boolean(this.comfyProcess?.pid);
    return {
      state: this.comfyState,
      running: this.comfyState === "READY",
      url: this.config.comfy.baseUrl,
      pid: this.comfyProcess?.pid ?? null,
      startedByApp,
      lastError: this.comfyLastError,
      lastLogs: this.getComfyLogs(),
      message: this.status.comfy.message,
      host: this.config.comfy.host,
      port: this.config.comfy.port,
      config: {
        comfyDir: this.config.comfy.comfyDir,
        condaHook: this.config.comfy.condaHook,
        condaEnvName: this.config.comfy.condaEnvName,
        pythonExeOverride: this.config.comfy.pythonExeOverride,
        startupTimeoutMs: this.config.comfy.startupTimeoutMs,
      },
    };
  }

  getComfyLogs(limit = 200) {
    const parsedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(this.comfyLogLimit, Math.floor(limit)))
      : 200;
    return this.comfyLogs.slice(-parsedLimit);
  }

  getComfyConfig() {
    this.refreshConfig(true);
    return this.config.comfy;
  }

  saveComfyConfig(patch: Partial<ComfyRuntimeConfig>) {
    const updated = saveComfyUserConfig(patch);
    this.config = updated;
    return updated.comfy;
  }

  async getStatus(): Promise<BackendStatus> {
    this.refreshProcessSnapshot();
    this.refreshActiveWorkflowStatus();
    try {
      await this.refreshComfyHealth();
    } catch {
      // keep last known status
    }
    this.updateLegacyComfyFromSnapshot(this.getComfyStatus());
    return JSON.parse(JSON.stringify(this.status)) as BackendStatus;
  }
}
