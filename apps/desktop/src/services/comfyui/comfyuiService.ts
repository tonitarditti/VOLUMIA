import {
  COMFYUI_JOB_POLL_MS,
  COMFYUI_JOB_STALL_TIMEOUT_MS,
  COMFYUI_READY_POLL_MS,
  COMFYUI_READY_TIMEOUT_MS,
} from "./comfyuiConfig";
import { comfyuiClient } from "./comfyuiClient";
import type { EnsureReadyResult, JobOutputs, JobStatus, SubmitWorkflowParams, SubmitWorkflowResult } from "./comfyuiTypes";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export const comfyuiService = {
  async ensureReady(): Promise<EnsureReadyResult> {
    const startedAt = Date.now();
    let lastDetails = "Waiting for ComfyUI readiness...";

    await this.startEngineIfNeeded();

    while (Date.now() - startedAt < COMFYUI_READY_TIMEOUT_MS) {
      const status = await comfyuiClient.getStatus();
      lastDetails = status.message || `ComfyUI ${status.state.toLowerCase()}.`;
      console.info("[VOLUMIA][comfyui][ready]", status.state, lastDetails);

      if (status.running) {
        return {
          ready: true,
          details: lastDetails,
        };
      }

      await wait(COMFYUI_READY_POLL_MS);
    }

    return {
      ready: false,
      details: lastDetails,
    };
  },

  async startEngineIfNeeded(): Promise<void> {
    const status = await comfyuiClient.getStatus();
    if (status.running || status.state === "STARTING") {
      return;
    }

    console.info("[VOLUMIA][comfyui][engine] starting");
    await comfyuiClient.start();
  },

  async submitWorkflow(params: SubmitWorkflowParams): Promise<SubmitWorkflowResult> {
    console.info("[VOLUMIA][comfyui][job] submit", params.workflowId ?? "default");
    const result = await comfyuiClient.submitWorkflow(params);
    return {
      jobId: result.jobId,
    };
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return await comfyuiClient.getJobStatus(jobId);
  },

  async cancelJob(jobId: string): Promise<void> {
    console.info("[VOLUMIA][comfyui][job] cancel", jobId);
    await comfyuiClient.cancelJob(jobId);
  },

  async resolveOutputs(jobId: string): Promise<JobOutputs> {
    return await comfyuiClient.resolveOutputs(jobId);
  },

  async waitForTerminalStatus(jobId: string): Promise<JobStatus> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < COMFYUI_JOB_STALL_TIMEOUT_MS) {
      const status = await this.getJobStatus(jobId);
      if (status.state === "RESULT_READY" || status.state === "ERROR" || status.state === "CANCELED") {
        return status;
      }
      await wait(COMFYUI_JOB_POLL_MS);
    }

    throw new Error(`ComfyUI job timeout: ${jobId}`);
  },
};
