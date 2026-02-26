import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { readModelRegistry } from "./modelRegistry";
import { getRepoWorkflowDir, getWorkflowsDir } from "./paths";

export type WorkflowSyncResult = {
  copied: string[];
  replaced: string[];
  backups: string[];
};

export type WorkflowCheckpointPatchResult = {
  patched: boolean;
  appliedCheckpoint: string | null;
  availableCheckpoints: string[];
  replacements: Array<{ nodeId: string; previous: string; next: string }>;
  workflowJson: unknown;
};

function listJsonFilesRecursive(dirPath: string, baseDir: string, collector: string[]) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      listJsonFilesRecursive(absolutePath, baseDir, collector);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }
    collector.push(path.relative(baseDir, absolutePath));
  }
}

async function sha256OfFile(filePath: string) {
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function ensureSafeWorkflowName(name: string) {
  if (!name || name.trim().length === 0) {
    throw new Error("Nombre de workflow vacio.");
  }
  if (name.includes("..")) {
    throw new Error(`Nombre de workflow invalido: ${name}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCheckpointCandidatesFromRegistry() {
  const registry = readModelRegistry();
  const checkpoints: string[] = [];
  for (const model of registry.models) {
    if (model.type !== "checkpoint") {
      continue;
    }
    for (const file of model.files) {
      checkpoints.push(path.basename(file.relPath));
    }
  }
  return Array.from(new Set(checkpoints.filter((item) => item.trim().length > 0)));
}

function pickPreferredCheckpoint(checkpoints: string[]) {
  if (checkpoints.includes("hunyuan_3d_v2.1.safetensors")) {
    return "hunyuan_3d_v2.1.safetensors";
  }
  return checkpoints[0] ?? null;
}

export async function syncWorkflows(): Promise<WorkflowSyncResult> {
  const sourceRoot = getRepoWorkflowDir();
  const targetRoot = getWorkflowsDir();

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`No existe carpeta de workflows en repo: ${sourceRoot}`);
  }

  const workflowFiles: string[] = [];
  listJsonFilesRecursive(sourceRoot, sourceRoot, workflowFiles);
  const result: WorkflowSyncResult = {
    copied: [],
    replaced: [],
    backups: [],
  };

  for (const relPath of workflowFiles) {
    const sourcePath = path.join(sourceRoot, relPath);
    const targetPath = path.join(targetRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      result.copied.push(targetPath);
      continue;
    }

    const sourceHash = await sha256OfFile(sourcePath);
    const targetHash = await sha256OfFile(targetPath);
    if (sourceHash === targetHash) {
      continue;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${targetPath}.bak.${timestamp}`;
    fs.copyFileSync(targetPath, backupPath);
    fs.copyFileSync(sourcePath, targetPath);
    result.backups.push(backupPath);
    result.replaced.push(targetPath);
  }

  logger.info("Workflows sincronizados.", {
    copied: result.copied.length,
    replaced: result.replaced.length,
    backups: result.backups.length,
  });
  return result;
}

export function getWorkflowPath(name: string) {
  ensureSafeWorkflowName(name);
  return path.join(getWorkflowsDir(), name);
}

export function patchWorkflowCheckpoint(workflowJson: unknown): WorkflowCheckpointPatchResult {
  const availableCheckpoints = getCheckpointCandidatesFromRegistry();
  const preferredCheckpoint = pickPreferredCheckpoint(availableCheckpoints);
  const replacements: Array<{ nodeId: string; previous: string; next: string }> = [];

  if (!isRecord(workflowJson) || !preferredCheckpoint) {
    return {
      patched: false,
      appliedCheckpoint: preferredCheckpoint,
      availableCheckpoints,
      replacements,
      workflowJson,
    };
  }

  const cloned = JSON.parse(JSON.stringify(workflowJson)) as Record<string, unknown>;
  for (const [nodeId, nodeValue] of Object.entries(cloned)) {
    if (!isRecord(nodeValue) || nodeValue.class_type !== "CheckpointLoaderSimple") {
      continue;
    }
    const inputs = isRecord(nodeValue.inputs) ? nodeValue.inputs : {};
    const current = typeof inputs.ckpt_name === "string" ? inputs.ckpt_name : "";
    if (availableCheckpoints.includes(current)) {
      continue;
    }
    inputs.ckpt_name = preferredCheckpoint;
    nodeValue.inputs = inputs;
    replacements.push({
      nodeId,
      previous: current || "<missing>",
      next: preferredCheckpoint,
    });
  }

  if (replacements.length > 0) {
    logger.warn(`Patched ckpt_name -> ${preferredCheckpoint}`, {
      replacements,
      availableCheckpoints,
    });
  }

  return {
    patched: replacements.length > 0,
    appliedCheckpoint: preferredCheckpoint,
    availableCheckpoints,
    replacements,
    workflowJson: cloned,
  };
}
