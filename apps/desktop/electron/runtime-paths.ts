import fs from "fs";
import path from "path";

export type RuntimePaths = {
  root: string;
  userData: string;
  userConfig: string;
  userState: string;
  userProjects: string;
  sessionData: string;
  sessionCache: string;
  sessionCookies: string;
  sessionGpuCache: string;
  backend: string;
  backendJobs: string;
  backendTemp: string;
  backendTextures: string;
  backendMeshes: string;
  backendExports: string;
  logs: string;
  crashDumps: string;
};

const DEFAULT_RUNTIME_ROOT = "F:\\VOLUMIA_RUNTIME";

export function resolveRuntimeRoot() {
  const raw = process.env.VOLUMIA_RUNTIME_DIR?.trim() || DEFAULT_RUNTIME_ROOT;
  return path.resolve(raw);
}

export function resolveRuntimePaths(runtimeRoot = resolveRuntimeRoot()): RuntimePaths {
  const root = path.resolve(runtimeRoot);
  const userData = path.join(root, "userData");
  const sessionData = path.join(root, "sessionData");
  const backend = path.join(root, "backend");
  return {
    root,
    userData,
    userConfig: path.join(userData, "config"),
    userState: path.join(userData, "state"),
    userProjects: path.join(userData, "projects"),
    sessionData,
    sessionCache: path.join(sessionData, "cache"),
    sessionCookies: path.join(sessionData, "cookies"),
    sessionGpuCache: path.join(sessionData, "gpu-cache"),
    backend,
    backendJobs: path.join(backend, "jobs"),
    backendTemp: path.join(backend, "temp"),
    backendTextures: path.join(backend, "textures"),
    backendMeshes: path.join(backend, "meshes"),
    backendExports: path.join(backend, "exports"),
    logs: path.join(root, "logs"),
    crashDumps: path.join(root, "crashDumps"),
  };
}

export function ensureRuntimeLayout(paths: RuntimePaths): RuntimePaths {
  const dirs = [
    paths.root,
    paths.userData,
    paths.userConfig,
    paths.userState,
    paths.userProjects,
    paths.sessionData,
    paths.sessionCache,
    paths.sessionCookies,
    paths.sessionGpuCache,
    paths.backend,
    paths.backendJobs,
    paths.backendTemp,
    paths.backendTextures,
    paths.backendMeshes,
    paths.backendExports,
    paths.logs,
    paths.crashDumps,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
