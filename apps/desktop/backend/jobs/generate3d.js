const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  backendDir,
  configuredNumber,
  desktopDir,
  ensureDir,
  ensureProjectLayout,
  getToolStatus,
  projectPaths,
  projectsRoot,
  readLocalSettings,
} = require("../config/paths");
const { readMetadata, syncLatestVersion } = require("../project-metadata");
const { gpuTaskQueue, GpuQueueCancelledError } = require("./gpu-task-queue");
const { createPipelineState } = require("./pipeline-state");
const { readGlbJson, validateMeshGlb, validateTexturedGlb } = require("./output-validator");

const logDir = path.join(backendDir, "logs");
const logPath = path.join(logDir, "volumia.log");
const validModes = new Set(["demo", "quick", "textured", "photogrammetry"]);
const glbMagic = Buffer.from([0x67, 0x6c, 0x54, 0x46]);
const QUICK_CANONICAL_ROTATION = {
  preset: "triposr_to_volumia_y_up_grounded_front_positive_z",
  rotationXDeg: -90,
  // Blender's OBJ importer already performs its own Y-up -> Z-up conversion.
  // TripoSR's OBJ is camera-oriented, so the two remaining quarter turns are
  // required to put the real support side on Blender Z=0 and face VOLUMIA +Z.
  rotationYDeg: -90,
  rotationZDeg: -90,
};
const QUICK_AXIS_NORMALIZATION = {
  applied: true,
  source: "TripoSR Z-up",
  target: "VOLUMIA Y-up",
  rotationXDeg: -90,
  rotationYDeg: -90,
  rotationZDeg: -90,
  forwardAxis: "+Z",
  supportPlaneLeveling: true,
  centered: true,
  grounded: true,
};
const PYTHON_OPENMP_ENV = [
  ["KMP_DUPLICATE_LIB_OK", "VOLUMIA_KMP_DUPLICATE_LIB_OK", "TRUE"],
  ["OMP_NUM_THREADS", "VOLUMIA_OMP_NUM_THREADS", "1"],
  ["MKL_NUM_THREADS", "VOLUMIA_MKL_NUM_THREADS", "1"],
  ["NUMEXPR_NUM_THREADS", "VOLUMIA_NUMEXPR_NUM_THREADS", "1"],
];
const activeJobs = new Map();
const generationStages = [
  ["validating", "Validando referencias"],
  ["preparing_image", "Preparando imagen"],
  ["geometry", "Reconstruyendo geometría"],
  ["optimizing", "Preparando malla y UV"],
  ["texture", "Generando textura"],
  ["editable", "Preparando activo editable"],
  ["exporting", "Exportando archivos"],
];

const stageStateOrder = {
  pending: 0,
  queued: 1,
  running: 2,
  complete: 3,
  skipped: 3,
  blocked: 3,
  cancelled: 3,
  error: 3,
};

function normalizeGenerationMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["textured", "objeto texturizado", "textured-object", "object_textured", "hunyuan_textured"].includes(normalized)) return "textured";
  if (["geometry_only", "geometry-only", "solo geometría", "solo geometria", "mesh-only", "quick", "photogrammetry", "demo"].includes(normalized)) return "geometry_only";
  if (["editable", "activo editable"].includes(normalized)) return "editable";
  throw new Error(`Modo de generación no reconocido: ${value}`);
}

function getRequiredStages(mode) {
  switch (normalizeGenerationMode(mode)) {
    case "textured":
      return ["validating", "preparing_image", "geometry", "optimizing", "texture", "exporting"];
    case "editable":
      return ["validating", "preparing_image", "geometry", "optimizing", "editable", "exporting"];
    case "geometry_only":
      return ["validating", "preparing_image", "geometry", "optimizing", "exporting"];
  }
}

class GenerationCancelledError extends Error {
  constructor() {
    super("Generación cancelada.");
    this.name = "GenerationCancelledError";
  }
}

function isActiveStatus(status) {
  return ["queued", "running", "optimizing"].includes(status);
}

function isGenerationCancelled(projectId) {
  return Boolean(activeJobs.get(projectId)?.cancelled) || readJob(projectId).status === "cancelled";
}

function waitForChildExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function terminateProcessTree(child) {
  if (!child?.pid) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", resolve);
      killer.once("close", resolve);
    });
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // The process may have exited between the cancellation request and kill.
  }
  return Promise.resolve();
}

async function cancelGeneration(projectId, options = {}) {
  const activeJob = activeJobs.get(projectId);
  const current = readJob(projectId);
  if (!activeJob && !isActiveStatus(current.status)) {
    return current;
  }

  if (activeJob) {
    activeJob.cancelled = true;
  }
  if (current.id) gpuTaskQueue.cancel(current.id);
  const cancelled = writeJob(projectId, {
    status: "cancelled",
    message: "Generación interrumpida por el usuario.",
    finishedAt: nowIso(),
    error: null,
  });
  finishActiveStage(projectId, "cancelled", "Cancelada por el usuario.");
  for (const stage of readJob(projectId).progress?.stages || []) {
    if (["pending", "queued"].includes(stage.state)) {
      updateGenerationStage(projectId, stage.id, { state: "cancelled", detail: "Cancelada antes de iniciar.", progress: null });
    }
  }
  const cancelledWithDuration = writeJob(projectId, {
    totalDurationMs: durationSince(cancelled.startedAt),
  });
  syncLatestVersion(projectId, cancelledWithDuration, null);
  appendJobLog(projectId, "Generación cancelada: terminando procesos asociados.");

  const children = activeJob ? [...activeJob.children] : [];
  await Promise.all(children.map((child) => terminateProcessTree(child)));
  await Promise.all(children.map((child) => waitForChildExit(child)));
  if (options.waitForCompletion && activeJob?.completion) {
    await activeJob.completion;
  }
  return cancelledWithDuration;
}

function reconcileInterruptedJobs() {
  if (!fs.existsSync(projectsRoot)) {
    return [];
  }

  const reconciled = [];
  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const job = readJob(entry.name);
    if (!isActiveStatus(job.status)) continue;
    writeJob(entry.name, {
      status: "cancelled",
      message: "Generación interrumpida al reiniciar VOLUMIA.",
      finishedAt: nowIso(),
      error: null,
    });
    finishActiveStage(entry.name, "cancelled", "Interrumpida al reiniciar VOLUMIA.");
    const cancelled = writeJob(entry.name, { totalDurationMs: durationSince(readJob(entry.name).startedAt) });
    syncLatestVersion(entry.name, cancelled, null);
    appendJobLog(entry.name, "Estado reconciliado al iniciar: no existe un proceso activo de esta sesión.");
    reconciled.push(entry.name);
  }
  return reconciled;
}

function configuredRotation(prefix, fallback) {
  return {
    preset: "settings",
    rotationXDeg: configuredNumber(`${prefix}_X`, fallback.rotationXDeg),
    rotationYDeg: configuredNumber(`${prefix}_Y`, fallback.rotationYDeg),
    rotationZDeg: configuredNumber(`${prefix}_Z`, fallback.rotationZDeg),
  };
}

function pythonGenerationEnv(extraEnv = {}) {
  const localSettings = readLocalSettings();
  const env = {};

  // Windows/Conda workaround: TripoSR/Hunyuan can load duplicate OpenMP runtimes
  // through torch, numpy, MKL or Intel libraries. Keep this scoped to Python
  // generation processes instead of applying it to the whole Electron app.
  for (const [targetKey, settingKey, fallback] of PYTHON_OPENMP_ENV) {
    env[targetKey] =
      process.env[settingKey] ??
      localSettings[settingKey] ??
      process.env[targetKey] ??
      localSettings[targetKey] ??
      fallback;
  }

  return { ...env, ...extraEnv };
}

function appendPythonEnvLogs(projectId, label, env) {
  appendJobLog(projectId, `[${label}] spawning python with OpenMP compatibility env`);
  for (const [targetKey] of PYTHON_OPENMP_ENV) {
    appendJobLog(projectId, `[python-env] ${targetKey}=${env[targetKey]}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function durationSince(startedAt, finishedAt = nowIso()) {
  const start = Date.parse(startedAt || "");
  const finish = Date.parse(finishedAt || "");
  return Number.isFinite(start) && Number.isFinite(finish)
    ? Math.max(0, finish - start)
    : 0;
}

function createGenerationProgress(context = {}) {
  const generationMode = normalizeGenerationMode(context.mode || "geometry_only");
  const requiredStageIds = getRequiredStages(generationMode);
  return {
    jobId: context.jobId || null,
    currentStageId: "validating",
    stageId: "validating",
    stageIndex: 1,
    stageCount: requiredStageIds.length,
    requiredStageIds,
    generationMode,
    stageProgress: null,
    overallProgress: 0,
    message: "Pendiente.",
    startedAt: Number.isFinite(context.startedAt) ? context.startedAt : null,
    stageStartedAt: null,
    stages: generationStages.map(([id, label]) => ({
      id,
      label,
      state: "pending",
      progress: null,
      indeterminate: false,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      detail: "Pendiente.",
    })),
  };
}

function normaliseGenerationProgress(progress, context = {}) {
  const provided = Array.isArray(progress?.stages) ? progress.stages : [];
  const byId = new Map(provided.map((stage) => [stage?.id, stage]));
  const generationMode = normalizeGenerationMode(context.mode || progress?.generationMode || "geometry_only");
  const requiredStageIds = progress?.generationMode === generationMode && Array.isArray(progress?.requiredStageIds)
    ? progress.requiredStageIds
    : getRequiredStages(generationMode);
  const normalized = {
    jobId: typeof progress?.jobId === "string" ? progress.jobId : context.jobId || null,
    currentStageId: typeof progress?.currentStageId === "string"
      ? progress.currentStageId
      : "validating",
    stageId: typeof progress?.stageId === "string" ? progress.stageId : "validating",
    stageIndex: Number.isInteger(progress?.stageIndex) ? progress.stageIndex : 1,
    requiredStageIds,
    generationMode,
    stageCount: 0,
    stageProgress: Number.isFinite(progress?.stageProgress) ? progress.stageProgress : null,
    overallProgress: Number.isFinite(progress?.overallProgress)
      ? Math.max(0, Math.min(100, Number(progress.overallProgress)))
      : 0,
    message: typeof progress?.message === "string" ? progress.message : "Pendiente.",
    startedAt: Number.isFinite(progress?.startedAt)
      ? Number(progress.startedAt)
      : Number.isFinite(context.startedAt)
        ? context.startedAt
        : null,
    stageStartedAt: Number.isFinite(progress?.stageStartedAt)
      ? Number(progress.stageStartedAt)
      : null,
    stages: generationStages.map(([id, label]) => ({
      id,
      label,
      state: "pending",
      progress: null,
      indeterminate: false,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      detail: "Pendiente.",
      ...(byId.get(id) || {}),
      id,
      label,
    })),
  };
  normalized.stageCount = normalized.requiredStageIds.length;
  return normalized;
}

function stageTimeMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function confirmedOverallProgress(stages, requiredStageIds) {
  const required = stages.filter((stage) => requiredStageIds.includes(stage.id));
  if (required.length === 0) return 0;
  let confirmed = 0;
  for (const stage of required) {
    if (stage.state === "complete") {
      confirmed += 100;
      continue;
    }
    if (stage.state === "running" && Number.isFinite(stage.progress)) {
      confirmed += Math.max(0, Math.min(100, Number(stage.progress)));
    }
    break;
  }
  return Math.floor(confirmed / required.length);
}

function updateProgressContract(progress, job) {
  const requiredStages = progress.stages.filter((stage) => progress.requiredStageIds.includes(stage.id));
  const current = requiredStages.find((stage) => stage.id === progress.currentStageId)
    || progress.stages.find((stage) => stage.state === "running")
    || requiredStages.find((stage) => ["pending", "queued"].includes(stage.state))
    || requiredStages[requiredStages.length - 1];
  const index = Math.max(0, requiredStages.findIndex((stage) => stage.id === current?.id));
  const confirmed = confirmedOverallProgress(progress.stages, progress.requiredStageIds);
  return {
    ...progress,
    jobId: job.id || progress.jobId || null,
    currentStageId: current?.id || progress.currentStageId,
    stageId: current?.id || progress.stageId,
    stageIndex: index + 1,
    stageCount: progress.requiredStageIds.length,
    stageProgress: Number.isFinite(current?.progress) ? Number(current.progress) : null,
    overallProgress: Math.max(progress.overallProgress || 0, confirmed),
    message: current?.detail || progress.message,
    startedAt: stageTimeMs(job.startedAt) ?? progress.startedAt,
    stageStartedAt: stageTimeMs(current?.startedAt),
  };
}

function updateGenerationStage(projectId, stageId, patch = {}) {
  const job = readJob(projectId);
  const progress = normaliseGenerationProgress(job.progress, {
    jobId: job.id,
    startedAt: stageTimeMs(job.startedAt),
    mode: job.generationMode || job.mode,
  });
  const stage = progress.stages.find((entry) => entry.id === stageId);
  if (!stage) return job;

  const timestamp = nowIso();
  const state = patch.state || stage.state;
  const terminal = ["complete", "skipped", "blocked", "cancelled", "error"].includes(state);
  if (["complete", "skipped", "blocked", "cancelled", "error"].includes(stage.state)) return job;
  if (state === "complete" && stage.state !== "running") {
    throw new Error(`Transición inválida de ${stage.state} a complete para ${stageId}.`);
  }
  if (stageStateOrder[state] < stageStateOrder[stage.state]) return job;
  const next = {
    ...stage,
    ...patch,
    state,
    startedAt: patch.startedAt || stage.startedAt || (state === "running" ? timestamp : null),
  };
  if (terminal) {
    next.finishedAt = patch.finishedAt || stage.finishedAt || timestamp;
    next.durationMs = durationSince(next.startedAt, next.finishedAt);
    next.indeterminate = false;
    if (state === "complete" && next.progress === null) next.progress = 100;
  }

  progress.stages = progress.stages.map((entry) => entry.id === stageId ? next : entry);
  if (["running", "queued"].includes(state)) progress.currentStageId = stageId;
  const contract = updateProgressContract(progress, job);
  const updated = writeJob(projectId, { progress: contract, overallProgress: contract.overallProgress });
  persistPipelineState(projectId, updated);
  return updated;
}

function finishActiveStage(projectId, state, detail) {
  const job = readJob(projectId);
  const progress = normaliseGenerationProgress(job.progress, {
    jobId: job.id,
    startedAt: stageTimeMs(job.startedAt),
    mode: job.generationMode || job.mode,
  });
  const active = progress.stages.find(
    (stage) => stage.id === progress.currentStageId && stage.state === "running",
  ) || progress.stages.find((stage) => stage.state === "running");
  if (!active) return job;
  return updateGenerationStage(projectId, active.id, { state, detail, progress: null });
}

function markNotRequiredStages(projectId, stageIds) {
  for (const stageId of stageIds) {
    const job = readJob(projectId);
    const current = normaliseGenerationProgress(job.progress, {
      jobId: job.id,
      startedAt: stageTimeMs(job.startedAt),
      mode: job.generationMode || job.mode,
    })
      .stages.find((stage) => stage.id === stageId);
    if (current?.state === "pending") {
      updateGenerationStage(projectId, stageId, {
        state: "skipped",
        detail: "No requerida por el modo seleccionado.",
        progress: null,
      });
    }
  }
}

function log(level, message, details) {
  ensureDir(logDir);
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  fs.appendFileSync(logPath, `[${nowIso()}] [${level}] ${message}${suffix}\n`, "utf8");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJob(projectId, patch) {
  const paths = ensureProjectLayout(projectId);
  const previous = readJson(paths.jobJson, {
    projectId: paths.id,
    status: "idle",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    warnings: [],
    logs: [],
  });
  const next = {
    ...previous,
    ...patch,
    projectId: paths.id,
    updatedAt: nowIso(),
  };
  fs.writeFileSync(paths.jobJson, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function readJob(projectId) {
  const paths = projectPaths(projectId);
  return readJson(paths.jobJson, {
    projectId: paths.id,
    status: "idle",
    warnings: [],
    logs: [],
  });
}

function persistPipelineState(projectId, job = readJob(projectId)) {
  const paths = ensureProjectLayout(projectId);
  const fallback = createPipelineState(job.id, job.startedAt || nowIso());
  const previous = readJson(paths.pipelineStateJson, fallback);
  const progress = normaliseGenerationProgress(job.progress, {
    jobId: job.id,
    startedAt: stageTimeMs(job.startedAt),
    mode: job.generationMode || job.mode,
  });
  const snapshot = {
    ...previous,
    jobId: job.id || previous.jobId || null,
    generationMode: progress.generationMode,
    overallState: job.status || previous.state,
    state: job.status || previous.state,
    activeStage: progress.currentStageId,
    stages: progress.stages,
    errors: job.error ? [...(previous.errors || []), { stage: progress.currentStageId, message: job.error.message || String(job.error), timestamp: nowIso() }] : previous.errors || [],
    outputPaths: Array.isArray(job.resultFiles) ? job.resultFiles : previous.outputPaths || [],
    activePids: [...(activeJobs.get(projectId)?.children || [])].map((child) => child.pid).filter(Boolean),
    startedAt: job.startedAt || previous.startedAt,
    finishedAt: job.finishedAt || null,
    updatedAt: nowIso(),
  };
  fs.writeFileSync(paths.pipelineStateJson, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

function appendJobLog(projectId, line) {
  const cleanLine = String(line || "").trim();
  if (!cleanLine) {
    return readJob(projectId);
  }
  const current = readJob(projectId);
  const logs = Array.isArray(current.logs) ? current.logs : [];
  return writeJob(projectId, {
    logs: [...logs, `[${nowIso()}] ${cleanLine}`].slice(-200),
  });
}

function applyRunnerEvent(projectId, event) {
  if (!event || typeof event !== "object" || typeof event.stage !== "string") return;
  const job = readJob(projectId);
  if (event.jobId && event.jobId !== job.id) {
    appendJobLog(projectId, `Evento ignorado de otro job: ${event.jobId}`);
    return;
  }
  const allowed = new Set(generationStages.map(([id]) => id));
  if (!allowed.has(event.stage)) return;
  const existing = normaliseGenerationProgress(job.progress, {
    jobId: job.id,
    startedAt: stageTimeMs(job.startedAt),
    mode: job.generationMode || job.mode,
  }).stages.find((stage) => stage.id === event.stage);
  const sequenceNumber = Number(event.sequenceNumber);
  if (Number.isFinite(sequenceNumber) && sequenceNumber <= Number(existing?.lastSequenceNumber || 0)) return;
  if (["complete", "skipped", "blocked", "cancelled", "error"].includes(existing?.state)) return;
  const progress = Number.isFinite(event.progress)
    ? Math.max(0, Math.min(100, Number(event.progress)))
    : null;
  const eventState = ["complete", "error", "cancelled"].includes(event.state)
    ? event.state
    : "running";
  updateGenerationStage(projectId, event.stage, {
    state: eventState,
    detail: typeof event.detail === "string" ? event.detail : undefined,
    progress,
    lastSequenceNumber: Number.isFinite(sequenceNumber) ? sequenceNumber : existing?.lastSequenceNumber || 0,
    // Runners use this only while their inference has no native percentage.
    indeterminate: event.indeterminate === true && progress === null,
  });
}

function handleRunnerLine(projectId, line) {
  const value = String(line || "").trim();
  if (!value) return;
  const marker = "VOLUMIA_EVENT:";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    try {
      applyRunnerEvent(projectId, JSON.parse(value.slice(markerIndex + marker.length)));
    } catch {
      appendJobLog(projectId, `Evento de progreso no válido: ${value}`);
    }
    return;
  }

  // TripoSR is an external checkout. Only promote its own emitted log lines to
  // milestones; never derive a percentage from elapsed time.
  if (/model (loaded|initialized)|loaded .*model/i.test(value)) {
    updateGenerationStage(projectId, "geometry", {
      state: "running",
      detail: "Modelo cargado.",
      progress: null,
      indeterminate: true,
    });
  } else if (/inference|reconstructing|generating (?:the )?mesh/i.test(value)) {
    updateGenerationStage(projectId, "geometry", {
      state: "running",
      detail: "Inferencia iniciada.",
      progress: null,
      indeterminate: true,
    });
  }
}

function isValidGlb(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  if (stat.size < 20) {
    return false;
  }
  const header = Buffer.alloc(4);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, header, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  return header.equals(glbMagic);
}

function verifyGroundedYUpGlb(filePath) {
  const gltf = readGlbJson(filePath);
  const positionAccessorIndexes = new Set();
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (Number.isInteger(positionAccessor)) {
        positionAccessorIndexes.add(positionAccessor);
      }
    }
  }

  const bounds = [...positionAccessorIndexes]
    .map((index) => gltf.accessors?.[index])
    .filter(
      (accessor) =>
        accessor?.type === "VEC3" &&
        Array.isArray(accessor.min) &&
        Array.isArray(accessor.max) &&
        accessor.min.length === 3 &&
        accessor.max.length === 3
    );
  if (bounds.length === 0) {
    throw new Error("El GLB normalizado no contiene bounds POSITION verificables.");
  }

  const minimumY = Math.min(...bounds.map((accessor) => Number(accessor.min[1])));
  const maximumY = Math.max(...bounds.map((accessor) => Number(accessor.max[1])));
  const height = maximumY - minimumY;
  const tolerance = Math.max(1, Math.abs(height)) * 1e-4;
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY) || height <= tolerance) {
    throw new Error("El GLB normalizado no tiene una altura Y válida.");
  }
  if (Math.abs(minimumY) > tolerance) {
    throw new Error(`El GLB normalizado no quedó apoyado en Y=0 (minY=${minimumY}).`);
  }
  return { minimumY, maximumY, height };
}

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const itemPath = path.join(root, item.name);
    if (item.isDirectory()) {
      entries.push(...listFilesRecursive(itemPath));
    } else {
      entries.push(itemPath);
    }
  }
  return entries;
}

function latestGeneratedAsset(outputDir) {
  const candidates = listFilesRecursive(outputDir)
    .filter((filePath) => [".glb", ".obj", ".ply"].includes(path.extname(filePath).toLowerCase()))
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || null;
}

function generatedResultFiles(result) {
  return Object.entries(result || {})
    .filter(([key, value]) =>
      ["latestGlb", "optimizedGlb", "texturedGlb", "raw"].includes(key) &&
      typeof value === "string" &&
      fs.existsSync(value)
    )
    .map(([, filePath]) => path.resolve(filePath));
}

function assertPipelineReadyForExport(projectId, mode) {
  const job = readJob(projectId);
  const required = getRequiredStages(mode).filter((stageId) => stageId !== "exporting");
  const stageById = new Map((job.progress?.stages || []).map((stage) => [stage.id, stage]));
  const incomplete = required.filter((stageId) => stageById.get(stageId)?.state !== "complete");
  if (incomplete.length) {
    const states = incomplete.map((stageId) => `${stageId}=${stageById.get(stageId)?.state || "missing"}`).join(", ");
    throw new Error(`No se puede exportar: etapas obligatorias incompletas (${states}).`);
  }
  if (normalizeGenerationMode(mode) === "textured") validateTexturedGlb(projectPaths(projectId).latestGlb);
}

function assertJobCanComplete(projectId, mode) {
  const job = readJob(projectId);
  const stageById = new Map((job.progress?.stages || []).map((stage) => [stage.id, stage]));
  const incomplete = getRequiredStages(mode).filter((stageId) => stageById.get(stageId)?.state !== "complete");
  if (incomplete.length) throw new Error(`El trabajo no puede finalizar. Etapas incompletas: ${incomplete.join(", ")}`);
}

function blockPendingRequiredStages(projectId, mode, reason) {
  const required = new Set(getRequiredStages(mode));
  const job = readJob(projectId);
  for (const stage of job.progress?.stages || []) {
    if (required.has(stage.id) && ["pending", "queued"].includes(stage.state)) {
      updateGenerationStage(projectId, stage.id, { state: "blocked", detail: reason, progress: null });
    }
  }
}

function copyRawOutput(projectId, sourcePath) {
  const paths = ensureProjectLayout(projectId);
  const ext = path.extname(sourcePath).toLowerCase();
  const rawPath = path.join(paths.output, `raw${ext}`);
  if (path.resolve(sourcePath) !== path.resolve(rawPath)) {
    fs.copyFileSync(sourcePath, rawPath);
  }
  appendJobLog(projectId, `Raw model: ${rawPath}`);
  return rawPath;
}

function spawnProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.projectId && isGenerationCancelled(options.projectId)) {
      reject(new GenerationCancelledError());
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...readLocalSettings(), ...(options.env || {}) },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const activeJob = options.projectId ? activeJobs.get(options.projectId) : null;
    activeJob?.children.add(child);
    let stdout = "";
    let stderr = "";
    const lineBuffers = { stdout: "", stderr: "" };
    const consumeLines = (chunk, stream) => {
      lineBuffers[stream] += String(chunk);
      const lines = lineBuffers[stream].split(/\r?\n/u);
      lineBuffers[stream] = lines.pop() || "";
      for (const line of lines) options.onLine?.(line, stream);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      options.onOutput?.(String(chunk), "stdout");
      consumeLines(chunk, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      options.onOutput?.(String(chunk), "stderr");
      consumeLines(chunk, "stderr");
    });
    child.on("error", (error) => {
      activeJob?.children.delete(child);
      reject(error);
    });
    child.on("close", (code, signal) => {
      activeJob?.children.delete(child);
      for (const stream of ["stdout", "stderr"]) {
        if (lineBuffers[stream]) options.onLine?.(lineBuffers[stream], stream);
      }
      if (options.projectId && isGenerationCancelled(options.projectId)) {
        reject(new GenerationCancelledError());
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const argparseHint = code === 2
        ? " El runner rechazó sus argumentos; revisá el detalle del comando y los flags obligatorios."
        : "";
      const error = new Error(`${command} exited with code ${code}${signal ? ` (${signal})` : ""}.${argparseHint}\n${stderr || stdout}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });
  });
}

async function runDemo(projectId) {
  const paths = ensureProjectLayout(projectId);
  markNotRequiredStages(projectId, ["preparing_image", "texture", "optimizing"]);
  updateGenerationStage(projectId, "geometry", {
    state: "running",
    detail: "Copiando activo de demostración.",
    progress: null,
    indeterminate: true,
  });
  const templatePath = path.join(desktopDir, "assets", "templates", "box.glb");
  if (!isValidGlb(templatePath)) {
    throw new Error(`Demo GLB not found or invalid: ${templatePath}`);
  }
  fs.copyFileSync(templatePath, paths.latestGlb);
  updateGenerationStage(projectId, "geometry", {
    state: "complete",
    detail: "GLB de demostración validado.",
    progress: 100,
  });
  return {
    latestGlb: paths.latestGlb,
    source: templatePath,
    warnings: [],
  };
}

async function runBlenderOptimize(projectId, sourcePath, options = {}) {
  const tools = getToolStatus();
  const paths = ensureProjectLayout(projectId);
  const rotation = options.rotation || null;
  const normalizeToGround = options.normalizeToGround === true;
  const levelSupportPlane = options.levelSupportPlane === true;
  const hasCanonicalRotation = Boolean(
    rotation &&
      (Math.abs(rotation.rotationXDeg || 0) > 0.0001 ||
        Math.abs(rotation.rotationYDeg || 0) > 0.0001 ||
        Math.abs(rotation.rotationZDeg || 0) > 0.0001)
  );
  if (!tools.blender.exists) {
    if (hasCanonicalRotation || normalizeToGround) {
      throw new Error("Blender no configurado: se necesita para normalizar el mesh antes del GLB final.");
    }
    if (path.extname(sourcePath).toLowerCase() === ".glb" && isValidGlb(sourcePath)) {
      fs.copyFileSync(sourcePath, paths.latestGlb);
      updateGenerationStage(projectId, "optimizing", {
        state: "complete",
        detail: "No se requirió optimización adicional; se validó el GLB original.",
        progress: 100,
      });
      return {
        latestGlb: paths.latestGlb,
        warnings: ["Blender no esta configurado; se uso el GLB generado directamente."],
      };
    }
    throw new Error("Blender no configurado: se necesita para convertir OBJ/PLY a GLB.");
  }

  writeJob(projectId, { status: "optimizing", message: "Optimizando malla con Blender..." });
  updateGenerationStage(projectId, "optimizing", {
    state: "running",
    detail: "Procesando malla con Blender.",
    progress: null,
    indeterminate: true,
  });
  appendJobLog(projectId, `Blender optimize: ${sourcePath}`);
  if (hasCanonicalRotation) {
    appendJobLog(
      projectId,
      `Canonical mesh rotation before bake/export (${rotation.preset || "custom"}): X=${rotation.rotationXDeg} Y=${rotation.rotationYDeg} Z=${rotation.rotationZDeg}`
    );
  }
  if (normalizeToGround) {
    appendJobLog(projectId, "Centering normalized mesh and placing its base on the ground plane.");
  }
  const optimizedGlb = path.join(paths.output, "optimized.glb");
  const blenderArgs = [
    "--background",
    "--python",
    path.join(backendDir, "tools", "blender_optimize.py"),
    "--",
    "--input",
    sourcePath,
    "--output",
    optimizedGlb,
  ];
  if (hasCanonicalRotation) {
    blenderArgs.push(
      "--rotation-x-deg",
      String(rotation.rotationXDeg || 0),
      "--rotation-y-deg",
      String(rotation.rotationYDeg || 0),
      "--rotation-z-deg",
      String(rotation.rotationZDeg || 0)
    );
  }
  if (normalizeToGround) {
    blenderArgs.push("--normalize-to-ground");
  }
  if (levelSupportPlane) {
    blenderArgs.push("--level-support-plane");
  }
  await spawnProcess(tools.blender.path, blenderArgs, {
    projectId,
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
    onLine: (line) => handleRunnerLine(projectId, line),
  });
  if (!isValidGlb(optimizedGlb)) {
    throw new Error("Blender termino, pero output/optimized.glb no es un GLB valido.");
  }
  let canonicalBounds = null;
  if (normalizeToGround) {
    canonicalBounds = verifyGroundedYUpGlb(optimizedGlb);
    appendJobLog(
      projectId,
      `Canonical GLB verified: Y-up minY=${canonicalBounds.minimumY.toFixed(6)} height=${canonicalBounds.height.toFixed(6)}`
    );
  }
  fs.copyFileSync(optimizedGlb, paths.latestGlb);
  updateGenerationStage(projectId, "optimizing", {
    state: "complete",
    detail: "Malla procesada y validada por Blender.",
    progress: 100,
  });
  return {
    latestGlb: paths.latestGlb,
    optimizedGlb,
    rotation,
    normalizeToGround,
    levelSupportPlane,
    canonicalBounds,
    warnings: [],
  };
}

async function runQuick(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.python.exists) {
    throw new Error("Python no configurado: define VOLUMIA_PYTHON.");
  }
  if (!tools.triposr.exists) {
    throw new Error("TripoSR no configurado: define VOLUMIA_TRIPOSR_DIR.");
  }
  if (inputFiles.length < 1) {
    throw new Error("No se encontró imagen de entrada.");
  }

  const paths = ensureProjectLayout(projectId);
  const triposrOutput = path.join(paths.output, "triposr");
  fs.rmSync(triposrOutput, { recursive: true, force: true });
  ensureDir(triposrOutput);
  writeJob(projectId, { status: "running", message: "Ejecutando TripoSR..." });
  updateGenerationStage(projectId, "preparing_image", {
    state: "running",
    detail: "Preparando imagen de referencia.",
    progress: null,
    indeterminate: true,
  });
  markNotRequiredStages(projectId, ["texture"]);
  const pythonEnv = pythonGenerationEnv();
  appendPythonEnvLogs(projectId, "triposr", pythonEnv);
  try {
    await spawnProcess(tools.python.path, [
      path.join(backendDir, "tools", "triposr_runner.py"),
      "--triposr-dir",
      tools.triposr.path,
      "--input",
      inputFiles[0],
      "--output-dir",
      triposrOutput,
    ], {
      projectId,
      cwd: tools.triposr.path,
      env: pythonEnv,
      onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
      onLine: (line) => handleRunnerLine(projectId, line),
    });
  } catch (error) {
    if (error instanceof GenerationCancelledError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error ejecutando Python: ${message}`);
  }

  const generated = latestGeneratedAsset(triposrOutput);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
  updateGenerationStage(projectId, "geometry", {
    state: "complete",
    detail: "Malla base generada y GLB temporal guardado.",
    progress: 100,
  });
  appendJobLog(
    projectId,
    "Quick axis normalization applied: TripoSR → VOLUMIA Y-up; support side grounded and canonical front aligned to +Z"
  );
  const optimized = await runBlenderOptimize(projectId, raw, {
    rotation: QUICK_CANONICAL_ROTATION,
    levelSupportPlane: true,
    normalizeToGround: true,
  });
  return {
    latestGlb: optimized.latestGlb,
    raw,
    optimizedGlb: optimized.optimizedGlb,
    source: generated,
    rotation: optimized.rotation,
    axisNormalization: QUICK_AXIS_NORMALIZATION,
    supportPlaneLevelingRequested: optimized.levelSupportPlane,
    canonicalBounds: optimized.canonicalBounds,
    warnings: optimized.warnings,
  };
}

function buildHunyuanRunnerArgs({ jobId, hunyuanDir, inputPath, outputDir }) {
  if (jobId === undefined || jobId === null || String(jobId).trim() === "") {
    throw new Error("No se puede ejecutar Hunyuan3D sin un jobId válido.");
  }
  return [
    path.join(backendDir, "tools", "hunyuan_runner.py"),
    "--job-id",
    String(jobId),
    "--hunyuan-dir",
    hunyuanDir,
    "--input",
    inputPath,
    "--output-dir",
    outputDir,
  ];
}

function buildHunyuanTexgenArgs({ jobId, inputPath, meshPath, outputDir, hunyuanDir }) {
  const normalizedJobId = String(jobId ?? "").trim();
  if (!normalizedJobId) throw new Error("No se puede iniciar la textura Hunyuan: falta jobId.");
  return [
    path.join(backendDir, "python", "hunyuan_texgen.py"),
    "--job-id", normalizedJobId,
    "--image", inputPath,
    "--mesh", meshPath,
    "--output-dir", outputDir,
    "--repo-root", hunyuanDir,
  ];
}

async function runTexture(projectId, inputPath, meshPath) {
  const tools = getToolStatus();
  const paths = ensureProjectLayout(projectId);
  const job = readJob(projectId);
  const jobId = String(job.id || "").trim();
  if (!jobId) throw new Error("No se puede iniciar la textura: falta jobId.");
  validateMeshGlb(meshPath, { requireUv: true });
  const textureOutput = path.join(paths.output, "hunyuan-texture");
  fs.rmSync(textureOutput, { recursive: true, force: true });
  ensureDir(textureOutput);
  updateGenerationStage(projectId, "texture", {
    state: "queued",
    detail: "Esperando acceso exclusivo a la GPU.",
    progress: null,
    indeterminate: true,
  });
  appendJobLog(projectId, `[GPU_QUEUE] job queued: ${jobId}:texture`);
  const texturedGlb = await gpuTaskQueue.runExclusive({
    jobId,
    stage: "texture",
    isCancelled: () => isGenerationCancelled(projectId),
    onStart: () => {
      appendJobLog(projectId, `[GPU_QUEUE] lock acquired: ${jobId}:texture`);
      updateGenerationStage(projectId, "texture", {
        state: "running",
        detail: "Generando textura con Hunyuan3D.",
        progress: null,
        indeterminate: true,
      });
    },
  }, async () => {
    try {
      await spawnProcess(tools.python.path, buildHunyuanTexgenArgs({
        jobId,
        inputPath,
        meshPath,
        outputDir: textureOutput,
        hunyuanDir: tools.hunyuan.path,
      }), {
        projectId,
        cwd: tools.hunyuan.path,
        env: pythonGenerationEnv(),
        onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
        onLine: (line) => handleRunnerLine(projectId, line),
      });
      const candidate = path.join(textureOutput, "textured.glb");
      validateTexturedGlb(candidate);
      return candidate;
    } finally {
      appendJobLog(projectId, `[GPU_QUEUE] lock released: ${jobId}:texture`);
    }
  });
  fs.copyFileSync(texturedGlb, paths.latestGlb);
  updateGenerationStage(projectId, "texture", {
    state: "complete",
    detail: "Textura, materiales y UV validados.",
    progress: 100,
  });
  return texturedGlb;
}

async function runTextured(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.python.exists) {
    throw new Error("Python no configurado: define VOLUMIA_PYTHON.");
  }
  if (!tools.hunyuan.exists) {
    throw new Error("Hunyuan3D no configurado: define VOLUMIA_HUNYUAN_DIR.");
  }
  if (inputFiles.length < 1) {
    throw new Error("No se encontró imagen de entrada.");
  }
  const paths = ensureProjectLayout(projectId);
  const jobId = readJob(projectId).id;
  const hunyuanOutput = path.join(paths.output, "hunyuan");
  fs.rmSync(hunyuanOutput, { recursive: true, force: true });
  ensureDir(hunyuanOutput);
  updateGenerationStage(projectId, "preparing_image", {
    state: "running",
    detail: "Cargando imagen de referencia.",
    progress: null,
    indeterminate: true,
  });
  const pythonEnv = pythonGenerationEnv();
  appendPythonEnvLogs(projectId, "hunyuan", pythonEnv);
  updateGenerationStage(projectId, "geometry", {
    state: "queued",
    detail: "Esperando acceso exclusivo a la GPU.",
    progress: null,
    indeterminate: true,
  });
  appendJobLog(projectId, `[GPU_QUEUE] job queued: ${jobId}:geometry`);
  await gpuTaskQueue.runExclusive({
    jobId,
    stage: "geometry",
    isCancelled: () => isGenerationCancelled(projectId),
    onStart: () => {
      appendJobLog(projectId, `[GPU_QUEUE] lock acquired: ${jobId}:geometry`);
      updateGenerationStage(projectId, "geometry", {
        state: "running",
        detail: "Cargando modelo de geometría.",
        progress: null,
        indeterminate: true,
      });
    },
  }, async () => {
    try {
      await spawnProcess(tools.python.path, buildHunyuanRunnerArgs({
        jobId,
        hunyuanDir: tools.hunyuan.path,
        inputPath: inputFiles[0],
        outputDir: hunyuanOutput,
      }), {
        projectId,
        cwd: tools.hunyuan.path,
        env: pythonEnv,
        onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
        onLine: (line) => handleRunnerLine(projectId, line),
      });
    } finally {
      appendJobLog(projectId, `[GPU_QUEUE] lock released: ${jobId}:geometry`);
    }
  });
  const generated = latestGeneratedAsset(hunyuanOutput);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
  updateGenerationStage(projectId, "geometry", {
    state: "complete",
    detail: "Malla base generada y GLB temporal guardado.",
    progress: 100,
  });
  const optimized = await runBlenderOptimize(projectId, raw, {
    rotation: configuredRotation("VOLUMIA_HUNYUAN_ROTATION", {
      preset: "hunyuan_default",
      rotationXDeg: 0,
      rotationYDeg: 0,
      rotationZDeg: 0,
    }),
  });
  validateMeshGlb(optimized.latestGlb, { requireUv: true });
  const texturedGlb = await runTexture(projectId, inputFiles[0], optimized.latestGlb);
  return {
    latestGlb: texturedGlb,
    raw,
    optimizedGlb: optimized.optimizedGlb,
    texturedGlb,
    source: generated,
    rotation: optimized.rotation,
    warnings: optimized.warnings,
  };
}

async function runPhotogrammetry(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.python.exists) {
    throw new Error("Python no configurado: define VOLUMIA_PYTHON.");
  }
  if (!tools.meshroom.exists) {
    throw new Error("Meshroom no configurado: define VOLUMIA_MESHROOM_DIR.");
  }
  if (inputFiles.length < 2) {
    throw new Error("El modo photogrammetry requiere multiples imagenes.");
  }
  const paths = ensureProjectLayout(projectId);
  updateGenerationStage(projectId, "preparing_image", {
    state: "complete",
    detail: "Las referencias se enviaron directamente a fotogrametría.",
    progress: 100,
  });
  updateGenerationStage(projectId, "geometry", {
    state: "running",
    detail: "Reconstruyendo desde las referencias fotográficas.",
    progress: null,
    indeterminate: true,
  });
  markNotRequiredStages(projectId, ["texture"]);
  const pythonEnv = pythonGenerationEnv();
  appendPythonEnvLogs(projectId, "meshroom", pythonEnv);
  await spawnProcess(tools.python.path, [
    path.join(backendDir, "tools", "meshroom_runner.py"),
    "--meshroom-dir",
    tools.meshroom.path,
    "--input-dir",
    paths.input,
    "--output-dir",
    paths.output,
  ], {
    projectId,
    cwd: tools.meshroom.path,
    env: pythonEnv,
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
    onLine: (line) => handleRunnerLine(projectId, line),
  });
  const generated = latestGeneratedAsset(paths.output);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
  updateGenerationStage(projectId, "geometry", {
    state: "complete",
    detail: "Malla base generada por fotogrametría.",
    progress: 100,
  });
  return await runBlenderOptimize(projectId, raw);
}

async function runGeneration(projectId, mode) {
  const paths = ensureProjectLayout(projectId);
  const current = readJob(projectId);
  const inputFiles = fs.readdirSync(paths.input)
    .map((fileName) => path.join(paths.input, fileName))
    .filter((filePath) => fs.statSync(filePath).isFile());
  const references = readMetadata(projectId).references;
  const primaryPath = references.find((reference) => reference.primary)?.path;
  if (primaryPath && inputFiles.includes(primaryPath)) {
    inputFiles.sort((left, right) => (left === primaryPath ? -1 : right === primaryPath ? 1 : 0));
  }

  try {
    // A cancellation can arrive immediately after the HTTP request is accepted,
    // before this asynchronous runner has written its first "queued" state.
    // Preserve that cancellation instead of reviving the job.
    if (isGenerationCancelled(projectId)) {
      throw new GenerationCancelledError();
    }
    if (!validModes.has(mode)) {
      throw new Error(`Modo de generacion invalido: ${mode}`);
    }
    const generationMode = normalizeGenerationMode(mode);
    writeJob(projectId, {
      id: current.id,
      mode,
      generationMode,
      status: "queued",
      message: "Job en cola.",
      startedAt: current.startedAt || nowIso(),
      finishedAt: null,
      totalDurationMs: null,
      runner: mode === "quick" ? "TripoSR" : mode === "textured" ? "Hunyuan3D" : mode === "photogrammetry" ? "Meshroom" : "Plantilla local",
      resultFiles: [],
      progress: normaliseGenerationProgress(
        current.progress || createGenerationProgress({
          jobId: current.id,
          startedAt: stageTimeMs(current.startedAt),
          mode: generationMode,
        }),
        { jobId: current.id, startedAt: stageTimeMs(current.startedAt), mode: generationMode },
      ),
      error: null,
      warnings: [],
      inputFiles,
    });
    const requiredStages = new Set(getRequiredStages(generationMode));
    markNotRequiredStages(
      projectId,
      generationStages.map(([stageId]) => stageId).filter((stageId) => !requiredStages.has(stageId)),
    );
    updateGenerationStage(projectId, "validating", {
      state: "running",
      detail: "Verificando referencias y configuración del modo.",
      progress: null,
      indeterminate: true,
    });
    const missingInput = inputFiles.find((filePath) => !fs.existsSync(filePath));
    if (missingInput) {
      throw new Error(`No se encontró la referencia: ${missingInput}`);
    }
    updateGenerationStage(projectId, "validating", {
      state: "complete",
      detail: inputFiles.length
        ? `${inputFiles.length} referencia(s) validada(s).`
        : "Modo de demostración validado sin referencias.",
      progress: 100,
    });
    writeJob(projectId, { status: "running", message: `Ejecutando modo ${mode}...` });
    log("INFO", "generation started", { projectId, mode, inputFiles: inputFiles.length });

    const result =
      mode === "demo"
        ? await runDemo(projectId)
        : mode === "quick"
          ? await runQuick(projectId, inputFiles)
          : mode === "textured"
            ? await runTextured(projectId, inputFiles)
            : await runPhotogrammetry(projectId, inputFiles);

    if (isGenerationCancelled(projectId)) {
      throw new GenerationCancelledError();
    }

    appendJobLog(projectId, `[PIPELINE] Export preconditions: mode=${generationMode} required=${getRequiredStages(generationMode).join(",")}`);
    assertPipelineReadyForExport(projectId, generationMode);
    updateGenerationStage(projectId, "exporting", {
      state: "running",
      detail: "Verificando el archivo final para el visor.",
      progress: null,
      indeterminate: true,
    });
    if (!isValidGlb(paths.latestGlb)) {
      throw new Error("El archivo final GLB no existe o no es válido.");
    }
    const finalGltf = readGlbJson(paths.latestGlb);
    if (!Array.isArray(finalGltf.meshes) || finalGltf.meshes.length === 0) {
      throw new Error("El archivo final GLB no contiene una malla cargable en el visor.");
    }
    updateGenerationStage(projectId, "exporting", {
      state: "complete",
      detail: "GLB final validado y disponible para el visor.",
      progress: 100,
    });

    assertJobCanComplete(projectId, generationMode);

    const finishedAt = nowIso();
    const finished = writeJob(projectId, {
      status: "complete",
      message: "Activo generado correctamente.",
      finishedAt,
      totalDurationMs: durationSince(readJob(projectId).startedAt, finishedAt),
      latestGlb: paths.latestGlb,
      output: result,
      resultFiles: generatedResultFiles(result),
      warnings: result.warnings || [],
    });
    persistPipelineState(projectId, finished);
    syncLatestVersion(projectId, finished, paths.latestGlb);
    log("INFO", "generation complete", { projectId, mode, latestGlb: paths.latestGlb });
    return finished;
  } catch (error) {
    if (error instanceof GenerationCancelledError || isGenerationCancelled(projectId)) {
      log("INFO", "generation cancelled", { projectId, mode });
      finishActiveStage(projectId, "cancelled", "Cancelada antes de finalizar.");
      const finishedAt = nowIso();
      const cancelled = writeJob(projectId, {
        status: "cancelled",
        message: "Generación interrumpida por el usuario.",
        finishedAt,
        totalDurationMs: durationSince(readJob(projectId).startedAt, finishedAt),
        error: null,
      });
      persistPipelineState(projectId, cancelled);
      syncLatestVersion(projectId, cancelled, null);
      return cancelled;
    }
    const message = error instanceof Error ? error.message : String(error);
    log("ERR", "generation failed", { projectId, mode, message });
    finishActiveStage(projectId, "error", message);
    blockPendingRequiredStages(projectId, normalizeGenerationMode(mode), "Bloqueada por una etapa obligatoria fallida.");
    const finishedAt = nowIso();
    const failed = writeJob(projectId, {
      status: "error",
      message,
      finishedAt,
      totalDurationMs: durationSince(readJob(projectId).startedAt, finishedAt),
      error: { message },
    });
    persistPipelineState(projectId, failed);
    syncLatestVersion(projectId, failed, null);
    return failed;
  }
}

function startGeneration(projectId, mode) {
  if (activeJobs.has(projectId)) {
    return readJob(projectId);
  }

  const current = readJob(projectId);
  if (current.id) gpuTaskQueue.resetCancellation(current.id);

  const activeJob = {
    cancelled: false,
    children: new Set(),
    completion: null,
  };
  activeJobs.set(projectId, activeJob);
  activeJob.completion = runGeneration(projectId, mode).finally(() => {
    activeJobs.delete(projectId);
  });
  return readJob(projectId);
}

module.exports = {
  QUICK_CANONICAL_ROTATION,
  QUICK_AXIS_NORMALIZATION,
  verifyGroundedYUpGlb,
  logPath,
  validModes,
  isValidGlb,
  createGenerationProgress,
  buildHunyuanRunnerArgs,
  buildHunyuanTexgenArgs,
  normalizeGenerationMode,
  getRequiredStages,
  assertPipelineReadyForExport,
  assertJobCanComplete,
  readJob,
  writeJob,
  startGeneration,
  runGeneration,
  cancelGeneration,
  reconcileInterruptedJobs,
};
