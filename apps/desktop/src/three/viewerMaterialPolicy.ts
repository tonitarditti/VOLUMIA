import * as THREE from "three";

export type ViewerTextureStatus =
  | "success"
  | "failed"
  | "geometry_only"
  | "pending"
  | "running";

export type ViewerTextureValidation = {
  ok: boolean;
  hasMaterials: boolean;
  hasImages: boolean;
  hasTextures: boolean;
  hasMaterialTextureBinding: boolean;
  reason?: string;
};

export type ViewerRenderState =
  | "textured_final"
  | "texgen_failed"
  | "geometry_preview"
  | "invalid_asset";

export type ViewerMaterialPolicyContext = {
  textureStatus?: string;
  textureValidation?: ViewerTextureValidation;
};

export type ViewerMaterialPolicyResult = {
  renderState: ViewerRenderState;
  message: string;
  meshCount: number;
  materialCount: number;
  texturedMaterialCount: number;
  uvMeshCount: number;
  missingNormalCount: number;
  invalidMaterialCount: number;
  replacedMaterialCount: number;
  fallbackApplied: boolean;
  hasTextureMaps: boolean;
  hasValidUv: boolean;
};

export const VIEWER_FALLBACK_CLAY_COLOR = "#D9D4CC";
const VIEWER_FALLBACK_CLAY_ROUGHNESS = 0.82;
const VIEWER_FALLBACK_CLAY_METALNESS = 0.03;
const ABSOLUTE_BLACK_THRESHOLD = 0.035;

type InspectMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
};

function getTextureCandidates(material: InspectMaterial) {
  return [
    material.map,
    material.normalMap,
    material.roughnessMap,
    material.metalnessMap,
    material.aoMap,
    material.emissiveMap,
  ];
}

function hasUsableTexture(texture: THREE.Texture | null | undefined) {
  if (!texture) {
    return false;
  }
  const candidate = texture as THREE.Texture & {
    image?: unknown;
    source?: { data?: unknown };
  };
  return Boolean(candidate.image ?? candidate.source?.data);
}

function materialHasUsableTextureMaps(material: InspectMaterial) {
  return getTextureCandidates(material).some((texture) =>
    hasUsableTexture(texture),
  );
}

function colorIsAbsoluteBlack(color: THREE.Color | undefined) {
  if (!(color instanceof THREE.Color)) {
    return true;
  }
  return (
    color.r <= ABSOLUTE_BLACK_THRESHOLD &&
    color.g <= ABSOLUTE_BLACK_THRESHOLD &&
    color.b <= ABSOLUTE_BLACK_THRESHOLD
  );
}

function geometryHasUv(geometry: THREE.BufferGeometry | undefined) {
  const uv = geometry?.getAttribute("uv");
  return Boolean(uv && uv.count > 0 && uv.itemSize >= 2);
}

function ensureVertexNormals(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute("position");
  if (!geometry || !position || position.count === 0) {
    return false;
  }

  const normal = geometry.getAttribute("normal");
  if (normal && normal.count === position.count) {
    return false;
  }

  geometry.computeVertexNormals();
  geometry.normalizeNormals();
  geometry.attributes.normal.needsUpdate = true;
  return true;
}

function normalizeTextureStatus(status?: string): ViewerTextureStatus | "missing" | "timeout" | undefined {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === "success" ||
    normalized === "ready" ||
    normalized === "completed"
  ) {
    return "success";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "runtime_error" ||
    normalized === "process_start_failed" ||
    normalized === "no_output_generated" ||
    normalized === "invalid_output"
  ) {
    return "failed";
  }
  if (
    normalized === "skipped" ||
    normalized === "skipped_invalid_mesh" ||
    normalized === "skipped_invalid_image" ||
    normalized === "fallback_geometry_only"
  ) {
    return "geometry_only";
  }
  if (normalized === "missing") {
    return "missing";
  }
  if (normalized === "pending") {
    return "pending";
  }
  if (normalized === "running") {
    return "running";
  }
  if (
    normalized === "timeout" ||
    normalized === "timed_out" ||
    normalized === "stalled"
  ) {
    return "timeout";
  }
  return undefined;
}

export function createFallbackClayMaterial(name = "volumia-clay-fallback") {
  return new THREE.MeshStandardMaterial({
    name,
    color: VIEWER_FALLBACK_CLAY_COLOR,
    roughness: VIEWER_FALLBACK_CLAY_ROUGHNESS,
    metalness: VIEWER_FALLBACK_CLAY_METALNESS,
    emissive: new THREE.Color(0x000000),
    transparent: false,
    opacity: 1,
  });
}

export function applyFallbackClayMaterial(object3D: THREE.Object3D) {
  let replacedMaterialCount = 0;
  let missingNormalCount = 0;

  object3D.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (ensureVertexNormals(child)) {
      missingNormalCount += 1;
    }

    const currentMaterials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];
    const slotCount = Math.max(1, currentMaterials.length);
    const nextMaterials = Array.from({ length: slotCount }, (_, index) =>
      createFallbackClayMaterial(
        slotCount > 1
          ? `volumia-clay-fallback-${child.name || "mesh"}-${index + 1}`
          : `volumia-clay-fallback-${child.name || "mesh"}`,
      ),
    );

    child.material = Array.isArray(child.material)
      ? nextMaterials
      : nextMaterials[0]!;
    child.castShadow = true;
    child.receiveShadow = true;
    replacedMaterialCount += slotCount;
  });

  return {
    replacedMaterialCount,
    missingNormalCount,
  };
}

export function evaluateViewerMaterialPolicy(
  object3D: THREE.Object3D,
  context: ViewerMaterialPolicyContext,
): ViewerMaterialPolicyResult {
  let meshCount = 0;
  let materialCount = 0;
  let texturedMaterialCount = 0;
  let uvMeshCount = 0;
  let missingNormalCount = 0;
  let invalidMaterialCount = 0;
  let replacedMaterialCount = 0;

  object3D.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    meshCount += 1;
    const hasUv = geometryHasUv(child.geometry);
    if (hasUv) {
      uvMeshCount += 1;
    }
    if (ensureVertexNormals(child)) {
      missingNormalCount += 1;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];
    if (materials.length === 0) {
      invalidMaterialCount += 1;
      return;
    }

    for (const material of materials) {
      materialCount += 1;
      if (!material) {
        invalidMaterialCount += 1;
        continue;
      }

      const inspectMaterial = material as InspectMaterial;
      const hasMaps = materialHasUsableTextureMaps(inspectMaterial);
      if (hasMaps) {
        texturedMaterialCount += 1;
      }

      const blackWithoutMaps =
        !hasMaps && colorIsAbsoluteBlack(inspectMaterial.color);
      if (blackWithoutMaps) {
        invalidMaterialCount += 1;
      }
    }
  });

  const normalizedTextureStatus = normalizeTextureStatus(context.textureStatus);
  const validation = context.textureValidation;
  const hasTextureMaps = texturedMaterialCount > 0;
  const hasValidUv = uvMeshCount > 0;
  const isExplicitFailure =
    normalizedTextureStatus === "failed" ||
    normalizedTextureStatus === "missing" ||
    normalizedTextureStatus === "timeout";
  const isExplicitPreview =
    normalizedTextureStatus === "geometry_only" ||
    normalizedTextureStatus === "pending" ||
    normalizedTextureStatus === "running" ||
    (validation?.ok === false &&
      validation.hasTextures === false &&
      validation.hasMaterialTextureBinding === false);
  const hasValidatedTextures =
    normalizedTextureStatus === "success" &&
    (validation?.ok !== false || validation?.hasTextures === true) &&
    hasTextureMaps &&
    hasValidUv;

  let renderState: ViewerRenderState;
  let message: string;

  if (meshCount === 0) {
    renderState = "invalid_asset";
    message = "Invalid asset: no renderable meshes were found.";
  } else if (isExplicitFailure) {
    renderState = "texgen_failed";
    message = "TexGen failed or did not produce valid textures. Using clay fallback.";
  } else if (hasValidatedTextures) {
    renderState = "textured_final";
    message = "Validated texture maps found. Rendering final textured asset.";
  } else if (hasTextureMaps && hasValidUv && validation?.ok !== false) {
    renderState = "textured_final";
    message = "Texture maps found on the asset. Rendering textured materials.";
  } else if (isExplicitPreview || !hasTextureMaps) {
    renderState = "geometry_preview";
    message = "No valid final textures were found. Rendering geometry preview in clay.";
  } else {
    renderState = "invalid_asset";
    message = "Asset materials are invalid for final rendering. Showing viewer warning.";
  }

  let fallbackApplied = false;
  if (renderState === "texgen_failed" || renderState === "geometry_preview") {
    const fallbackResult = applyFallbackClayMaterial(object3D);
    fallbackApplied = fallbackResult.replacedMaterialCount > 0;
    replacedMaterialCount += fallbackResult.replacedMaterialCount;
    missingNormalCount += fallbackResult.missingNormalCount;
  } else if (renderState === "textured_final" && invalidMaterialCount > 0) {
    object3D.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const materials = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : [];
      const nextMaterials = materials.map((material) => {
        if (!material) {
          replacedMaterialCount += 1;
          return createFallbackClayMaterial();
        }

        const inspectMaterial = material as InspectMaterial;
        const hasMaps = materialHasUsableTextureMaps(inspectMaterial);
        if (hasMaps || !colorIsAbsoluteBlack(inspectMaterial.color)) {
          return material;
        }

        replacedMaterialCount += 1;
        return createFallbackClayMaterial(
          material.name || "volumia-clay-fallback-invalid-material",
        );
      });

      child.material = Array.isArray(child.material)
        ? nextMaterials
        : nextMaterials[0]!;
    });
  }

  return {
    renderState,
    message,
    meshCount,
    materialCount,
    texturedMaterialCount,
    uvMeshCount,
    missingNormalCount,
    invalidMaterialCount,
    replacedMaterialCount,
    fallbackApplied,
    hasTextureMaps,
    hasValidUv,
  };
}
