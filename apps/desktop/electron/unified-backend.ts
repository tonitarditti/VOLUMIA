import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  type BackendStatusResponse,
  type ComfyConfigPatch,
  type ComfyConfigResponse,
  type ComfyJobOutputs,
  type ComfyJobStatusResponse,
  type ComfyStatusResponse,
  type ComfySubmitJobPayload,
  type ComfySubmitJobResult,
} from "./channels";
import { ensureRuntimeLayout, resolveRuntimePaths, type RuntimePaths } from "./runtime-paths";

type MvpHealth = {
  ok: boolean;
  service: string;
  version: string;
  projectsRoot: string;
  logPath: string;
  startedAt: string;
};

type MvpTool = {
  configured: boolean;
  exists: boolean;
  path: string | null;
  status: string;
};

type MvpToolsResponse = {
  ok: boolean;
  tools: Record<string, MvpTool>;
};

type MvpJob = {
  id?: string;
  projectId: string;
  mode?: string;
  status: string;
  message?: string;
  latestGlb?: string;
  output?: Record<string, unknown>;
  error?: { message?: string };
  startedAt?: string;
  finishedAt?: string;
};

type MvpStatusResponse = {
  ok: boolean;
  project: {
    id: string;
    latestGlb: string | null;
    modelUrl: string | null;
  };
  job: MvpJob;
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

function toTimestamp(value?: string) {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapJobState(status: string): ComfyJobStatusResponse["state"] {
  if (status === "queued") return "QUEUED";
  if (status === "complete") return "RESULT_READY";
  if (status === "error") return "ERROR";
  return "RUNNING";
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
    await this.ensureStarted();
    const [health, tools] = await Promise.all([
      this.requestJson<MvpHealth>("/api/health", { method: "GET" }),
      this.requestJson<MvpToolsResponse>("/api/tools/status", { method: "GET" }),
    ]);
    const configuredCount = Object.values(tools.tools).filter((tool) => tool.exists).length;
    return {
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
      startedAt: health.startedAt ?? null,
      workflows: {
        sourceDir: path.resolve(process.cwd(), "backend"),
        targetDir: path.resolve(process.cwd(), "backend"),
        copied: 0,
        replaced: 0,
        backups: 0,
        lastSyncAt: null,
        error: null,
        activeName: "VOLUMIA Local MVP",
        activePath: this.resolveServerScriptPath(),
      },
      models: {
        ok: true,
        totalFiles: Object.keys(tools.tools).length,
        installedFiles: configuredCount,
        message: `${configuredCount}/${Object.keys(tools.tools).length} herramientas configuradas`,
        error: null,
      },
      comfy: {
        running: true,
        url: this.baseUrl,
        lastError: null,
        state: "running",
        host: this.host,
        port: this.port,
        pid: this.backendProcess?.pid ?? null,
        python: tools.tools.python?.path ?? null,
        comfyRoot: null,
        healthy: true,
        external: false,
        message: "Backend MVP local activo. ComfyUI esta aislado.",
      },
      activeProcesses: this.backendProcess?.pid ? [{ name: "volumia-mvp-backend", pid: this.backendProcess.pid }] : [],
      notes: [`projectsRoot: ${health.projectsRoot}`, `logs: ${health.logPath}`],
    };
  }

  async getComfyStatus(): Promise<ComfyStatusResponse> {
    await this.ensureStarted();
    return {
      state: "STOPPED",
      running: false,
      url: this.baseUrl,
      pid: null,
      startedByApp: false,
      lastError: null,
      lastLogs: ["ComfyUI no se usa en el MVP local."],
      message: "ComfyUI aislado; usa demo, quick, textured o photogrammetry via backend MVP.",
      host: this.host,
      port: 8188,
      config: {
        comfyDir: "",
        condaHook: "",
        condaEnvName: "",
        pythonExeOverride: process.env.VOLUMIA_PYTHON ?? "",
        startupTimeoutMs: 0,
      },
    };
  }

  async startComfy(): Promise<ComfyStatusResponse> {
    return await this.getComfyStatus();
  }

  async stopComfy(): Promise<ComfyStatusResponse> {
    return await this.getComfyStatus();
  }

  async getComfyLogs(limit = 200): Promise<string[]> {
    const candidates = [
      path.resolve(process.cwd(), "backend", "logs", "volumia.log"),
      path.resolve(__dirname, "..", "backend", "logs", "volumia.log"),
      path.join(this.runtimePaths.logs, "volumia.log"),
    ];
    const logPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!logPath) {
      return ["No MVP backend logs yet."];
    }
    const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - Math.max(1, limit)));
  }

  async submitWorkflow(payload?: ComfySubmitJobPayload): Promise<ComfySubmitJobResult> {
    await this.ensureStarted();
    const projectId = payload?.projectId ?? `project_${Date.now()}`;
    await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/generate`, {
      method: "POST",
      body: JSON.stringify({ mode: payload?.workflowId ?? "quick" }),
    });
    return {
      jobId: projectId,
      promptId: projectId,
      workflowName: payload?.workflowId ?? "quick",
      workflowPath: "VOLUMIA MVP",
      message: `Job ${projectId} queued`,
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
          outputGlbPath: status.outputs?.glbPath,
        };
      }
      if (status.state === "ERROR") {
        throw new Error(status.error?.message ?? status.message);
      }
      await sleep(1000);
    }
    throw new Error(`Workflow timeout for job ${submitted.jobId}`);
  }

  async getWorkflowJobStatus(projectId: string): Promise<ComfyJobStatusResponse> {
    await this.ensureStarted();
    const payload = await this.requestJson<MvpStatusResponse>(`/api/projects/${encodeURIComponent(projectId)}/status`, { method: "GET" });
    const job = payload.job;
    return {
      jobId: projectId,
      promptId: projectId,
      workflowName: job.mode ?? "mvp",
      workflowPath: "VOLUMIA MVP",
      state: mapJobState(job.status),
      progress: job.status === "complete" ? 100 : job.status === "queued" ? 10 : job.status === "error" ? 100 : 55,
      message: job.message ?? "",
      startedAt: toTimestamp(job.startedAt),
      updatedAt: Date.now(),
      finishedAt: job.finishedAt ? toTimestamp(job.finishedAt) : undefined,
      outputs: this.toOutputs(job, payload.project.latestGlb),
      error: job.error ? { message: job.error.message ?? job.message ?? "Unknown error" } : undefined,
    };
  }

  async cancelWorkflowJob(_projectId?: string): Promise<void> {
    return;
  }

  async resolveWorkflowJobOutputs(projectId: string): Promise<ComfyJobOutputs> {
    const status = await this.getWorkflowJobStatus(projectId);
    return status.outputs ?? {};
  }

  async getComfyConfig(): Promise<ComfyConfigResponse> {
    return {
      host: this.host,
      port: this.port,
      baseUrl: this.baseUrl,
      comfyDir: "",
      condaHook: "",
      condaEnvName: "",
      pythonExeOverride: process.env.VOLUMIA_PYTHON ?? "",
      args: ["backend/server.js"],
      startupTimeoutMs: 0,
    };
  }

  async saveComfyConfig(_patch: ComfyConfigPatch): Promise<ComfyConfigResponse> {
    return await this.getComfyConfig();
  }

  private toOutputs(job: MvpJob, latestGlb: string | null): ComfyJobOutputs {
    const output = job.output && typeof job.output === "object" ? job.output : {};
    return {
      glbPath: latestGlb ?? (typeof job.latestGlb === "string" ? job.latestGlb : undefined),
      meshPath: typeof output.source === "string" ? output.source : undefined,
      raw: job,
    };
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
      const startedAt = Date.now();
      while (Date.now() - startedAt < 60_000) {
        if (await this.isReachable()) {
          return;
        }
        await sleep(400);
      }
      throw new Error("MVP backend startup timeout.");
    })();
    try {
      await this.startupInFlight;
    } finally {
      this.startupInFlight = null;
    }
  }

  private async isReachable() {
    try {
      await this.requestJson("/api/health", { method: "GET" }, 2_000);
      return true;
    } catch {
      return false;
    }
  }

  private async spawnBackendProcess() {
    const scriptPath = this.resolveServerScriptPath();
    if (!scriptPath) {
      throw new Error("MVP backend/server.js not found.");
    }
    const nodeCommand = process.env.VOLUMIA_NODE?.trim() || "node";
    const child = spawn(nodeCommand, [scriptPath], {
      cwd: path.dirname(scriptPath),
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        VOLUMIA_BACKEND_HOST: this.host,
        VOLUMIA_BACKEND_PORT: String(this.port),
        VOLUMIA_RUNTIME_DIR: this.runtimePaths.root,
      },
    });
    child.stdout?.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) console.log("[VOLUMIA][mvp-backend]", message);
    });
    child.stderr?.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) console.warn("[VOLUMIA][mvp-backend][err]", message);
    });
    child.on("exit", (code, signal) => {
      if (this.backendProcess === child) {
        this.backendProcess = null;
      }
      console.warn("[VOLUMIA][mvp-backend] exited", { code, signal });
    });
    this.backendProcess = child;
  }

  private resolveServerScriptPath() {
    const candidates = [
      path.resolve(process.cwd(), "backend", "server.js"),
      path.resolve(__dirname, "..", "backend", "server.js"),
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
      throw new Error(`[MvpBackend] ${toErrorMessage(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
