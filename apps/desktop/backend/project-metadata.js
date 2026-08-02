const fs = require("fs");
const path = require("path");
const { ensureProjectLayout } = require("./config/paths");

const CATEGORIES = new Set([
  "chair", "table", "sofa", "lighting", "faucet", "surface", "free_object", "other",
]);
const UNITS = new Set(["cm", "m"]);
const ANGLES = new Set(["front", "side", "back", "top", "detail"]);

function now() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function legacyName(projectId) {
  return projectId.replace(/^project[_-]?/i, "Proyecto ").replace(/_/g, " ");
}

function defaultMetadata(projectId) {
  const timestamp = now();
  return {
    schemaVersion: 1,
    name: legacyName(projectId),
    category: "free_object",
    tags: [],
    favorite: false,
    archived: false,
    units: "cm",
    referenceMeasurement: null,
    scaleFactor: 1,
    references: [],
    versions: [],
    thumbnail: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeMetadata(projectId, raw) {
  const base = defaultMetadata(projectId);
  const value = raw && typeof raw === "object" ? raw : {};
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
    : [];
  const references = Array.isArray(value.references)
    ? value.references.filter((reference) => reference && typeof reference.path === "string").map((reference, index) => ({
        id: typeof reference.id === "string" ? reference.id : `ref_${index + 1}`,
        path: reference.path,
        filename: typeof reference.filename === "string" ? reference.filename : path.basename(reference.path),
        angle: ANGLES.has(reference.angle) ? reference.angle : "detail",
        primary: Boolean(reference.primary),
        width: Number.isFinite(reference.width) ? reference.width : undefined,
        height: Number.isFinite(reference.height) ? reference.height : undefined,
      })).slice(0, 4)
    : [];
  if (references.length && !references.some((reference) => reference.primary)) references[0].primary = true;
  return {
    ...base,
    ...value,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 120) : base.name,
    category: CATEGORIES.has(value.category) ? value.category : base.category,
    tags,
    favorite: Boolean(value.favorite),
    archived: Boolean(value.archived),
    units: UNITS.has(value.units) ? value.units : base.units,
    referenceMeasurement: value.referenceMeasurement && Number.isFinite(Number(value.referenceMeasurement.value)) && Number(value.referenceMeasurement.value) > 0
      ? { label: typeof value.referenceMeasurement.label === "string" ? value.referenceMeasurement.label.slice(0, 60) : "Medida de referencia", value: Number(value.referenceMeasurement.value), unit: UNITS.has(value.referenceMeasurement.unit) ? value.referenceMeasurement.unit : (UNITS.has(value.units) ? value.units : "cm") }
      : null,
    scaleFactor: Number.isFinite(Number(value.scaleFactor)) && Number(value.scaleFactor) > 0 ? Number(value.scaleFactor) : 1,
    references,
    versions: Array.isArray(value.versions) ? value.versions.filter((entry) => entry && typeof entry === "object").slice(-30) : [],
    thumbnail: typeof value.thumbnail === "string" ? value.thumbnail : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : base.createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : base.updatedAt,
  };
}

function readMetadata(projectId) {
  const paths = ensureProjectLayout(projectId);
  const metadata = normalizeMetadata(paths.id, readJson(paths.metadataJson, null));
  if (!fs.existsSync(paths.metadataJson)) writeMetadata(paths.id, metadata);
  return metadata;
}

function writeMetadata(projectId, patch) {
  const paths = ensureProjectLayout(projectId);
  const previous = fs.existsSync(paths.metadataJson) ? readJson(paths.metadataJson, {}) : defaultMetadata(paths.id);
  const next = normalizeMetadata(paths.id, { ...previous, ...patch, updatedAt: now() });
  fs.writeFileSync(paths.metadataJson, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function addUploadedReferences(projectId, files) {
  const metadata = readMetadata(projectId);
  const existing = metadata.references.filter((reference) => fs.existsSync(reference.path));
  const additions = files.map((file, index) => ({
    id: `ref_${Date.now()}_${index + 1}`,
    path: file.path,
    filename: file.originalName || file.filename,
    angle: "detail",
    primary: existing.length === 0 && index === 0,
    width: file.width,
    height: file.height,
  }));
  return writeMetadata(projectId, { references: [...existing, ...additions].slice(0, 4) });
}

function createVersion(projectId, mode, inputFiles) {
  const metadata = readMetadata(projectId);
  const version = {
    id: `v_${Date.now()}`,
    createdAt: now(),
    mode,
    inputFiles: Array.isArray(inputFiles) ? inputFiles : [],
    status: "queued",
  };
  const versions = [...metadata.versions, version];
  writeMetadata(projectId, { versions });
  return version;
}

function syncLatestVersion(projectId, job, latestGlb) {
  const metadata = readMetadata(projectId);
  if (!metadata.versions.length || !job?.mode) return metadata;
  const versions = [...metadata.versions];
  const last = { ...versions[versions.length - 1] };
  const nextStatus = job.status;
  const nextFinishedAt = job.finishedAt || last.finishedAt;
  const nextGlbPath = latestGlb || last.glbPath;
  if (last.status === nextStatus && last.finishedAt === nextFinishedAt && last.glbPath === nextGlbPath) return metadata;
  last.status = nextStatus;
  if (nextFinishedAt) last.finishedAt = nextFinishedAt;
  if (nextGlbPath) last.glbPath = nextGlbPath;
  versions[versions.length - 1] = last;
  return writeMetadata(projectId, { versions });
}

module.exports = { CATEGORIES, ANGLES, readMetadata, writeMetadata, addUploadedReferences, createVersion, syncLatestVersion };
