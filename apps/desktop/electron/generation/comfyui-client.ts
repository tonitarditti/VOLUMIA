import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ComfyMultiviewPreset = "hard_surface" | "balanced" | "organic";

type ViewSpec = {
  key: string;
  suffix: string;
  prompt: string;
};

type PresetConfig = {
  positivePrompt: string;
  negativePrompt: string;
  denoise: number;
  controlStrength: number;
  steps: number;
  cfg: number;
};

type ModelSelection = {
  checkpointName: string;
  controlnetName: string;
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

export type ComfyMultiviewResult = {
  viewsDir: string;
  viewPaths: string[];
  seed: number;
  checkpointName: string;
  controlnetName: string;
  logs: string[];
};

type GenerateComfyMultiviewArgs = {
  baseUrl: string;
  imagePath: string;
  outputDir: string;
  preset: ComfyMultiviewPreset;
  isCanceled?: () => boolean;
  onProgress?: (progress: { percent: number; message: string }) => void;
};

const WORKFLOW_PATH_SEGMENTS = ["tools", "comfyui", "workflows", "multiview_sdxl_canny.json"] as const;
const INSTALL_DOC_PATH = path.join("docs", "README_COMFYUI_MODELS.md");
const POLL_INTERVAL_MS = 1_200;
const HISTORY_TIMEOUT_MS = 180_000;
const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const MAX_REPO_ROOT_ASCENT = 10;
const DEBUG_PATHS_ENABLED = process.env.VOLUMIA_DEBUG_PATHS === "1";

const VIEW_SPECS: ViewSpec[] = [
  { key: "front", suffix: "front", prompt: "front view, centered camera, product shot" },
  { key: "front_left", suffix: "front_left", prompt: "front-left view, 45 degree yaw, centered object" },
  { key: "left", suffix: "left", prompt: "left side view, profile view, centered object" },
  { key: "back", suffix: "back", prompt: "back view, 180 degree yaw, centered object" },
  { key: "right", suffix: "right", prompt: "right side view, profile view, centered object" },
  { key: "front_right", suffix: "front_right", prompt: "front-right view, -45 degree yaw, centered object" },
];

const PRESET_CONFIGS: Record<ComfyMultiviewPreset, PresetConfig> = {
  hard_surface: {
    positivePrompt:
      "clean hard-surface industrial object, crisp edges, planar surfaces, symmetric proportions, studio lighting, white background",
    negativePrompt:
      "organic shape, blob, melted geometry, warped topology, asymmetry, deformed silhouette, noise, extra limbs",
    denoise: 0.3,
    controlStrength: 0.84,
    steps: 28,
    cfg: 6.5,
  },
  balanced: {
    positivePrompt: "clean product render, consistent geometry, controlled perspective, studio lighting, neutral background",
    negativePrompt: "deformed silhouette, warped topology, extra limbs, heavy artifacts, noisy geometry",
    denoise: 0.45,
    controlStrength: 0.62,
    steps: 26,
    cfg: 6.0,
  },
  organic: {
    positivePrompt: "organic object render, smooth continuous forms, consistent silhouette, studio lighting, neutral background",
    negativePrompt: "hard faceted artifacts, broken silhouette, melted geometry, excessive noise, duplicated parts",
    denoise: 0.62,
    controlStrength: 0.4,
    steps: 24,
    cfg: 5.8,
  },
};

function assertNotCanceled(isCanceled?: () => boolean) {
  if (isCanceled?.()) {
    throw new Error("Generacion cancelada.");
  }
}

function debugPathLog(...args: unknown[]) {
  if (!DEBUG_PATHS_ENABLED) {
    return;
  }
  console.log("[ComfyUI:path]", ...args);
}

function isDirectory(entryPath: string) {
  try {
    return fs.statSync(entryPath).isDirectory();
  } catch {
    return false;
  }
}

function collectAncestorDirs(startDir: string) {
  const inspected: string[] = [];
  let cursor = path.resolve(startDir);

  for (let depth = 0; depth <= MAX_REPO_ROOT_ASCENT; depth += 1) {
    inspected.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  return inspected;
}

function hasWorkspacePackageJson(dir: string): boolean {
  const packageJsonPath = path.join(dir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(parsed, "workspaces");
  } catch (error) {
    debugPathLog("Failed to parse package.json while resolving repo root:", packageJsonPath, error);
    return false;
  }
}

function hasRepoMarkers(dir: string): boolean {
  const toolsComfyPath = path.join(dir, "tools", "comfyui");
  const appsPath = path.join(dir, "apps");
  const desktopAppsPath = path.join(appsPath, "desktop");

  return isDirectory(toolsComfyPath) && (isDirectory(appsPath) || isDirectory(desktopAppsPath));
}

export function findRepoRoot(startDir: string): string {
  const inspectedDirs = collectAncestorDirs(startDir);

  for (const currentDir of inspectedDirs) {
    const workspaceMarker = hasWorkspacePackageJson(currentDir);
    const folderMarkers = hasRepoMarkers(currentDir);
    debugPathLog(`Inspecting "${currentDir}"`, { workspaceMarker, folderMarkers });

    if (workspaceMarker || folderMarkers) {
      debugPathLog(`Resolved repo root: "${currentDir}"`);
      return currentDir;
    }
  }

  throw new Error(
    [
      `[ComfyUI] No se pudo resolver la raiz del monorepo desde: ${path.resolve(startDir)}`,
      `Inspeccion realizada (max ${MAX_REPO_ROOT_ASCENT} niveles):`,
      ...inspectedDirs.map((dir) => ` - ${dir}`),
      "Se esperaba encontrar package.json con workspaces o carpetas tools/comfyui y apps (o apps/desktop).",
    ].join("\n")
  );
}

export function resolveWorkflowPath(): string {
  const inspectedRoots = collectAncestorDirs(__dirname);
  const repoRoot = findRepoRoot(__dirname);
  const workflowPath = path.join(repoRoot, ...WORKFLOW_PATH_SEGMENTS);

  debugPathLog("Resolved workflow path candidate:", workflowPath);

  if (!fs.existsSync(workflowPath)) {
    const attemptedRoots = Array.from(new Set([repoRoot, ...inspectedRoots]));
    throw new Error(
      [
        "[ComfyUI] Workflow template no encontrado.",
        `Ruta esperada: ${workflowPath}`,
        `Repo root resuelto: ${repoRoot}`,
        "Roots inspeccionados:",
        ...attemptedRoots.map((item) => ` - ${item}`),
        "El workflow debe existir SOLO en: <repoRoot>/tools/comfyui/workflows/multiview_sdxl_canny.json",
      ].join("\n")
    );
  }

  return workflowPath;
}

function loadWorkflowTemplate() {
  const workflowPath = resolveWorkflowPath();
  const raw = fs.readFileSync(workflowPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function withPlaceholders(node: unknown, placeholders: Record<string, string | number>): unknown {
  if (typeof node === "string") {
    if (Object.prototype.hasOwnProperty.call(placeholders, node)) {
      return placeholders[node];
    }
    let nextValue = node;
    for (const [key, value] of Object.entries(placeholders)) {
      nextValue = nextValue.split(key).join(String(value));
    }
    return nextValue;
  }

  if (Array.isArray(node)) {
    return node.map((item) => withPlaceholders(item, placeholders));
  }

  if (node && typeof node === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      output[key] = withPlaceholders(value, placeholders);
    }
    return output;
  }

  return node;
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
        keyHint === keyName &&
        node.length > 0 &&
        Array.isArray(node[0]) &&
        node[0].every((item) => typeof item === "string")
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

    if (typeof node === "object") {
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
    `Necesarios: models/checkpoints/sd_xl_base_1.0.safetensors y models/controlnet/controlnet-canny-sdxl-1.0.safetensors.`,
    `Como instalar: revisa ${INSTALL_DOC_PATH}`,
  ].join(" ");
}

async function fetchJson(baseUrl: string, route: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${route}`, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI ${route} fallo (${response.status}): ${body || response.statusText}`);
  }
  return (await response.json()) as unknown;
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

function toDeterministicSeed(imagePath: string, preset: ComfyMultiviewPreset) {
  const buffer = fs.readFileSync(imagePath);
  const hash = crypto.createHash("sha1").update(buffer).update("|").update(preset).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) & 0x7fffffff;
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
    if (!nodeOutput || typeof nodeOutput !== "object") continue;
    const nodeImages = (nodeOutput as Record<string, unknown>).images;
    if (!Array.isArray(nodeImages)) continue;
    for (const item of nodeImages) {
      if (!item || typeof item !== "object") continue;
      const image = item as Record<string, unknown>;
      if (typeof image.filename !== "string" || image.filename.trim().length === 0) continue;
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
  onPoll?: (elapsedMs: number) => void,
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

    onPoll?.(Date.now() - startedAt);
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

export async function generateComfyMultiviewViews(args: GenerateComfyMultiviewArgs): Promise<ComfyMultiviewResult> {
  const baseUrl = (args.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const presetConfig = PRESET_CONFIGS[args.preset];
  const logs: string[] = [];

  assertNotCanceled(args.isCanceled);
  fs.mkdirSync(args.outputDir, { recursive: true });

  args.onProgress?.({ percent: 2, message: "Generando multivistas (1/2): validando ComfyUI..." });

  const modelSelection = await resolveModelSelection(baseUrl);
  logs.push(`[models] checkpoint=${modelSelection.checkpointName}`);
  logs.push(`[models] controlnet=${modelSelection.controlnetName}`);

  const seedBase = toDeterministicSeed(args.imagePath, args.preset);
  logs.push(`[seed] base=${seedBase}`);

  args.onProgress?.({ percent: 6, message: "Generando multivistas (1/2): subiendo imagen..." });
  const uploadedImage = await uploadImage(baseUrl, args.imagePath);
  logs.push(`[upload] image=${uploadedImage.name}`);

  const workflowTemplate = loadWorkflowTemplate();
  const savedPaths: string[] = [];

  for (let index = 0; index < VIEW_SPECS.length; index += 1) {
    assertNotCanceled(args.isCanceled);
    const viewSpec = VIEW_SPECS[index];
    const promptSeed = (seedBase + index) & 0x7fffffff;
    const filename = `view_${String(index).padStart(2, "0")}_${viewSpec.suffix}.png`;
    const outputPath = path.join(args.outputDir, filename);

    const progressBase = 10 + Math.floor((index / VIEW_SPECS.length) * 80);
    args.onProgress?.({
      percent: progressBase,
      message: `Generando multivistas (1/2): ${index + 1}/${VIEW_SPECS.length} (${viewSpec.key})`,
    });

    const placeholders: Record<string, string | number> = {
      "__CHECKPOINT__": modelSelection.checkpointName,
      "__CONTROLNET_MODEL__": modelSelection.controlnetName,
      "__INPUT_IMAGE__": uploadedImage.name,
      "__PROMPT__": `${presetConfig.positivePrompt}, ${viewSpec.prompt}`,
      "__NEGATIVE_PROMPT__": presetConfig.negativePrompt,
      "__SEED__": promptSeed,
      "__STEPS__": presetConfig.steps,
      "__CFG__": presetConfig.cfg,
      "__DENOISE__": presetConfig.denoise,
      "__CONTROLNET_STRENGTH__": presetConfig.controlStrength,
      "__FILENAME_PREFIX__": `volumia_mv_${viewSpec.key}_${promptSeed}`,
    };

    const workflow = withPlaceholders(workflowTemplate, placeholders);
    const queued = (await fetchJson(baseUrl, "/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    })) as Record<string, unknown>;

    const promptIdRaw = queued.prompt_id;
    const promptId = String(promptIdRaw ?? "").trim();
    if (!promptId) {
      throw new Error("ComfyUI /prompt no devolvio prompt_id.");
    }

    logs.push(`[prompt] id=${promptId} view=${viewSpec.key} seed=${promptSeed}`);

    const outputImage = await waitForPromptImage(
      baseUrl,
      promptId,
      (elapsedMs) => {
        const extraPercent = Math.min(12, Math.floor(elapsedMs / 5_000));
        args.onProgress?.({
          percent: Math.min(95, progressBase + extraPercent),
          message: `Generando multivistas (1/2): esperando ${viewSpec.key}...`,
        });
      },
      args.isCanceled
    );

    await downloadHistoryImage(baseUrl, outputImage, outputPath);
    logs.push(`[view] ${filename} <- ${outputImage.filename}`);
    savedPaths.push(outputPath);
  }

  args.onProgress?.({ percent: 98, message: "Generando multivistas (1/2): completado." });

  return {
    viewsDir: args.outputDir,
    viewPaths: savedPaths,
    seed: seedBase,
    checkpointName: modelSelection.checkpointName,
    controlnetName: modelSelection.controlnetName,
    logs,
  };
}
