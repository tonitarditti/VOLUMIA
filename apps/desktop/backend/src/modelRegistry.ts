import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { getModelsDir, getRepoConfigDir } from "./paths";

export type ModelFileEntry = {
  relPath: string;
  url?: string;
  sha256?: string;
  bytes?: number;
};

export type ModelEntry = {
  id: string;
  type: "checkpoint" | "controlnet" | "vae" | "lora" | "other";
  name: string;
  files: ModelFileEntry[];
};

export type ModelRegistry = {
  version: number;
  models: ModelEntry[];
};

export type ModelIssue = {
  modelId: string;
  modelName: string;
  relPath: string;
  targetPath: string;
  reason: string;
  details?: string;
};

export type ModelCheckResult = {
  ok: boolean;
  totalFiles: number;
  installedFiles: number;
  issues: ModelIssue[];
};

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function getRegistryPath() {
  return path.join(getRepoConfigDir(), "model-registry.json");
}

function ensureInsideModelsDir(targetPath: string) {
  const modelsRoot = path.resolve(getModelsDir());
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedTarget === modelsRoot) {
    return normalizedTarget;
  }
  if (!normalizedTarget.startsWith(`${modelsRoot}${path.sep}`)) {
    throw new Error(`Ruta de modelo fuera de models/: ${targetPath}`);
  }
  return normalizedTarget;
}

function resolveModelFilePath(relPath: string) {
  const normalizedRel = relPath.replace(/\\/g, "/");
  return ensureInsideModelsDir(path.join(getModelsDir(), normalizedRel));
}

function validateRegistryShape(value: unknown): asserts value is ModelRegistry {
  if (!value || typeof value !== "object") {
    throw new Error("model-registry.json invalido: raiz no es objeto.");
  }
  const root = value as Record<string, unknown>;
  if (root.version !== 1) {
    throw new Error(`model-registry.json invalido: version esperada 1, recibida ${String(root.version)}.`);
  }
  if (!Array.isArray(root.models)) {
    throw new Error("model-registry.json invalido: 'models' debe ser array.");
  }

  for (const model of root.models) {
    if (!model || typeof model !== "object") {
      throw new Error("model-registry.json invalido: modelo debe ser objeto.");
    }
    const item = model as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      throw new Error("model-registry.json invalido: model.id requerido.");
    }
    if (typeof item.type !== "string" || item.type.trim().length === 0) {
      throw new Error(`model-registry.json invalido: model.type requerido (model=${item.id}).`);
    }
    if (typeof item.name !== "string" || item.name.trim().length === 0) {
      throw new Error(`model-registry.json invalido: model.name requerido (model=${item.id}).`);
    }
    if (!Array.isArray(item.files) || item.files.length === 0) {
      throw new Error(`model-registry.json invalido: model.files requerido (model=${item.id}).`);
    }
    for (const file of item.files) {
      if (!file || typeof file !== "object") {
        throw new Error(`model-registry.json invalido: file invalido (model=${item.id}).`);
      }
      const fileItem = file as Record<string, unknown>;
      if (typeof fileItem.relPath !== "string" || fileItem.relPath.trim().length === 0) {
        throw new Error(`model-registry.json invalido: file.relPath requerido (model=${item.id}).`);
      }
      if (typeof fileItem.bytes !== "undefined" && typeof fileItem.bytes !== "number") {
        throw new Error(`model-registry.json invalido: file.bytes debe ser number (model=${item.id}).`);
      }
      if (typeof fileItem.sha256 !== "undefined" && typeof fileItem.sha256 !== "string") {
        throw new Error(`model-registry.json invalido: file.sha256 debe ser string (model=${item.id}).`);
      }
      if (typeof fileItem.url !== "undefined" && typeof fileItem.url !== "string") {
        throw new Error(`model-registry.json invalido: file.url debe ser string (model=${item.id}).`);
      }
    }
  }
}

async function computeSha256(filePath: string) {
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

async function downloadFile(
  url: string,
  targetPath: string,
  onProgress?: (payload: { targetPath: string; downloadedBytes: number; totalBytes: number | null }) => void
) {
  logger.info("Descargando modelo...", { url, targetPath });
  const response = await fetch(url);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Descarga fallo (${response.status}) para ${url}: ${bodyText || response.statusText}`);
  }

  const totalHeader = response.headers.get("content-length");
  const totalBytes = totalHeader ? Number.parseInt(totalHeader, 10) : null;
  const reader = response.body?.getReader();
  if (!reader) {
    const arrayBuffer = await response.arrayBuffer();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
    onProgress?.({ targetPath, downloadedBytes: arrayBuffer.byteLength, totalBytes });
    return;
  }

  let downloadedBytes = 0;
  const chunks: Buffer[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    const buffer = Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength);
    downloadedBytes += buffer.byteLength;
    chunks.push(buffer);
    onProgress?.({ targetPath, downloadedBytes, totalBytes });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.concat(chunks));
}

export function readModelRegistry() {
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    throw new Error(`No existe model-registry.json en: ${registryPath}`);
  }
  const raw = fs.readFileSync(registryPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  validateRegistryShape(parsed);
  return parsed;
}

export async function checkModelsInstalled(): Promise<ModelCheckResult> {
  const registry = readModelRegistry();
  const issues: ModelIssue[] = [];
  let totalFiles = 0;
  let installedFiles = 0;

  for (const model of registry.models) {
    for (const file of model.files) {
      totalFiles += 1;
      const targetPath = resolveModelFilePath(file.relPath);
      if (!fs.existsSync(targetPath)) {
        issues.push({
          modelId: model.id,
          modelName: model.name,
          relPath: file.relPath,
          targetPath,
          reason: "missing",
          details: "Archivo no encontrado.",
        });
        continue;
      }

      const fileStats = fs.statSync(targetPath);
      if (typeof file.bytes === "number" && file.bytes > 0 && fileStats.size !== file.bytes) {
        issues.push({
          modelId: model.id,
          modelName: model.name,
          relPath: file.relPath,
          targetPath,
          reason: "size-mismatch",
          details: `Esperado=${file.bytes}, actual=${fileStats.size}`,
        });
        continue;
      }

      const expectedHash = file.sha256?.trim().toLowerCase();
      if (expectedHash) {
        const currentHash = (await computeSha256(targetPath)).toLowerCase();
        if (currentHash !== expectedHash) {
          issues.push({
            modelId: model.id,
            modelName: model.name,
            relPath: file.relPath,
            targetPath,
            reason: "hash-mismatch",
            details: `Esperado=${expectedHash}, actual=${currentHash}`,
          });
          continue;
        }
      }

      installedFiles += 1;
    }
  }

  return {
    ok: issues.length === 0,
    totalFiles,
    installedFiles,
    issues,
  };
}

export async function ensureModels(options?: {
  onDownloadProgress?: (payload: { targetPath: string; downloadedBytes: number; totalBytes: number | null }) => void;
}) {
  const registry = readModelRegistry();
  const missingManualInstructions: string[] = [];

  for (const model of registry.models) {
    for (const file of model.files) {
      const targetPath = resolveModelFilePath(file.relPath);
      const hasFile = fs.existsSync(targetPath);
      const expectedBytes = typeof file.bytes === "number" ? file.bytes : 0;
      const expectedHash = file.sha256?.trim().toLowerCase() ?? "";

      let needsDownload = !hasFile;

      if (hasFile) {
        const stats = fs.statSync(targetPath);
        if (expectedBytes > 0 && stats.size !== expectedBytes) {
          needsDownload = true;
        } else if (expectedHash) {
          const currentHash = (await computeSha256(targetPath)).toLowerCase();
          if (currentHash !== expectedHash) {
            needsDownload = true;
          }
        }
      }

      if (!needsDownload) {
        continue;
      }

      const modelUrl = file.url?.trim() ?? "";
      if (!isHttpUrl(modelUrl)) {
        missingManualInstructions.push(
          `- ${model.name} (${model.id}) -> copiar archivo en: ${targetPath} (sin URL automatica en registry).`
        );
        continue;
      }

      await downloadFile(modelUrl, targetPath, options?.onDownloadProgress);
    }
  }

  if (missingManualInstructions.length > 0) {
    throw new Error(
      [
        "Modelos faltantes y sin URL automatica.",
        "Instalacion manual requerida en las rutas exactas:",
        ...missingManualInstructions,
      ].join("\n")
    );
  }

  const checkResult = await checkModelsInstalled();
  if (!checkResult.ok) {
    const details = checkResult.issues.map((issue) => `- ${issue.reason}: ${issue.targetPath} (${issue.details ?? ""})`);
    throw new Error(["Validacion de modelos fallo despues de ensureModels().", ...details].join("\n"));
  }

  logger.info("Modelos validados correctamente.", {
    totalFiles: checkResult.totalFiles,
    installedFiles: checkResult.installedFiles,
  });
  return checkResult;
}

