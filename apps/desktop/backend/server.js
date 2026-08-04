const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { execFile } = require("child_process");
const {
  ensureDir,
  ensureProjectLayout,
  getToolStatus,
  recordToolVerification,
  projectPaths,
  projectsRoot,
  readLocalSettings,
  safeProjectId,
  saveLocalSettings,
  settingsPath,
} = require("./config/paths");
const {
  cancelGeneration,
  createGenerationProgress,
  isValidGlb,
  logPath,
  readJob,
  reconcileInterruptedJobs,
  startGeneration,
  writeJob,
} = require("./jobs/generate3d");
const {
  addUploadedReferences,
  createVersion,
  readMetadata,
  syncLatestVersion,
  writeMetadata,
} = require("./project-metadata");
const {
  run: runPreparation,
  cancel: cancelPreparation,
} = require("./jobs/prepareAsset");

const host = process.env.VOLUMIA_BACKEND_HOST || "127.0.0.1";
const port =
  Number.parseInt(process.env.VOLUMIA_BACKEND_PORT || "9360", 10) || 9360;
const app = express();

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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
  const job = readJob(paths.id);
  const metadata = syncLatestVersion(
    paths.id,
    job,
    hasModel ? paths.latestGlb : null,
  );
  return {
    id: paths.id,
    root: paths.root,
    input: paths.input,
    output: paths.output,
    latestGlb: hasModel ? paths.latestGlb : null,
    modelUrl: hasModel
      ? `/api/projects/${encodeURIComponent(paths.id)}/model`
      : null,
    job,
    metadata,
  };
}

function imageDimensions(buffer, mimetype) {
  if (
    mimetype === "image/png" &&
    buffer.length > 24 &&
    buffer.subarray(1, 4).toString() === "PNG"
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimetype === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      if (!size || offset + 2 + size > buffer.length) break;
      offset += 2 + size;
    }
  }
  if (
    mimetype === "image/webp" &&
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  ) {
    return { width: 0, height: 0 };
  }
  return null;
}

function validateUploadedImages(files) {
  if (!files.length || files.length > 4)
    throw new Error("Cargá entre 1 y 4 imágenes.");
  return files.map((file) => {
    const buffer = fs.readFileSync(file.path);
    const dimensions = imageDimensions(buffer, file.mimetype);
    if (!dimensions)
      throw new Error(
        `${file.originalname}: el archivo no es una imagen PNG, JPG o WebP válida.`,
      );
    if (
      dimensions.width &&
      (dimensions.width < 256 || dimensions.height < 256)
    ) {
      throw new Error(
        `${file.originalname}: la resolución mínima es 256 × 256 px.`,
      );
    }
    return {
      ...file,
      width: dimensions.width || undefined,
      height: dimensions.height || undefined,
    };
  });
}

function runNvidiaSmi() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      [
        "--query-gpu=name,memory.total,memory.free",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 3000 },
      (error, stdout) => {
        if (error)
          return resolve({
            available: false,
            details:
              error.code === "ENOENT"
                ? "nvidia-smi no está disponible."
                : error.message,
          });
        const [name = "GPU", total = "", free = ""] = String(stdout)
          .trim()
          .split(/\s*,\s*/);
        resolve({
          available: true,
          name,
          totalMiB: Number(total) || null,
          freeMiB: Number(free) || null,
        });
      },
    );
  });
}

function runExecutable(file, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          error: error ? (stderr || stdout || error.message).trim() : null,
          stdout: String(stdout || ""),
        });
      },
    );
  });
}

async function testTool(target) {
  const tools = getToolStatus();
  if (target === "blender") {
    if (!tools.blender.exists)
      return {
        state: "No instalado",
        details: "Blender no está configurado o blender.exe no existe.",
      };
    const result = await runExecutable(tools.blender.path, ["--version"]);
    return result.ok
      ? {
          state: "Verificado",
          details: "Blender se ejecutó correctamente en modo seguro.",
        }
      : {
          state: "Error",
          details: `Blender no pudo ejecutarse: ${result.error}`,
        };
  }
  if (target === "sketchup") {
    return tools.sketchup.exists
      ? { state: "Verificado", details: "SketchUp.exe existe y es accesible." }
      : {
          state: "No instalado",
          details: "SketchUp.exe no existe en la ruta configurada.",
        };
  }
  if (target === "dae") {
    if (!tools.blender.exists)
      return {
        state: "No instalado",
        details: "La exportación DAE requiere Blender configurado.",
      };
    const tempDir = fs.mkdtempSync(
      path.join(require("os").tmpdir(), "volumia-dae-check-"),
    );
    const output = path.join(tempDir, "verification.dae");
    const script = [
      "import bpy, sys",
      "bpy.ops.wm.read_factory_settings(use_empty=True)",
      "bpy.ops.mesh.primitive_cube_add()",
      "bpy.ops.wm.collada_export(filepath=sys.argv[sys.argv.index('--') + 1])",
    ].join("; ");
    try {
      const result = await runExecutable(
        tools.blender.path,
        ["--background", "--python-expr", script, "--", output],
        60000,
      );
      const exported = fs.existsSync(output) && fs.statSync(output).size > 0;
      return result.ok && exported
        ? {
            state: "Verificado",
            details: "Blender exportó una escena temporal a DAE correctamente.",
          }
        : {
            state: "Error",
            details: `No se generó un DAE válido: ${result.error || "archivo ausente"}`,
          };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  if (target === "sketchupBridge") {
    if (!tools.sketchupBridge.exists)
      return {
        state: "No instalado",
        details: "VOLUMIA_Bridge.rb no está en la carpeta Plugins configurada.",
      };
    return tools.sketchupBridge.verificationStatus === "Verificado"
      ? {
          state: "Verificado",
          details: "La extensión Ruby de VOLUMIA respondió desde SketchUp.",
        }
      : tools.sketchupBridge.verificationStatus === "Error"
        ? { state: "Error", details: tools.sketchupBridge.details }
        : {
            state: "Configurado",
            details:
              "El bridge está instalado; abrí SketchUp una vez para comprobar su respuesta.",
          };
  }
  throw new Error("Herramienta de diagnóstico no compatible.");
}

function sketchupAssetStatus(tools) {
  const ready =
    tools.blender.verificationStatus === "Verificado" &&
    tools.sketchup.verificationStatus === "Verificado" &&
    tools.dae.verificationStatus === "Verificado";
  const missing = [];
  if (tools.blender.verificationStatus !== "Verificado")
    missing.push("Blender sin verificar");
  if (tools.sketchup.verificationStatus !== "Verificado")
    missing.push("SketchUp sin verificar");
  if (tools.dae.verificationStatus !== "Verificado")
    missing.push("exportación DAE sin verificar");
  return {
    available: ready,
    details: ready
      ? "Activo SketchUp habilitado: salida GLB + DAE disponible."
      : `Activo SketchUp requiere: ${missing.join(", ")}.`,
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

app.post("/api/tools/test", async (req, res) => {
  try {
    const target = String(req.body?.target || "");
    const result = await testTool(target);
    recordToolVerification(target, result);
    res.json({ ok: true, target, result, tools: getToolStatus() });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/diagnostics", async (_req, res) => {
  const tools = getToolStatus();
  let disk = null;
  try {
    const stat = fs.statfsSync(projectsRoot);
    disk = {
      availableBytes: Number(stat.bavail) * Number(stat.bsize),
      totalBytes: Number(stat.blocks) * Number(stat.bsize),
    };
  } catch {
    disk = { availableBytes: null, totalBytes: null };
  }
  const gpu = await runNvidiaSmi();
  res.json({
    ok: true,
    checks: {
      backend: { available: true, details: `Escuchando en ${host}:${port}` },
      python: tools.python,
      cuda: gpu,
      triposr: tools.triposr,
      hunyuan: tools.hunyuan,
      blender: tools.blender,
      sketchup: tools.sketchup,
      dae: tools.dae,
      sketchupBridge: tools.sketchupBridge,
      activeSketchUp: sketchupAssetStatus(tools),
      conversion: {
        available: tools.dae.verificationStatus === "Verificado",
        details: tools.dae.details,
      },
      storage: disk,
    },
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
  writeMetadata(id, {
    name: req.body?.name,
    category: req.body?.category,
    tags: req.body?.tags,
    units: req.body?.units,
    referenceMeasurement: req.body?.referenceMeasurement,
  });
  res.status(201).json(projectPayload(id));
});

app.post("/api/projects/:id/input", upload.array("images"), (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  let validated;
  try {
    validated = validateUploadedImages(req.files || []);
  } catch (error) {
    for (const file of req.files || []) fs.rmSync(file.path, { force: true });
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const files = validated.map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    path: file.path,
    size: file.size,
    width: file.width,
    height: file.height,
  }));
  addUploadedReferences(paths.id, files);
  writeJob(paths.id, {
    status: "idle",
    message: `${files.length} imagen(es) cargada(s).`,
    inputFiles: fs
      .readdirSync(paths.input)
      .map((fileName) => path.join(paths.input, fileName)),
  });
  res.json({
    ok: true,
    project: projectPayload(paths.id),
    files,
  });
});

app.patch("/api/projects/:id", (req, res) => {
  const paths = projectPaths(req.params.id);
  if (!fs.existsSync(paths.root)) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return;
  }
  try {
    const metadata = writeMetadata(paths.id, req.body || {});
    res.json({ ok: true, project: { ...projectPayload(paths.id), metadata } });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/projects/:id/duplicate", (req, res) => {
  try {
    const source = projectPaths(req.params.id);
    if (!fs.existsSync(source.root)) {
      res.status(404).json({ ok: false, error: "Project not found." });
      return;
    }
    const id = safeProjectId(req.body?.id || `project_${Date.now()}`);
    const target = projectPaths(id);
    if (fs.existsSync(target.root)) {
      res.status(409).json({
        ok: false,
        error: "Ya existe un proyecto con ese identificador.",
      });
      return;
    }
    fs.cpSync(source.root, target.root, {
      recursive: true,
      errorOnExist: true,
    });
    const sourceMetadata = readMetadata(source.id);
    const references = sourceMetadata.references.map((reference) => ({
      ...reference,
      path: reference.path.startsWith(source.root)
        ? path.join(target.root, path.relative(source.root, reference.path))
        : reference.path,
    }));
    writeMetadata(id, {
      ...sourceMetadata,
      name:
        typeof req.body?.name === "string" && req.body.name.trim()
          ? req.body.name
          : `${sourceMetadata.name} (copia)`,
      createdAt: new Date().toISOString(),
      versions: [],
      references,
    });
    writeJob(id, {
      id: `job_${Date.now()}`,
      projectId: id,
      status: "idle",
      message: "Copia del proyecto lista.",
      createdAt: new Date().toISOString(),
      warnings: [],
      logs: [],
    });
    res.status(201).json(projectPayload(id));
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/projects/:id/generate", (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  if (["queued", "running", "optimizing"].includes(readJob(paths.id).status)) {
    res.status(409).json({
      ok: false,
      error: "El proyecto ya tiene una generación en curso.",
    });
    return;
  }
  const mode = String(req.body?.mode || "demo");
  const metadata = readMetadata(paths.id);
  const referenceCount =
    metadata.references.length || fs.readdirSync(paths.input).length;
  if (mode === "photogrammetry" && referenceCount < 6) {
    res.status(400).json({
      ok: false,
      error:
        "La reconstrucción fotográfica requiere al menos 6 fotos con cobertura amplia.",
    });
    return;
  }
  const startedAt = new Date();
  const jobId = `job_${startedAt.getTime()}`;
  const job = writeJob(paths.id, {
    id: jobId,
    status: "queued",
    mode,
    message: "Validando referencias.",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    totalDurationMs: null,
    runner: null,
    resultFiles: [],
    progress: createGenerationProgress({
      jobId,
      startedAt: startedAt.getTime(),
    }),
    warnings: [],
    logs: [],
    error: null,
  });
  createVersion(paths.id, mode, readJob(paths.id).inputFiles || []);
  startGeneration(paths.id, mode);
  res.status(202).json({
    ok: true,
    projectId: paths.id,
    job,
  });
});

app.post("/api/projects/:id/prepare", (req, res) => {
  try {
    const operation = String(req.body?.operation || "");
    if (!["separate", "scale", "optimize"].includes(operation)) {
      res
        .status(400)
        .json({ ok: false, error: "Operación de preparación no compatible." });
      return;
    }
    const version = runPreparation(req.params.id, operation, {
      sourceVersionId: req.body?.sourceVersionId,
      scale: Number(req.body?.scale) || 1,
      ratio: Number(req.body?.ratio) || 0.5,
    });
    res
      .status(202)
      .json({ ok: true, version, project: projectPayload(req.params.id) });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/projects/:id/status", (req, res) => {
  const paths = ensureProjectLayout(req.params.id);
  res.json({
    ok: true,
    project: projectPayload(paths.id),
    job: readJob(paths.id),
  });
});

app.post("/api/projects/:id/cancel", async (req, res) => {
  try {
    if (await cancelPreparation(req.params.id)) {
      res.json({
        ok: true,
        projectId: req.params.id,
        job: readJob(req.params.id),
      });
      return;
    }
    const paths = projectPaths(req.params.id);
    if (!fs.existsSync(paths.root)) {
      res.status(404).json({ ok: false, error: "Project not found." });
      return;
    }

    const job = await cancelGeneration(paths.id);
    res.json({ ok: true, projectId: paths.id, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const paths = projectPaths(req.params.id);
    if (!fs.existsSync(paths.root)) {
      res.status(404).json({ ok: false, error: "Project not found." });
      return;
    }

    await cancelGeneration(paths.id, { waitForCompletion: true });

    fs.rmSync(paths.root, { recursive: true, force: true });
    res.json({ ok: true, id: paths.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message });
  }
});

app.get("/api/projects/:id/model", (req, res) => {
  const paths = projectPaths(req.params.id);
  if (!isValidGlb(paths.latestGlb)) {
    res.status(404).json({ ok: false, error: "latest.glb not found." });
    return;
  }
  res.sendFile(paths.latestGlb);
});

app.get("/api/projects/:id/versions/:versionId/dae", (req, res) => {
  const paths = projectPaths(req.params.id);
  const metadata = readMetadata(paths.id);
  const version = metadata.versions.find(
    (item) => item.id === req.params.versionId,
  );
  const daePath = version?.daePath;
  if (
    !daePath ||
    !daePath.startsWith(paths.versions) ||
    !fs.existsSync(daePath)
  ) {
    res
      .status(404)
      .json({ ok: false, error: "DAE de la versión no encontrado." });
    return;
  }
  res.download(daePath, `${paths.id}-${version.id}.dae`);
});

app.get("/api/projects/:id/reference/:referenceId", (req, res) => {
  const metadata = readMetadata(req.params.id);
  const reference = metadata.references.find(
    (item) => item.id === req.params.referenceId,
  );
  if (!reference || !fs.existsSync(reference.path)) {
    res.status(404).json({ ok: false, error: "Reference not found." });
    return;
  }
  res.sendFile(reference.path);
});

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ ok: false, error: message });
});

ensureDir(projectsRoot);
const reconciledProjects = reconcileInterruptedJobs();
const serverStartedAt = new Date().toISOString();
app.listen(port, host, () => {
  console.log(`[VOLUMIA][mvp-backend] http://${host}:${port}`);
  if (reconciledProjects.length > 0) {
    console.log(
      `[VOLUMIA][jobs] reconciled interrupted projects: ${reconciledProjects.join(", ")}`,
    );
  }
});
