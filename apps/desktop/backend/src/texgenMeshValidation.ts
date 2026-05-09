import fs from "fs";
import path from "path";
import type { TexgenBounds, TexgenMeshValidation } from "./texgenTypes";

const MIN_MESH_FILE_SIZE_BYTES = 512;
const MIN_VERTEX_COUNT = 24;
const MIN_FACE_COUNT = 12;
const MIN_BOUND_DIAGONAL = 1e-4;
const MIN_BOUND_VOLUME = 1e-10;
const INVALID_FLATNESS_RATIO = 0.0015;
const WARNING_FLATNESS_RATIO = 0.01;
const MAX_COMPONENTS_WARNING = 32;

type ObjMeshStats = {
  vertexCount: number;
  faceCount: number;
  hasNormals: boolean;
  bounds: TexgenBounds | null;
  flatnessRatio: number | null;
  componentCount: number | null;
};

function buildBounds(
  min: [number, number, number],
  max: [number, number, number],
): TexgenBounds {
  const size: [number, number, number] = [
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
  ];
  const diagonal = Math.hypot(size[0], size[1], size[2]);
  return {
    min,
    max,
    size,
    diagonal,
    volume: Math.max(0, size[0]) * Math.max(0, size[1]) * Math.max(0, size[2]),
  };
}

function resolveFlatnessRatio(bounds: TexgenBounds | null) {
  if (!bounds) {
    return null;
  }
  const dimensions = bounds.size
    .map((value) => Math.abs(value))
    .filter((value) => Number.isFinite(value));
  if (dimensions.length !== 3) {
    return null;
  }
  const minDimension = Math.min(...dimensions);
  const maxDimension = Math.max(...dimensions);
  if (maxDimension <= 0) {
    return 0;
  }
  return minDimension / maxDimension;
}

function parseFaceVertexIndex(token: string) {
  const [vertexIndexRaw] = token.split("/");
  const parsed = Number.parseInt(vertexIndexRaw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function countConnectedComponents(
  vertexCount: number,
  faces: number[][],
) {
  if (vertexCount <= 0 || faces.length === 0) {
    return 0;
  }

  const adjacency = new Map<number, Set<number>>();
  for (const face of faces) {
    for (const index of face) {
      if (!adjacency.has(index)) {
        adjacency.set(index, new Set<number>());
      }
    }
    for (let index = 0; index < face.length; index += 1) {
      const current = face[index]!;
      const next = face[(index + 1) % face.length]!;
      adjacency.get(current)?.add(next);
      adjacency.get(next)?.add(current);
    }
  }

  const seen = new Set<number>();
  let componentCount = 0;
  for (const start of adjacency.keys()) {
    if (seen.has(start)) {
      continue;
    }
    componentCount += 1;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (seen.has(neighbor)) {
          continue;
        }
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return componentCount;
}

function parseObjMeshStats(meshPath: string): ObjMeshStats {
  const source = fs.readFileSync(meshPath, "utf8");
  const lines = source.split(/\r?\n/u);
  let vertexCount = 0;
  let faceCount = 0;
  let hasNormals = false;
  let min: [number, number, number] | null = null;
  let max: [number, number, number] | null = null;
  const faces: number[][] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("v ")) {
      const [, xRaw, yRaw, zRaw] = line.split(/\s+/u);
      const x = Number.parseFloat(xRaw ?? "");
      const y = Number.parseFloat(yRaw ?? "");
      const z = Number.parseFloat(zRaw ?? "");
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z)
      ) {
        continue;
      }
      vertexCount += 1;
      if (!min || !max) {
        min = [x, y, z];
        max = [x, y, z];
      } else {
        min = [
          Math.min(min[0], x),
          Math.min(min[1], y),
          Math.min(min[2], z),
        ];
        max = [
          Math.max(max[0], x),
          Math.max(max[1], y),
          Math.max(max[2], z),
        ];
      }
      continue;
    }
    if (line.startsWith("vn ")) {
      hasNormals = true;
      continue;
    }
    if (!line.startsWith("f ")) {
      continue;
    }
    const tokens = line.split(/\s+/u).slice(1);
    const vertexIndices = tokens
      .map((token) => parseFaceVertexIndex(token))
      .filter((value): value is number => value !== null)
      .map((value) => (value > 0 ? value - 1 : value));
    if (vertexIndices.length < 3) {
      continue;
    }
    faceCount += Math.max(1, vertexIndices.length - 2);
    const normalized = vertexIndices.filter((value) => value >= 0);
    if (normalized.length >= 3 && normalized.length <= 64) {
      faces.push(normalized);
    }
  }

  const bounds = min && max ? buildBounds(min, max) : null;
  return {
    vertexCount,
    faceCount,
    hasNormals,
    bounds,
    flatnessRatio: resolveFlatnessRatio(bounds),
    componentCount:
      faces.length > 0 ? countConnectedComponents(vertexCount, faces) : null,
  };
}

function readGlbJsonChunk(filePath: string) {
  const file = fs.readFileSync(filePath);
  if (file.length < 20) {
    return null;
  }
  const magic = file.readUInt32LE(0);
  const version = file.readUInt32LE(4);
  if (magic !== 0x46546c67 || version < 2) {
    return null;
  }
  const jsonChunkLength = file.readUInt32LE(12);
  const jsonChunkType = file.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    return null;
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonEnd > file.length) {
    return null;
  }
  const parsed = JSON.parse(file.slice(jsonStart, jsonEnd).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

function resolveAccessorBounds(
  accessor: Record<string, unknown> | undefined,
) {
  const minArray = Array.isArray(accessor?.min) ? accessor.min : null;
  const maxArray = Array.isArray(accessor?.max) ? accessor.max : null;
  if (!minArray || !maxArray || minArray.length < 3 || maxArray.length < 3) {
    return null;
  }
  const min = minArray.slice(0, 3).map((value) => Number(value));
  const max = maxArray.slice(0, 3).map((value) => Number(value));
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    return null;
  }
  return buildBounds(
    [min[0]!, min[1]!, min[2]!],
    [max[0]!, max[1]!, max[2]!],
  );
}

function parseGltfMeshStats(meshPath: string) {
  const ext = path.extname(meshPath).toLowerCase();
  let parsed: Record<string, unknown> | null = null;
  if (ext === ".glb") {
    parsed = readGlbJsonChunk(meshPath);
  } else if (ext === ".gltf") {
    const raw = fs.readFileSync(meshPath, "utf8");
    const json = JSON.parse(raw) as unknown;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      parsed = json as Record<string, unknown>;
    }
  }
  if (!parsed) {
    return {
      vertexCount: 0,
      faceCount: 0,
      hasNormals: false,
      bounds: null,
      flatnessRatio: null,
      componentCount: null,
    };
  }

  const accessors = Array.isArray(parsed.accessors) ? parsed.accessors : [];
  const meshes = Array.isArray(parsed.meshes) ? parsed.meshes : [];
  let vertexCount = 0;
  let faceCount = 0;
  let hasNormals = false;
  let bounds: TexgenBounds | null = null;

  for (const mesh of meshes) {
    if (!mesh || typeof mesh !== "object" || Array.isArray(mesh)) {
      continue;
    }
    const primitives = Array.isArray((mesh as Record<string, unknown>).primitives)
      ? ((mesh as Record<string, unknown>).primitives as unknown[])
      : [];
    for (const primitive of primitives) {
      if (
        !primitive ||
        typeof primitive !== "object" ||
        Array.isArray(primitive)
      ) {
        continue;
      }
      const primitiveRecord = primitive as Record<string, unknown>;
      const attributes =
        primitiveRecord.attributes &&
        typeof primitiveRecord.attributes === "object" &&
        !Array.isArray(primitiveRecord.attributes)
          ? (primitiveRecord.attributes as Record<string, unknown>)
          : {};

      const positionAccessorIndex = Number.parseInt(
        String(attributes.POSITION ?? ""),
        10,
      );
      if (Number.isFinite(positionAccessorIndex) && positionAccessorIndex >= 0) {
        const accessor = accessors[positionAccessorIndex];
        if (accessor && typeof accessor === "object" && !Array.isArray(accessor)) {
          const accessorRecord = accessor as Record<string, unknown>;
          const accessorCount = Number.parseInt(
            String(accessorRecord.count ?? "0"),
            10,
          );
          if (Number.isFinite(accessorCount) && accessorCount > 0) {
            vertexCount += accessorCount;
          }
          const accessorBounds = resolveAccessorBounds(accessorRecord);
          if (accessorBounds) {
            if (!bounds) {
              bounds = accessorBounds;
            } else {
              bounds = buildBounds(
                [
                  Math.min(bounds.min[0], accessorBounds.min[0]),
                  Math.min(bounds.min[1], accessorBounds.min[1]),
                  Math.min(bounds.min[2], accessorBounds.min[2]),
                ],
                [
                  Math.max(bounds.max[0], accessorBounds.max[0]),
                  Math.max(bounds.max[1], accessorBounds.max[1]),
                  Math.max(bounds.max[2], accessorBounds.max[2]),
                ],
              );
            }
          }
        }
      }

      const normalAccessorIndex = Number.parseInt(
        String(attributes.NORMAL ?? ""),
        10,
      );
      if (Number.isFinite(normalAccessorIndex) && normalAccessorIndex >= 0) {
        hasNormals = true;
      }

      const indexAccessorIndex = Number.parseInt(
        String(primitiveRecord.indices ?? ""),
        10,
      );
      if (Number.isFinite(indexAccessorIndex) && indexAccessorIndex >= 0) {
        const accessor = accessors[indexAccessorIndex];
        if (accessor && typeof accessor === "object" && !Array.isArray(accessor)) {
          const accessorCount = Number.parseInt(
            String((accessor as Record<string, unknown>).count ?? "0"),
            10,
          );
          if (Number.isFinite(accessorCount) && accessorCount > 0) {
            faceCount += Math.floor(accessorCount / 3);
          }
        }
      }
    }
  }

  return {
    vertexCount,
    faceCount,
    hasNormals,
    bounds,
    flatnessRatio: resolveFlatnessRatio(bounds),
    componentCount: null,
  };
}

function validateMeshStats(
  meshPath: string,
  stats: ObjMeshStats,
  format: TexgenMeshValidation["format"],
  fileSizeBytes: number,
) {
  const warnings: string[] = [];
  if (fileSizeBytes < MIN_MESH_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `Mesh file is too small (${fileSizeBytes} bytes).`,
      warnings,
    };
  }
  if (stats.vertexCount < MIN_VERTEX_COUNT) {
    return {
      ok: false,
      reason: `Mesh has too few vertices (${stats.vertexCount}).`,
      warnings,
    };
  }
  if (stats.faceCount < MIN_FACE_COUNT) {
    return {
      ok: false,
      reason: `Mesh has too few faces (${stats.faceCount}).`,
      warnings,
    };
  }
  if (!stats.bounds) {
    warnings.push("Bounding box could not be resolved from mesh data.");
  } else {
    if (stats.bounds.diagonal <= MIN_BOUND_DIAGONAL) {
      return {
        ok: false,
        reason: "Mesh bounding box is collapsed or absurdly small.",
        warnings,
      };
    }
    if (stats.bounds.volume <= MIN_BOUND_VOLUME) {
      warnings.push("Mesh bounding box volume is extremely small.");
    }
  }

  if (stats.flatnessRatio !== null && stats.flatnessRatio <= INVALID_FLATNESS_RATIO) {
    return {
      ok: false,
      reason: `Mesh appears degenerate or sheet-like (flatness_ratio=${stats.flatnessRatio.toFixed(5)}).`,
      warnings,
    };
  }

  if (stats.flatnessRatio !== null && stats.flatnessRatio <= WARNING_FLATNESS_RATIO) {
    warnings.push(
      `Mesh is very flat for texgen (flatness_ratio=${stats.flatnessRatio.toFixed(5)}).`,
    );
  }

  if (
    stats.componentCount !== null &&
    stats.componentCount > MAX_COMPONENTS_WARNING
  ) {
    warnings.push(
      `Mesh has many disconnected components (${stats.componentCount}).`,
    );
  }

  return {
    ok: true,
    reason: undefined,
    warnings,
    format,
  };
}

export function validateMeshForTexGen(meshPath: string): TexgenMeshValidation {
  const resolvedPath = path.resolve(meshPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const format: TexgenMeshValidation["format"] =
    ext === ".obj"
      ? "obj"
      : ext === ".glb"
        ? "glb"
        : ext === ".gltf"
          ? "gltf"
          : "unknown";

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      meshPath: resolvedPath,
      format,
      fileSizeBytes: 0,
      readable: false,
      vertexCount: 0,
      faceCount: 0,
      componentCount: null,
      hasNormals: false,
      normalsRegenerable: false,
      flatnessRatio: null,
      bounds: null,
      warnings: [],
      reason: "Mesh file does not exist.",
    };
  }

  const fileSizeBytes = fs.statSync(resolvedPath).size;
  try {
    const stats =
      format === "obj"
        ? parseObjMeshStats(resolvedPath)
        : parseGltfMeshStats(resolvedPath);
    const evaluation = validateMeshStats(
      resolvedPath,
      stats,
      format,
      fileSizeBytes,
    );
    return {
      ok: evaluation.ok,
      meshPath: resolvedPath,
      format,
      fileSizeBytes,
      readable: true,
      vertexCount: stats.vertexCount,
      faceCount: stats.faceCount,
      componentCount: stats.componentCount,
      hasNormals: stats.hasNormals,
      normalsRegenerable: stats.vertexCount > 0 && stats.faceCount > 0,
      flatnessRatio: stats.flatnessRatio,
      bounds: stats.bounds,
      warnings: evaluation.warnings,
      reason:
        evaluation.reason ??
        (format === "unknown"
          ? "Mesh format is not recognized for texgen preflight."
          : undefined),
    };
  } catch (error) {
    return {
      ok: false,
      meshPath: resolvedPath,
      format,
      fileSizeBytes,
      readable: false,
      vertexCount: 0,
      faceCount: 0,
      componentCount: null,
      hasNormals: false,
      normalsRegenerable: false,
      flatnessRatio: null,
      bounds: null,
      warnings: [],
      reason:
        error instanceof Error
          ? `Mesh preflight could not read the file: ${error.message}`
          : "Mesh preflight could not read the file.",
    };
  }
}
