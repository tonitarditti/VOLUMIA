import { desktopApi } from "@/electron/desktopApi";
import type { JobOutputs, JobStatus, SubmitWorkflowParams } from "./comfyuiTypes";

function toJobStatus(raw: Awaited<ReturnType<typeof desktopApi.getComfyJobStatus>>): JobStatus {
  return {
    jobId: raw.jobId,
    promptId: raw.promptId,
    state: raw.state,
    progress: raw.progress,
    message: raw.message,
    startedAt: raw.startedAt,
    updatedAt: raw.updatedAt,
    finishedAt: raw.finishedAt,
    queuePosition: raw.queuePosition,
    outputs: raw.outputs,
    error: raw.error,
    raw,
  };
}

export const comfyuiClient = {
  async getStatus() {
    return await desktopApi.getComfyStatus();
  },

  async start() {
    return await desktopApi.startComfy();
  },

  async stop() {
    return await desktopApi.stopComfy();
  },

  async getConfig() {
    return await desktopApi.getComfyConfig();
  },

  async submitWorkflow(params: SubmitWorkflowParams) {
    return await desktopApi.submitComfyJob(params);
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const raw = await desktopApi.getComfyJobStatus(jobId);
    return toJobStatus(raw);
  },

  async cancelJob(jobId: string) {
    await desktopApi.cancelComfyJob(jobId);
  },

  async resolveOutputs(jobId: string): Promise<JobOutputs> {
    return await desktopApi.resolveComfyOutputs(jobId);
  },
};
