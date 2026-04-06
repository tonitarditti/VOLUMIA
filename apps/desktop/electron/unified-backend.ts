import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  type BackendStatusResponse,
  type ComfyConfigPatch,
  type ComfyConfigResponse,
  type ComfyJobOutputs,
  type ComfyJobState,
  type ComfyJobStatusResponse,
  type ComfyStatusResponse,
  type ComfySubmitJobPayload,
  type ComfySubmitJobResult,
} from "./channels";
import { ensureRuntimeLayout, resolveRuntimePaths, type RuntimePaths } from "./runtime-paths";

type BackendHealth = {
  ok: boolean;
  service: string;
  version: string;
  startedAt: string;
};

type UnifiedJobResponse = {
  jobId: string;
  type: string;
  status: string;
  stage: string;
  progress: number;
  message: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  projectId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeComfyState(state: string): ComfyStatusResponse["state"] {
  const normalized = state.toLowerCase();
  if (normalized === "starting") return "STARTING";
  if (normalized === "healthy" || normalized === "busy") return "READY";
  if (normalized === "failed" || normalized === "degraded") return "ERROR";
  return "STOPPED";
}

function mapJobState(status: string): ComfyJobState {
  if (status === "queued") return "QUEUED";
  if (status === "done") return "RESULT_READY";
  if (status === "failed") return "ERROR";
  if (status === "cancelled") return "CANCELED";
  return "RUNNING";
}

function toTimestamp(input?: string) {
  if (!input) return Date.now();
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class UnifiedBackendClient {
  private readonly host: string;
  private readonly port: number;
  private readonly baseUrl: string;
  private readonly runtimePaths: RuntimePaths;
  private backendProcess: ChildProcess | null = null;
  private startupInFlight: Promise<void> | null = null;

  constructor() {
    this.host = process.env.VOLUMIA_BACKEND_HOST ?? "127.0.0.1";
    this.port = Number.parseInt(process.env.VOLUMIA_BACKEND_PORT ?? "9360", 10) || 9360;
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.runtimePaths = ensureRuntimeLayout(resolveRuntimePaths());
  }

  async initBackend() {
    await this.ensureStarted();
    return await this.getBackendStatus();
  }

  async startBackend() {
    await this.ensureStarted();
    return await this.getBackendStatus();
  }

  async stopBackend() {
    if (this.backendProcess && !this.backendProcess.killed) {
      this.backendProcess.kill();
    }
    this.backendProcess = null;
  }

  async getBackendStatus(): Promise<BackendStatusResponse> {
    const [health, modelsPayload, comfy, processesPayload] = await Promise.all([
      this.getHealth(),
      this.requestJson<{ models?: Record<string, unknown> }>("/system/models", { method: "GET" }),
      this.getComfyStatus(),
      this.requestJson<{ processes?: Array<{ name: string; pid: number }> }>("/system/processes", { method: "GET" }),
    ]);

    const models = modelsPayload.models ?? {};
    const modelEntries = Object.values(models).filter((entry) => typeof entry === "object");
    const installedFiles = modelEntries.filter((entry) => Boolean((entry as Record<string, unknown>).loaded)).length;

    return {
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
      startedAt: health.startedAt ?? null,
      workflows: {
        sourceDir: path.resolve(process.cwd(), "electron", "generation", "comfyui-workflows"),
        targetDir: path.resolve(process.cwd(), "electron", "generation", "comfyui-workflows"),
        copied: 0,
        replaced: 0,
        backups: 0,
        lastSyncAt: null,
        error: null,
        activeName: null,
        activePath: null,
      },
      models: {
        ok: true,
        totalFiles: modelEntries.length,
        installedFiles,
        message: `Loaded models: ${installedFiles}`,
        error: null,
      },
      comfy: {
        running: comfy.running,
        url: comfy.url,
        lastError: comfy.lastError,
        state: comfy.running ? "running" : (comfy.state === "ERROR" ? "error" : "stopped"),
        host: comfy.host,
        port: comfy.port,
        pid: comfy.pid,
        python: comfy.config.pythonExeOverride || null,
        comfyRoot: comfy.config.comfyDir || null,
        healthy: comfy.state === "READY",
        external: !comfy.startedByApp,
        message: comfy.message,
      },
      activeProcesses: processesPayload.processes ?? [],
      notes: [],
    };
  }

  async getComfyStatus(): Promise<ComfyStatusResponse> {
    await this.ensureStarted();
    const payload = await this.requestJson<Record<string, unknown>>("/system/comfy", { method: "GET" });
    const config = asObject(payload.config);
    return {
      state: normalizeComfyState(String(payload.state ?? "stopped")),
      running: Boolean(payload.running),
      url: String(payload.url ?? this.baseUrl),
      pid: typeof payload.pid === "number" ? payload.pid : null,
      startedByApp: Boolean(payload.startedByBackend),
      lastError: payload.lastError ? String(payload.lastError) : null,
      lastLogs: [],
      message: String(payload.message ?? "Comfy status unavailable"),
      host: String(payload.host ?? "127.0.0.1"),
      port: Number.parseInt(String(payload.port ?? "8188"), 10) || 8188,
      config: {
        comfyDir: String(config.comfyDir ?? ""),
        condaHook: "",
        condaEnvName: "volumia",
        pythonExeOverride: String(config.pythonExeOverride ?? ""),
        startupTimeoutMs: Number.parseInt(String(config.startupTimeoutMs ?? "120000"), 10) || 120000,
      },
    };
  }

  async startComfy(): Promise<ComfyStatusResponse> {
    await this.ensureStarted();
    await this.requestJson("/system/comfy/start", { method: "POST" });
    return await this.getComfyStatus();
  }

  async stopComfy(): Promise<ComfyStatusResponse> {
    await this.ensureStarted();
    await this.requestJson("/system/comfy/stop", { method: "POST" });
    return await this.getComfyStatus();
  }

  async getComfyLogs(limit = 200): Promise<string[]> {
    const candidates = [
      path.join(this.runtimePaths.logs, "comfyui.log"),
      // Legacy compatibility fallbacks.
      path.resolve(process.cwd(), "backend", "python", "runtime", "logs", "comfyui.log"),
      path.resolve(__dirname, "..", "backend", "python", "runtime", "logs", "comfyui.log"),
    ];
    const logPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!logPath) {
      return [];
    }
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.slice(Math.max(0, lines.length - Math.max(1, limit)));
  }

  async submitWorkflow(payload?: ComfySubmitJobPayload): Promise<ComfySubmitJobResult> {
    await this.ensureStarted();
    const imagePath = await this.resolveImagePath(payload?.imagePath, payload?.imageBase64);
    const response = await this.requestJson<{ jobId: string; status: string }>("/jobs/reconstruct", {
      method: "POST",
      body: JSON.stringify({
        projectId: payload?.projectId,
        sourceImages: [imagePath],
        workflowId: payload?.workflowId,
        preset: payload?.preset,
      }),
    });

    return {
      jobId: response.jobId,
      promptId: response.jobId,
      workflowName: payload?.workflowId ?? "hunyuan_image_to_3d_textured.json",
      workflowPath: payload?.workflowId ?? "hunyuan_image_to_3d_textured.json",
      message: `Job ${response.jobId} queued`,
    };
  }

  async runWorkflow(payload?: ComfySubmitJobPayload): Promise<{
    promptId: string;
    workflowName: string;
    workflowPath: string;
    message: string;
    outputGlbPath?: string;
  }> {
    const submitted = await this.submitWorkflow(payload);
    const startedAt = Date.now();

    while (Date.now() - startedAt < 15 * 60 * 1000) {
      const status = await this.getWorkflowJobStatus(submitted.jobId);
      if (status.state === "RESULT_READY") {
        return {
          promptId: submitted.promptId,
          workflowName: submitted.workflowName,
          workflowPath: submitted.workflowPath,
          message: status.message,
          outputGlbPath: status.outputs?.texturedGlbPath ?? status.outputs?.glbPath,
        };
      }
      if (status.state === "ERROR") {
        throw new Error(status.error?.message ?? status.message);
      }
      if (status.state === "CANCELED") {
        throw new Error("Workflow canceled.");
      }
      await sleep(1000);
    }

    throw new Error(`Workflow timeout for job ${submitted.jobId}`);
  }

  async getWorkflowJobStatus(jobId: string): Promise<ComfyJobStatusResponse> {
    await this.ensureStarted();
    const job = await this.requestJson<UnifiedJobResponse>(`/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
    const output = asObject(job.output);
    return {
      jobId: job.jobId,
      promptId: String(output.promptId ?? job.jobId),
      workflowName: String(output.workflowName ?? "hunyuan_image_to_3d_textured.json"),
      workflowPath: String(output.workflowName ?? "hunyuan_image_to_3d_textured.json"),
      state: mapJobState(job.status),
      progress: Math.max(0, Math.min(100, Number(job.progress ?? 0))),
      message: job.message ?? "",
      queuePosition: undefined,
      startedAt: toTimestamp(job.startedAt ?? job.createdAt),
      updatedAt: Date.now(),
      finishedAt: job.finishedAt ? toTimestamp(job.finishedAt) : undefined,
      outputs: this.toComfyOutputs(output),
      error: job.error
        ? {
            code: job.error.code,
            message: job.error.message ?? "Unknown error",
          }
        : undefined,
    };
  }

  async cancelWorkflowJob(jobId: string): Promise<void> {
    await this.ensureStarted();
    await this.requestJson(`/jobs/cancel/${encodeURIComponent(jobId)}`, { method: "POST" });
  }

  async resolveWorkflowJobOutputs(jobId: string): Promise<ComfyJobOutputs> {
    const status = await this.getWorkflowJobStatus(jobId);
    return status.outputs ?? {};
  }

  async getComfyConfig(): Promise<ComfyConfigResponse> {
    await this.ensureStarted();
    const config = await this.requestJson<Record<string, unknown>>("/system/comfy/config", { method: "GET" });
    const host = String(config.host ?? "127.0.0.1");
    const port = Number.parseInt(String(config.port ?? "8188"), 10) || 8188;
    return {
      host,
      port,
      baseUrl: String(config.baseUrl ?? `http://${host}:${port}`),
      comfyDir: String(config.comfyDir ?? ""),
      condaHook: "",
      condaEnvName: "volumia",
      pythonExeOverride: String(config.pythonExeOverride ?? ""),
      args: ["main.py", "--listen", host, "--port", String(port)],
      startupTimeoutMs: Number.parseInt(String(config.startupTimeoutMs ?? "120000"), 10) || 120000,
    };
  }

  async saveComfyConfig(patch: ComfyConfigPatch): Promise<ComfyConfigResponse> {
    await this.ensureStarted();
    await this.requestJson("/system/comfy/config", {
      method: "POST",
      body: JSON.stringify(patch ?? {}),
    });
    return await this.getComfyConfig();
  }

  private toComfyOutputs(output: Record<string, unknown>): ComfyJobOutputs {
    const previewImagesRaw = output.previewImages;
    const previewImages = Array.isArray(previewImagesRaw)
      ? previewImagesRaw.filter((item): item is string => typeof item === "string")
      : undefined;

    return {
      glbPath: typeof output.glbPath === "string" ? output.glbPath : undefined,
      meshPath: typeof output.meshPath === "string" ? output.meshPath : undefined,
      texturedGlbPath: typeof output.texturedGlbPath === "string" ? output.texturedGlbPath : undefined,
      previewImages,
      raw: output,
    };
  }

  private async getHealth(): Promise<BackendHealth> {
    await this.ensureStarted();
    return await this.requestJson<BackendHealth>("/health", { method: "GET" });
  }

  private async ensureStarted() {
    if (await this.isReachable()) {
      return;
    }
    if (this.startupInFlight) {
      await this.startupInFlight;
      return;
    }

    this.startupInFlight = (async () => {
      if (await this.isReachable()) {
        return;
      }
      await this.spawnBackendProcess();
      const timeoutMs = 60_000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (await this.isReachable()) {
          return;
        }
        await sleep(400);
      }
      throw new Error("Unified backend startup timeout.");
    })();

    try {
      await this.startupInFlight;
    } finally {
      this.startupInFlight = null;
    }
  }

  private async isReachable() {
    try {
      await this.requestJson("/health", { method: "GET" }, 2_000);
      return true;
    } catch {
      return false;
    }
  }

  private async spawnBackendProcess() {
    const scriptPath = this.resolveServerScriptPath();
    if (!scriptPath) {
      throw new Error("Python backend server.py not found.");
    }

    const configuredPython = process.env.VOLUMIA_PYTHON?.trim();
    const pythonCommand = configuredPython && configuredPython.length > 0
      ? { cmd: configuredPython, prefixArgs: [] as string[] }
      : process.platform === "win32"
        ? { cmd: "py", prefixArgs: ["-3"] }
        : { cmd: "python3", prefixArgs: [] as string[] };
    const child = spawn(pythonCommand.cmd, [...pythonCommand.prefixArgs, scriptPath], {
      cwd: path.dirname(scriptPath),
      shell: false,
      env: {
        ...process.env,
        VOLUMIA_BACKEND_HOST: this.host,
        VOLUMIA_BACKEND_PORT: String(this.port),
        VOLUMIA_RUNTIME_DIR: this.runtimePaths.root,
      },
    });
    child.stdout?.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message.length > 0) {
        console.log("[VOLUMIA][unified-python]", message);
      }
    });
    child.stderr?.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message.length > 0) {
        console.warn("[VOLUMIA][unified-python][err]", message);
      }
    });
    child.on("exit", (code, signal) => {
      if (this.backendProcess === child) {
        this.backendProcess = null;
      }
      console.warn("[VOLUMIA][unified-python] exited", { code, signal });
    });
    this.backendProcess = child;
  }

  private resolveServerScriptPath() {
    const candidates = [
      path.resolve(process.cwd(), "backend", "python", "server.py"),
      path.resolve(__dirname, "..", "backend", "python", "server.py"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private async requestJson<T>(route: string, init: RequestInit, timeoutMs = 15_000): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${route}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${route}: ${detail || response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      throw new Error(`[UnifiedBackend] ${toErrorMessage(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async resolveImagePath(imagePath?: string, imageBase64?: string): Promise<string> {
    if (imagePath && imagePath.trim().length > 0) {
      return imagePath;
    }
    if (!imageBase64 || imageBase64.trim().length === 0) {
      throw new Error("Either imagePath or imageBase64 is required.");
    }
    const tempDir = this.runtimePaths.backendTemp;
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `volumia-unified-${Date.now()}.png`);
    const normalized = imageBase64.replace(/^data:image\/\w+;base64,/i, "").trim();
    const buffer = Buffer.from(normalized, "base64");
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }
}
