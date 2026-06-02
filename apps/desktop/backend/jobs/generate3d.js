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
  readLocalSettings,
} = require("../config/paths");

const logDir = path.join(backendDir, "logs");
const logPath = path.join(logDir, "volumia.log");
const validModes = new Set(["demo", "quick", "textured", "photogrammetry"]);
const glbMagic = Buffer.from([0x67, 0x6c, 0x54, 0x46]);
const QUICK_CANONICAL_ROTATION = {
  preset: "side_to_ground",
  rotationXDeg: -90,
  rotationYDeg: 0,
  rotationZDeg: 0,
};
const PYTHON_OPENMP_ENV = [
  ["KMP_DUPLICATE_LIB_OK", "VOLUMIA_KMP_DUPLICATE_LIB_OK", "TRUE"],
  ["OMP_NUM_THREADS", "VOLUMIA_OMP_NUM_THREADS", "1"],
  ["MKL_NUM_THREADS", "VOLUMIA_MKL_NUM_THREADS", "1"],
  ["NUMEXPR_NUM_THREADS", "VOLUMIA_NUMEXPR_NUM_THREADS", "1"],
];

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
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...readLocalSettings(), ...(options.env || {}) },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    child.on("error", (error) => reject(error));
    child.on("close", (code, signal) => {
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
  const hasCanonicalRotation = Boolean(
    rotation &&
      (Math.abs(rotation.rotationXDeg || 0) > 0.0001 ||
        Math.abs(rotation.rotationYDeg || 0) > 0.0001 ||
        Math.abs(rotation.rotationZDeg || 0) > 0.0001)
  );
  if (!tools.blender.exists) {
    if (hasCanonicalRotation) {
      throw new Error("Blender no configurado: se necesita para rotar el mesh antes del GLB final.");
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
  await spawnProcess(tools.blender.path, blenderArgs, {
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });
  if (!isValidGlb(optimizedGlb)) {
    throw new Error("Blender termino, pero output/optimized.glb no es un GLB valido.");
  }
  fs.copyFileSync(optimizedGlb, paths.latestGlb);
  return { latestGlb: paths.latestGlb, optimizedGlb, rotation, warnings: [] };
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
      cwd: tools.triposr.path,
      env: pythonEnv,
      onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error ejecutando Python: ${message}`);
  }

  const generated = latestGeneratedAsset(triposrOutput);
  if (!generated) {
    throw new Error("El runner no generó modelo.");
  }
  const raw = copyRawOutput(projectId, generated);
  const optimized = await runBlenderOptimize(projectId, raw, {
    rotation: configuredRotation("VOLUMIA_QUICK_ROTATION", QUICK_CANONICAL_ROTATION),
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

  try {
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
  void runGeneration(projectId, mode);
  return readJob(projectId);
}

module.exports = {
  logPath,
  validModes,
  isValidGlb,
  readJob,
  writeJob,
  startGeneration,
  runGeneration,
};
