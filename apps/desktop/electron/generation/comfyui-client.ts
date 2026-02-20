import crypto from "crypto";
import fs from "fs";
import path from "path";
import { buildSDXLCannyWorkflow, type PromptWorkflow, type SDXLCannyParams } from "./comfyui-workflows/sdxlCanny";

export type ComfyMultiviewPreset = "hard_surface" | "balanced" | "organic";
export type { SDXLCannyParams } from "./comfyui-workflows/sdxlCanny";

export type MultiviewViewKey = "front" | "v45" | "side" | "rear";

export type MultiviewViewSpec = {
  key: MultiviewViewKey;
  suffixPrompt: string;
  outputSuffix: string;
  seedOffset?: number;
};

type HistoryImage = {
  filename: string;
  subfolder?: string;
  type?: string;
};

type UploadedImage = {
  name: string;
  subfolder?: string;
  type?: string;
};

type ModelSelection = {
  checkpointName: string;
  controlnetName: string;
};

type PresetConfig = {
  basePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  cannyLow: number;
  cannyHigh: number;
  controlStrength: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  denoise: number;
};

export type ComfyPresetRuntimeConfig = {
  basePrompt: string;
  negativePrompt: string;
  params: Omit<SDXLCannyParams, "seed" | "checkpointName" | "controlNetName">;
};

export type RunSDXLCannyRefineSingleArgs = {
  baseUrl?: string;
  inputImagePath: string;
  prompt: string;
  negative: string;
  outputDir: string;
  outputPrefix: string;
  params: SDXLCannyParams;
  isCanceled?: () => boolean;
  onPoll?: (elapsedMs: number, promptId: string) => void;
};

export type RunSDXLCannyRefineSingleResult = {
  promptId: string;
  outputPath: string;
  outputImage: HistoryImage;
  logs: string[];
};

export type RunMultiviewCannyRefineArgs = {
  baseUrl?: string;
  inputImagePath: string;
  outputDir?: string;
  basePrompt: string;
  negative: string;
  params: SDXLCannyParams;
  views?: Array<MultiviewViewSpec>;
  maxConcurrency?: number;
  useSeedOffsets?: boolean;
  isCanceled?: () => boolean;
  onProgress?: (progress: { percent: number; message: string }) => void;
};

export type RunMultiviewViewResult = {
  key: MultiviewViewKey;
  promptId: string;
  outputPath: string;
  outputPrefix: string;
  seed: number;
};

export type RunMultiviewCannyRefineResult = {
  viewsDir: string;
  viewPaths: string[];
  seed: number;
  checkpointName: string;
  controlnetName: string;
  logs: string[];
  results: RunMultiviewViewResult[];
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const POLL_INTERVAL_MS = 1_200;
const HISTORY_TIMEOUT_MS = 180_000;
const INSTALL_DOC_PATH = path.join("docs", "README_COMFYUI_MODELS.md");
const DEBUG_COMFYUI = process.env.VOLUMIA_DEBUG_COMFYUI === "1";

const DEFAULT_VIEWS: MultiviewViewSpec[] = [
  {
    key: "front",
    suffixPrompt: "front elevation view, straight-on camera, centered, no tilt, 35mm lens",
    outputSuffix: "front",
    seedOffset: 0,
  },
  {
    key: "v45",
    suffixPrompt: "three-quarter view, 45 degree angle, eye level, 35mm lens",
    outputSuffix: "45",
    seedOffset: 1,
  },
  {
    key: "side",
    suffixPrompt: "side elevation view, minimal distortion, technical framing",
    outputSuffix: "side",
    seedOffset: 2,
  },
  {
    key: "rear",
    suffixPrompt: "rear view, consistent lighting direction, documentation framing",
    outputSuffix: "rear",
    seedOffset: 3,
  },
];

const PRESET_CONFIGS: Record<ComfyMultiviewPreset, PresetConfig> = {
  hard_surface: {
    basePrompt:
      "clean hard-surface industrial object, crisp edges, planar surfaces, symmetric proportions, studio lighting, white background",
    negativePrompt:
      "organic shape, blob, melted geometry, warped topology, asymmetry, deformed silhouette, noise, extra limbs",
    width: 1024,
    height: 1024,
    cannyLow: 0.4,
    cannyHigh: 0.8,
    controlStrength: 0.84,
    steps: 28,
    cfg: 6.5,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    denoise: 0.3,
  },
  balanced: {
    basePrompt: "clean product render, consistent geometry, controlled perspective, studio lighting, neutral background",
    negativePrompt: "deformed silhouette, warped topology, extra limbs, heavy artifacts, noisy geometry",
    width: 1024,
    height: 1024,
    cannyLow: 0.4,
    cannyHigh: 0.8,
    controlStrength: 0.62,
    steps: 26,
    cfg: 6,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    denoise: 0.45,
  },
  organic: {
    basePrompt: "organic object render, smooth continuous forms, consistent silhouette, studio lighting, neutral background",
    negativePrompt: "hard faceted artifacts, broken silhouette, melted geometry, excessive noise, duplicated parts",
    width: 1024,
    height: 1024,
    cannyLow: 0.4,
    cannyHigh: 0.8,
    controlStrength: 0.4,
    steps: 24,
    cfg: 5.8,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    denoise: 0.62,
  },
};

function debugComfyLog(...args: unknown[]) {
  if (!DEBUG_COMFYUI) {
    return;
  }
  console.log("[ComfyUI:debug]", ...args);
}

function assertNotCanceled(isCanceled?: () => boolean) {
  if (isCanceled?.()) {
    throw new Error("Generacion cancelada.");
  }
}

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeSeed(value: number) {
  const parsed = Number.isFinite(value) ? Math.floor(value) : 0;
  return parsed & 0x7fffffff;
}

function sanitizeBaseName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toInputImageReference(image: UploadedImage) {
  const normalizedSubfolder = image.subfolder ? image.subfolder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "";
  return normalizedSubfolder ? `${normalizedSubfolder}/${image.name}` : image.name;
}

function getMimeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function extractStringOptionsByKey(root: unknown, keyName: string): string[] {
  const found = new Set<string>();

  const visit = (node: unknown, keyHint?: string) => {
    if (!node) return;

    if (Array.isArray(node)) {
      if (
        keyHint === keyName
        && node.length > 0
        && Array.isArray(node[0])
        && node[0].every((item) => typeof item === "string")
      ) {
        for (const item of node[0] as string[]) {
          found.add(item);
        }
      } else if (keyHint === keyName && node.every((item) => typeof item === "string")) {
        for (const item of node as string[]) {
          found.add(item);
        }
      }

      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        visit(value, key);
      }
    }
  };

  visit(root);
  return Array.from(found);
}

function pickCheckpointName(names: string[]) {
  const preferred = "sd_xl_base_1.0.safetensors";
  if (names.includes(preferred)) {
    return preferred;
  }
  const fallback = names.find((name) => name.toLowerCase().includes("sd_xl_base_1.0"));
  return fallback ?? "";
}

function pickControlnetName(names: string[]) {
  const preferred = "controlnet-canny-sdxl-1.0.safetensors";
  if (names.includes(preferred)) {
    return preferred;
  }
  const fallback = names.find((name) => {
    const normalized = name.toLowerCase();
    return normalized.includes("canny") && normalized.includes("sdxl");
  });
  return fallback ?? "";
}

function buildInstallHint() {
  return [
    "Modelos de ComfyUI faltantes para Multiview.",
    "Necesarios: models/checkpoints/sd_xl_base_1.0.safetensors y models/controlnet/controlnet-canny-sdxl-1.0.safetensors.",
    `Como instalar: revisa ${INSTALL_DOC_PATH}`,
  ].join(" ");
}

function summarizeWorkflow(workflow: PromptWorkflow) {
  return Object.values(workflow).map((node) => node.class_type);
}

async function fetchJson(baseUrl: string, route: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${route}`, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI ${route} fallo (${response.status}): ${body || response.statusText}`);
  }
  return (await response.json()) as unknown;
}

async function ensureComfyUiReachable(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/system_stats`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `ComfyUI not running on ${baseUrl}. /system_stats returned ${response.status}: ${body || response.statusText}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ComfyUI not running")) {
      throw error;
    }
    throw new Error(`ComfyUI not running on ${baseUrl}`);
  }
}

async function resolveModelSelection(baseUrl: string): Promise<ModelSelection> {
  const checkpointInfo = await fetchJson(baseUrl, "/object_info/CheckpointLoaderSimple");
  const controlnetInfo = await fetchJson(baseUrl, "/object_info/ControlNetLoader");
  const checkpointNames = extractStringOptionsByKey(checkpointInfo, "ckpt_name");
  const controlnetNames = extractStringOptionsByKey(controlnetInfo, "control_net_name");

  const checkpointName = pickCheckpointName(checkpointNames);
  const controlnetName = pickControlnetName(controlnetNames);

  if (!checkpointName || !controlnetName) {
    const checkpointLabel = checkpointNames.length > 0 ? checkpointNames.join(", ") : "(vacio)";
    const controlnetLabel = controlnetNames.length > 0 ? controlnetNames.join(", ") : "(vacio)";
    throw new Error(
      `${buildInstallHint()} Modelos detectados: checkpoints=[${checkpointLabel}] controlnet=[${controlnetLabel}]`
    );
  }

  return {
    checkpointName,
    controlnetName,
  };
}

async function uploadImage(baseUrl: string, imagePath: string): Promise<UploadedImage> {
  const form = new FormData();
  const fileContent = fs.readFileSync(imagePath);
  const blob = new Blob([fileContent], { type: getMimeFromPath(imagePath) });
  form.append("image", blob, path.basename(imagePath));

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI /upload/image fallo (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name : "";
  if (!name) {
    throw new Error("ComfyUI /upload/image devolvio un nombre de archivo invalido.");
  }
  return {
    name,
    subfolder: typeof payload.subfolder === "string" ? payload.subfolder : "",
    type: typeof payload.type === "string" ? payload.type : "input",
  };
}

async function queuePrompt(baseUrl: string, workflow: PromptWorkflow): Promise<string> {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI /prompt fallo (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const promptId = String(payload.prompt_id ?? "").trim();
  if (!promptId) {
    throw new Error("ComfyUI /prompt no devolvio prompt_id.");
  }

  return promptId;
}

function collectHistoryImages(historyEntry: unknown): HistoryImage[] {
  if (!historyEntry || typeof historyEntry !== "object") {
    return [];
  }
  const output = (historyEntry as Record<string, unknown>).outputs;
  if (!output || typeof output !== "object") {
    return [];
  }

  const images: HistoryImage[] = [];
  for (const nodeOutput of Object.values(output as Record<string, unknown>)) {
    if (!nodeOutput || typeof nodeOutput !== "object") {
      continue;
    }
    const nodeImages = (nodeOutput as Record<string, unknown>).images;
    if (!Array.isArray(nodeImages)) {
      continue;
    }

    for (const item of nodeImages) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const image = item as Record<string, unknown>;
      if (typeof image.filename !== "string" || image.filename.trim().length === 0) {
        continue;
      }

      images.push({
        filename: image.filename,
        subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
        type: typeof image.type === "string" ? image.type : "output",
      });
    }
  }

  return images;
}

async function waitForPromptImage(
  baseUrl: string,
  promptId: string,
  onPoll?: (elapsedMs: number, promptId: string) => void,
  isCanceled?: () => boolean
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= HISTORY_TIMEOUT_MS) {
    assertNotCanceled(isCanceled);

    const history = await fetchJson(baseUrl, `/history/${encodeURIComponent(promptId)}`);
    const entry =
      history && typeof history === "object"
        ? (history as Record<string, unknown>)[promptId] ?? Object.values(history as Record<string, unknown>)[0]
        : null;

    const images = collectHistoryImages(entry);
    if (images.length > 0) {
      return images[0];
    }

    const elapsedMs = Date.now() - startedAt;
    debugComfyLog(`Polling history for prompt_id=${promptId}`, { elapsedMs });
    onPoll?.(elapsedMs, promptId);

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, POLL_INTERVAL_MS);
    });
  }

  throw new Error(`ComfyUI timeout esperando /history para prompt_id=${promptId}`);
}

async function downloadHistoryImage(baseUrl: string, image: HistoryImage, targetPath: string) {
  const params = new URLSearchParams({
    filename: image.filename,
  });
  if (image.subfolder) {
    params.set("subfolder", image.subfolder);
  }
  if (image.type) {
    params.set("type", image.type);
  }

  const response = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI /view fallo (${response.status}): ${body || response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, bytes);
}

function resolveOutputDir(explicitOutputDir: string | undefined, inputImagePath: string) {
  if (explicitOutputDir && explicitOutputDir.trim().length > 0) {
    return explicitOutputDir;
  }
  const baseDir = path.dirname(path.resolve(inputImagePath));
  return path.join(baseDir, "comfyui-views");
}

function clampMaxConcurrency(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const intValue = Math.floor(Number(value));
  return Math.max(1, Math.min(2, intValue));
}

function buildViewSeed(baseSeed: number, view: MultiviewViewSpec, index: number, useSeedOffsets: boolean) {
  if (!useSeedOffsets) {
    return baseSeed;
  }
  const offset = Number.isFinite(view.seedOffset) ? Number(view.seedOffset) : index;
  return normalizeSeed(baseSeed + offset);
}

export function resolveComfyMultiviewPresetConfig(preset: ComfyMultiviewPreset): ComfyPresetRuntimeConfig {
  const config = PRESET_CONFIGS[preset];
  return {
    basePrompt: config.basePrompt,
    negativePrompt: config.negativePrompt,
    params: {
      width: config.width,
      height: config.height,
      cannyLow: config.cannyLow,
      cannyHigh: config.cannyHigh,
      controlStrength: config.controlStrength,
      steps: config.steps,
      cfg: config.cfg,
      sampler: config.sampler,
      scheduler: config.scheduler,
      denoise: config.denoise,
    },
  };
}

export function computeDeterministicSeedFromFile(imagePath: string, salt = "") {
  const buffer = fs.readFileSync(imagePath);
  const hash = crypto.createHash("sha1").update(buffer).update("|").update(salt).digest("hex");
  return normalizeSeed(Number.parseInt(hash.slice(0, 8), 16));
}

export async function runSDXLCannyRefineSingle(args: RunSDXLCannyRefineSingleArgs): Promise<RunSDXLCannyRefineSingleResult> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const logs: string[] = [];

  assertNotCanceled(args.isCanceled);
  await ensureComfyUiReachable(baseUrl);

  debugComfyLog("Base URL", baseUrl);

  const uploaded = await uploadImage(baseUrl, args.inputImagePath);
  const inputImageRef = toInputImageReference(uploaded);

  const workflow = buildSDXLCannyWorkflow({
    inputImage: inputImageRef,
    prompt: args.prompt,
    negative: args.negative,
    outputPrefix: args.outputPrefix,
    params: {
      ...args.params,
      seed: normalizeSeed(args.params.seed),
    },
  });

  debugComfyLog("Workflow summary", {
    outputPrefix: args.outputPrefix,
    nodeTypes: summarizeWorkflow(workflow),
  });

  const promptId = await queuePrompt(baseUrl, workflow);
  logs.push(`[prompt] id=${promptId} outputPrefix=${args.outputPrefix}`);
  debugComfyLog("Queued prompt", { promptId, outputPrefix: args.outputPrefix });

  const outputImage = await waitForPromptImage(baseUrl, promptId, args.onPoll, args.isCanceled);

  fs.mkdirSync(args.outputDir, { recursive: true });
  const outputPath = path.join(args.outputDir, `${sanitizeBaseName(args.outputPrefix)}.png`);
  await downloadHistoryImage(baseUrl, outputImage, outputPath);
  logs.push(`[view] ${outputPath} <- ${outputImage.filename}`);

  return {
    promptId,
    outputPath,
    outputImage,
    logs,
  };
}

export async function runMultiviewCannyRefine(args: RunMultiviewCannyRefineArgs): Promise<RunMultiviewCannyRefineResult> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const views = (args.views && args.views.length > 0 ? args.views : DEFAULT_VIEWS).map((item) => ({ ...item }));
  const useSeedOffsets = Boolean(args.useSeedOffsets);
  const outputDir = resolveOutputDir(args.outputDir, args.inputImagePath);
  const maxConcurrency = clampMaxConcurrency(args.maxConcurrency);
  const baseName = sanitizeBaseName(path.basename(args.inputImagePath, path.extname(args.inputImagePath)) || "image");
  const baseSeed = normalizeSeed(args.params.seed);

  await ensureComfyUiReachable(baseUrl);

  const modelSelection =
    args.params.checkpointName && args.params.controlNetName
      ? {
          checkpointName: args.params.checkpointName,
          controlnetName: args.params.controlNetName,
        }
      : await resolveModelSelection(baseUrl);

  const effectiveParams: Omit<SDXLCannyParams, "seed"> = {
    ...args.params,
    checkpointName: args.params.checkpointName || modelSelection.checkpointName,
    controlNetName: args.params.controlNetName || modelSelection.controlnetName,
  };

  const logs: string[] = [
    `[models] checkpoint=${effectiveParams.checkpointName}`,
    `[models] controlnet=${effectiveParams.controlNetName}`,
    `[seed] base=${baseSeed}`,
  ];

  debugComfyLog("Multiview config", {
    baseUrl,
    outputDir,
    maxConcurrency,
    useSeedOffsets,
    views: views.map((view) => view.key),
  });

  const tasks = views.map((view, index) => ({ view, index }));
  const results: Array<RunMultiviewViewResult> = [];
  let completed = 0;

  const runTask = async (task: { view: MultiviewViewSpec; index: number }) => {
    assertNotCanceled(args.isCanceled);

    const prompt = `${args.basePrompt}, ${task.view.suffixPrompt}, maintain identical materials across views`;
    const outputPrefix = `${baseName}_${sanitizeBaseName(task.view.outputSuffix)}`;
    const seed = buildViewSeed(baseSeed, task.view, task.index, useSeedOffsets);

    const progressBase = Math.floor((task.index / Math.max(1, tasks.length)) * 92);
    args.onProgress?.({
      percent: Math.min(96, Math.max(2, progressBase)),
      message: `Generando multivistas (1/2): ${task.view.key}...`,
    });

    const singleResult = await runSDXLCannyRefineSingle({
      baseUrl,
      inputImagePath: args.inputImagePath,
      prompt,
      negative: args.negative,
      outputDir,
      outputPrefix,
      params: {
        ...effectiveParams,
        seed,
      },
      isCanceled: args.isCanceled,
      onPoll: (elapsedMs, promptId) => {
        args.onProgress?.({
          percent: Math.min(97, Math.max(3, progressBase + Math.floor(elapsedMs / 5_000))),
          message: `Generando multivistas (1/2): esperando ${task.view.key} (prompt ${promptId})...`,
        });
      },
    });

    logs.push(`[prompt] id=${singleResult.promptId} view=${task.view.key} seed=${seed}`);
    logs.push(...singleResult.logs);

    const viewResult: RunMultiviewViewResult = {
      key: task.view.key,
      promptId: singleResult.promptId,
      outputPath: singleResult.outputPath,
      outputPrefix,
      seed,
    };

    completed += 1;
    args.onProgress?.({
      percent: Math.min(98, Math.max(5, Math.floor((completed / tasks.length) * 98))),
      message: `Generando multivistas (1/2): ${completed}/${tasks.length} completadas.`,
    });

    return viewResult;
  };

  if (maxConcurrency <= 1) {
    for (const task of tasks) {
      const result = await runTask(task);
      results.push(result);
    }
  } else {
    const queue = [...tasks];
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        assertNotCanceled(args.isCanceled);
        const task = queue.shift();
        if (!task) {
          return;
        }
        const result = await runTask(task);
        results.push(result);
      }
    };

    for (let i = 0; i < maxConcurrency; i += 1) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  const orderedResults = results.sort((a, b) => {
    const indexA = views.findIndex((view) => view.key === a.key);
    const indexB = views.findIndex((view) => view.key === b.key);
    return indexA - indexB;
  });

  args.onProgress?.({ percent: 98, message: "Generando multivistas (1/2): completado." });

  return {
    viewsDir: outputDir,
    viewPaths: orderedResults.map((item) => item.outputPath),
    seed: baseSeed,
    checkpointName: effectiveParams.checkpointName,
    controlnetName: effectiveParams.controlNetName,
    logs,
    results: orderedResults,
  };
}
