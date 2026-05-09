const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..");
const desktopDir = path.resolve(backendDir, "..");
const defaultProjectsRoot = path.join(desktopDir, "projects");
const projectsRoot = path.resolve(process.env.VOLUMIA_ROOT || defaultProjectsRoot);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function configuredPath(envName) {
  const raw = process.env[envName];
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return path.resolve(raw.trim());
}

function toolStatus(name, envName, type) {
  const resolvedPath = configuredPath(envName);
  const exists = resolvedPath ? fs.existsSync(resolvedPath) : false;
  return {
    name,
    env: envName,
    type,
    configured: Boolean(resolvedPath),
    path: resolvedPath,
    exists,
    status: exists ? "Configurada" : "No configurada",
  };
}

function getToolStatus() {
  return {
    python: toolStatus("Python", "VOLUMIA_PYTHON", "file"),
    blender: toolStatus("Blender", "VOLUMIA_BLENDER", "file"),
    triposr: toolStatus("TripoSR", "VOLUMIA_TRIPOSR_DIR", "directory"),
    hunyuan: toolStatus("Hunyuan3D", "VOLUMIA_HUNYUAN_DIR", "directory"),
    meshroom: toolStatus("Meshroom", "VOLUMIA_MESHROOM_DIR", "directory"),
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
  ensureDir,
  configuredPath,
  getToolStatus,
  projectPaths,
  ensureProjectLayout,
  safeProjectId,
};
