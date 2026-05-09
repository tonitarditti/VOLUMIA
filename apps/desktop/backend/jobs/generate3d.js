const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  backendDir,
  desktopDir,
  ensureDir,
  ensureProjectLayout,
  getToolStatus,
  projectPaths,
} = require("../config/paths");

const logDir = path.join(backendDir, "logs");
const logPath = path.join(logDir, "volumia.log");
const validModes = new Set(["demo", "quick", "textured", "photogrammetry"]);
const glbMagic = Buffer.from([0x67, 0x6c, 0x54, 0x46]);

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
  const current = readJob(projectId);
  const logs = Array.isArray(current.logs) ? current.logs : [];
  return writeJob(projectId, {
    logs: [...logs, `[${nowIso()}] ${line}`].slice(-200),
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

function spawnProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
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

async function runBlenderOptimize(projectId, sourcePath) {
  const tools = getToolStatus();
  const paths = ensureProjectLayout(projectId);
  if (!tools.blender.exists) {
    if (path.extname(sourcePath).toLowerCase() === ".glb" && isValidGlb(sourcePath)) {
      fs.copyFileSync(sourcePath, paths.latestGlb);
      return {
        latestGlb: paths.latestGlb,
        warnings: ["Blender no esta configurado; se uso el GLB generado directamente."],
      };
    }
    throw new Error("Blender no esta configurado y el runner no produjo un GLB directo.");
  }

  writeJob(projectId, { status: "optimizing", message: "Optimizando y exportando con Blender..." });
  appendJobLog(projectId, `Blender optimize: ${sourcePath}`);
  await spawnProcess(tools.blender.path, [
    "--background",
    "--python",
    path.join(backendDir, "tools", "blender_optimize.py"),
    "--",
    "--input",
    sourcePath,
    "--output",
    paths.latestGlb,
  ], {
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });
  if (!isValidGlb(paths.latestGlb)) {
    throw new Error("Blender termino, pero latest.glb no es un GLB valido.");
  }
  return { latestGlb: paths.latestGlb, warnings: [] };
}

async function runQuick(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.python.exists) {
    throw new Error("Python no esta configurado. Define VOLUMIA_PYTHON.");
  }
  if (!tools.triposr.exists) {
    throw new Error("TripoSR no esta configurado. Define VOLUMIA_TRIPOSR_DIR.");
  }
  if (inputFiles.length < 1) {
    throw new Error("El modo quick requiere una imagen.");
  }

  const paths = ensureProjectLayout(projectId);
  const triposrOutput = path.join(paths.output, "triposr");
  ensureDir(triposrOutput);
  writeJob(projectId, { status: "running", message: "Ejecutando TripoSR..." });
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
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });

  const generated = latestGeneratedAsset(triposrOutput);
  if (!generated) {
    throw new Error("TripoSR termino sin generar OBJ, PLY o GLB.");
  }
  const optimized = await runBlenderOptimize(projectId, generated);
  return {
    latestGlb: optimized.latestGlb,
    source: generated,
    warnings: optimized.warnings,
  };
}

async function runTextured(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.python.exists) {
    throw new Error("Python no esta configurado. Define VOLUMIA_PYTHON.");
  }
  if (!tools.hunyuan.exists) {
    throw new Error("Hunyuan3D no esta configurado. Define VOLUMIA_HUNYUAN_DIR.");
  }
  if (inputFiles.length < 1) {
    throw new Error("El modo textured requiere una imagen.");
  }
  const paths = ensureProjectLayout(projectId);
  await spawnProcess(tools.python.path, [
    path.join(backendDir, "tools", "hunyuan_runner.py"),
    "--hunyuan-dir",
    tools.hunyuan.path,
    "--input",
    inputFiles[0],
    "--output-dir",
    paths.output,
  ], {
    cwd: tools.hunyuan.path,
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });
  const generated = latestGeneratedAsset(paths.output);
  if (!generated) {
    throw new Error("Hunyuan3D termino sin generar OBJ, PLY o GLB.");
  }
  return await runBlenderOptimize(projectId, generated);
}

async function runPhotogrammetry(projectId, inputFiles) {
  const tools = getToolStatus();
  if (!tools.meshroom.exists) {
    throw new Error("Meshroom no esta configurado. Define VOLUMIA_MESHROOM_DIR.");
  }
  if (inputFiles.length < 2) {
    throw new Error("El modo photogrammetry requiere multiples imagenes.");
  }
  const paths = ensureProjectLayout(projectId);
  await spawnProcess(process.env.VOLUMIA_PYTHON || "python", [
    path.join(backendDir, "tools", "meshroom_runner.py"),
    "--meshroom-dir",
    tools.meshroom.path,
    "--input-dir",
    paths.input,
    "--output-dir",
    paths.output,
  ], {
    cwd: tools.meshroom.path,
    onOutput: (chunk) => appendJobLog(projectId, chunk.trim()),
  });
  const generated = latestGeneratedAsset(paths.output);
  if (!generated) {
    throw new Error("Meshroom termino sin generar OBJ, PLY o GLB.");
  }
  return await runBlenderOptimize(projectId, generated);
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
