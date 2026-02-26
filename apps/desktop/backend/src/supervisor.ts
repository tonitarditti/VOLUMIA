import fs from "fs";
import path from "path";
import { ComfyApi } from "./comfyApi";
import { logger } from "./logger";
import { checkModelsInstalled, ensureModels } from "./modelRegistry";
import { getOutputsDir, getWorkflowsDir } from "./paths";
import { killProcessTree, ProcessManager, waitForPort, type ManagedProcess } from "./processManager";
import { loadBackendConfig } from "./runtimeConfig";
import {
  applyImageInputToWorkflow,
  getActiveWorkflowInfo,
  getCheckpointUsages,
  importWorkflowFromDisk,
  loadWorkflowJson,
  syncWorkflows,
} from "./workflowManager";

export type BackendMode = "dev" | "prod";
export type BackendServiceState = "stopped" | "starting" | "running" | "error";

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

export type ImportWorkflowResult = {
  workflowName: string;
  workflowPath: string;
  message: string;
};

type RunWorkflowInput = {
  imagePath?: string;
  imageBase64?: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function ensurePathExists(targetPath: string, label: string) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} no existe: ${targetPath}`);
  }
}

export class BackendSupervisor {
  private readonly processManager = new ProcessManager();
  private readonly config = loadBackendConfig();
  private readonly comfyApi = new ComfyApi();
  private readonly comfyUrl = this.config.comfy.baseUrl;

  private started = false;
  private comfyProcess: ManagedProcess | null = null;
  private stoppingComfy = false;

  private status: BackendStatus = {
    mode: "dev",
    startedAt: null,
    workflows: {
      sourceDir: path.resolve(process.cwd(), "backend", "workflows"),
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
      url: this.comfyUrl,
      pid: null,
      lastError: null,
      state: "stopped",
      host: this.config.comfy.host,
      port: this.config.comfy.port,
      python: null,
      comfyRoot: null,
      healthy: false,
      external: false,
      message: "ComfyUI no iniciado.",
    },
    activeProcesses: [],
    notes: [],
  };

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

  private setComfyError(message: string) {
    this.status.comfy.state = "error";
    this.status.comfy.running = false;
    this.status.comfy.healthy = false;
    this.status.comfy.lastError = message;
    this.status.comfy.message = message;
    this.pushNote(`comfy-error: ${message}`);
  }

  private async refreshComfyHealth() {
    const health = await this.comfyApi.health();
    this.status.comfy.healthy = health.ok;
    this.status.comfy.running = health.ok;
    this.status.comfy.state = health.ok ? "running" : "error";
    this.status.comfy.message = health.message;
    if (!health.ok) {
      this.status.comfy.lastError = health.message;
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
      const tempFilePath = path.join(uploadsDir, `backend-upload-${Date.now()}.png`);
      const buffer = this.decodeBase64Image(input.imageBase64);
      fs.writeFileSync(tempFilePath, buffer);
      return tempFilePath;
    }

    return null;
  }

  private async validateWorkflowCheckpoints(workflowJson: unknown) {
    const checkpointUsages = getCheckpointUsages(workflowJson);
    if (checkpointUsages.length === 0) {
      return;
    }

    let availableCheckpoints: string[];
    try {
      availableCheckpoints = await this.comfyApi.getAvailableCheckpoints();
    } catch (error) {
      logger.warn("No se pudo consultar /object_info para validar checkpoints.", errorMessage(error));
      return;
    }

    if (availableCheckpoints.length === 0) {
      logger.warn("ComfyUI no devolvio lista de checkpoints; se omite validacion previa.");
      return;
    }

    const invalid = checkpointUsages.filter((usage) => !availableCheckpoints.includes(usage.ckptName));
    if (invalid.length === 0) {
      return;
    }

    const invalidSummary = invalid.map((usage) => `${usage.ckptName} (node ${usage.nodeId})`).join(", ");
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
      const directPath = typeof recordNode.path === "string" ? recordNode.path.trim() : "";
      if (directPath.toLowerCase().endsWith(".glb")) {
        candidates.push(directPath);
      }

      const filename = typeof recordNode.filename === "string" ? recordNode.filename.trim() : "";
      if (filename.toLowerCase().endsWith(".glb")) {
        const subfolder = typeof recordNode.subfolder === "string" ? recordNode.subfolder.trim() : "";
        const combined = subfolder ? `${subfolder.replace(/\\/g, "/")}/${filename}` : filename;
        candidates.push(combined);
      }

      for (const value of Object.values(recordNode)) {
        visit(value);
      }
    };

    visit(history);
    return candidates[0] ?? null;
  }

  private async stopComfyUI(reason = "manual-stop") {
    this.stoppingComfy = true;
    try {
      if (this.comfyProcess?.pid) {
        try {
          this.comfyProcess.child.kill("SIGTERM");
        } catch {
          // best effort
        }
        await killProcessTree(this.comfyProcess.pid);
      }
      await this.processManager.stopAll(`stop-comfyui:${reason}`);
      this.comfyProcess = null;
      this.refreshProcessSnapshot();
      this.status.comfy.pid = null;
      this.status.comfy.running = false;
      this.status.comfy.healthy = false;
      this.status.comfy.external = false;
      this.status.comfy.state = "stopped";
      this.status.comfy.message = "ComfyUI detenido.";
      this.status.comfy.lastError = null;
    } finally {
      this.stoppingComfy = false;
    }
  }

  private async startComfyUI() {
    const health = await this.comfyApi.health();
    if (health.ok) {
      this.status.comfy.running = true;
      this.status.comfy.healthy = true;
      this.status.comfy.external = this.comfyProcess === null;
      this.status.comfy.state = "running";
      this.status.comfy.message = `ComfyUI ya responde en ${this.comfyUrl}`;
      this.status.comfy.lastError = null;
      this.status.comfy.pid = this.comfyProcess?.pid ?? null;
      return;
    }

    ensurePathExists(this.config.comfy.pythonExe, "Python de ComfyUI");
    ensurePathExists(this.config.comfy.rootDir, "Carpeta raiz de ComfyUI");
    ensurePathExists(path.join(this.config.comfy.rootDir, "main.py"), "Archivo main.py de ComfyUI");

    this.status.comfy.state = "starting";
    this.status.comfy.running = false;
    this.status.comfy.healthy = false;
    this.status.comfy.external = false;
    this.status.comfy.lastError = null;
    this.status.comfy.python = this.config.comfy.pythonExe;
    this.status.comfy.comfyRoot = this.config.comfy.rootDir;
    this.status.comfy.message = `Iniciando ComfyUI en ${this.comfyUrl}...`;

    logger.info("Starting ComfyUI process.", {
      pythonExe: this.config.comfy.pythonExe,
      args: this.config.comfy.args,
      cwd: this.config.comfy.rootDir,
      shell: false,
    });

    const managed = this.processManager.spawn(this.config.comfy.pythonExe, this.config.comfy.args, {
      name: "comfyui",
      cwd: this.config.comfy.rootDir,
      env: process.env,
      windowsHide: true,
      onStdoutLine: (line) => logger.info(`[ComfyUI][stdout] ${line}`),
      onStderrLine: (line) => logger.warn(`[ComfyUI][stderr] ${line}`),
    });

    this.comfyProcess = managed;
    this.status.comfy.pid = managed.pid;
    this.refreshProcessSnapshot();

    void managed.exit.then(({ code, signal }) => {
      this.refreshProcessSnapshot();
      if (this.stoppingComfy) {
        return;
      }
      const message = `ComfyUI process exited (code=${String(code)} signal=${String(signal)})`;
      this.setComfyError(message);
      logger.warn(message);
    });

    const opened = await waitForPort(this.config.comfy.host, this.config.comfy.port, this.config.comfy.startupTimeoutMs);
    if (!opened) {
      await this.stopComfyUI("startup-timeout");
      throw new Error(
        `ComfyUI no abrio puerto ${this.config.comfy.host}:${this.config.comfy.port} dentro de ${this.config.comfy.startupTimeoutMs}ms.`
      );
    }

    const startedHealth = await this.refreshComfyHealth();
    if (!startedHealth.ok) {
      await this.stopComfyUI("healthcheck-failed-after-spawn");
      throw new Error(startedHealth.message);
    }
    this.status.comfy.external = false;
    this.status.comfy.lastError = null;
  }

  private async ensureComfyRunning(mode: BackendMode) {
    try {
      await this.startComfyUI();
      return;
    } catch (error) {
      const message = errorMessage(error);
      this.setComfyError(message);
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
      this.status.workflows.sourceDir = path.resolve(process.cwd(), "backend", "workflows");
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
          logger.info("Model download progress.", { targetPath, downloadedBytes, totalBytes });
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
    await this.stopComfyUI("backend-stop");
    this.refreshProcessSnapshot();
    return await this.getStatus();
  }

  async runDefaultWorkflow(input?: RunWorkflowInput): Promise<RunWorkflowResult> {
    if (!this.started) {
      await this.startAll({ mode: "dev" });
    }

    await this.ensureComfyRunning("dev");
    if (!this.status.comfy.running) {
      throw new Error(
        [
          "ComfyUI no esta disponible para ejecutar workflow.",
          `URL esperada: ${this.comfyUrl}`,
          `Python esperado: ${this.config.comfy.pythonExe}`,
          `ComfyUI root esperado: ${this.config.comfy.rootDir}`,
          this.status.comfy.lastError ? `Detalle: ${this.status.comfy.lastError}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    let activeWorkflow = this.refreshActiveWorkflowStatus();
    if (!activeWorkflow) {
      await syncWorkflows();
      activeWorkflow = this.refreshActiveWorkflowStatus();
    }
    if (!activeWorkflow) {
      throw new Error(
        `No hay workflow activo para ejecutar. Importa un JSON o agrega ${path.join(this.status.workflows.sourceDir, "hunyuan_image_to_3d.json")}.`
      );
    }

    let workflowJson = loadWorkflowJson(activeWorkflow.path);
    const imageInputPath = await this.resolveWorkflowInputImagePath(input);
    if (imageInputPath) {
      const uploaded = await this.comfyApi.uploadImage(imageInputPath);
      const injected = applyImageInputToWorkflow(workflowJson, uploaded.name, uploaded.subfolder);
      workflowJson = injected.workflowJson;
      if (injected.appliedNodeIds.length > 0) {
        logger.info("Imagen de entrada aplicada en workflow.", {
          workflow: activeWorkflow.name,
          nodes: injected.appliedNodeIds,
          image: injected.imageValue,
        });
      } else {
        logger.warn("Se subio imagen pero el workflow no tiene nodos LoadImage para aplicar entrada dinamica.", {
          workflow: activeWorkflow.name,
          image: uploaded.name,
        });
      }
    }

    await this.validateWorkflowCheckpoints(workflowJson);
    const queue = await this.comfyApi.queuePrompt(workflowJson);

    let outputGlbPath: string | undefined;
    try {
      const completion = await this.comfyApi.waitForCompletion(queue.promptId, 45_000);
      const glbCandidate = this.extractGlbPathFromHistory(completion.history);
      if (glbCandidate) {
        outputGlbPath = glbCandidate;
      }
    } catch (error) {
      logger.warn("No se pudo resolver salida final del workflow dentro del timeout (se devuelve promptId).", errorMessage(error));
    }

    const message = outputGlbPath
      ? `Workflow encolado/completado. promptId=${queue.promptId}. GLB=${outputGlbPath}`
      : `Workflow encolado en ComfyUI con promptId=${queue.promptId}`;
    logger.info(message, {
      workflowName: activeWorkflow.name,
      workflowPath: activeWorkflow.path,
      outputGlbPath: outputGlbPath ?? null,
    });
    this.pushNote(message);
    return {
      promptId: queue.promptId,
      workflowName: activeWorkflow.name,
      workflowPath: activeWorkflow.path,
      message,
      outputGlbPath,
    };
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

  async getStatus(): Promise<BackendStatus> {
    this.refreshProcessSnapshot();
    this.refreshActiveWorkflowStatus();
    try {
      const health = await this.comfyApi.health();
      this.status.comfy.running = health.ok;
      this.status.comfy.healthy = health.ok;
      this.status.comfy.state = health.ok ? "running" : this.status.comfy.state === "starting" ? "starting" : "error";
      this.status.comfy.message = health.message;
      this.status.comfy.lastError = health.ok ? null : health.message;
      if (health.ok && !this.status.comfy.pid) {
        this.status.comfy.external = true;
      }
    } catch {
      // keep last known status
    }
    return JSON.parse(JSON.stringify(this.status)) as BackendStatus;
  }
}
