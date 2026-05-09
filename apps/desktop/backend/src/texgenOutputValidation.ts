import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { TexgenOutputValidation, TexturedGlbValidation } from "./texgenTypes";

function parseGlbJsonChunk(glbPath: string): Record<string, unknown> | null {
  try {
    const file = fs.readFileSync(glbPath);
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
    const jsonText = file.slice(jsonStart, jsonEnd).toString("utf8");
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sha1OfFile(filePath: string) {
  const hash = crypto.createHash("sha1");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function validateTexturedGlb(glbPath: string): TexturedGlbValidation {
  if (!fs.existsSync(glbPath)) {
    return {
      ok: false,
      hasMaterials: false,
      hasImages: false,
      hasTextures: false,
      hasMaterialTextureBinding: false,
      reason: "Textured GLB file was not generated.",
      fileSizeBytes: 0,
    };
  }

  const parsed = parseGlbJsonChunk(glbPath);
  const fileSizeBytes = fs.statSync(glbPath).size;
  if (!parsed) {
    return {
      ok: false,
      hasMaterials: false,
      hasImages: false,
      hasTextures: false,
      hasMaterialTextureBinding: false,
      reason: "No se pudo parsear GLB/JSON chunk para validar texturas.",
      fileSizeBytes,
    };
  }

  const materials = Array.isArray(parsed.materials) ? parsed.materials : [];
  const images = Array.isArray(parsed.images) ? parsed.images : [];
  const textures = Array.isArray(parsed.textures) ? parsed.textures : [];

  const hasMaterialTextureBinding = materials.some((material) => {
    if (!material || typeof material !== "object" || Array.isArray(material)) {
      return false;
    }
    const node = material as Record<string, unknown>;
    const pbr =
      node.pbrMetallicRoughness &&
      typeof node.pbrMetallicRoughness === "object" &&
      !Array.isArray(node.pbrMetallicRoughness)
        ? (node.pbrMetallicRoughness as Record<string, unknown>)
        : null;

    return Boolean(
      pbr?.baseColorTexture ||
        pbr?.metallicRoughnessTexture ||
        node.normalTexture ||
        node.occlusionTexture ||
        node.emissiveTexture,
    );
  });

  const validation: TexturedGlbValidation = {
    ok:
      fileSizeBytes > 4096 &&
      materials.length > 0 &&
      images.length > 0 &&
      textures.length > 0 &&
      hasMaterialTextureBinding,
    hasMaterials: materials.length > 0,
    hasImages: images.length > 0,
    hasTextures: textures.length > 0,
    hasMaterialTextureBinding,
    fileSizeBytes,
  };

  if (!validation.ok) {
    validation.reason =
      fileSizeBytes <= 4096
        ? "Generated GLB is too small to be a valid textured output."
        : "GLB generado sin binding de texturas/materiales reales (solo color base o material uniforme).";
  }

  return validation;
}

export function validateTexgenOutput(params: {
  outputPath: string;
  sourceMeshPath: string;
}): TexgenOutputValidation {
  const outputPath = path.resolve(params.outputPath);
  const sourceMeshPath = path.resolve(params.sourceMeshPath);
  const validation = validateTexturedGlb(outputPath);
  const samePath =
    path.normalize(outputPath).toLowerCase() ===
    path.normalize(sourceMeshPath).toLowerCase();
  let sameAsSourceMesh = samePath;

  if (
    !sameAsSourceMesh &&
    fs.existsSync(outputPath) &&
    fs.existsSync(sourceMeshPath) &&
    fs.statSync(outputPath).size === fs.statSync(sourceMeshPath).size
  ) {
    try {
      sameAsSourceMesh = sha1OfFile(outputPath) === sha1OfFile(sourceMeshPath);
    } catch {
      sameAsSourceMesh = false;
    }
  }

  if (sameAsSourceMesh) {
    return {
      ...validation,
      ok: false,
      outputPath,
      sameAsSourceMesh: true,
      reason: "Generated output matches the source mesh fallback and contains no validated textured result.",
    };
  }

  return {
    ...validation,
    outputPath,
    sameAsSourceMesh: false,
  };
}
