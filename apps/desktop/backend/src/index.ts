import { BackendSupervisor, type BackendMode, type BackendStatus } from "./supervisor";

let supervisor: BackendSupervisor | null = null;

function getSupervisor() {
  if (!supervisor) {
    supervisor = new BackendSupervisor();
  }
  return supervisor;
}

function detectMode(): BackendMode {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { app?: { isPackaged?: boolean } };
    if (electron?.app?.isPackaged) {
      return "prod";
    }
  } catch {
    // No-op by design.
  }
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

export async function initBackend() {
  const instance = getSupervisor();
  return await instance.getStatus();
}

export async function startBackend(mode?: BackendMode) {
  const instance = getSupervisor();
  return await instance.startAll({ mode: mode ?? detectMode() });
}

export async function stopBackend() {
  if (!supervisor) {
    return null;
  }
  return await supervisor.stopAll();
}

export async function getBackendStatus(): Promise<BackendStatus> {
  const instance = getSupervisor();
  return await instance.getStatus();
}

export async function runDefaultWorkflow(input?: { imagePath?: string; imageBase64?: string }) {
  const instance = getSupervisor();
  return await instance.runDefaultWorkflow(input);
}

export async function runWorkflow(workflowName?: string, input?: { imagePath?: string; imageBase64?: string }) {
  const instance = getSupervisor();
  return await instance.runWorkflow(workflowName, input);
}

export async function submitWorkflow(workflowName?: string, input?: { imagePath?: string; imageBase64?: string; projectId?: string }) {
  const instance = getSupervisor();
  return await instance.submitWorkflow(workflowName, input);
}

export async function getWorkflowJobStatus(jobId: string) {
  const instance = getSupervisor();
  return await instance.getWorkflowJobStatus(jobId);
}

export async function cancelWorkflowJob(jobId: string) {
  const instance = getSupervisor();
  return await instance.cancelWorkflowJob(jobId);
}

export async function resolveWorkflowJobOutputs(jobId: string) {
  const instance = getSupervisor();
  return await instance.resolveWorkflowJobOutputs(jobId);
}

export async function importWorkflowFromPath(sourcePath: string) {
  const instance = getSupervisor();
  return instance.importWorkflowFromPath(sourcePath);
}

export async function getComfyStatus() {
  const instance = getSupervisor();
  return instance.getComfyStatus();
}

export async function startComfy() {
  const instance = getSupervisor();
  return await instance.startComfyUI();
}

export async function stopComfy() {
  const instance = getSupervisor();
  return await instance.stopComfyUI("ipc-stop", false);
}

export async function getComfyLogs(limit?: number) {
  const instance = getSupervisor();
  return instance.getComfyLogs(limit);
}

export async function getComfyConfig() {
  const instance = getSupervisor();
  return instance.getComfyConfig();
}

export async function saveComfyConfig(patch: {
  host?: string;
  port?: number;
  baseUrl?: string;
  comfyDir?: string;
  condaHook?: string;
  condaEnvName?: string;
  pythonExeOverride?: string;
  startupTimeoutMs?: number;
}) {
  const instance = getSupervisor();
  return instance.saveComfyConfig(patch);
}
