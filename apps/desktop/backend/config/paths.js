const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..");
const desktopDir = path.resolve(backendDir, "..");
const settingsPath = path.join(__dirname, "local.settings.json");
const settingKeys = [
  "VOLUMIA_PYTHON",
  "VOLUMIA_BLENDER",
  "VOLUMIA_SKETCHUP",
  "VOLUMIA_TRIPOSR_DIR",
  "VOLUMIA_HUNYUAN_DIR",
  "VOLUMIA_HUNYUAN_MODEL_PATH",
  "VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER",
  "VOLUMIA_HUNYUAN_PAINT_SUBFOLDER",
  "VOLUMIA_MESHROOM_DIR",
  "VOLUMIA_QUICK_ROTATION_X",
  "VOLUMIA_QUICK_ROTATION_Y",
  "VOLUMIA_QUICK_ROTATION_Z",
  "VOLUMIA_HUNYUAN_ROTATION_X",
  "VOLUMIA_HUNYUAN_ROTATION_Y",
  "VOLUMIA_HUNYUAN_ROTATION_Z",
  "VOLUMIA_KMP_DUPLICATE_LIB_OK",
  "VOLUMIA_OMP_NUM_THREADS",
  "VOLUMIA_MKL_NUM_THREADS",
  "VOLUMIA_NUMEXPR_NUM_THREADS",
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readLocalSettings() {
  const raw = readJson(settingsPath, {});
  const settings = {};
  for (const key of settingKeys) {
    if (typeof raw[key] === "string") {
      settings[key] = raw[key];
    }
  }
  return settings;
}

function saveLocalSettings(patch) {
  ensureDir(path.dirname(settingsPath));
  const previous = readLocalSettings();
  const next = { ...previous };
  for (const key of settingKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = typeof patch[key] === "string" ? patch[key].trim() : "";
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
    }
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function configuredValue(envName) {
  const settings = readLocalSettings();
  const localValue = settings[envName];
  if (localValue && localValue.trim().length > 0) {
    return localValue.trim();
  }
  const envValue = process.env[envName];
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return "";
}

function configuredPath(envName) {
  const raw = configuredValue(envName);
  if (!raw) {
    return null;
  }
  return path.resolve(raw);
}

function configuredNumber(envName, fallback = 0) {
  const raw = configuredValue(envName);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const defaultProjectsRoot = path.join(desktopDir, "projects");
const projectsRoot = path.resolve(process.env.VOLUMIA_ROOT || defaultProjectsRoot);

function fileExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return Boolean(dirPath && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());
  } catch {
    return false;
  }
}

function findFirstExisting(root, names) {
  if (!dirExists(root)) {
    return null;
  }
  for (const name of names) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function baseToolStatus(name, envName, type, resolvedPath, ready, details) {
  return {
    name,
    env: envName,
    type,
    configured: Boolean(resolvedPath),
    path: resolvedPath,
    exists: ready,
    status: ready ? "Configurada" : "No configurada",
    details,
  };
}

function pythonStatus() {
  const resolvedPath = configuredPath("VOLUMIA_PYTHON");
  const ready = fileExists(resolvedPath);
  return baseToolStatus(
    "Python",
    "VOLUMIA_PYTHON",
    "file",
    resolvedPath,
    ready,
    ready ? "Executable found." : "Python executable not found.",
  );
}

function blenderStatus() {
  const configured = configuredPath("VOLUMIA_BLENDER");
  let resolvedPath = configured;
  if (configured && dirExists(configured)) {
    resolvedPath = path.join(configured, "blender.exe");
  }
  const ready = fileExists(resolvedPath) && path.basename(resolvedPath).toLowerCase() === "blender.exe";
  return baseToolStatus(
    "Blender",
    "VOLUMIA_BLENDER",
    "file",
    resolvedPath,
    ready,
    ready ? "blender.exe found." : "blender.exe not found.",
  );
}

function triposrStatus() {
  const resolvedPath = configuredPath("VOLUMIA_TRIPOSR_DIR");
  const entrypoint = findFirstExisting(resolvedPath, ["run.py", "app.py", "main.py", "infer.py", "inference.py", "demo.py"]);
  const ready = dirExists(resolvedPath) && Boolean(entrypoint);
  return {
    ...baseToolStatus(
      "TripoSR",
      "VOLUMIA_TRIPOSR_DIR",
      "directory",
      resolvedPath,
      ready,
      ready ? `Entrypoint found: ${path.basename(entrypoint)}` : "TripoSR dir or entrypoint not found.",
    ),
    entrypoint,
  };
}

function hunyuanStatus() {
  const resolvedPath = configuredPath("VOLUMIA_HUNYUAN_DIR");
  const entrypoint = findFirstExisting(resolvedPath, [
    "api_server.py",
    "gradio_app.py",
    "minimal_demo.py",
    "run.py",
    "app.py",
    "main.py",
    "infer.py",
    "inference.py",
    "demo.py",
  ]);
  const ready = dirExists(resolvedPath) && Boolean(entrypoint);
  const details = !dirExists(resolvedPath)
    ? "Directory not found."
    : entrypoint
      ? `Entrypoint found: ${path.basename(entrypoint)}`
      : "Hunyuan3D repo entrypoint not found. This may be a checkpoints directory only.";
  return {
    ...baseToolStatus(
      "Hunyuan3D",
      "VOLUMIA_HUNYUAN_DIR",
      "directory",
      resolvedPath,
      ready,
      details,
    ),
    entrypoint,
  };
}

function meshroomStatus() {
  const configured = configuredPath("VOLUMIA_MESHROOM_DIR");
  let resolvedPath = configured;
  if (configured && dirExists(configured)) {
    const exe = findFirstExisting(configured, ["meshroom_batch.exe", "MeshroomBatch.exe", "Meshroom.exe", "meshroom.exe"]);
    resolvedPath = exe || configured;
  }
  const ready = fileExists(resolvedPath) || Boolean(findFirstExisting(configured, ["meshroom_batch.exe", "MeshroomBatch.exe"]));
  return baseToolStatus(
    "Meshroom",
    "VOLUMIA_MESHROOM_DIR",
    "directory",
    resolvedPath,
    ready,
    ready ? "Meshroom executable found." : "meshroom_batch.exe or Meshroom.exe not found.",
  );
}

function getToolStatus() {
  return {
    python: pythonStatus(),
    blender: blenderStatus(),
    triposr: triposrStatus(),
    hunyuan: hunyuanStatus(),
    meshroom: meshroomStatus(),
  };
}

function safeProjectId(projectId) {
  const safe = String(projectId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!safe) {
    throw new Error("Project id is required.");
  }
  return safe;
}

function projectPaths(projectId) {
  const safeId = safeProjectId(projectId);
  const root = path.join(projectsRoot, safeId);
  return {
    id: safeId,
    root,
    input: path.join(root, "input"),
    output: path.join(root, "output"),
    latestGlb: path.join(root, "latest.glb"),
    jobJson: path.join(root, "job.json"),
  };
}

function ensureProjectLayout(projectId) {
  const paths = projectPaths(projectId);
  ensureDir(paths.root);
  ensureDir(paths.input);
  ensureDir(paths.output);
  return paths;
}

module.exports = {
  backendDir,
  desktopDir,
  projectsRoot,
  settingsPath,
  settingKeys,
  ensureDir,
  configuredPath,
  configuredNumber,
  readLocalSettings,
  saveLocalSettings,
  getToolStatus,
  projectPaths,
  ensureProjectLayout,
  safeProjectId,
};
