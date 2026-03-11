import { desktopApi } from "@/electron/desktopApi";
import type { ComfyConfigPatch, ComfySubmitJobPayload } from "@/electron/channels";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const backendBaseUrl =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_UNIFIED_BACKEND_URL ??
  "http://127.0.0.1:9360";

async function requestJson<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Backend ${route} failed (${response.status}): ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export const backendClient = {
  async startBackend() {
    return await desktopApi.getBackendStatus();
  },

  async waitForBackendReady(timeoutMs = 30_000, pollMs = 800) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const status = await desktopApi.getBackendStatus();
      if (status?.comfy?.state !== "error") {
        return status;
      }
      await wait(pollMs);
    }
    throw new Error("Backend not ready within timeout.");
  },

  async createReconstructJob(payload: ComfySubmitJobPayload) {
    return await desktopApi.submitComfyJob(payload);
  },

  async createTextureJob(payload: {
    projectId?: string;
    meshPath: string;
    referenceImages: string[];
    preset?: "fast" | "balanced" | "high" | "quality";
    timeoutMs?: number;
  }) {
    await this.startBackend();
    return await requestJson<{ jobId: string; status: string }>("/jobs/texture", {
      method: "POST",
      body: JSON.stringify({
        projectId: payload.projectId,
        meshPath: payload.meshPath,
        referenceImages: payload.referenceImages,
        preset: payload.preset ?? "balanced",
        timeoutMs: payload.timeoutMs ?? 0,
      }),
    });
  },

  async getJobStatus(jobId: string) {
    return await desktopApi.getComfyJobStatus(jobId);
  },

  async cancelJob(jobId: string) {
    await desktopApi.cancelComfyJob(jobId);
  },

  async getSystemResources() {
    await this.startBackend();
    return await requestJson<Record<string, unknown>>("/system/resources");
  },

  async getComfyStatus() {
    return await desktopApi.getComfyStatus();
  },

  async startComfy() {
    return await desktopApi.startComfy();
  },

  async stopComfy() {
    return await desktopApi.stopComfy();
  },

  async runComfyWorkflow(payload?: ComfySubmitJobPayload) {
    return await desktopApi.runComfyWorkflow(payload);
  },

  async resolveOutputs(jobId: string) {
    return await desktopApi.resolveComfyOutputs(jobId);
  },

  async getComfyConfig() {
    return await desktopApi.getComfyConfig();
  },

  async saveComfyConfig(patch: ComfyConfigPatch) {
    return await desktopApi.saveComfyConfig(patch);
  },
};

