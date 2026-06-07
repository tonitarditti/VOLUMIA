import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  ProjectTextureStatus,
  ProjectTextureValidation,
} from "@/projects/types";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import type { StudioProfile } from "@/volumia/settings/types";
import { themeTokens } from "@/ui/theme/tokens";
import { SceneMassing } from "./SceneMassing";
import {
  VIEWER_FALLBACK_CLAY_COLOR,
  evaluateViewerMaterialPolicy,
  type ViewerMaterialPolicyResult,
  type ViewerRenderState,
} from "./viewerMaterialPolicy";

type ViewportSize = {
  width: number;
  height: number;
};

type FrameLimiterProps = {
  fpsLimit: 30 | 60 | 120;
  isInteractingRef: MutableRefObject<boolean>;
};

type ViewportResizeSyncProps = {
  width: number;
  height: number;
};

type OrbitTargetClampProps = {
  controlsRef: { current: OrbitControlsImpl | null };
  radius: number;
  minY: number;
  maxY: number;
};

type ProjectViewportProps = {
  glbPath?: string;
  glbVersion?: number;
  textureStatus?: ProjectTextureStatus;
  textureMessage?: string;
  textureValidation?: ProjectTextureValidation;
  isGenerating?: boolean;
  generationStage?: string;
  showUtilityButtons?: boolean;
  showChrome?: boolean;
  resetSignal?: number;
  fitSignal?: number;
  shadowEnabled?: boolean;
  gridEnabled?: boolean;
  wireframe?: boolean;
  onToggleWireframe?: () => void;
  screenshotSignal?: number;
  onStatsChange?: (stats: ModelViewportStats | null) => void;
  onCameraTelemetryChange?: (telemetry: ViewportCameraTelemetry) => void;
};

type ViewportMultiviewCaptureArgs = {
  outputDir: string;
  baseName: string;
  width: number;
  height: number;
};

type ViewportGenerationBridge = {
  readGlb?: (path: string) => Promise<ArrayBuffer | Uint8Array>;
  writePngBase64?: (payload: {
    outputPath: string;
    base64: string;
  }) => Promise<string>;
  captureViewportMultiview?: (
    payload: ViewportMultiviewCaptureArgs,
  ) => Promise<string[]>;
  setViewportMultiviewCaptureHandler?: (
    handler: (payload: ViewportMultiviewCaptureArgs) => Promise<string[]>,
  ) => void;
  clearViewportMultiviewCaptureHandler?: () => void;
};

type LoadedModelProps = {
  glbPath?: string;
  glbVersion?: number;
  textureStatus?: ProjectTextureStatus;
  textureValidation?: ProjectTextureValidation;
  modelUrl?: string;
  allowFit: boolean;
  debugRenderEnabled: boolean;
  fittedForUrlRef: { current: string | null };
  controlsRef: { current: OrbitControlsImpl | null };
  envMapIntensity: number;
  fallbackMaterialColor: string;
  wireframe: boolean;
  onLoadError: (message: string | null) => void;
  onCameraFit: (snapshot: CameraSnapshot) => void;
  onModelNormalizationDebug: (info: ModelNormalizationDebug | null) => void;
  onViewerMaterialPolicy: (info: ViewerMaterialPolicyResult | null) => void;
  onModelReady: (model: THREE.Object3D | null) => void;
};

type ViewportTheme = "light" | "dark";

type CameraSnapshot = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
};

type ModelNormalizationDebug = {
  bboxSize: {
    x: number;
    y: number;
    z: number;
  };
  minYTranslation: number;
  minYBefore: number;
  minYAfter: number;
  centeredX: number;
  centeredZ: number;
};

export type ModelViewportStats = {
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  materialCount: number;
  bounds: {
    x: number;
    y: number;
    z: number;
  };
};

export type ViewportCameraTelemetry = {
  projection: "Perspective";
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
};

type CoplanarHeuristicStats = {
  meshCount: number;
  thinMeshCount: number;
  duplicateBoxKeyCount: number;
  suspicious: boolean;
};

type MaterialStabilityStats = {
  totalMaterials: number;
  transparentMaterials: number;
  forcedOpaqueMaterials: number;
  translucentMaterials: number;
  polygonOffsetMaterials: number;
  invalidMaterialsReplaced: number;
  fallbackClayApplied: boolean;
  missingNormalsFixed: number;
  renderState: ViewerRenderState;
  hasTextureMaps: boolean;
  hasValidUv: boolean;
};

type ModelMaterialEntry = {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
};

type MaterialVisualSettingsOptions = {
  envMapIntensity: number;
  wireframe: boolean;
  polygonOffset: boolean;
  fallbackMaterialColor: string;
  textureStatus?: ProjectTextureStatus;
  textureValidation?: ProjectTextureValidation;
};

type MaterialRuntimeSettingsOptions = Pick<
  MaterialVisualSettingsOptions,
  "envMapIntensity" | "wireframe" | "polygonOffset"
>;

type ModelStabilizationResult = {
  bboxSize: THREE.Vector3;
  minYTranslation: number;
  minYBefore: number;
  minYAfter: number;
  centeredX: number;
  centeredZ: number;
  radius: number;
  diagonal: number;
  epsilonLift: number;
  scaleApplied: number;
  removedBaseMeshes: number;
  coplanar: CoplanarHeuristicStats;
  material: MaterialStabilityStats;
  materialEntries: ModelMaterialEntry[];
  polygonOffsetEngaged: boolean;
  viewerPolicy: ViewerMaterialPolicyResult;
};

type NormalizeAndStabilizeOptions = {
  floorY: number;
  envMapIntensity: number;
  fallbackMaterialColor: string;
  wireframe: boolean;
  debugRender: boolean;
  forcePolygonOffsetAllMeshes: boolean;
  textureStatus?: ProjectTextureStatus;
  textureValidation?: ProjectTextureValidation;
};

type TextureAssignment = {
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
};

type TextureMaterialMap = Record<string, TextureAssignment>;

type ViewportThemeConfig = {
  isDark: boolean;
  environmentPreset: "studio" | "warehouse";
  background: string;
  ground: string;
  groundBronzeTint: string;
  groundBronzeStrength: number;
  groundMetalness: number;
  groundRoughness: number;
  gridMain: string;
  gridSub: string;
  gridOpacity: number;
  ambientIntensity: number;
  ambientColor: string;
  hemisphereIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  keyIntensity: number;
  keyColor: string;
  fillIntensity: number;
  fillColor: string;
  rimIntensity: number;
  rimColor: string;
  topDownKeyIntensity: number;
  topDownKeyColor: string;
  envMapIntensity: number;
  toneMappingExposure: number;
  contactShadowOpacity: number;
  contactShadowBlur: number;
  contactShadowScale: number;
  contactShadowFar: number;
  ambientOcclusionOpacity: number;
  ambientOcclusionBlur: number;
  ambientOcclusionScale: number;
  ambientOcclusionFar: number;
  overlayGradient: string;
  vignetteGradient: string | null;
  fallbackMaterialColor: string;
  errorBorder: string;
  errorBg: string;
  errorText: string;
};

const VIEW_TARGET = new THREE.Vector3(0, 0, 0);
const VIEWER_DEBUG =
  import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_DEBUG_VIEWPORT === "1";
const VIEWPORT_EVENT_DEBUG =
  import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_DEBUG_VIEWPORT === "1";
const VIEWPORT_CAPTURE_DEBUG =
  import.meta.env.VITE_VOLUMIA_DEBUG_VIEWPORT === "1";
const DEFAULT_DEBUG_RENDER =
  import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_DEBUG_RENDER === "1";
const DEV_POLY_OFFSET_ALL_MESHES =
  import.meta.env.DEV &&
  import.meta.env.VITE_VOLUMIA_POLYOFFSET_ALL_MESHES === "1";
const SHADOW_CAMERA_BOUNDS = 12;
const SHADOW_CAMERA_NEAR = 0.5;
const SHADOW_CAMERA_FAR = 40;
const FLOOR_Y = 0;
const MODEL_GROUND_TOLERANCE = 0.0005;
const TARGET_MODEL_DIAGONAL = 2.0;
const DEFAULT_CAMERA_SNAPSHOT: CameraSnapshot = {
  position: new THREE.Vector3(2.8, 2.2, 2.8),
  target: VIEW_TARGET.clone(),
  near: 0.1,
  far: 200,
};

function computeVisibleBoundingBox(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().makeEmpty();
  const meshBox = new THREE.Box3();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) {
      return;
    }

    const geometry = child.geometry;
    if (!geometry) {
      return;
    }
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }

    meshBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    box.union(meshBox);
  });

  return box.isEmpty() ? null : box;
}

function countVisibleTriangles(root: THREE.Object3D) {
  let total = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) {
      return;
    }
    const geometry = child.geometry;
    if (!geometry) {
      return;
    }
    if (geometry.index) {
      total += geometry.index.count / 3;
      return;
    }
    const positionAttribute = geometry.getAttribute("position");
    if (positionAttribute) {
      total += positionAttribute.count / 3;
    }
  });
  return Math.round(total);
}

function countVisibleVertices(root: THREE.Object3D) {
  let total = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) {
      return;
    }
    const geometry = child.geometry;
    if (!geometry) {
      return;
    }
    const positionAttribute = geometry.getAttribute("position");
    if (positionAttribute) {
      total += positionAttribute.count;
    }
  });
  return Math.round(total);
}

function countVisibleMeshes(root: THREE.Object3D) {
  let total = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible) {
      total += 1;
    }
  });
  return total;
}

function countVisibleMaterials(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible || !child.material) {
      return;
    }
    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        if (material) {
          materials.add(material);
        }
      }
      return;
    }
    materials.add(child.material);
  });
  return materials.size;
}

function collectModelViewportStats(
  root: THREE.Object3D | null,
): ModelViewportStats | null {
  if (!root) {
    return null;
  }
  const bounds = computeVisibleBoundingBox(root);
  if (!bounds) {
    return null;
  }
  const size = bounds.getSize(new THREE.Vector3());
  return {
    triangleCount: countVisibleTriangles(root),
    vertexCount: countVisibleVertices(root),
    meshCount: countVisibleMeshes(root),
    materialCount: countVisibleMaterials(root),
    bounds: {
      x: size.x,
      y: size.y,
      z: size.z,
    },
  };
}

function createViewportCameraTelemetry(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
): ViewportCameraTelemetry {
  const offset = camera.position.clone().sub(target);
  const horizontalDistance = Math.sqrt(
    offset.x * offset.x + offset.z * offset.z,
  );
  const azimuthDeg = THREE.MathUtils.euclideanModulo(
    THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
    360,
  );
  const elevationDeg = THREE.MathUtils.radToDeg(
    Math.atan2(offset.y, Math.max(horizontalDistance, 0.0001)),
  );

  return {
    projection: "Perspective",
    azimuthDeg,
    elevationDeg,
    distance: offset.length(),
  };
}

function hideLikelyEmbeddedBaseMeshes(root: THREE.Object3D) {
  const globalBox = computeVisibleBoundingBox(root);
  if (!globalBox) {
    return { removed: 0, debug: [] as string[] };
  }

  const globalSize = globalBox.getSize(new THREE.Vector3());
  const globalMinY = globalBox.min.y;
  const maxDim = Math.max(globalSize.x, globalSize.y, globalSize.z);
  const thinThreshold = maxDim * 0.03;
  const nearMinThreshold = maxDim * 0.05;
  const footprintThreshold = maxDim * 0.7;
  const meshBox = new THREE.Box3();
  const debug: string[] = [];
  let removed = 0;

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) {
      return;
    }

    const geometry = child.geometry;
    if (!geometry) {
      return;
    }
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }

    meshBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    const size = meshBox.getSize(new THREE.Vector3());
    const center = meshBox.getCenter(new THREE.Vector3());
    const isThin = size.y <= thinThreshold;
    const isNearGlobalMin = Math.abs(center.y - globalMinY) <= nearMinThreshold;
    const hasLargeFootprint =
      size.x >= footprintThreshold && size.z >= footprintThreshold;
    if (!isThin || !isNearGlobalMin || !hasLargeFootprint) {
      return;
    }

    child.visible = false;
    removed += 1;
    debug.push(
      `${child.name || "(unnamed)"} size=(${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)})`,
    );
  });

  if (removed > 0) {
    root.updateMatrixWorld(true);
  }

  return { removed, debug };
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
}

function applyCameraSnapshot(
  camera: THREE.PerspectiveCamera,
  controlsRef: { current: OrbitControlsImpl | null },
  snapshot: CameraSnapshot,
  controlsFromThree: OrbitControlsImpl | null = null,
) {
  camera.position.copy(snapshot.position);
  camera.near = snapshot.near;
  camera.far = snapshot.far;
  camera.lookAt(snapshot.target);
  camera.updateProjectionMatrix();

  const controls = controlsRef.current ?? controlsFromThree;
  if (controls) {
    controls.target.copy(snapshot.target);
    controls.update();
  }
}

function asOrbitControls(value: unknown): OrbitControlsImpl | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const maybe = value as Partial<OrbitControlsImpl>;
  if (!maybe.target || typeof maybe.update !== "function") {
    return null;
  }
  return maybe as OrbitControlsImpl;
}

function resolveFitKey(
  glbPath?: string,
  glbVersion?: number,
  modelUrl?: string,
) {
  if (modelUrl) {
    return modelUrl;
  }
  if (glbPath) {
    return typeof glbVersion === "number"
      ? `${glbPath}::${glbVersion}`
      : glbPath;
  }
  return "";
}

function resolveMaterialPolicyKey({
  fallbackMaterialColor,
  textureStatus,
  textureValidation,
}: {
  fallbackMaterialColor: string;
  textureStatus?: ProjectTextureStatus;
  textureValidation?: ProjectTextureValidation;
}) {
  return JSON.stringify({
    fallbackMaterialColor,
    textureStatus: textureStatus ?? null,
    textureValidation: textureValidation
      ? {
          ok: textureValidation.ok,
          hasMaterials: textureValidation.hasMaterials,
          hasImages: textureValidation.hasImages,
          hasTextures: textureValidation.hasTextures,
          hasMaterialTextureBinding:
            textureValidation.hasMaterialTextureBinding,
          reason: textureValidation.reason ?? null,
        }
      : null,
  });
}

function deriveCameraPlanes(radius: number) {
  const safeRadius = Math.max(radius, 0.01);
  return {
    near: Math.max(0.01, safeRadius / 1000),
    far: Math.max(100, safeRadius * 20),
  };
}

function normalizeTextureColorSpace(texture: THREE.Texture) {
  if ("colorSpace" in texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else {
    const legacyEncoding = Reflect.get(
      THREE as Record<string, unknown>,
      "sRGBEncoding",
    );
    if (legacyEncoding !== undefined) {
      (texture as THREE.Texture & { encoding?: number }).encoding =
        legacyEncoding as number;
    }
  }
  texture.needsUpdate = true;
}

function reduceWarmGroundBounce(color: string) {
  const source = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.95, hsl.l * 0.99).getStyle();
}

function coolNeutralLight(color: string) {
  const source = new THREE.Color(color);
  return new THREE.Color(
    THREE.MathUtils.clamp(source.r * 0.965, 0, 1),
    THREE.MathUtils.clamp(source.g * 0.985, 0, 1),
    THREE.MathUtils.clamp(source.b * 1.035, 0, 1),
  ).getStyle();
}

function softenWarmAmbient(color: string) {
  const source = new THREE.Color(color);
  return new THREE.Color(
    THREE.MathUtils.clamp(source.r * 1.01, 0, 1),
    THREE.MathUtils.clamp(source.g * 1.0, 0, 1),
    THREE.MathUtils.clamp(source.b * 0.985, 0, 1),
  ).getStyle();
}

function analyzeCoplanarRisk(root: THREE.Object3D): CoplanarHeuristicStats {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const seenBoxes = new Map<string, number>();
  let meshCount = 0;
  let thinMeshCount = 0;

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    if (!child.visible || !child.geometry) {
      return;
    }
    const geometry = child.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }
    box.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (box.isEmpty()) {
      return;
    }

    box.getSize(size);
    box.getCenter(center);
    const maxAxis = Math.max(size.x, size.y, size.z);
    const minAxis = Math.min(size.x, size.y, size.z);
    if (maxAxis > 0 && minAxis / maxAxis <= 0.0025) {
      thinMeshCount += 1;
    }

    const key = [
      size.x.toFixed(4),
      size.y.toFixed(4),
      size.z.toFixed(4),
      center.x.toFixed(4),
      center.y.toFixed(4),
      center.z.toFixed(4),
    ].join("|");
    seenBoxes.set(key, (seenBoxes.get(key) ?? 0) + 1);
    meshCount += 1;
  });

  let duplicateBoxKeyCount = 0;
  for (const count of seenBoxes.values()) {
    if (count > 1) {
      duplicateBoxKeyCount += count - 1;
    }
  }

  const suspicious =
    duplicateBoxKeyCount > 0 ||
    thinMeshCount >= Math.max(2, Math.floor(meshCount * 0.2));
  return {
    meshCount,
    thinMeshCount,
    duplicateBoxKeyCount,
    suspicious,
  };
}

function applyRuntimeMaterialSettings(
  mesh: THREE.Mesh,
  material: THREE.Material,
  options: MaterialRuntimeSettingsOptions,
  stats: MaterialStabilityStats,
) {
  if (material instanceof THREE.MeshStandardMaterial) {
    material.envMapIntensity = options.envMapIntensity;
  }

  if ("wireframe" in material) {
    const wireframeMaterial = material as THREE.Material & {
      wireframe?: boolean;
    };
    if (typeof wireframeMaterial.wireframe === "boolean") {
      wireframeMaterial.wireframe = options.wireframe;
    }
  }

  const alphaMaterial = material as THREE.Material & {
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    depthTest?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  };
  const opacity =
    typeof alphaMaterial.opacity === "number" ? alphaMaterial.opacity : 1;
  const wasTransparent = alphaMaterial.transparent === true;
  if (wasTransparent) {
    stats.transparentMaterials += 1;
  }
  if (wasTransparent && opacity >= 0.99) {
    alphaMaterial.transparent = false;
    alphaMaterial.opacity = 1;
    stats.forcedOpaqueMaterials += 1;
  }

  const isTranslucent =
    alphaMaterial.transparent === true && (alphaMaterial.opacity ?? 1) < 0.99;
  if (isTranslucent) {
    stats.translucentMaterials += 1;
  }
  alphaMaterial.depthTest = true;
  alphaMaterial.depthWrite = !isTranslucent;

  const shouldOffsetMaterial = options.polygonOffset || isTranslucent;
  alphaMaterial.polygonOffset = shouldOffsetMaterial;
  alphaMaterial.polygonOffsetFactor = shouldOffsetMaterial ? 1 : 0;
  alphaMaterial.polygonOffsetUnits = shouldOffsetMaterial ? 1 : 0;
  if (shouldOffsetMaterial) {
    stats.polygonOffsetMaterials += 1;
  }

  if (isTranslucent) {
    mesh.renderOrder = Math.max(mesh.renderOrder, 1);
  }
  material.needsUpdate = true;
}

function createEmptyMaterialStabilityStats(
  policy: ViewerMaterialPolicyResult,
): MaterialStabilityStats {
  return {
    totalMaterials: 0,
    transparentMaterials: 0,
    forcedOpaqueMaterials: 0,
    translucentMaterials: 0,
    polygonOffsetMaterials: 0,
    invalidMaterialsReplaced: policy.replacedMaterialCount,
    fallbackClayApplied: policy.fallbackApplied,
    missingNormalsFixed: policy.missingNormalCount,
    renderState: policy.renderState,
    hasTextureMaps: policy.hasTextureMaps,
    hasValidUv: policy.hasValidUv,
  };
}

function applyCachedModelVisualSettings(
  materialEntries: ModelMaterialEntry[],
  options: MaterialRuntimeSettingsOptions,
  policy: ViewerMaterialPolicyResult,
): MaterialStabilityStats {
  const stats = createEmptyMaterialStabilityStats(policy);
  for (const entry of materialEntries) {
    entry.mesh.castShadow = true;
    entry.mesh.receiveShadow = true;
    for (const material of entry.materials) {
      stats.totalMaterials += 1;
      applyRuntimeMaterialSettings(entry.mesh, material, options, stats);
    }
  }
  return stats;
}

function applyModelVisualSettings({
  object,
  options,
}: {
  object: THREE.Object3D;
  options: MaterialVisualSettingsOptions;
}): MaterialStabilityStats & {
  policy: ViewerMaterialPolicyResult;
  materialEntries: ModelMaterialEntry[];
} {
  const policy = evaluateViewerMaterialPolicy(object, {
    textureStatus: options.textureStatus,
    textureValidation: options.textureValidation,
  });

  console.info("[VOLUMIA][viewer] texture maps found / not found", {
    renderState: policy.renderState,
    textureStatus: options.textureStatus ?? "unknown",
    texturedMaterialCount: policy.texturedMaterialCount,
    materialCount: policy.materialCount,
    uvMeshCount: policy.uvMeshCount,
    hasTextureMaps: policy.hasTextureMaps,
    hasValidUv: policy.hasValidUv,
    message: policy.message,
  });
  if (policy.fallbackApplied) {
    console.warn("[VOLUMIA][viewer] fallback clay applied", {
      renderState: policy.renderState,
      replacedMaterialCount: policy.replacedMaterialCount,
      missingNormalCount: policy.missingNormalCount,
    });
  } else if (policy.replacedMaterialCount > 0) {
    console.warn("[VOLUMIA][viewer] invalid material replaced", {
      renderState: policy.renderState,
      replacedMaterialCount: policy.replacedMaterialCount,
    });
  }

  const stats = createEmptyMaterialStabilityStats(policy);
  const materialEntries: ModelMaterialEntry[] = [];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({
        color: VIEWER_FALLBACK_CLAY_COLOR,
        roughness: 0.82,
        metalness: 0.03,
      });
    }

    const sourceMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const normalizedMaterials = sourceMaterials.map((material) => {
      if (!material) {
        return new THREE.MeshStandardMaterial({
          color: VIEWER_FALLBACK_CLAY_COLOR,
          roughness: 0.82,
          metalness: 0.03,
        });
      }

      const source = material as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
        aoMap?: THREE.Texture | null;
        emissive?: THREE.Color;
        emissiveMap?: THREE.Texture | null;
        roughness?: number;
        metalness?: number;
        opacity?: number;
        transparent?: boolean;
        side?: THREE.Side;
      };
      const materialName = (material.name ?? "").trim().toLowerCase();
      const isDefaultMaterial =
        materialName === "" || materialName === "default";
      const hasTextureMaps = Boolean(
        source.map ||
          source.normalMap ||
          source.roughnessMap ||
          source.metalnessMap ||
          source.aoMap,
      );
      const baseColor =
        source.color instanceof THREE.Color
          ? source.color.clone()
          : new THREE.Color(VIEWER_FALLBACK_CLAY_COLOR);
      if (!hasTextureMaps && isDefaultMaterial) {
        baseColor.set(VIEWER_FALLBACK_CLAY_COLOR);
      }

      const standard = new THREE.MeshStandardMaterial({
        name: material.name || "default",
        color: baseColor,
        map: source.map ?? null,
        normalMap: source.normalMap ?? null,
        roughnessMap: source.roughnessMap ?? null,
        metalnessMap: source.metalnessMap ?? null,
        aoMap: source.aoMap ?? null,
        emissive: source.emissive ?? new THREE.Color(0x000000),
        emissiveMap: source.emissiveMap ?? null,
        roughness:
          typeof source.roughness === "number" ? source.roughness : 0.82,
        metalness:
          typeof source.metalness === "number" ? source.metalness : 0.03,
        transparent: false,
        opacity: 1,
        side:
          typeof source.side === "number" ? source.side : THREE.FrontSide,
      });
      if (standard.map) {
        normalizeTextureColorSpace(standard.map);
      }
      return standard;
    });

    if (Array.isArray(child.material)) {
      child.material = normalizedMaterials;
    } else {
      child.material = normalizedMaterials[0]!;
    }

    const activeMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const materials = activeMaterials.filter(
      (material): material is THREE.Material => Boolean(material),
    );
    if (materials.length > 0) {
      materialEntries.push({ mesh: child, materials });
    }

    for (const material of materials) {
      stats.totalMaterials += 1;
      applyRuntimeMaterialSettings(child, material, options, stats);
    }
  });

  return {
    ...stats,
    policy,
    materialEntries,
  };
}

function applyTextures(root: THREE.Object3D, materialMap: TextureMaterialMap) {
  if (Object.keys(materialMap).length === 0) {
    return;
  }

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      const keyCandidates = [material.name, child.name].filter(
        (value) => value && value.trim().length > 0,
      ) as string[];
      let assignment: TextureAssignment | undefined;
      for (const key of keyCandidates) {
        if (materialMap[key]) {
          assignment = materialMap[key];
          break;
        }
      }
      if (!assignment) {
        continue;
      }

      const pbr = material as THREE.Material & {
        map?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
        aoMap?: THREE.Texture | null;
      };
      if (assignment.map !== undefined) {
        pbr.map = assignment.map ?? null;
        if (pbr.map) {
          normalizeTextureColorSpace(pbr.map);
        }
      }
      if (assignment.normalMap !== undefined) {
        pbr.normalMap = assignment.normalMap ?? null;
      }
      if (assignment.roughnessMap !== undefined) {
        pbr.roughnessMap = assignment.roughnessMap ?? null;
      }
      if (assignment.metalnessMap !== undefined) {
        pbr.metalnessMap = assignment.metalnessMap ?? null;
      }
      if (assignment.aoMap !== undefined) {
        pbr.aoMap = assignment.aoMap ?? null;
      }
      material.needsUpdate = true;
    }
  });
}

function disposeObject3D(object: THREE.Object3D | null) {
  if (!object) {
    return;
  }

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material?.dispose();
    }
  });
}

function normalizeAndStabilizeModel(
  root: THREE.Object3D,
  options: NormalizeAndStabilizeOptions,
): ModelStabilizationResult | null {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);

  const stripResult = hideLikelyEmbeddedBaseMeshes(root);
  let bbox = computeVisibleBoundingBox(root);
  if (!bbox || bbox.isEmpty()) {
    return null;
  }

  const preScaleSize = bbox.getSize(new THREE.Vector3());
  const preScaleDiagonal = preScaleSize.length();
  let scaleApplied = 1;
  const isScaleClearlyWrong =
    preScaleDiagonal > 0 && (preScaleDiagonal < 0.02 || preScaleDiagonal > 200);
  if (isScaleClearlyWrong) {
    scaleApplied = THREE.MathUtils.clamp(
      TARGET_MODEL_DIAGONAL / preScaleDiagonal,
      0.001,
      1000,
    );
    root.scale.multiplyScalar(scaleApplied);
    root.updateMatrixWorld(true);
    bbox = computeVisibleBoundingBox(root);
    if (!bbox || bbox.isEmpty()) {
      return null;
    }
  }

  const center = bbox.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= center.y;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);

  const groundedBox = computeVisibleBoundingBox(root);
  if (!groundedBox || groundedBox.isEmpty()) {
    return null;
  }

  const groundedSize = groundedBox.getSize(new THREE.Vector3());
  const radius = Math.max(groundedSize.length() * 0.5, 0.001);
  const epsilonLift = Math.max(0.001, radius * 0.001);
  const targetMinY = options.floorY + epsilonLift;
  const minYBefore = groundedBox.min.y;
  let minYTranslation = targetMinY - groundedBox.min.y;
  if (Math.abs(minYTranslation) > MODEL_GROUND_TOLERANCE) {
    root.position.y += minYTranslation;
    root.updateMatrixWorld(true);
  } else {
    minYTranslation = 0;
  }

  let finalBox = computeVisibleBoundingBox(root);
  if (!finalBox || finalBox.isEmpty()) {
    return null;
  }

  const postMoveMinY = finalBox.min.y;
  if (Math.abs(postMoveMinY - targetMinY) > MODEL_GROUND_TOLERANCE) {
    const correction = targetMinY - postMoveMinY;
    root.position.y += correction;
    minYTranslation += correction;
    root.updateMatrixWorld(true);
    finalBox = computeVisibleBoundingBox(root);
    if (!finalBox || finalBox.isEmpty()) {
      return null;
    }
  }

  const coplanar = analyzeCoplanarRisk(root);
  const polygonOffsetEngaged =
    options.forcePolygonOffsetAllMeshes || coplanar.suspicious;
  const material = applyModelVisualSettings({
    object: root,
    options: {
      envMapIntensity: options.envMapIntensity,
      wireframe: options.wireframe,
      polygonOffset: polygonOffsetEngaged,
      fallbackMaterialColor: options.fallbackMaterialColor,
      textureStatus: options.textureStatus,
      textureValidation: options.textureValidation,
    },
  });

  const finalSize = finalBox.getSize(new THREE.Vector3());
  const minYAfter = finalBox.min.y;
  const diagonal = finalSize.length();
  if (options.debugRender) {
    console.debug("[ProjectViewport][stabilize]", {
      bbox: { x: finalSize.x, y: finalSize.y, z: finalSize.z },
      radius,
      diagonal,
      epsilonLift,
      scaleApplied,
      minYBefore,
      minYAfter,
      minYTranslation,
      coplanar,
      material,
      viewerPolicy: material.policy,
      polygonOffsetEngaged,
      removedBaseMeshes: stripResult.removed,
    });
  }

  return {
    bboxSize: finalSize,
    minYTranslation,
    minYBefore,
    minYAfter,
    centeredX: center.x,
    centeredZ: center.z,
    radius,
    diagonal,
    epsilonLift,
    scaleApplied,
    removedBaseMeshes: stripResult.removed,
    coplanar,
    material,
    materialEntries: material.materialEntries,
    polygonOffsetEngaged,
    viewerPolicy: material.policy,
  };
}



function rotateModel90(root: THREE.Object3D | null, axis: "x" | "y" | "z", direction: 1 | -1) {
  if (!root) return;
  const ang = THREE.MathUtils.degToRad(90 * direction);
  console.info("[viewer] rotate axis=", axis, "direction=", direction);
  if (axis === "x") root.rotateX(ang);
  if (axis === "y") root.rotateY(ang);
  if (axis === "z") root.rotateZ(ang);
  root.updateMatrixWorld(true);
  console.info("[viewer] rotate done, calling normalizeAndStabilizeModel");
  try {
    normalizeAndStabilizeModel(root, { floorY: FLOOR_Y, envMapIntensity: 1, fallbackMaterialColor: VIEWER_FALLBACK_CLAY_COLOR, wireframe: false, debugRender: false, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus: undefined, textureValidation: undefined });
  } catch (e) {
    console.warn('[viewer] rotate normalization failed', e);
  }
  // persist rotation in localStorage if possible
  try {
    if (typeof window !== "undefined" && (root as any).uuid) {
      const key = `volumia:model-rotation:${(root as any).uuid}`;
      const euler = root.rotation;
      const payload = { x: euler.x, y: euler.y, z: euler.z };
      localStorage.setItem(key, JSON.stringify(payload));
    }
  } catch (e) {
    // ignore
  }
}

function LoadedModel({
  glbPath,
  glbVersion,
  textureStatus,
  textureValidation,
  modelUrl,
  allowFit,
  debugRenderEnabled,
  fittedForUrlRef,
  controlsRef,
  envMapIntensity,
  fallbackMaterialColor,
  wireframe,
  onLoadError,
  onCameraFit,
  onModelNormalizationDebug,
  onViewerMaterialPolicy,
  onModelReady,
}: LoadedModelProps) {
  const { camera, controls, invalidate } = useThree();
  const modelRef = useRef<THREE.Group>(null);
  const loadedSceneRef = useRef<THREE.Object3D | null>(null);
  const [loadedModel, setLoadedModel] = useState<THREE.Object3D | null>(null);
  const [stabilization, setStabilization] =
    useState<ModelStabilizationResult | null>(null);
  const cameraFitKeyRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const invalidateRef = useRef(invalidate);
  const materialEntriesRef = useRef<ModelMaterialEntry[]>([]);
  const materialPolicyKeyRef = useRef<string | null>(null);
  const materialPolicyResultRef = useRef<ViewerMaterialPolicyResult | null>(
    null,
  );
  const envMapIntensityRef = useRef(envMapIntensity);
  const fallbackMaterialColorRef = useRef(fallbackMaterialColor);
  const wireframeRef = useRef(wireframe);
  const debugRenderEnabledRef = useRef(debugRenderEnabled);
  const onLoadErrorRef = useRef(onLoadError);
  const onModelNormalizationDebugRef = useRef(onModelNormalizationDebug);
  const onViewerMaterialPolicyRef = useRef(onViewerMaterialPolicy);
  const onModelReadyRef = useRef(onModelReady);

  useEffect(() => {
    invalidateRef.current = invalidate;
  }, [invalidate]);

  useEffect(() => {
    envMapIntensityRef.current = envMapIntensity;
  }, [envMapIntensity]);

  useEffect(() => {
    fallbackMaterialColorRef.current = fallbackMaterialColor;
  }, [fallbackMaterialColor]);

  useEffect(() => {
    wireframeRef.current = wireframe;
  }, [wireframe]);

  useEffect(() => {
    debugRenderEnabledRef.current = debugRenderEnabled;
  }, [debugRenderEnabled]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    onModelNormalizationDebugRef.current = onModelNormalizationDebug;
  }, [onModelNormalizationDebug]);

  useEffect(() => {
    onViewerMaterialPolicyRef.current = onViewerMaterialPolicy;
  }, [onViewerMaterialPolicy]);

  useEffect(() => {
    onModelReadyRef.current = onModelReady;
  }, [onModelReady]);

  useEffect(() => {
    const container = modelRef.current;

    if (!glbPath) {
      loadSeqRef.current += 1;
      if (container && loadedSceneRef.current) {
        container.remove(loadedSceneRef.current);
        disposeObject3D(loadedSceneRef.current);
        loadedSceneRef.current = null;
      }
      setLoadedModel(null);
      setStabilization(null);
      materialEntriesRef.current = [];
      materialPolicyKeyRef.current = null;
      materialPolicyResultRef.current = null;
      onLoadErrorRef.current(null);
      onModelNormalizationDebugRef.current(null);
      onViewerMaterialPolicyRef.current(null);
      onModelReadyRef.current(null);
      cameraFitKeyRef.current = null;
      invalidateRef.current();
      return;
    }

    const loader = new GLTFLoader();
    const readGlb = (
      window as { volumia?: { generation?: ViewportGenerationBridge } }
    ).volumia?.generation?.readGlb;

    if (!readGlb) {
      onLoadErrorRef.current("GLB reader unavailable in this environment.");
      onViewerMaterialPolicyRef.current({
        renderState: "invalid_asset",
        message: "Invalid asset: GLB reader unavailable in this environment.",
        meshCount: 0,
        materialCount: 0,
        texturedMaterialCount: 0,
        uvMeshCount: 0,
        missingNormalCount: 0,
        invalidMaterialCount: 0,
        replacedMaterialCount: 0,
        fallbackApplied: false,
        hasTextureMaps: false,
        hasValidUv: false,
      });
      return;
    }

    const seq = ++loadSeqRef.current;
    let cancelled = false;
    onLoadErrorRef.current(null);

    const shouldRetry =
      !loadedSceneRef.current &&
      /(?:^|[\\/])latest\.glb(?:\?.*)?$/i.test(glbPath);
    const retryDelaysMs = shouldRetry ? [0, 300, 800, 1500] : [0];

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const readBufferWithRetry = async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        const delayMs = retryDelaysMs[attempt]!;
        if (attempt > 0) {
          await wait(delayMs);
        }
        if (cancelled || seq !== loadSeqRef.current) {
          throw new Error("GLB load cancelled.");
        }
        try {
          return await readGlb(glbPath);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error("GLB file not found.");
    };

    const parseModel = async (arrayBuffer: ArrayBuffer) =>
      await new Promise<THREE.Object3D>((resolve, reject) => {
        loader.parse(
          arrayBuffer,
          "",
          (gltf) => {
            const model = gltf.scene ?? gltf.scenes[0];
            if (!model) {
              reject(new Error("GLB loaded but no scene was found."));
              return;
            }
            resolve(model);
          },
          (error) => {
            reject(error);
          },
        );
      });

    void (async () => {
      let nextModel: THREE.Object3D | null = null;
      try {
        const buffer = await readBufferWithRetry();
        if (cancelled || seq !== loadSeqRef.current) {
          return;
        }
        const source =
          buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        const bytes = new Uint8Array(source.byteLength);
        bytes.set(source);
        nextModel = await parseModel(bytes.buffer);
        if (cancelled || seq !== loadSeqRef.current) {
          disposeObject3D(nextModel);
          return;
        }

        const nextContainer = modelRef.current;
        if (!nextContainer) {
          disposeObject3D(nextModel);
          if (seq === loadSeqRef.current) {
            onLoadErrorRef.current("Model container unavailable.");
          }
          return;
        }

        const fitKey = resolveFitKey(glbPath, glbVersion, modelUrl);
        // Apply persisted rotation if present (localStorage keyed by glbPath or model uuid)
        try {
          const storageKey = glbPath ? `volumia:model-rotation:${glbPath}` : `volumia:model-rotation:${nextModel.uuid}`;
          const raw = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.x === 'number') {
              nextModel.rotation.set(parsed.x, parsed.y, parsed.z);
              nextModel.updateMatrixWorld(true);
              console.info('[viewer] applied saved rotation from storage', storageKey, parsed);
            }
          }
        } catch (e) {
          // ignore
        }

        const stabilized = normalizeAndStabilizeModel(nextModel, {
          floorY: FLOOR_Y,
          envMapIntensity: envMapIntensityRef.current,
          fallbackMaterialColor: fallbackMaterialColorRef.current,
          wireframe: wireframeRef.current,
          debugRender: debugRenderEnabledRef.current,
          forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES,
          textureStatus,
          textureValidation,
        });

        if (!stabilized) {
          disposeObject3D(nextModel);
          if (seq === loadSeqRef.current) {
            onLoadErrorRef.current("GLB stabilization failed.");
            onViewerMaterialPolicyRef.current({
              renderState: "invalid_asset",
              message: "Invalid asset: stabilization failed.",
              meshCount: 0,
              materialCount: 0,
              texturedMaterialCount: 0,
              uvMeshCount: 0,
              missingNormalCount: 0,
              invalidMaterialCount: 0,
              replacedMaterialCount: 0,
              fallbackApplied: false,
              hasTextureMaps: false,
              hasValidUv: false,
            });
          }
          return;
        }
        materialEntriesRef.current = stabilized.materialEntries;
        materialPolicyKeyRef.current = resolveMaterialPolicyKey({
          fallbackMaterialColor: fallbackMaterialColorRef.current,
          textureStatus,
          textureValidation,
        });
        materialPolicyResultRef.current = stabilized.viewerPolicy;

        const normalizationDebug: ModelNormalizationDebug = {
          bboxSize: {
            x: stabilized.bboxSize.x,
            y: stabilized.bboxSize.y,
            z: stabilized.bboxSize.z,
          },
          minYTranslation: stabilized.minYTranslation,
          minYBefore: stabilized.minYBefore,
          minYAfter: stabilized.minYAfter,
          centeredX: stabilized.centeredX,
          centeredZ: stabilized.centeredZ,
        };
        onViewerMaterialPolicyRef.current(stabilized.viewerPolicy);
        if (stabilized.viewerPolicy.renderState === "invalid_asset") {
          disposeObject3D(nextModel);
          materialEntriesRef.current = [];
          materialPolicyKeyRef.current = null;
          materialPolicyResultRef.current = null;
          if (seq === loadSeqRef.current) {
            onLoadErrorRef.current(stabilized.viewerPolicy.message);
            onModelNormalizationDebugRef.current(normalizationDebug);
            onModelReadyRef.current(null);
          }
          return;
        }
        if (debugRenderEnabledRef.current) {
          const cameraPlanes = deriveCameraPlanes(stabilized.radius);
          console.debug("[ProjectViewport][debug-render]", {
            bboxSize: stabilized.bboxSize,
            radius: stabilized.radius,
            diagonal: stabilized.diagonal,
            scaleApplied: stabilized.scaleApplied,
            epsilonLift: stabilized.epsilonLift,
            cameraNearFar: cameraPlanes,
            transparency: stabilized.material,
            coplanar: stabilized.coplanar,
            polygonOffsetEngaged: stabilized.polygonOffsetEngaged,
          });
        }
        if (fitKey) {
          fittedForUrlRef.current = fitKey;
        }

        applyTextures(nextModel, {});

        if (cancelled || seq !== loadSeqRef.current) {
          disposeObject3D(nextModel);
          return;
        }

        const previousModel = loadedSceneRef.current;
        if (previousModel) {
          nextContainer.remove(previousModel);
        }
        nextContainer.add(nextModel);
        loadedSceneRef.current = nextModel;
        setLoadedModel(nextModel);
        setStabilization(stabilized);
        onModelNormalizationDebugRef.current(normalizationDebug);
        onModelReadyRef.current(nextModel);
        onLoadErrorRef.current(null);
        if (previousModel) {
          disposeObject3D(previousModel);
        }
        invalidateRef.current();
      } catch (error) {
        if (nextModel && (cancelled || seq !== loadSeqRef.current)) {
          disposeObject3D(nextModel);
          return;
        }
        if (cancelled || seq !== loadSeqRef.current) {
          return;
        }
        onLoadErrorRef.current(`GLB load error: ${extractErrorMessage(error)}`);
        onViewerMaterialPolicyRef.current({
          renderState: "invalid_asset",
          message: `Invalid asset: ${extractErrorMessage(error)}`,
          meshCount: 0,
          materialCount: 0,
          texturedMaterialCount: 0,
          uvMeshCount: 0,
          missingNormalCount: 0,
          invalidMaterialCount: 0,
          replacedMaterialCount: 0,
          fallbackApplied: false,
          hasTextureMaps: false,
          hasValidUv: false,
        });
        invalidateRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fittedForUrlRef,
    glbPath,
    glbVersion,
    modelUrl,
    textureStatus,
    textureValidation,
  ]);

  useEffect(() => {
    if (!loadedModel || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    loadedModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(loadedModel);
    if (box.isEmpty()) {
      return;
    }

    const radius = Math.max(
      box.getSize(new THREE.Vector3()).length() * 0.5,
      0.01,
    );
    const { near, far } = deriveCameraPlanes(radius);
    if (
      !Number.isFinite(near) ||
      !Number.isFinite(far) ||
      near <= 0 ||
      near >= far
    ) {
      if (debugRenderEnabled) {
        console.warn("[ProjectViewport][debug-render] Invalid derived planes", {
          near,
          far,
          radius,
        });
      }
      return;
    }

    const changed =
      Math.abs(camera.near - near) > 1e-6 || Math.abs(camera.far - far) > 1e-3;
    if (changed) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, debugRenderEnabled, invalidate, loadedModel]);

  useEffect(() => {
    if (!loadedModel || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }
    if (!allowFit || !modelUrl) {
      return;
    }
    const fitKey = resolveFitKey(glbPath, glbVersion, modelUrl);
    if (!fitKey) {
      return;
    }
    if (cameraFitKeyRef.current === fitKey) {
      return;
    }

    loadedModel.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(loadedModel);
    if (finalBox.isEmpty()) {
      return;
    }

    const size = finalBox.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.01);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0 || !Number.isFinite(radius)) {
      return;
    }

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const cameraDistance = Math.max(
      (radius / Math.tan(fovRad / 2)) * 1.25,
      radius * 2.2,
    );
    const { near, far } = deriveCameraPlanes(radius);
    const nextTarget = new THREE.Vector3(0, size.y * 0.3, 0);
    const nextPosition = new THREE.Vector3(
      cameraDistance * 0.7,
      Math.max(size.y * 0.5, maxDim * 0.35),
      cameraDistance * 0.7,
    );
    const snapshot: CameraSnapshot = {
      position: nextPosition,
      target: nextTarget,
      near,
      far,
    };

    const controlsFromThree = asOrbitControls(controls);
    applyCameraSnapshot(camera, controlsRef, snapshot, controlsFromThree);
    onCameraFit({
      position: snapshot.position.clone(),
      target: snapshot.target.clone(),
      near: snapshot.near,
      far: snapshot.far,
    });
    if (debugRenderEnabled) {
      if (
        !Number.isFinite(snapshot.near) ||
        !Number.isFinite(snapshot.far) ||
        snapshot.near <= 0 ||
        snapshot.near >= snapshot.far
      ) {
        console.warn(
          "[ProjectViewport][debug-render] Invalid camera near/far",
          snapshot,
        );
      } else {
        console.debug("[ProjectViewport][debug-render] Camera fit", {
          near: snapshot.near,
          far: snapshot.far,
          radius,
          cameraDistance,
          bboxSize: size,
        });
      }
    }
    cameraFitKeyRef.current = fitKey;
    invalidate();
  }, [
    allowFit,
    camera,
    controls,
    controlsRef,
    debugRenderEnabled,
    invalidate,
    loadedModel,
    glbPath,
    glbVersion,
    modelUrl,
    onCameraFit,
  ]);

  useEffect(() => {
    if (!loadedModel) {
      return;
    }

    const nextPolicyKey = resolveMaterialPolicyKey({
      fallbackMaterialColor,
      textureStatus,
      textureValidation,
    });
    const polygonOffset =
      stabilization?.polygonOffsetEngaged ?? DEV_POLY_OFFSET_ALL_MESHES;

    if (
      stabilization &&
      materialPolicyKeyRef.current === nextPolicyKey &&
      materialEntriesRef.current.length > 0
    ) {
      const currentPolicy =
        materialPolicyResultRef.current ?? stabilization.viewerPolicy;
      applyCachedModelVisualSettings(
        materialEntriesRef.current,
        {
          envMapIntensity,
          wireframe,
          polygonOffset,
        },
        currentPolicy,
      );
      onViewerMaterialPolicyRef.current(currentPolicy);
      invalidate();
      return;
    }

    const materialRefresh = applyModelVisualSettings({
      object: loadedModel,
      options: {
        envMapIntensity,
        wireframe,
        polygonOffset,
        fallbackMaterialColor,
        textureStatus,
        textureValidation,
      },
    });
    materialEntriesRef.current = materialRefresh.materialEntries;
    materialPolicyKeyRef.current = nextPolicyKey;
    materialPolicyResultRef.current = materialRefresh.policy;
    onViewerMaterialPolicyRef.current(materialRefresh.policy);
    invalidate();
  }, [
    envMapIntensity,
    fallbackMaterialColor,
    invalidate,
    loadedModel,
    stabilization,
    textureStatus,
    textureValidation,
    wireframe,
  ]);

  return <group ref={modelRef} />;
}

function FrameLimiter({ fpsLimit, isInteractingRef }: FrameLimiterProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    const frameDurationMs = Math.max(8, Math.round(1000 / fpsLimit));
    invalidate();

    const interval = window.setInterval(() => {
      if (isInteractingRef.current) {
        invalidate();
      }
    }, frameDurationMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fpsLimit, invalidate, isInteractingRef]);

  return null;
}

function ViewportResizeSync({ width, height }: ViewportResizeSyncProps) {
  const { camera, gl, invalidate } = useThree();

  useEffect(() => {
    if (width < 10 || height < 10) {
      return;
    }

    gl.setSize(width, height, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, gl, height, invalidate, width]);

  return null;
}

function OrbitTargetClamp({
  controlsRef,
  radius,
  minY,
  maxY,
}: OrbitTargetClampProps) {
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.target.set(0, VIEW_TARGET.y, 0);
    controls.update();
  }, [controlsRef]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, minY, maxY);
    controls.update();
  }, [controlsRef, maxY, minY]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const target = controls.target;
    const xzLength = Math.hypot(target.x, target.z);
    if (xzLength > radius) {
      const factor = radius / xzLength;
      target.x *= factor;
      target.z *= factor;
    }
    target.y = THREE.MathUtils.clamp(target.y, minY, maxY);
  });

  return null;
}

function resolveViewportTheme(theme: string | undefined): ViewportTheme {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  if (typeof document !== "undefined") {
    const dataTheme = document.documentElement.dataset.theme;
    if (dataTheme === "light" || dataTheme === "dark") {
      return dataTheme;
    }

    if (
      document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark")
    ) {
      return "dark";
    }
  }

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return "dark";
}

function getViewportThemeConfig(
  theme: ViewportTheme,
  studioProfile: StudioProfile,
): ViewportThemeConfig {
  const tokens = themeTokens[theme];
  const isDark = theme === "dark";
  const isAtelier = studioProfile === "atelier";
  return {
    isDark,
    environmentPreset: isAtelier ? (isDark ? "warehouse" : "studio") : "studio",
    background: tokens.viewportBackground,
    ground: isDark ? "#747A84" : "#C5CBD2",
    groundBronzeTint: tokens.accentPrimary,
    groundBronzeStrength: isAtelier ? (isDark ? 0.018 : 0.008) : 0,
    groundMetalness: isAtelier ? (isDark ? 0.022 : 0.01) : 0,
    groundRoughness: 0.94,
    gridMain: tokens.viewportGridMain,
    gridSub: tokens.viewportGridSub,
    gridOpacity: isDark ? 0.23 : 0.18,
    ambientIntensity: isDark
      ? isAtelier
        ? 0.24
        : 0.22
      : isAtelier
        ? 0.28
        : 0.25,
    ambientColor: isAtelier
      ? softenWarmAmbient(tokens.viewportAmbientLight)
      : coolNeutralLight(tokens.viewportAmbientLight),
    hemisphereIntensity: isDark
      ? isAtelier
        ? 0.84
        : 0.78
      : isAtelier
        ? 0.78
        : 0.74,
    hemisphereSkyColor: isAtelier
      ? tokens.viewportHemisphereSky
      : coolNeutralLight(tokens.viewportHemisphereSky),
    hemisphereGroundColor: isAtelier
      ? reduceWarmGroundBounce(tokens.viewportHemisphereGround)
      : coolNeutralLight(
          reduceWarmGroundBounce(tokens.viewportHemisphereGround),
        ),
    keyIntensity: isDark ? (isAtelier ? 2.05 : 1.92) : isAtelier ? 1.62 : 1.54,
    keyColor: isAtelier
      ? tokens.viewportKeyLight
      : coolNeutralLight(tokens.viewportKeyLight),
    fillIntensity: isDark ? (isAtelier ? 0.94 : 0.88) : isAtelier ? 0.98 : 0.94,
    fillColor: isAtelier
      ? tokens.viewportFillLight
      : coolNeutralLight(tokens.viewportFillLight),
    rimIntensity: isDark ? (isAtelier ? 0.38 : 0.3) : isAtelier ? 0.42 : 0.34,
    rimColor: isAtelier
      ? tokens.viewportRimLight
      : coolNeutralLight(tokens.viewportRimLight),
    topDownKeyIntensity: isDark
      ? isAtelier
        ? 0.42
        : 0.22
      : isAtelier
        ? 0.14
        : 0.07,
    topDownKeyColor: coolNeutralLight(
      isDark ? tokens.viewportKeyLight : tokens.viewportAmbientLight,
    ),
    envMapIntensity: isDark
      ? isAtelier
        ? 1
        : 0.92
      : isAtelier
        ? 0.94
        : 0.88,
    toneMappingExposure: isDark ? 1.12 : 0.93,
    contactShadowOpacity: isDark ? 0.38 : isAtelier ? 0.46 : 0.43,
    contactShadowBlur: isDark ? 2.8 : isAtelier ? 2 : 2.1,
    contactShadowScale: isDark ? 13.6 : isAtelier ? 14.2 : 13.8,
    contactShadowFar: isDark ? 7.2 : isAtelier ? 7.5 : 7,
    ambientOcclusionOpacity: isDark ? 0 : isAtelier ? 0.12 : 0.095,
    ambientOcclusionBlur: isDark ? 0 : isAtelier ? 4.1 : 3.5,
    ambientOcclusionScale: isDark ? 0 : isAtelier ? 12.6 : 11.8,
    ambientOcclusionFar: isDark ? 0 : isAtelier ? 9.4 : 8.6,
    overlayGradient: isDark
      ? isAtelier
        ? "linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(16, 15, 14, 0.012) 46%, rgba(0, 0, 0, 0.06) 100%)"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.014) 0%, rgba(16, 15, 14, 0.008) 42%, rgba(0, 0, 0, 0.038) 100%)"
      : isAtelier
        ? "linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(240, 236, 230, 0.045) 42%, rgba(32, 28, 24, 0.018) 100%)"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(242, 239, 234, 0.035) 44%, rgba(32, 28, 24, 0.012) 100%)",
    vignetteGradient: isAtelier
      ? isDark
        ? "radial-gradient(circle at 50% 42%, rgba(0, 0, 0, 0) 58%, rgba(0, 0, 0, 0.1) 100%)"
        : "radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0) 60%, rgba(28, 24, 20, 0.032) 100%)"
      : null,
    fallbackMaterialColor: VIEWER_FALLBACK_CLAY_COLOR,
    errorBorder: tokens.viewportErrorBorder,
    errorBg: tokens.viewportErrorBg,
    errorText: tokens.viewportErrorText,
  };
}

export function ProjectViewport({
  glbPath,
  glbVersion,
  textureStatus,
  textureMessage,
  textureValidation,
  isGenerating = false,
  generationStage,
  showUtilityButtons = true,
  showChrome = true,
  resetSignal,
  fitSignal,
  shadowEnabled = true,
  gridEnabled = true,
  wireframe: wireframeProp,
  onToggleWireframe,
  screenshotSignal,
  onStatsChange,
  onCameraTelemetryChange,
}: ProjectViewportProps) {
  const { t } = useT();
  const { settings, resolvedTheme } = useSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const loadedModelRef = useRef<THREE.Object3D | null>(null);
  const fittedForUrlRef = useRef<string | null>(null);
  const cameraSnapshotRef = useRef<CameraSnapshot>({
    position: DEFAULT_CAMERA_SNAPSHOT.position.clone(),
    target: DEFAULT_CAMERA_SNAPSHOT.target.clone(),
    near: DEFAULT_CAMERA_SNAPSHOT.near,
    far: DEFAULT_CAMERA_SNAPSHOT.far,
  });
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [wireframeInternal, setWireframeInternal] = useState(false);
  const [debugRenderEnabled, setDebugRenderEnabled] =
    useState(DEFAULT_DEBUG_RENDER);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerMaterialPolicy, setViewerMaterialPolicy] =
    useState<ViewerMaterialPolicyResult | null>(null);
  const [modelNormalizationDebug, setModelNormalizationDebug] =
    useState<ModelNormalizationDebug | null>(null);
  const [modelStats, setModelStats] = useState<ModelViewportStats | null>(null);
  const wireframe = wireframeProp ?? wireframeInternal;
  const isInteractingRef = useRef(false);
  const interactionEndTimerRef = useRef<number | null>(null);
  const lastTelemetryKeyRef = useRef("");
  const url = useMemo(
    () =>
      glbPath
        ? glbVersion
          ? `${glbPath}?v=${glbVersion}`
          : glbPath
        : undefined,
    [glbPath, glbVersion],
  );
  const isFinalStage = useMemo(() => {
    const stage = (generationStage ?? "").toLowerCase();
    return stage === "done" || stage === "ready" || stage === "final";
  }, [generationStage]);
  const allowModelFit = !isGenerating && isFinalStage;
  const viewerStatusLabel = useMemo(() => {
    if (!viewerMaterialPolicy) {
      return null;
    }
    if (viewerMaterialPolicy.renderState === "textured_final") {
      return null;
    }
    if (viewerMaterialPolicy.renderState === "texgen_failed") {
      return "TexGen failed";
    }
    if (viewerMaterialPolicy.renderState === "geometry_preview") {
      return "Geometry preview";
    }
    return "Invalid asset";
  }, [viewerMaterialPolicy]);
  const viewerStatusMessage = useMemo(() => {
    if (!viewerMaterialPolicy) {
      return null;
    }
    if (
      textureMessage &&
      viewerMaterialPolicy.renderState !== "textured_final"
    ) {
      return textureMessage;
    }
    return viewerMaterialPolicy.message;
  }, [textureMessage, viewerMaterialPolicy]);

  useEffect(() => {
    if (!glbPath) {
      setViewerMaterialPolicy(null);
    }
  }, [glbPath]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateSize = () => {
      setSize({
        width: host.clientWidth,
        height: host.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      const interval = window.setInterval(updateSize, 200);
      return () => window.clearInterval(interval);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));

    const raf = window.requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host) {
        window.dispatchEvent(new Event("resize"));
        return;
      }

      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      setSize({ width, height });

      if (rendererRef.current) {
        rendererRef.current.setSize(width, height, false);
      }

      window.dispatchEvent(new Event("resize"));
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const canRenderCanvas = size.width >= 10 && size.height >= 10;
  const viewportTheme = resolveViewportTheme(resolvedTheme);
  const studioProfile = settings.studioProfile;
  const themeConfig = useMemo(
    () => getViewportThemeConfig(viewportTheme, studioProfile),
    [studioProfile, viewportTheme],
  );
  const shadowMapSize = settings.fpsLimit >= 120 ? 1024 : 2048;
  const headerClass =
    "shrink-0 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2";
  const chipClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1";
  const hintChipClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1";
  const utilityButtonBaseClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]";
  const utilityWireframeClass = `rounded-md border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors ${
    wireframe
      ? "bg-[var(--surface-3)] text-[var(--text)]"
      : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
  }`;
  const utilityDebugClass = `rounded-md border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors ${
    debugRenderEnabled
      ? "bg-[var(--surface-3)] text-[var(--text)]"
      : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
  }`;

  const emitCameraTelemetry = useCallback(() => {
    if (!onCameraTelemetryChange) {
      return;
    }
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    const target =
      controlsRef.current?.target.clone() ?? cameraSnapshotRef.current.target;
    const telemetry = createViewportCameraTelemetry(camera, target);
    const telemetryKey = `${Math.round(telemetry.azimuthDeg)}:${Math.round(
      telemetry.elevationDeg,
    )}:${telemetry.distance.toFixed(2)}`;
    if (lastTelemetryKeyRef.current === telemetryKey) {
      return;
    }
    lastTelemetryKeyRef.current = telemetryKey;
    onCameraTelemetryChange(telemetry);
  }, [onCameraTelemetryChange]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = themeConfig.toneMappingExposure;
    }
    invalidateRef.current?.();
  }, [studioProfile, themeConfig.toneMappingExposure, viewportTheme]);

  useEffect(() => {
    onStatsChange?.(modelStats);
  }, [modelStats, onStatsChange]);

  useEffect(() => {
    emitCameraTelemetry();
  }, [emitCameraTelemetry, wireframe, glbPath, glbVersion]);

  const handleManualRotate = useCallback((axis: "x" | "y" | "z", direction: 1 | -1) => {
    const model = loadedModelRef.current;
    if (!model) return;
    console.info("[viewer] rotate axis=", axis, "direction=", direction);
    rotateModel90(model, axis, direction);
    setModelStats(collectModelViewportStats(model));
    invalidateRef.current?.();
  }, []);

  const handleStraightenModel = useCallback(() => {
    const model = loadedModelRef.current;
    if (!model) return;
    console.info("[viewer] straighten model start");
    model.updateMatrixWorld(true);
    const box = computeVisibleBoundingBox(model);
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const origY = size.y;
    const origFootprint = Math.max(size.x, size.z);

    type Candidate = { axis: "none" | "x" | "y" | "z"; dir?: 1 | -1; y: number; footprint: number };
    const candidates: Candidate[] = [];
    // no rotation
    candidates.push({ axis: "none", y: size.y, footprint: Math.max(size.x, size.z) });
    // rotate X => swap y and z
    candidates.push({ axis: "x", dir: 1, y: size.z, footprint: Math.max(size.x, size.y) });
    candidates.push({ axis: "x", dir: -1, y: size.z, footprint: Math.max(size.x, size.y) });
    // rotate Z => swap x and y
    candidates.push({ axis: "z", dir: 1, y: size.x, footprint: Math.max(size.y, size.z) });
    candidates.push({ axis: "z", dir: -1, y: size.x, footprint: Math.max(size.y, size.z) });
    // rotate Y => swap x and z (height stays y)
    candidates.push({ axis: "y", dir: 1, y: size.y, footprint: Math.max(size.z, size.x) });
    candidates.push({ axis: "y", dir: -1, y: size.y, footprint: Math.max(size.z, size.x) });

    // choose candidate with minimal y, tie-breaker larger footprint
    candidates.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1e-6) return a.y - b.y;
      return b.footprint - a.footprint;
    });

    const best = candidates[0];
    if (!best) return;
    if (best.axis === "none" || best.y >= origY * 0.95) {
      console.info("[viewer] straighten model: no beneficial rotation found");
      // still recenter/normalize
      const normalized = normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
      setModelStats(collectModelViewportStats(model));
      invalidateRef.current?.();
      return;
    }

    // apply rotation
    console.info("[viewer] straighten applied rotation=", best.axis, best.dir);
    rotateModel90(model, best.axis as "x" | "y" | "z", (best.dir as 1 | -1) || 1);
    normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
    setModelStats(collectModelViewportStats(model));
    const afterBox = computeVisibleBoundingBox(model);
    console.info("[viewer] straighten bbox after", afterBox ? afterBox.getSize(new THREE.Vector3()) : null);
    // persist rotation keyed by glbPath if available
    try {
      const key = glbPath ? `volumia:model-rotation:${glbPath}` : `volumia:model-rotation:${model.uuid}`;
      const e = model.rotation;
      localStorage.setItem(key, JSON.stringify({ x: e.x, y: e.y, z: e.z }));
    } catch (e) {
      // ignore
    }
    invalidateRef.current?.();
  }, [glbPath]);

  useEffect(() => {
    // create overlay controls inside hostRef for manual rotate and straighten
    const host = hostRef.current;
    if (!host) return;
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.top = "12px";
    container.style.right = "12px";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const makeBtn = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.padding = "6px 8px";
      b.style.fontSize = "11px";
      b.style.borderRadius = "6px";
      b.style.border = "1px solid rgba(0,0,0,0.12)";
      b.style.background = "rgba(255,255,255,0.04)";
      b.style.color = "var(--text)";
      b.onclick = onClick;
      return b;
    };

    container.appendChild(makeBtn("X +90", () => handleManualRotate("x", 1)));
    container.appendChild(makeBtn("X -90", () => handleManualRotate("x", -1)));
    container.appendChild(makeBtn("Y +90", () => handleManualRotate("y", 1)));
    container.appendChild(makeBtn("Y -90", () => handleManualRotate("y", -1)));
    container.appendChild(makeBtn("Z +90", () => handleManualRotate("z", 1)));
    container.appendChild(makeBtn("Z -90", () => handleManualRotate("z", -1)));
    container.appendChild(makeBtn("Reset Rot", () => {
      const m = loadedModelRef.current;
      if (!m) return;
      m.rotation.set(0,0,0);
      normalizeAndStabilizeModel(m, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
      setModelStats(collectModelViewportStats(m));
      invalidateRef.current?.();
    }));
    container.appendChild(makeBtn("Centrar/Apoyar", () => {
      const m = loadedModelRef.current;
      if (!m) return;
      normalizeAndStabilizeModel(m, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
      setModelStats(collectModelViewportStats(m));
      invalidateRef.current?.();
    }));
    container.appendChild(makeBtn("Enderezar modelo", () => handleStraightenModel()));

    // style adapt for dark background
    container.style.backdropFilter = "blur(6px)";
    container.style.padding = "8px";
    container.style.borderRadius = "8px";
    container.style.background = "rgba(0,0,0,0.35)";

    host.style.position = host.style.position || "relative";
    host.appendChild(container);

    return () => {
      if (host.contains(container)) host.removeChild(container);
    };
  }, [handleManualRotate, handleStraightenModel]);

  useEffect(() => {
    console.debug("[ProjectViewport] studioProfile changed", {
      studioProfile,
      viewportTheme,
      background: themeConfig.background,
      groundBronzeStrength: themeConfig.groundBronzeStrength,
      ambientIntensity: themeConfig.ambientIntensity,
      keyIntensity: themeConfig.keyIntensity,
      topDownKeyIntensity: themeConfig.topDownKeyIntensity,
      vignette: Boolean(themeConfig.vignetteGradient),
    });

    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(themeConfig.background);
    }

    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = themeConfig.toneMappingExposure;
    }

    let frame = 0;
    let raf = 0;
    const scheduleRefresh = () => {
      invalidateRef.current?.();
      frame += 1;
      if (frame < 4) {
        raf = window.requestAnimationFrame(scheduleRefresh);
      }
    };

    raf = window.requestAnimationFrame(scheduleRefresh);

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [
    studioProfile,
    viewportTheme,
    themeConfig.background,
    themeConfig.ground,
    themeConfig.groundBronzeStrength,
    themeConfig.ambientIntensity,
    themeConfig.hemisphereIntensity,
    themeConfig.keyIntensity,
    themeConfig.fillIntensity,
    themeConfig.rimIntensity,
    themeConfig.topDownKeyIntensity,
    themeConfig.toneMappingExposure,
    themeConfig.contactShadowOpacity,
    themeConfig.ambientOcclusionOpacity,
    themeConfig.vignetteGradient,
  ]);

  useEffect(() => {
    if (glbPath) {
      return;
    }

    loadedModelRef.current = null;
    fittedForUrlRef.current = null;
    cameraSnapshotRef.current = {
      position: DEFAULT_CAMERA_SNAPSHOT.position.clone(),
      target: DEFAULT_CAMERA_SNAPSHOT.target.clone(),
      near: DEFAULT_CAMERA_SNAPSHOT.near,
      far: DEFAULT_CAMERA_SNAPSHOT.far,
    };
    setLoadError(null);
    setModelNormalizationDebug(null);
    setModelStats(null);
  }, [glbPath]);

  const handleResetView = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
    emitCameraTelemetry();
  }, [emitCameraTelemetry]);

  const rotateModel = useCallback((axis: "x" | "y" | "z", angleDeg: number) => {
    const model = loadedModelRef.current;
    if (!model) {
      return;
    }
    const angle = THREE.MathUtils.degToRad(angleDeg);
    console.info("[VOLUMIA][viewer] manual-rotate", { axis, angleDeg });
    if (axis === "x") {
      model.rotateX(angle);
    } else if (axis === "y") {
      model.rotateY(angle);
    } else {
      model.rotateZ(angle);
    }

    // Recenter/ground preserving rotation
    const stabilization = normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
    if (stabilization) {
      setModelNormalizationDebug({
        bboxSize: { x: stabilization.bboxSize.x, y: stabilization.bboxSize.y, z: stabilization.bboxSize.z },
        minYTranslation: stabilization.minYTranslation,
        minYBefore: stabilization.minYBefore,
        minYAfter: stabilization.minYAfter,
        centeredX: stabilization.centeredX,
        centeredZ: stabilization.centeredZ,
      });
      setModelStats(collectModelViewportStats(model));
      invalidateRef.current?.();
    }
  }, [themeConfig.envMapIntensity, themeConfig.fallbackMaterialColor, wireframe, debugRenderEnabled, textureStatus, textureValidation]);

  const handleResetOrientation = useCallback(() => {
    const model = loadedModelRef.current;
    if (!model) return;
    model.rotation.set(0, 0, 0);
    console.info("[VOLUMIA][viewer] reset-orientation");
    // recentre and ground
    const stabilization = normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
    if (stabilization) {
      setModelNormalizationDebug({
        bboxSize: { x: stabilization.bboxSize.x, y: stabilization.bboxSize.y, z: stabilization.bboxSize.z },
        minYTranslation: stabilization.minYTranslation,
        minYBefore: stabilization.minYBefore,
        minYAfter: stabilization.minYAfter,
        centeredX: stabilization.centeredX,
        centeredZ: stabilization.centeredZ,
      });
      setModelStats(collectModelViewportStats(model));
      invalidateRef.current?.();
    }
  }, [themeConfig.envMapIntensity, themeConfig.fallbackMaterialColor, wireframe, debugRenderEnabled, textureStatus, textureValidation]);

  const handleRecenter = useCallback(() => {
    const model = loadedModelRef.current;
    if (!model) return;
    console.info("[VOLUMIA][viewer] recentering model");
        const stabilization = normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
    if (stabilization) {
      setModelNormalizationDebug({
        bboxSize: { x: stabilization.bboxSize.x, y: stabilization.bboxSize.y, z: stabilization.bboxSize.z },
        minYTranslation: stabilization.minYTranslation,
        minYBefore: stabilization.minYBefore,
        minYAfter: stabilization.minYAfter,
        centeredX: stabilization.centeredX,
        centeredZ: stabilization.centeredZ,
      });
      setModelStats(collectModelViewportStats(model));
      invalidateRef.current?.();
    }
  }, [themeConfig.envMapIntensity, themeConfig.fallbackMaterialColor, wireframe, debugRenderEnabled, textureStatus, textureValidation]);

  const handleAutoOrient = useCallback(() => {
    const model = loadedModelRef.current;
    if (!model) return;
    model.updateMatrixWorld(true);
    const before = computeVisibleBoundingBox(model);
    if (!before) return;
    console.info('[auto-orient] bbox before', before.getSize(new THREE.Vector3()));
    const size = before.getSize(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z);
    let applied = null as string | null;
    // If height is not the largest axis, try to rotate so largest becomes Y
    if (size.y < 0.9 * maxAxis) {
      if (size.x >= size.z) {
        // rotate around Z so X -> Y
        model.rotateZ(THREE.MathUtils.degToRad(90));
        applied = 'rotateZ+90';
      } else {
        // rotate around X so Z -> Y
        model.rotateX(THREE.MathUtils.degToRad(-90));
        applied = 'rotateX-90';
      }
      model.updateMatrixWorld(true);
      const after = computeVisibleBoundingBox(model);
      console.info('[auto-orient] rotation applied', applied);
      console.info('[auto-orient] bbox after', after ? after.getSize(new THREE.Vector3()) : null);
      // If after is worse (height decreased), revert
      if (after) {
        const afterSize = after.getSize(new THREE.Vector3());
        if (afterSize.y < size.y * 0.9) {
          // revert
          if (applied === 'rotateZ+90') model.rotateZ(THREE.MathUtils.degToRad(-90));
          if (applied === 'rotateX-90') model.rotateX(THREE.MathUtils.degToRad(90));
          model.updateMatrixWorld(true);
          console.info('[auto-orient] revert rotation, not beneficial');
        } else {
          // accept and recenter
          const stabilization = normalizeAndStabilizeModel(model, { floorY: FLOOR_Y, envMapIntensity: themeConfig.envMapIntensity, fallbackMaterialColor: themeConfig.fallbackMaterialColor, wireframe, debugRender: debugRenderEnabled, forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES, textureStatus, textureValidation });
          setModelNormalizationDebug(stabilization ? {
            bboxSize: { x: stabilization.bboxSize.x, y: stabilization.bboxSize.y, z: stabilization.bboxSize.z },
            minYTranslation: stabilization.minYTranslation,
            minYBefore: stabilization.minYBefore,
            minYAfter: stabilization.minYAfter,
            centeredX: stabilization.centeredX,
            centeredZ: stabilization.centeredZ,
          } : null);
          setModelStats(collectModelViewportStats(model));
          invalidateRef.current?.();
        }
      }
    }
  }, [themeConfig.envMapIntensity, themeConfig.fallbackMaterialColor, wireframe, debugRenderEnabled, textureStatus, textureValidation]);

  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }

    try {
      const link = document.createElement("a");
      link.download = `volumia-viewport-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      link.href = renderer.domElement.toDataURL("image/png");
      link.click();
    } catch (error) {
      setLoadError(`Screenshot failed: ${extractErrorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
    console.info("[VOLUMIA][viewer] viewer lighting initialized", {
      environmentPreset: themeConfig.environmentPreset,
      ambientIntensity: themeConfig.ambientIntensity,
      hemisphereIntensity: themeConfig.hemisphereIntensity,
      keyIntensity: themeConfig.keyIntensity,
      fillIntensity: themeConfig.fillIntensity,
      rimIntensity: themeConfig.rimIntensity,
      topDownKeyIntensity: themeConfig.topDownKeyIntensity,
    });
  }, [
    themeConfig.ambientIntensity,
    themeConfig.environmentPreset,
    themeConfig.fillIntensity,
    themeConfig.hemisphereIntensity,
    themeConfig.keyIntensity,
    themeConfig.rimIntensity,
    themeConfig.topDownKeyIntensity,
  ]);

  useEffect(() => {
    if (typeof screenshotSignal !== "number" || screenshotSignal <= 0) {
      return;
    }
    handleScreenshot();
  }, [handleScreenshot, screenshotSignal]);

  const captureMultiviewSnapshots = useCallback(
    async (args: ViewportMultiviewCaptureArgs) => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      const model = loadedModelRef.current;
      const invalidate = invalidateRef.current;
      const generation = (
        window as { volumia?: { generation?: ViewportGenerationBridge } }
      ).volumia?.generation;

      if (!renderer || !camera || !scene || !model) {
        throw new Error(
          "Viewport capture unavailable: renderer, camera, scene, or model is missing.",
        );
      }
      if (!generation?.writePngBase64) {
        throw new Error(
          "Viewport capture unavailable: PNG writer bridge is missing.",
        );
      }
      if (
        !Number.isFinite(args.width) ||
        !Number.isFinite(args.height) ||
        args.width < 32 ||
        args.height < 32
      ) {
        throw new Error("Viewport capture received invalid dimensions.");
      }
      if (!args.outputDir.trim() || !args.baseName.trim()) {
        throw new Error("Viewport capture requires outputDir and baseName.");
      }

      model.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(model);
      if (bbox.isEmpty()) {
        throw new Error(
          "Viewport capture failed: model bounding box is empty.",
        );
      }
      const bboxSize = bbox.getSize(new THREE.Vector3());
      const target = bbox.getCenter(new THREE.Vector3());
      const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
      const modelRadius = Math.max(bboxSize.length() * 0.5, 0.01);
      if (!Number.isFinite(maxDim) || maxDim <= 0) {
        throw new Error("Viewport capture failed: invalid model dimensions.");
      }

      const radius = maxDim * 1.6;
      const elevation = target.y + maxDim * 0.35;
      const controls = controlsRef.current;
      const previousTarget = controls
        ? controls.target.clone()
        : target.clone();
      const previousSnapshot: CameraSnapshot = {
        position: camera.position.clone(),
        target: previousTarget,
        near: camera.near,
        far: camera.far,
      };
      cameraSnapshotRef.current = {
        position: previousSnapshot.position.clone(),
        target: previousSnapshot.target.clone(),
        near: previousSnapshot.near,
        far: previousSnapshot.far,
      };

      const previousSize = renderer.getSize(new THREE.Vector2());
      const previousPixelRatio = renderer.getPixelRatio();
      const previousViewport = renderer.getViewport(new THREE.Vector4());
      const previousScissor = renderer.getScissor(new THREE.Vector4());
      const previousScissorTest = renderer.getScissorTest();
      const previousAutoClear = renderer.autoClear;
      const outputPaths: string[] = [];
      const views: Array<{
        name: "front" | "right" | "rear" | "left";
        yawDeg: number;
      }> = [
        { name: "front", yawDeg: 0 },
        { name: "right", yawDeg: 90 },
        { name: "rear", yawDeg: 180 },
        { name: "left", yawDeg: 270 },
      ];

      if (VIEWPORT_CAPTURE_DEBUG) {
        console.debug("[ProjectViewport][capture] bbox", {
          center: { x: target.x, y: target.y, z: target.z },
          size: { x: bboxSize.x, y: bboxSize.y, z: bboxSize.z },
          radius,
          width: args.width,
          height: args.height,
        });
      }

      try {
        renderer.setPixelRatio(1);
        renderer.setSize(args.width, args.height, false);
        renderer.setViewport(0, 0, args.width, args.height);
        renderer.setScissorTest(false);
        renderer.autoClear = true;
        camera.aspect = args.width / args.height;
        const capturePlanes = deriveCameraPlanes(modelRadius);
        camera.near = capturePlanes.near;
        camera.far = capturePlanes.far;
        camera.updateProjectionMatrix();

        for (const view of views) {
          const yaw = THREE.MathUtils.degToRad(view.yawDeg);
          const x = target.x + Math.sin(yaw) * radius;
          const z = target.z + Math.cos(yaw) * radius;
          camera.position.set(x, elevation, z);
          camera.lookAt(target);
          camera.updateProjectionMatrix();

          if (controls) {
            controls.target.copy(target);
            controls.update();
          }

          if (VIEWPORT_CAPTURE_DEBUG) {
            console.debug("[ProjectViewport][capture] view", {
              name: view.name,
              yawDeg: view.yawDeg,
              camera: { x, y: elevation, z },
            });
          }

          invalidate?.();
          renderer.render(scene, camera);

          const dataUrl = renderer.domElement.toDataURL("image/png");
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
          const outputPath = `${args.outputDir}/${args.baseName}_${view.name}.png`;
          const savedPath = await generation.writePngBase64({
            outputPath,
            base64,
          });
          outputPaths.push(savedPath);
        }

        return outputPaths;
      } finally {
        renderer.setPixelRatio(previousPixelRatio);
        renderer.setSize(previousSize.x, previousSize.y, false);
        renderer.setViewport(
          previousViewport.x,
          previousViewport.y,
          previousViewport.z,
          previousViewport.w,
        );
        renderer.setScissor(
          previousScissor.x,
          previousScissor.y,
          previousScissor.z,
          previousScissor.w,
        );
        renderer.setScissorTest(previousScissorTest);
        renderer.autoClear = previousAutoClear;
        camera.aspect =
          previousSize.y > 0 ? previousSize.x / previousSize.y : camera.aspect;
        applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
        invalidate?.();
        renderer.render(scene, camera);
      }
    },
    [],
  );

  useEffect(() => {
    if (typeof resetSignal === "number") {
      handleResetView();
    }
  }, [handleResetView, resetSignal]);

  useEffect(() => {
    if (typeof fitSignal !== "number" || fitSignal <= 0) {
      return;
    }
    const camera = cameraRef.current;
    const model = loadedModelRef.current;
    if (!camera || !model) {
      return;
    }

    model.updateMatrixWorld(true);
    const box =
      computeVisibleBoundingBox(model) ?? new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.01);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0) {
      return;
    }

    const target = box.getCenter(new THREE.Vector3());
    const distance = Math.max(radius * 2.2, maxDim * 1.4);
    const elevation = target.y + Math.max(size.y * 0.4, radius * 0.6);
    const position = new THREE.Vector3(
      target.x + distance * 0.55,
      elevation,
      target.z + distance * 0.55,
    );
    const { near, far } = deriveCameraPlanes(radius);
    const snapshot: CameraSnapshot = {
      position,
      target,
      near,
      far,
    };

    cameraSnapshotRef.current = {
      position: snapshot.position.clone(),
      target: snapshot.target.clone(),
      near: snapshot.near,
      far: snapshot.far,
    };
    applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
    emitCameraTelemetry();
    invalidateRef.current?.();
  }, [emitCameraTelemetry, fitSignal]);

  useEffect(() => {
    const generation = (
      window as { volumia?: { generation?: ViewportGenerationBridge } }
    ).volumia?.generation;
    if (!generation?.setViewportMultiviewCaptureHandler) {
      return;
    }
    generation.setViewportMultiviewCaptureHandler(captureMultiviewSnapshots);
    return () => {
      generation.clearViewportMultiviewCaptureHandler?.();
    };
  }, [captureMultiviewSnapshots]);

  const handleToggleWireframe = useCallback(() => {
    if (onToggleWireframe) {
      onToggleWireframe();
      return;
    }
    setWireframeInternal((current) => !current);
  }, [onToggleWireframe]);

  const handleToggleDebugRender = useCallback(() => {
    setDebugRenderEnabled((current) => !current);
  }, []);

  const beginInteracting = useCallback(() => {
    if (interactionEndTimerRef.current !== null) {
      window.clearTimeout(interactionEndTimerRef.current);
      interactionEndTimerRef.current = null;
    }
    isInteractingRef.current = true;
    document.body.classList.add("is-orbiting");
    invalidateRef.current?.();
  }, []);

  const stopOrbiting = useCallback(() => {
    if (interactionEndTimerRef.current !== null) {
      window.clearTimeout(interactionEndTimerRef.current);
      interactionEndTimerRef.current = null;
    }
    if (!isInteractingRef.current) {
      return;
    }
    isInteractingRef.current = false;
    document.body.classList.remove("is-orbiting");
  }, []);

  const scheduleStopInteracting = useCallback(() => {
    if (interactionEndTimerRef.current !== null) {
      window.clearTimeout(interactionEndTimerRef.current);
    }
    interactionEndTimerRef.current = window.setTimeout(() => {
      interactionEndTimerRef.current = null;
      stopOrbiting();
    }, 300);
  }, [stopOrbiting]);

  const handleViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("canvas")
      ) {
        return;
      }
      if (VIEWPORT_EVENT_DEBUG) {
        console.debug("[ProjectViewport][events] pointerdown on canvas");
      }
      beginInteracting();
    },
    [beginInteracting],
  );

  const handleViewportPointerUp = useCallback(() => {
    scheduleStopInteracting();
  }, [scheduleStopInteracting]);

  const handleViewportPointerCancel = useCallback(() => {
    stopOrbiting();
  }, [stopOrbiting]);

  useEffect(() => {
    return () => {
      if (interactionEndTimerRef.current !== null) {
        window.clearTimeout(interactionEndTimerRef.current);
      }
      isInteractingRef.current = false;
      document.body.classList.remove("is-orbiting");
    };
  }, []);

  return (
    <div
      className="relative flex h-full min-h-0 w-full min-w-0 select-none overflow-hidden"
      onPointerDown={handleViewportPointerDown}
      onPointerUp={handleViewportPointerUp}
      onPointerCancel={handleViewportPointerCancel}
      onMouseLeave={stopOrbiting}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={hostRef}
        className="relative flex h-full w-full min-h-0 min-w-0 select-none flex-col overflow-hidden bg-[var(--shell-viewport)]"
      >
        {showChrome ? (
          <div className={headerClass}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`${chipClass} text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]`}
                >
                  {t("project.viewport")}
                </span>
                <span
                  className={`${hintChipClass} text-[10px] text-[var(--text-muted)]`}
                >
                  {t("project.viewportHint")}
                </span>
              </div>
              {showUtilityButtons ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetView}
                    className={utilityButtonBaseClass}
                  >
                    Reset View
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("x", 90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot X +90
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("x", -90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot X -90
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("y", 90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot Y +90
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("y", -90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot Y -90
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("z", 90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot Z +90
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateModel("z", -90)}
                    className={utilityButtonBaseClass}
                  >
                    Rot Z -90
                  </button>

                  <button
                    type="button"
                    onClick={handleResetOrientation}
                    className={utilityButtonBaseClass}
                  >
                    Reset Ori
                  </button>

                  <button
                    type="button"
                    onClick={handleRecenter}
                    className={utilityButtonBaseClass}
                  >
                    Recenter
                  </button>

                  <button
                    type="button"
                    onClick={handleAutoOrient}
                    className={utilityButtonBaseClass}
                  >
                    Auto Orient
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleWireframe}
                    className={utilityWireframeClass}
                  >
                    Wireframe
                  </button>
                  <button
                    type="button"
                    onClick={handleScreenshot}
                    className={utilityButtonBaseClass}
                  >
                    Screenshot
                  </button>
                  {VIEWER_DEBUG ? (
                    <button
                      type="button"
                      onClick={handleToggleDebugRender}
                      className={utilityDebugClass}
                    >
                      Debug Render
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="relative flex-1 min-h-0 w-full overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{ backgroundImage: themeConfig.overlayGradient }}
          />
          {themeConfig.vignetteGradient ? (
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{ backgroundImage: themeConfig.vignetteGradient }}
            />
          ) : null}
          {loadError ? (
            <div
              className="pointer-events-none absolute inset-x-3 top-3 z-20 rounded-[var(--radius-sm)] border px-3 py-2 text-[11px] leading-snug"
              style={{
                borderColor: themeConfig.errorBorder,
                backgroundColor: themeConfig.errorBg,
                color: themeConfig.errorText,
              }}
            >
              {loadError}
            </div>
          ) : null}
          {!loadError && viewerStatusLabel && viewerMaterialPolicy ? (
            <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[320px] rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 text-[11px] leading-snug text-[var(--text)] shadow-[var(--glass-shadow)] backdrop-blur-[12px]">
              <div className="font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
                {viewerStatusLabel}
              </div>
              <div className="mt-1 text-[var(--muted-text)]">
                {viewerStatusMessage}
              </div>
            </div>
          ) : null}
          {showChrome && modelStats ? (
            <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 text-right text-[10px] uppercase tracking-[0.12em] text-[var(--muted-text)] shadow-[var(--glass-shadow)] backdrop-blur-[12px]">
              <div>Mesh {modelStats.triangleCount.toLocaleString()} tris</div>
              <div className="mt-1 text-[9px] tracking-[0.1em] text-[var(--text-faint)]">
                Bounds {modelStats.bounds.x.toFixed(2)} x{" "}
                {modelStats.bounds.y.toFixed(2)} x{" "}
                {modelStats.bounds.z.toFixed(2)}
              </div>
            </div>
          ) : null}
          {VIEWER_DEBUG && modelNormalizationDebug ? (
            <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border border-[var(--border)] bg-[var(--surface-1)]/95 px-3 py-2 text-[11px] leading-snug text-[var(--text)]">
              {`centerXZ shift: ${modelNormalizationDebug.centeredX.toFixed(3)}, ${modelNormalizationDebug.centeredZ.toFixed(3)} | bbox: ${modelNormalizationDebug.bboxSize.x.toFixed(3)}, ${modelNormalizationDebug.bboxSize.y.toFixed(3)}, ${modelNormalizationDebug.bboxSize.z.toFixed(3)} | minY shift: ${modelNormalizationDebug.minYTranslation.toFixed(3)}`}
            </div>
          ) : null}
          {canRenderCanvas ? (
            <div className="relative h-full w-full min-h-0 select-none touch-none overflow-hidden">
              <Canvas
                key={`viewport-fps-${settings.fpsLimit}`}
                className="block h-full w-full"
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  pointerEvents: "auto",
                  touchAction: "none",
                }}
                eventSource={hostRef.current ?? undefined}
                eventPrefix="client"
                camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
                dpr={[1, 2]}
                frameloop="demand"
                shadows
                gl={{
                  antialias: true,
                  alpha: false,
                  preserveDrawingBuffer: true,
                  logarithmicDepthBuffer: true,
                }}
                onCreated={({ gl, camera, scene, invalidate }) => {
                  rendererRef.current = gl;
                  sceneRef.current = scene;
                  invalidateRef.current = invalidate;
                  gl.sortObjects = true;
                  if ("outputColorSpace" in gl) {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                  } else {
                    const legacyEncoding = Reflect.get(
                      THREE as Record<string, unknown>,
                      "sRGBEncoding",
                    );
                    if (legacyEncoding !== undefined) {
                      (
                        gl as THREE.WebGLRenderer & { outputEncoding: number }
                      ).outputEncoding = legacyEncoding as number;
                    }
                  }
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = themeConfig.toneMappingExposure;
                  gl.shadowMap.enabled = true;
                  gl.shadowMap.type = THREE.PCFSoftShadowMap;
                  if ("physicallyCorrectLights" in gl) {
                    (
                      gl as THREE.WebGLRenderer & {
                        physicallyCorrectLights: boolean;
                      }
                    ).physicallyCorrectLights = true;
                  }

                  if (camera instanceof THREE.PerspectiveCamera) {
                    const host = hostRef.current;
                    if (host) {
                      const width = Math.max(1, host.clientWidth);
                      const height = Math.max(1, host.clientHeight);
                      gl.setSize(width, height, false);
                      camera.aspect = width / height;
                      camera.updateProjectionMatrix();
                      setSize({ width, height });
                    }
                    camera.up.set(0, 1, 0);
                    cameraRef.current = camera;
                    applyCameraSnapshot(
                      camera,
                      controlsRef,
                      cameraSnapshotRef.current,
                    );
                    controlsRef.current?.update();
                    emitCameraTelemetry();
                  }
                }}
              >
                <ViewportResizeSync width={size.width} height={size.height} />
                <FrameLimiter
                  fpsLimit={settings.fpsLimit}
                  isInteractingRef={isInteractingRef}
                />
                <color attach="background" args={[themeConfig.background]} />
                <Environment
                  preset={themeConfig.environmentPreset}
                  background={false}
                />
                <ambientLight
                  intensity={themeConfig.ambientIntensity}
                  color={themeConfig.ambientColor}
                />
                <hemisphereLight
                  args={[
                    themeConfig.hemisphereSkyColor,
                    themeConfig.hemisphereGroundColor,
                    themeConfig.hemisphereIntensity,
                  ]}
                />
                <directionalLight
                  intensity={shadowEnabled ? themeConfig.keyIntensity : themeConfig.keyIntensity * 0.92}
                  color={themeConfig.keyColor}
                  position={[6, 10, 4]}
                  castShadow={shadowEnabled}
                  shadow-mapSize-width={shadowMapSize}
                  shadow-mapSize-height={shadowMapSize}
                  shadow-camera-near={SHADOW_CAMERA_NEAR}
                  shadow-camera-far={SHADOW_CAMERA_FAR}
                  shadow-camera-left={-SHADOW_CAMERA_BOUNDS}
                  shadow-camera-right={SHADOW_CAMERA_BOUNDS}
                  shadow-camera-top={SHADOW_CAMERA_BOUNDS}
                  shadow-camera-bottom={-SHADOW_CAMERA_BOUNDS}
                  shadow-bias={-0.0001}
                  shadow-normalBias={0.024}
                  shadow-radius={2.2}
                />
                <directionalLight
                  intensity={themeConfig.fillIntensity}
                  color={themeConfig.fillColor}
                  position={[-8, 5, 6]}
                />
                <directionalLight
                  intensity={themeConfig.rimIntensity}
                  color={themeConfig.rimColor}
                  position={[-5, 7, -8]}
                />
                <directionalLight
                  intensity={themeConfig.topDownKeyIntensity}
                  color={themeConfig.topDownKeyColor}
                  position={[0, 13, 0.5]}
                />
                <SceneMassing
                  showMassing={!glbPath}
                  showGrid={gridEnabled}
                  groundColor={themeConfig.ground}
                  bronzeTintColor={themeConfig.groundBronzeTint}
                  bronzeTintStrength={themeConfig.groundBronzeStrength}
                  groundMetalness={themeConfig.groundMetalness}
                  groundRoughness={themeConfig.groundRoughness}
                  gridMain={themeConfig.gridMain}
                  gridSub={themeConfig.gridSub}
                  gridOpacity={themeConfig.gridOpacity}
                />
                <ContactShadows
                  position={[0, 0.002, 0]}
                  opacity={shadowEnabled ? themeConfig.contactShadowOpacity : 0}
                  scale={themeConfig.contactShadowScale}
                  blur={themeConfig.contactShadowBlur}
                  far={themeConfig.contactShadowFar}
                  resolution={1024}
                />
                {shadowEnabled && themeConfig.ambientOcclusionOpacity > 0 ? (
                  <ContactShadows
                    position={[0, 0.001, 0]}
                    opacity={themeConfig.ambientOcclusionOpacity}
                    scale={themeConfig.ambientOcclusionScale}
                    blur={themeConfig.ambientOcclusionBlur}
                    far={themeConfig.ambientOcclusionFar}
                    resolution={512}
                  />
                ) : null}
                <LoadedModel
                  glbPath={glbPath}
                  glbVersion={glbVersion}
                  textureStatus={textureStatus}
                  textureValidation={textureValidation}
                  modelUrl={url}
                  allowFit={allowModelFit}
                  debugRenderEnabled={debugRenderEnabled}
                  fittedForUrlRef={fittedForUrlRef}
                  controlsRef={controlsRef}
                  envMapIntensity={themeConfig.envMapIntensity}
                  fallbackMaterialColor={themeConfig.fallbackMaterialColor}
                  wireframe={wireframe}
                  onLoadError={setLoadError}
                  onModelReady={(model) => {
                    loadedModelRef.current = model;
                    setModelStats(collectModelViewportStats(model));
                  }}
                  onCameraFit={(snapshot) => {
                    cameraSnapshotRef.current = snapshot;
                    emitCameraTelemetry();
                  }}
                  onModelNormalizationDebug={setModelNormalizationDebug}
                  onViewerMaterialPolicy={setViewerMaterialPolicy}
                />
                <OrbitControls
                  ref={controlsRef}
                  enabled={true}
                  enableRotate={true}
                  enableZoom={true}
                  enablePan={true}
                  makeDefault
                  target={[0, VIEW_TARGET.y, 0]}
                  enableDamping
                  dampingFactor={0.08}
                  mouseButtons={{
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN,
                  }}
                  minDistance={0.3}
                  maxDistance={20}
                  minPolarAngle={0}
                  maxPolarAngle={Math.PI * 0.49}
                  screenSpacePanning={false}
                  onStart={() => {
                    beginInteracting();
                    if (VIEWPORT_EVENT_DEBUG) {
                      console.debug("[ProjectViewport][controls] start");
                    }
                  }}
                  onChange={() => {
                    const camera = cameraRef.current;
                    const controls = controlsRef.current;
                    if (camera && controls) {
                      cameraSnapshotRef.current = {
                        position: camera.position.clone(),
                        target: controls.target.clone(),
                        near: camera.near,
                        far: camera.far,
                      };
                    }
                    emitCameraTelemetry();
                    invalidateRef.current?.();
                  }}
                  onEnd={() => {
                    scheduleStopInteracting();
                    if (VIEWPORT_EVENT_DEBUG) {
                      console.debug("[ProjectViewport][controls] end");
                    }
                  }}
                />
                <OrbitTargetClamp
                  controlsRef={controlsRef}
                  radius={4}
                  minY={0}
                  maxY={2.5}
                />
              </Canvas>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
