import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { getRepoWorkflowDir, getUserDataRoot, getWorkflowsDir } from "./paths";

export type WorkflowSyncResult = {
  copied: string[];
  replaced: string[];
  backups: string[];
};

export type ActiveWorkflowInfo = {
  name: string;
  path: string;
};

export type WorkflowImportResult = {
  workflowName: string;
  workflowPath: string;
  replacedExisting: boolean;
};

export type WorkflowImageInjectionResult = {
  workflowJson: unknown;
  appliedNodeIds: string[];
  imageValue: string;
};

export type WorkflowCheckpointUsage = {
  nodeId: string;
  ckptName: string;
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
  if (!name.toLowerCase().endsWith(".json")) {
    throw new Error(`Nombre de workflow invalido (debe terminar en .json): ${name}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_WORKFLOW_NAME = "hunyuan_image_to_3d.json";

type WorkflowState = {
  activeWorkflowName: string | null;
};

function getWorkflowStatePath() {
  return path.join(getUserDataRoot(), "workflow-state.json");
}

function readWorkflowState(): WorkflowState {
  const statePath = getWorkflowStatePath();
  if (!fs.existsSync(statePath)) {
    return { activeWorkflowName: null };
  }
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { activeWorkflowName: null };
    }
    const activeWorkflowNameRaw = parsed.activeWorkflowName;
    if (typeof activeWorkflowNameRaw !== "string" || activeWorkflowNameRaw.trim().length === 0) {
      return { activeWorkflowName: null };
    }
    return { activeWorkflowName: activeWorkflowNameRaw.trim() };
  } catch {
    return { activeWorkflowName: null };
  }
}

function writeWorkflowState(state: WorkflowState) {
  const statePath = getWorkflowStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function listAvailableWorkflows() {
  const workflowsDir = getWorkflowsDir();
  if (!fs.existsSync(workflowsDir)) {
    return [] as string[];
  }
  return fs
    .readdirSync(workflowsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function ensureWorkflowJsonShape(value: unknown, workflowPathForError: string) {
  if (!isRecord(value)) {
    throw new Error(`Workflow invalido (raiz no es objeto): ${workflowPathForError}`);
  }
}

function resolveActiveWorkflowName() {
  const state = readWorkflowState();
  const available = listAvailableWorkflows();
  if (state.activeWorkflowName && available.includes(state.activeWorkflowName)) {
    return state.activeWorkflowName;
  }
  if (available.includes(DEFAULT_WORKFLOW_NAME)) {
    return DEFAULT_WORKFLOW_NAME;
  }
  return available[0] ?? null;
}

function normalizeImportedWorkflowName(sourcePath: string) {
  const parsed = path.parse(sourcePath);
  const base = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const normalized = `${base || "imported_workflow"}.json`;
  ensureSafeWorkflowName(normalized);
  return normalized;
}

function buildUniqueWorkflowName(baseName: string) {
  const workflowsDir = getWorkflowsDir();
  const parsed = path.parse(baseName);
  let candidate = `${parsed.name}${parsed.ext || ".json"}`;
  let counter = 1;
  while (fs.existsSync(path.join(workflowsDir, candidate))) {
    candidate = `${parsed.name}_${counter}${parsed.ext || ".json"}`;
    counter += 1;
  }
  return candidate;
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

export function getDefaultWorkflowName() {
  return DEFAULT_WORKFLOW_NAME;
}

export function getWorkflowPath(name: string) {
  ensureSafeWorkflowName(name);
  return path.join(getWorkflowsDir(), name);
}

export function getActiveWorkflowInfo(): ActiveWorkflowInfo {
  const activeName = resolveActiveWorkflowName();
  if (!activeName) {
    throw new Error(
      `No hay workflows disponibles en ${getWorkflowsDir()}. Importa un workflow JSON o agrega ${DEFAULT_WORKFLOW_NAME}.`
    );
  }
  return {
    name: activeName,
    path: getWorkflowPath(activeName),
  };
}

export function setActiveWorkflowByName(name: string): ActiveWorkflowInfo {
  ensureSafeWorkflowName(name);
  const workflowPath = getWorkflowPath(name);
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow no encontrado para activar: ${workflowPath}`);
  }
  writeWorkflowState({ activeWorkflowName: name });
  return { name, path: workflowPath };
}

export function importWorkflowFromDisk(sourcePath: string): WorkflowImportResult {
  const absoluteSourcePath = path.resolve(sourcePath);
  if (!fs.existsSync(absoluteSourcePath)) {
    throw new Error(`Workflow source no encontrado: ${absoluteSourcePath}`);
  }
  if (!absoluteSourcePath.toLowerCase().endsWith(".json")) {
    throw new Error(`El archivo importado debe ser .json: ${absoluteSourcePath}`);
  }

  const raw = fs.readFileSync(absoluteSourcePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  ensureWorkflowJsonShape(parsed, absoluteSourcePath);

  const normalizedName = normalizeImportedWorkflowName(absoluteSourcePath);
  const workflowsDir = getWorkflowsDir();
  fs.mkdirSync(workflowsDir, { recursive: true });
  const preferredPath = path.join(workflowsDir, normalizedName);
  const targetName = fs.existsSync(preferredPath) ? buildUniqueWorkflowName(normalizedName) : normalizedName;
  const targetPath = path.join(workflowsDir, targetName);
  const replacedExisting = fs.existsSync(targetPath);

  fs.writeFileSync(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  setActiveWorkflowByName(targetName);

  logger.info("Workflow importado y activado.", {
    sourcePath: absoluteSourcePath,
    workflowName: targetName,
    workflowPath: targetPath,
  });

  return {
    workflowName: targetName,
    workflowPath: targetPath,
    replacedExisting,
  };
}

export function loadWorkflowJson(workflowPath: string): unknown {
  const absoluteWorkflowPath = path.resolve(workflowPath);
  if (!fs.existsSync(absoluteWorkflowPath)) {
    throw new Error(`Workflow no encontrado: ${absoluteWorkflowPath}`);
  }
  const raw = fs.readFileSync(absoluteWorkflowPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  ensureWorkflowJsonShape(parsed, absoluteWorkflowPath);
  return parsed;
}

export function applyImageInputToWorkflow(
  workflowJson: unknown,
  uploadedImageName: string,
  uploadedSubfolder = ""
): WorkflowImageInjectionResult {
  if (!isRecord(workflowJson)) {
    return {
      workflowJson,
      appliedNodeIds: [],
      imageValue: uploadedImageName,
    };
  }

  const normalizedImageValue = uploadedSubfolder
    ? `${uploadedSubfolder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/${uploadedImageName}`
    : uploadedImageName;
  const cloned = JSON.parse(JSON.stringify(workflowJson)) as Record<string, unknown>;
  const appliedNodeIds: string[] = [];

  for (const [nodeId, nodeValue] of Object.entries(cloned)) {
    if (!isRecord(nodeValue)) {
      continue;
    }

    const classType = String(nodeValue.class_type ?? "");
    if (!classType.toLowerCase().includes("loadimage")) {
      continue;
    }

    const inputs = isRecord(nodeValue.inputs) ? { ...nodeValue.inputs } : {};
    if (typeof inputs.image !== "string") {
      continue;
    }
    inputs.image = normalizedImageValue;
    nodeValue.inputs = inputs;
    appliedNodeIds.push(nodeId);
  }

  return {
    imageValue: normalizedImageValue,
    appliedNodeIds,
    workflowJson: cloned,
  };
}

export function getCheckpointUsages(workflowJson: unknown): WorkflowCheckpointUsage[] {
  if (!isRecord(workflowJson)) {
    return [];
  }

  const usages: WorkflowCheckpointUsage[] = [];
  for (const [nodeId, nodeValue] of Object.entries(workflowJson)) {
    if (!isRecord(nodeValue)) {
      continue;
    }
    if (nodeValue.class_type !== "CheckpointLoaderSimple") {
      continue;
    }
    const inputs = isRecord(nodeValue.inputs) ? nodeValue.inputs : {};
    const ckptName = typeof inputs.ckpt_name === "string" ? inputs.ckpt_name.trim() : "";
    if (!ckptName) {
      continue;
    }
    usages.push({ nodeId, ckptName });
  }
  return usages;
}
