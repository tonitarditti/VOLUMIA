const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  ensureDir,
  ensureProjectLayout,
  getToolStatus,
  projectPaths,
} = require("../config/paths");
const { isValidGlb, readJob, writeJob } = require("./generate3d");
const { readMetadata, writeMetadata } = require("../project-metadata");
const active = new Map();

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function validateDae(daePath, expectedPieces) {
  try {
    const content = fs.readFileSync(daePath, "utf8");
    const pieceNodes = (content.match(/(?:name|id)="Pieza_\d+"/g) || []).length;
    return {
      exists: fs.existsSync(daePath),
      bytes: Buffer.byteLength(content),
      expectedPieces,
      pieceNodes,
      preservesPieceNodes: expectedPieces > 0 && pieceNodes >= expectedPieces,
    };
  } catch (error) {
    return {
      exists: false,
      bytes: 0,
      expectedPieces,
      pieceNodes: 0,
      preservesPieceNodes: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sourceFor(metadata, paths, versionId) {
  const version =
    versionId && metadata.versions.find((item) => item.id === versionId);
  return version?.glbPath && isValidGlb(version.glbPath)
    ? version.glbPath
    : paths.latestGlb;
}
function run(projectId, operation, options = {}) {
  const paths = ensureProjectLayout(projectId);
  const tools = getToolStatus();
  if (!tools.blender.exists)
    throw new Error(
      "Blender no está configurado; esta operación requiere una salida real de Blender.",
    );
  if (active.has(paths.id)) throw new Error("Ya hay una preparación en curso.");
  const metadata = readMetadata(paths.id);
  const source = sourceFor(metadata, paths, options.sourceVersionId);
  if (!isValidGlb(source))
    throw new Error("No existe un GLB válido para preparar.");
  const version = {
    id: `v_${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: "prepared",
    operation,
    status: "running",
    sourceGlbPath: source,
    inputFiles: [],
    actions: [{ operation, options }],
  };
  const dir = ensureDir(path.join(paths.versions, version.id));
  const output = path.join(dir, "asset.glb");
  const dae = path.join(dir, "asset.dae");
  const manifest = path.join(dir, "asset.volumia.json");
  writeMetadata(paths.id, { versions: [...metadata.versions, version] });
  writeJob(paths.id, {
    ...readJob(paths.id),
    status: "running",
    message: "Analizando activo…",
    preparation: { versionId: version.id, operation, percent: 5 },
  });
  const args = [
    "--background",
    "--python",
    path.join(__dirname, "..", "tools", "prepare_sketchup_asset.py"),
    "--",
    "--input",
    source,
    "--output",
    output,
    "--operation",
    operation,
    "--scale",
    String(options.scale || 1),
    "--ratio",
    String(options.ratio || 0.5),
    "--dae",
    dae,
    "--manifest",
    manifest,
    "--project-name",
    metadata.name,
    "--version-id",
    version.id,
    "--preset",
    options.preset || "equilibrado",
  ];
  const child = spawn(tools.blender.path, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  active.set(paths.id, child);
  let logs = [];
  const outputLine = (line) => {
    logs = [...logs, line].slice(-200);
    const stage = line.match(/STAGE:(.+)/)?.[1];
    if (stage)
      writeJob(paths.id, {
        message: stage,
        preparation: {
          versionId: version.id,
          operation,
          percent: {
            "Analizando estructura": 15,
            "Separando componentes": 40,
            Optimizando: 65,
            "Exportando DAE": 85,
            Finalizado: 100,
          }[stage] || 55,
        },
        logs: [...(readJob(paths.id).logs || []), line].slice(-200),
      });
  };
  child.stdout.on("data", (data) =>
    String(data).split(/\r?\n/).filter(Boolean).forEach(outputLine),
  );
  child.stderr.on("data", (data) => logs.push(String(data)));
  child.on("close", (code) => {
    active.delete(paths.id);
    const bridgeManifest = readJson(manifest, {});
    const editableStats = bridgeManifest.editableStats || null;
    const daeValidation = validateDae(dae, editableStats?.pieces || 0);
    const complete =
      code === 0 &&
      isValidGlb(output) &&
      daeValidation.exists &&
      daeValidation.preservesPieceNodes &&
      Boolean(editableStats);
    const next = readMetadata(paths.id);
    const versions = next.versions.map((item) =>
      item.id === version.id
        ? {
            ...item,
            status: complete ? "complete" : "error",
            finishedAt: new Date().toISOString(),
            glbPath: isValidGlb(output) ? output : undefined,
            daePath: fs.existsSync(dae) ? dae : undefined,
            bridgeMetadataPath: complete ? manifest : undefined,
            sourceStats: bridgeManifest.sourceStats,
            editableStats,
            separation: bridgeManifest.separation,
            optimization: bridgeManifest.optimization,
            daeValidation,
            logs,
          }
        : item,
    );
    writeMetadata(paths.id, { versions });
    writeJob(
      paths.id,
      complete
        ? {
            status: "complete",
            message: `Activo editable preparado: ${editableStats.pieces} piezas y ${editableStats.materials} materiales.`,
            latestGlb: paths.latestGlb,
            preparation: { versionId: version.id, operation, percent: 100 },
          }
        : {
            status: "error",
            message: logs.join("\n") || "Blender no pudo preparar el activo.",
          },
    );
  });
  return version;
}
async function cancel(projectId) {
  const child = active.get(projectId);
  if (!child) return false;
  child.kill();
  return true;
}
module.exports = { run, cancel };
