const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const {
  ensureDir,
  ensureProjectLayout,
  getToolStatus,
  projectPaths,
  projectsRoot,
  readLocalSettings,
  safeProjectId,
  saveLocalSettings,
  settingsPath,
} = require("./config/paths");
const { isValidGlb, logPath, readJob, startGeneration, writeJob } = require("./jobs/generate3d");

const host = process.env.VOLUMIA_BACKEND_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.VOLUMIA_BACKEND_PORT || "9360", 10) || 9360;
const app = express();

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      try {
        const paths = ensureProjectLayout(req.params.id);
        callback(null, paths.input);
      } catch (error) {
        callback(error);
      }
    },
    filename(_req, file, callback) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      callback(null, `${Date.now()}-${safeName}`);
    },
  }),
});

function projectPayload(projectId) {
  const paths = ensureProjectLayout(projectId);
  if (!fs.existsSync(paths.jobJson)) {
    writeJob(paths.id, {
      status: "idle",
      mode: null,
      message: "Proyecto listo.",
      warnings: [],
      logs: [],
    });
  }
  const hasModel = isValidGlb(paths.latestGlb);
  return {
    id: paths.id,
    root: paths.root,
    input: paths.input,
    output: paths.output,
    latestGlb: hasModel ? paths.latestGlb : null,
    modelUrl: hasModel ? `/api/projects/${encodeURIComponent(paths.id)}/model` : null,
    job: readJob(paths.id),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "volumia-local-mvp",
    version: "0.1.0-mvp",
    projectsRoot,
    logPath,
    startedAt: serverStartedAt,
  });
});

app.get("/health", (_req, res) => {
  res.redirect(307, "/api/health");
});

app.get("/api/tools/status", (_req, res) => {
  res.json({
    ok: true,
    tools: getToolStatus(),
  });
});

app.post("/api/tools/detect", (_req, res) => {
  res.json({
    ok: true,
    tools: getToolStatus(),
  });
});

app.get("/api/settings", (_req, res) => {
  res.json({
    ok: true,
    settings: readLocalSettings(),
    settingsPath,
    tools: getToolStatus(),
  });
});

app.post("/api/settings", (req, res) => {
  const settings = saveLocalSettings(req.body || {});
  res.json({
    ok: true,
    settings,
    settingsPath,
    tools: getToolStatus(),
  });
});

app.get("/api/projects", (_req, res) => {
  try {
    ensureDir(projectsRoot);
    const entries = fs.readdirSync(projectsRoot);
    const projects = entries
      .filter((entry) => {
        const fullPath = path.join(projectsRoot, entry);
        try {
          return fs.statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      })
      .map((id) => projectPayload(id))
      .sort((a, b) => {
        const aTime = a.job.createdAt ? new Date(a.job.createdAt).getTime() : 0;
        const bTime = b.job.createdAt ? new Date(b.job.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    res.json({
      ok: true,
      projects,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/api/projects", (req, res) => {
  const id = safeProjectId(req.body?.id || `project_${Date.now()}`);
  ensureProjectLayout(id);
  writeJob(id, {
    id: `job_${Date.now()}`,
    status: "idle",
    mode: null,
    message: "Proyecto listo.",
    createdAt: new Date().toISOString(),
    warnings: [],
    logs: [],
  });
  res.status(201).json(projectPayload(id));
});

app.post("/api/projects/:id/input", upload.array("images"), (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  const files = (req.files || []).map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    path: file.path,
    size: file.size,
  }));
  writeJob(paths.id, {
    status: "idle",
    message: `${files.length} imagen(es) cargada(s).`,
    inputFiles: fs.readdirSync(paths.input).map((fileName) => path.join(paths.input, fileName)),
  });
  res.json({
    ok: true,
    project: projectPayload(paths.id),
    files,
  });
});

app.post("/api/projects/:id/generate", (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  const mode = String(req.body?.mode || "demo");
  const job = writeJob(paths.id, {
    id: `job_${Date.now()}`,
    status: "queued",
    mode,
    message: "Job en cola.",
    warnings: [],
    logs: [],
    error: null,
  });
  startGeneration(paths.id, mode);
  res.status(202).json({
    ok: true,
    projectId: paths.id,
    job,
  });
});

app.get("/api/projects/:id/status", (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  res.json({
    ok: true,
    project: projectPayload(paths.id),
    job: readJob(paths.id),
  });
});

app.get("/api/projects/:id/model", (req, res) => {
  const paths = projectPaths(req.params.id);
  if (!isValidGlb(paths.latestGlb)) {
    res.status(404).json({ ok: false, error: "latest.glb not found." });
    return;
  }
  res.sendFile(paths.latestGlb);
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ ok: false, error: message });
});

ensureDir(projectsRoot);
const serverStartedAt = new Date().toISOString();
app.listen(port, host, () => {
  console.log(`[VOLUMIA][mvp-backend] http://${host}:${port}`);
});
