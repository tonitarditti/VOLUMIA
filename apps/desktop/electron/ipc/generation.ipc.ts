import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import { copyFile, mkdir, writeFile } from "fs/promises";
import { basename, extname, join, resolve } from "path";
import {
  IPC_CHANNELS,
  type GenerationDonePayload,
  type GenerationErrorPayload,
  type GenerationPreset,
  type GenerationProgressPayload,
  type GenerationRunPayload,
  type GenerationRunResult,
} from "../channels";

type WindowGetter = () => BrowserWindow | null;
type GenerationJobState = {
  canceled: boolean;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeJobs = new Map<string, GenerationJobState>();

function wait(ms: number) {
  return new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function sanitizeProjectId(projectId: string) {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe || "project";
}

function isPreset(value: unknown): value is GenerationPreset {
  return value === "fast" || value === "balanced" || value === "quality";
}

function validateRunPayload(payload: unknown): payload is GenerationRunPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Partial<GenerationRunPayload>;
  return (
    typeof candidate.projectId === "string" &&
    Array.isArray(candidate.imagePaths) &&
    candidate.imagePaths.every((item) => typeof item === "string") &&
    isPreset(candidate.preset)
  );
}

function sendProgress(getWindow: WindowGetter, payload: GenerationProgressPayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationProgress, payload);
}

function sendDone(getWindow: WindowGetter, payload: GenerationDonePayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationDone, payload);
}

function sendError(getWindow: WindowGetter, payload: GenerationErrorPayload) {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.generationError, payload);
}

function createPlaceholderGlbBuffer() {
  const positions = Buffer.from(
    new Float32Array([-0.6, 0, 0.6, 0.6, 0, 0.6, 0, 1.1, 0]).buffer
  );
  const indices = Buffer.from(new Uint16Array([0, 1, 2]).buffer);
  const binaryChunk = Buffer.concat([positions, indices, Buffer.from([0, 0])]);

  const gltf = {
    asset: {
      version: "2.0",
      generator: "VOLUMIA Placeholder Generator",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1 }],
      },
    ],
    buffers: [{ byteLength: binaryChunk.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: indices.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-0.6, 0, 0],
        max: [0.6, 1.1, 0.6],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
  };

  const jsonBufferRaw = Buffer.from(JSON.stringify(gltf), "utf-8");
  const jsonPadding = (4 - (jsonBufferRaw.length % 4)) % 4;
  const jsonBuffer =
    jsonPadding === 0 ? jsonBufferRaw : Buffer.concat([jsonBufferRaw, Buffer.alloc(jsonPadding, 0x20)]);

  const binaryPadding = (4 - (binaryChunk.length % 4)) % 4;
  const paddedBinaryChunk =
    binaryPadding === 0 ? binaryChunk : Buffer.concat([binaryChunk, Buffer.alloc(binaryPadding, 0)]);

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + paddedBinaryChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

  const binaryChunkHeader = Buffer.alloc(8);
  binaryChunkHeader.writeUInt32LE(paddedBinaryChunk.length, 0);
  binaryChunkHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binaryChunkHeader, paddedBinaryChunk]);
}

async function runGenerationJob(payload: GenerationRunPayload, getWindow: WindowGetter, job: GenerationJobState) {
  const projectId = payload.projectId;
  const safeProjectId = sanitizeProjectId(projectId);
  const baseDir = join(app.getPath("userData"), "project-assets", safeProjectId);
  const imagesDir = join(baseDir, "images");
  const outputDir = join(baseDir, "generated", String(Date.now()));
  const copiedImages: string[] = [];

  await mkdir(imagesDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  sendProgress(getWindow, {
    projectId,
    stage: "preprocess",
    percent: 5,
    message: "Preparando archivos...",
  });

  for (let index = 0; index < payload.imagePaths.length; index += 1) {
    if (job.canceled) {
      sendError(getWindow, { projectId, message: "Generacion cancelada." });
      return;
    }

    const imagePath = payload.imagePaths[index];
    const extension = extname(imagePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue;
    }

    const filename = `${Date.now()}-${index + 1}-${basename(imagePath)}`;
    const targetPath = join(imagesDir, filename);
    await copyFile(resolve(imagePath), targetPath);
    copiedImages.push(targetPath);

    const copyPercent = 10 + Math.round(((index + 1) / Math.max(1, payload.imagePaths.length)) * 35);
    sendProgress(getWindow, {
      projectId,
      stage: "preprocess",
      percent: copyPercent,
      message: `Procesando imagen ${index + 1}/${payload.imagePaths.length}`,
    });
  }

  if (job.canceled) {
    sendError(getWindow, { projectId, message: "Generacion cancelada." });
    return;
  }

  sendProgress(getWindow, {
    projectId,
    stage: "infer",
    percent: 60,
    message: "Generando geometria base...",
  });
  await wait(payload.preset === "quality" ? 850 : payload.preset === "balanced" ? 500 : 300);

  if (job.canceled) {
    sendError(getWindow, { projectId, message: "Generacion cancelada." });
    return;
  }

  sendProgress(getWindow, {
    projectId,
    stage: "export",
    percent: 90,
    message: "Exportando GLB...",
  });

  const glbPath = join(outputDir, "result.glb");
  const glbBuffer = createPlaceholderGlbBuffer();
  await writeFile(glbPath, glbBuffer);

  sendProgress(getWindow, {
    projectId,
    stage: "done",
    percent: 100,
    message: "Modelo 3D listo.",
  });

  sendDone(getWindow, {
    projectId,
    glbPath,
    sourceImages: copiedImages,
    preset: payload.preset,
  });
}

export function registerGenerationHandlers(getWindow: WindowGetter) {
  ipcMain.handle(IPC_CHANNELS.generationSelectImages, async () => {
    const response = await dialog.showOpenDialog({
      title: "Seleccionar imagenes",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });

    if (response.canceled || response.filePaths.length === 0) {
      return [];
    }

    return response.filePaths.map((filePath) => resolve(filePath));
  });

  ipcMain.handle(IPC_CHANNELS.generationRun, async (_event, payload: unknown): Promise<GenerationRunResult> => {
    if (!validateRunPayload(payload)) {
      return { ok: false, error: "Invalid generation payload." };
    }

    if (activeJobs.has(payload.projectId)) {
      return { ok: false, error: "A generation job is already running for this project." };
    }

    const hasAtLeastOneImage = payload.imagePaths.some((imagePath) => {
      return IMAGE_EXTENSIONS.has(extname(imagePath).toLowerCase());
    });

    if (!hasAtLeastOneImage) {
      return { ok: false, error: "No valid images were selected." };
    }

    const job: GenerationJobState = { canceled: false };
    activeJobs.set(payload.projectId, job);

    void runGenerationJob(payload, getWindow, job)
      .catch((error) => {
        sendError(getWindow, {
          projectId: payload.projectId,
          message: error instanceof Error ? error.message : "Generation failed unexpectedly.",
        });
      })
      .finally(() => {
        activeJobs.delete(payload.projectId);
      });

    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.generationCancel, async (_event, payload: { projectId?: string } | undefined) => {
    if (!payload?.projectId) {
      return;
    }

    const job = activeJobs.get(payload.projectId);
    if (job) {
      job.canceled = true;
    }
  });
}
