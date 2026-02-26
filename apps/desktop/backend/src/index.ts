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

export async function importWorkflowFromPath(sourcePath: string) {
  const instance = getSupervisor();
  return instance.importWorkflowFromPath(sourcePath);
}
