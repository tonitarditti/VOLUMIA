import { backendClient } from "@/services/backendClient";
import type { JobOutputs, JobStatus, SubmitWorkflowParams } from "./comfyuiTypes";

function toJobStatus(raw: Awaited<ReturnType<typeof backendClient.getJobStatus>>): JobStatus {
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
    return await backendClient.getComfyStatus();
  },

  async start() {
    return await backendClient.startComfy();
  },

  async stop() {
    return await backendClient.stopComfy();
  },

  async getConfig() {
    return await backendClient.getComfyConfig();
  },

  async submitWorkflow(params: SubmitWorkflowParams) {
    return await backendClient.createReconstructJob(params);
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const raw = await backendClient.getJobStatus(jobId);
    return toJobStatus(raw);
  },

  async cancelJob(jobId: string) {
    await backendClient.cancelJob(jobId);
  },

  async resolveOutputs(jobId: string): Promise<JobOutputs> {
    return await backendClient.resolveOutputs(jobId);
  },
};
