import fs from "fs";
import path from "path";
import { ComfyApi } from "./comfyApi";
import { logger } from "./logger";
import { checkModelsInstalled, ensureModels } from "./modelRegistry";
import { getWorkflowsDir } from "./paths";
import { killProcessTree, ProcessManager, waitForPort, type ManagedProcess } from "./processManager";
import { loadBackendConfig } from "./runtimeConfig";
import { getWorkflowPath, patchWorkflowCheckpoint, syncWorkflows } from "./workflowManager";

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
  workflowPath: string;
  message: string;
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
  private readonly comfyUrl = `http://${this.config.comfy.host}:${this.config.comfy.port}`;

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
    return this.getStatus();
  }

  async stopAll() {
    await this.stopComfyUI("backend-stop");
    this.refreshProcessSnapshot();
    return this.getStatus();
  }

  async runDefaultWorkflow(_input?: { imagePath?: string }): Promise<RunWorkflowResult> {
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

    const workflowPath = getWorkflowPath("default.json");
    if (!fs.existsSync(workflowPath)) {
      await syncWorkflows();
    }
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow default no encontrado en: ${workflowPath}`);
    }

    const rawWorkflow = fs.readFileSync(workflowPath, "utf8");
    const parsedWorkflow = JSON.parse(rawWorkflow) as unknown;
    const patched = patchWorkflowCheckpoint(parsedWorkflow);
    const queue = await this.comfyApi.queuePrompt(patched.workflowJson);

    const message = `Workflow encolado en ComfyUI con promptId=${queue.promptId}`;
    logger.info(message, {
      workflowPath,
      patched: patched.patched,
      replacements: patched.replacements.length,
      appliedCheckpoint: patched.appliedCheckpoint,
    });
    this.pushNote(message);
    return {
      promptId: queue.promptId,
      workflowPath,
      message,
    };
  }

  getStatus(): BackendStatus {
    this.refreshProcessSnapshot();
    return JSON.parse(JSON.stringify(this.status)) as BackendStatus;
  }
}
