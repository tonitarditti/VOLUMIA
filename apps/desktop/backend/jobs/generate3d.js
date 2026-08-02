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
const { readMetadata } = require("../project-metadata");

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
  const cancelled = writeJob(projectId, {
    status: "cancelled",
    message: "Generación interrumpida por el usuario.",
    finishedAt: nowIso(),
    error: null,
  });
  appendJobLog(projectId, "Generación cancelada: terminando procesos asociados.");

  const children = activeJob ? [...activeJob.children] : [];
  await Promise.all(children.map((child) => terminateProcessTree(child)));
  await Promise.all(children.map((child) => waitForChildExit(child)));
  if (options.waitForCompletion && activeJob?.completion) {
    await activeJob.completion;
  }
  return cancelled;
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

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 20 || !buffer.subarray(0, 4).equals(glbMagic)) {
    throw new Error(`Invalid GLB header: ${filePath}`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.length) {
    throw new Error(`Invalid GLB JSON chunk: ${filePath}`);
  }
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/u, ""));
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
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      options.onOutput?.(String(chunk), "stdout");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      options.onOutput?.(String(chunk), "stderr");
    });
    child.on("error", (error) => {
      activeJob?.children.delete(child);
      reject(error);
    });
    child.on("close", (code, signal) => {
      activeJob?.children.delete(child);
      if (options.projectId && isGenerationCancelled(options.projectId)) {
        reject(new GenerationCancelledError());
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const error = new Error(`${command} exited with code ${code}${signal ? ` (${signal})` : ""}.\n${stderr || stdout}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });
  });
}

async function runDemo(projectId) {
  const paths = ensureProjectLayout(projectId);
  const templatePath = path.join(desktopDir, "assets", "templates", "box.glb");
  if (!isValidGlb(templatePath)) {
    throw new Error(`Demo GLB not found or invalid: ${templatePath}`);
  }
  fs.copyFileSync(templatePath, paths.latestGlb);
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
      return {
        latestGlb: paths.latestGlb,
        warnings: ["Blender no esta configurado; se uso el GLB generado directamente."],
      };
    }
    throw new Error("Blender no configurado: se necesita para convertir OBJ/PLY a GLB.");
  }

  writeJob(projectId, { status: "optimizing", message: "Optimizando y exportando con Blender..." });
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
  const hunyuanOutput = path.join(paths.output, "hunyuan");
  fs.rmSync(hunyuanOutput, { recursive: true, force: true });
  ensureDir(hunyuanOutput);
  const pythonEnv = pythonGenerationEnv();
  appendPythonEnvLogs(projectId, "hunyuan", pythonEnv);
  await spawnProcess(tools.python.path, [
    path.join(backendDir, "tools", "hunyuan_runner.py"),
    "--hunyuan-dir",
    tools.hunyuan.path,
    "--input",
    inputFiles[0],
    "--output-dir",
    hunyuanOutput,
  ], {
    projectId,
    cwd: tools.hunyuan.path,
    env: pythonEnv,
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });
  const generated = latestGeneratedAsset(hunyuanOutput);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
  const optimized = await runBlenderOptimize(projectId, raw, {
    rotation: configuredRotation("VOLUMIA_HUNYUAN_ROTATION", {
      preset: "hunyuan_default",
      rotationXDeg: 0,
      rotationYDeg: 0,
      rotationZDeg: 0,
    }),
  });
  return {
    latestGlb: optimized.latestGlb,
    raw,
    optimizedGlb: optimized.optimizedGlb,
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
  });
  const generated = latestGeneratedAsset(paths.output);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
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
    writeJob(projectId, {
      id: current.id,
      mode,
      status: "queued",
      message: "Job en cola.",
      startedAt: nowIso(),
      finishedAt: null,
      error: null,
      warnings: [],
      inputFiles,
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

    const finished = writeJob(projectId, {
      status: "complete",
      message: "Modelo listo.",
      finishedAt: nowIso(),
      latestGlb: paths.latestGlb,
      output: result,
      warnings: result.warnings || [],
    });
    log("INFO", "generation complete", { projectId, mode, latestGlb: paths.latestGlb });
    return finished;
  } catch (error) {
    if (error instanceof GenerationCancelledError || isGenerationCancelled(projectId)) {
      log("INFO", "generation cancelled", { projectId, mode });
      return writeJob(projectId, {
        status: "cancelled",
        message: "Generación interrumpida por el usuario.",
        finishedAt: nowIso(),
        error: null,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    log("ERR", "generation failed", { projectId, mode, message });
    return writeJob(projectId, {
      status: "error",
      message,
      finishedAt: nowIso(),
      error: { message },
    });
  }
}

function startGeneration(projectId, mode) {
  if (activeJobs.has(projectId)) {
    return readJob(projectId);
  }

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
  readJob,
  writeJob,
  startGeneration,
  runGeneration,
  cancelGeneration,
  reconcileInterruptedJobs,
};
