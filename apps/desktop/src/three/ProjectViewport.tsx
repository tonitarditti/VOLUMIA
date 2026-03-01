import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import { SceneMassing } from "./SceneMassing";

type ViewportSize = {
  width: number;
  height: number;
};

type FrameLimiterProps = {
  fpsLimit: 30 | 60 | 120;
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
  isGenerating?: boolean;
  generationStage?: string;
  showUtilityButtons?: boolean;
  showChrome?: boolean;
  resetSignal?: number;
  wireframe?: boolean;
  onToggleWireframe?: () => void;
};

type ViewportMultiviewCaptureArgs = {
  outputDir: string;
  baseName: string;
  width: number;
  height: number;
};

type ViewportGenerationBridge = {
  readGlb?: (path: string) => Promise<ArrayBuffer | Uint8Array>;
  writePngBase64?: (payload: { outputPath: string; base64: string }) => Promise<string>;
  captureViewportMultiview?: (payload: ViewportMultiviewCaptureArgs) => Promise<string[]>;
  setViewportMultiviewCaptureHandler?: (
    handler: (payload: ViewportMultiviewCaptureArgs) => Promise<string[]>
  ) => void;
  clearViewportMultiviewCaptureHandler?: () => void;
};

type LoadedModelProps = {
  glbPath?: string;
  glbVersion?: number;
  modelUrl?: string;
  allowFit: boolean;
  debugRenderEnabled: boolean;
  fittedForUrlRef: { current: string | null };
  controlsRef: { current: OrbitControlsImpl | null };
  envMapIntensity: number;
  wireframe: boolean;
  onLoadError: (message: string | null) => void;
  onCameraFit: (snapshot: CameraSnapshot) => void;
  onModelNormalizationDebug: (info: ModelNormalizationDebug | null) => void;
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
};

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
  polygonOffsetEngaged: boolean;
};

type NormalizeAndStabilizeOptions = {
  floorY: number;
  envMapIntensity: number;
  wireframe: boolean;
  debugRender: boolean;
  forcePolygonOffsetAllMeshes: boolean;
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
  background: string;
  ground: string;
  gridMain: string;
  gridSub: string;
  gridOpacity: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
  envMapIntensity: number;
};

const VIEW_TARGET = new THREE.Vector3(0, 0, 0);
const VIEWER_DEBUG = import.meta.env.DEV;
const VIEWPORT_EVENT_DEBUG = import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_DEBUG_VIEWPORT === "1";
const VIEWPORT_CAPTURE_DEBUG = import.meta.env.VITE_VOLUMIA_DEBUG_VIEWPORT === "1";
const DEFAULT_DEBUG_RENDER = import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_DEBUG_RENDER === "1";
const DEV_POLY_OFFSET_ALL_MESHES = import.meta.env.DEV && import.meta.env.VITE_VOLUMIA_POLYOFFSET_ALL_MESHES === "1";
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
    const hasLargeFootprint = size.x >= footprintThreshold && size.z >= footprintThreshold;
    if (!isThin || !isNearGlobalMin || !hasLargeFootprint) {
      return;
    }

    child.visible = false;
    removed += 1;
    debug.push(`${child.name || "(unnamed)"} size=(${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)})`);
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
  controlsFromThree: OrbitControlsImpl | null = null
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

function resolveFitKey(glbPath?: string, glbVersion?: number, modelUrl?: string) {
  if (modelUrl) {
    return modelUrl;
  }
  if (glbPath) {
    return typeof glbVersion === "number" ? `${glbPath}::${glbVersion}` : glbPath;
  }
  return "";
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
    const legacyEncoding = (THREE as unknown as { sRGBEncoding?: number }).sRGBEncoding;
    if (legacyEncoding !== undefined) {
      (texture as THREE.Texture & { encoding?: number }).encoding = legacyEncoding;
    }
  }
  texture.needsUpdate = true;
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

  const suspicious = duplicateBoxKeyCount > 0 || thinMeshCount >= Math.max(2, Math.floor(meshCount * 0.2));
  return {
    meshCount,
    thinMeshCount,
    duplicateBoxKeyCount,
    suspicious,
  };
}

function applyModelVisualSettings(
  object: THREE.Object3D,
  options: { envMapIntensity: number; wireframe: boolean; polygonOffset: boolean }
): MaterialStabilityStats {
  const stats: MaterialStabilityStats = {
    totalMaterials: 0,
    transparentMaterials: 0,
    forcedOpaqueMaterials: 0,
    translucentMaterials: 0,
    polygonOffsetMaterials: 0,
  };

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({
        color: "#c8c8c8",
        roughness: 0.62,
        metalness: 0.08,
      });
    }

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const normalizedMaterials = sourceMaterials.map((material) => {
      if (!material) {
        return new THREE.MeshStandardMaterial({
          color: "#c8c8c8",
          roughness: 0.62,
          metalness: 0.08,
        });
      }

      const materialName = (material.name ?? "").trim().toLowerCase();
      const isDefaultMaterial = materialName === "" || materialName === "default";
      if (!isDefaultMaterial) {
        return material;
      }

      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        const hasTextureMaps = Boolean(
          material.map ||
          material.normalMap ||
          material.roughnessMap ||
          material.metalnessMap ||
          material.aoMap
        );
        if (!hasTextureMaps) {
          material.color.set("#c8c8c8");
          material.roughness = 0.62;
          material.metalness = 0.08;
        }
        return material;
      }

      const fallback = new THREE.MeshStandardMaterial({
        color: "#c8c8c8",
        roughness: 0.62,
        metalness: 0.08,
      });
      fallback.name = material.name || "default";
      return fallback;
    });

    if (Array.isArray(child.material)) {
      child.material = normalizedMaterials;
    } else {
      child.material = normalizedMaterials[0]!;
    }

    for (const material of normalizedMaterials) {
      if (!material) {
        continue;
      }
      stats.totalMaterials += 1;

      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.envMapIntensity = options.envMapIntensity;
      }

      if ("wireframe" in material) {
        const wireframeMaterial = material as THREE.Material & { wireframe?: boolean };
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
      const opacity = typeof alphaMaterial.opacity === "number" ? alphaMaterial.opacity : 1;
      const wasTransparent = alphaMaterial.transparent === true;
      if (wasTransparent) {
        stats.transparentMaterials += 1;
      }
      if (wasTransparent && opacity >= 0.99) {
        alphaMaterial.transparent = false;
        alphaMaterial.opacity = 1;
        stats.forcedOpaqueMaterials += 1;
      }

      const isTranslucent = alphaMaterial.transparent === true && (alphaMaterial.opacity ?? 1) < 0.99;
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
        child.renderOrder = Math.max(child.renderOrder, 1);
      }
      material.needsUpdate = true;
    }
  });

  return stats;
}

function applyTextures(root: THREE.Object3D, materialMap: TextureMaterialMap) {
  if (Object.keys(materialMap).length === 0) {
    return;
  }

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      const keyCandidates = [material.name, child.name].filter((value) => value && value.trim().length > 0) as string[];
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
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.dispose();
    }
  });
}

function normalizeAndStabilizeModel(root: THREE.Object3D, options: NormalizeAndStabilizeOptions): ModelStabilizationResult | null {
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
  const isScaleClearlyWrong = preScaleDiagonal > 0 && (preScaleDiagonal < 0.02 || preScaleDiagonal > 200);
  if (isScaleClearlyWrong) {
    scaleApplied = THREE.MathUtils.clamp(TARGET_MODEL_DIAGONAL / preScaleDiagonal, 0.001, 1000);
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
  const polygonOffsetEngaged = options.forcePolygonOffsetAllMeshes || coplanar.suspicious;
  const material = applyModelVisualSettings(root, {
    envMapIntensity: options.envMapIntensity,
    wireframe: options.wireframe,
    polygonOffset: polygonOffsetEngaged,
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
    polygonOffsetEngaged,
  };
}

function LoadedModel({
  glbPath,
  glbVersion,
  modelUrl,
  allowFit,
  debugRenderEnabled,
  fittedForUrlRef,
  controlsRef,
  envMapIntensity,
  wireframe,
  onLoadError,
  onCameraFit,
  onModelNormalizationDebug,
  onModelReady,
}: LoadedModelProps) {
  const { camera, controls, invalidate } = useThree();
  const modelRef = useRef<THREE.Group>(null);
  const loadedSceneRef = useRef<THREE.Object3D | null>(null);
  const [loadedModel, setLoadedModel] = useState<THREE.Object3D | null>(null);
  const [stabilization, setStabilization] = useState<ModelStabilizationResult | null>(null);
  const cameraFitKeyRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const invalidateRef = useRef(invalidate);
  const envMapIntensityRef = useRef(envMapIntensity);
  const wireframeRef = useRef(wireframe);
  const debugRenderEnabledRef = useRef(debugRenderEnabled);
  const onLoadErrorRef = useRef(onLoadError);
  const onModelNormalizationDebugRef = useRef(onModelNormalizationDebug);
  const onModelReadyRef = useRef(onModelReady);

  useEffect(() => {
    invalidateRef.current = invalidate;
  }, [invalidate]);

  useEffect(() => {
    envMapIntensityRef.current = envMapIntensity;
  }, [envMapIntensity]);

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
      onLoadErrorRef.current(null);
      onModelNormalizationDebugRef.current(null);
      onModelReadyRef.current(null);
      cameraFitKeyRef.current = null;
      invalidateRef.current();
      return;
    }

    const loader = new GLTFLoader();
    const readGlb = (window as { volumia?: { generation?: ViewportGenerationBridge } }).volumia?.generation?.readGlb;

    if (!readGlb) {
      onLoadErrorRef.current("GLB reader unavailable in this environment.");
      return;
    }

    const seq = ++loadSeqRef.current;
    let cancelled = false;
    onLoadErrorRef.current(null);

    const shouldRetry = !loadedSceneRef.current && /(?:^|[\\/])latest\.glb(?:\?.*)?$/i.test(glbPath);
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
          }
        );
      });

    void (async () => {
      let nextModel: THREE.Object3D | null = null;
      try {
        const buffer = await readBufferWithRetry();
        if (cancelled || seq !== loadSeqRef.current) {
          return;
        }
        const source = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
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
        const stabilized = normalizeAndStabilizeModel(nextModel, {
          floorY: FLOOR_Y,
          envMapIntensity: envMapIntensityRef.current,
          wireframe: wireframeRef.current,
          debugRender: debugRenderEnabledRef.current,
          forcePolygonOffsetAllMeshes: DEV_POLY_OFFSET_ALL_MESHES,
        });

        if (!stabilized) {
          disposeObject3D(nextModel);
          if (seq === loadSeqRef.current) {
            onLoadErrorRef.current("GLB stabilization failed.");
          }
          return;
        }

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
        invalidateRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [glbPath, modelUrl]);

  useEffect(() => {
    if (!loadedModel || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    loadedModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(loadedModel);
    if (box.isEmpty()) {
      return;
    }

    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.01);
    const { near, far } = deriveCameraPlanes(radius);
    if (!Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || near >= far) {
      if (debugRenderEnabled) {
        console.warn("[ProjectViewport][debug-render] Invalid derived planes", { near, far, radius });
      }
      return;
    }

    const changed = Math.abs(camera.near - near) > 1e-6 || Math.abs(camera.far - far) > 1e-3;
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
    const cameraDistance = Math.max((radius / Math.tan(fovRad / 2)) * 1.25, radius * 2.2);
    const { near, far } = deriveCameraPlanes(radius);
    const nextTarget = new THREE.Vector3(0, 0, 0);
    const nextPosition = new THREE.Vector3(0, Math.max(size.y * 0.5, radius * 0.9), cameraDistance);
    const snapshot: CameraSnapshot = {
      position: nextPosition,
      target: nextTarget,
      near,
      far,
    };

    const controlsFromThree = asOrbitControls(controls);
    applyCameraSnapshot(camera, controlsRef, snapshot, controlsFromThree);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onCameraFit({
      position: snapshot.position.clone(),
      target: snapshot.target.clone(),
      near: snapshot.near,
      far: snapshot.far,
    });
    if (debugRenderEnabled) {
      if (!Number.isFinite(snapshot.near) || !Number.isFinite(snapshot.far) || snapshot.near <= 0 || snapshot.near >= snapshot.far) {
        console.warn("[ProjectViewport][debug-render] Invalid camera near/far", snapshot);
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

    applyModelVisualSettings(loadedModel, {
      envMapIntensity,
      wireframe,
      polygonOffset: stabilization?.polygonOffsetEngaged ?? DEV_POLY_OFFSET_ALL_MESHES,
    });
    invalidate();
  }, [envMapIntensity, invalidate, loadedModel, stabilization, wireframe]);

  return <group ref={modelRef} />;
}

function FrameLimiter({ fpsLimit }: FrameLimiterProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    const frameDurationMs = Math.max(8, Math.round(1000 / fpsLimit));
    invalidate();

    const interval = window.setInterval(() => {
      invalidate();
    }, frameDurationMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fpsLimit, invalidate]);

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

function OrbitTargetClamp({ controlsRef, radius, minY, maxY }: OrbitTargetClampProps) {
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

    if (document.documentElement.classList.contains("dark") || document.body.classList.contains("dark")) {
      return "dark";
    }
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "dark";
}

function getViewportThemeConfig(theme: ViewportTheme): ViewportThemeConfig {
  if (theme === "light") {
    return {
      isDark: false,
      background: "#f4f1ee",
      ground: "#8e867c",
      gridMain: "#756d63",
      gridSub: "#7f776d",
      gridOpacity: 0.38,
      ambientIntensity: 0.18,
      hemisphereIntensity: 0.6,
      keyIntensity: 1.6,
      fillIntensity: 0.8,
      rimIntensity: 0.45,
      envMapIntensity: 0.9,
    };
  }

  return {
    isDark: true,
    background: "#0d0b0a",
    ground: "#3d3832",
    gridMain: "#3a352f",
    gridSub: "#36322d",
    gridOpacity: 0.3,
    ambientIntensity: 0.18,
    hemisphereIntensity: 0.78,
    keyIntensity: 2.35,
    fillIntensity: 0.95,
    rimIntensity: 0.5,
    envMapIntensity: 1.05,
  };
}

export function ProjectViewport({
  glbPath,
  glbVersion,
  isGenerating = false,
  generationStage,
  showUtilityButtons = true,
  showChrome = true,
  resetSignal,
  wireframe: wireframeProp,
  onToggleWireframe,
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
  const [debugRenderEnabled, setDebugRenderEnabled] = useState(DEFAULT_DEBUG_RENDER);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modelNormalizationDebug, setModelNormalizationDebug] = useState<ModelNormalizationDebug | null>(null);
  const wireframe = wireframeProp ?? wireframeInternal;
  const isOrbitingRef = useRef(false);
  const url = useMemo(() => (glbPath ? (glbVersion ? `${glbPath}?v=${glbVersion}` : glbPath) : undefined), [glbPath, glbVersion]);
  const isFinalStage = useMemo(() => {
    const stage = (generationStage ?? "").toLowerCase();
    return stage === "done" || stage === "ready" || stage === "final";
  }, [generationStage]);
  const allowModelFit = !isGenerating && isFinalStage;

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
  const themeConfig = getViewportThemeConfig(viewportTheme);
  const bgClass = themeConfig.isDark ? "bg-[#0c0a09]" : "bg-[#f4f1ee]";
  const shadowMapSize = settings.fpsLimit >= 120 ? 1024 : 2048;
  const headerClass = "shrink-0 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2";
  const chipClass = "rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1";
  const hintChipClass = "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1";
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
  }, [glbPath]);

  const handleResetView = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
  }, []);

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

  const captureMultiviewSnapshots = useCallback(async (args: ViewportMultiviewCaptureArgs) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const model = loadedModelRef.current;
    const invalidate = invalidateRef.current;
    const generation = (window as { volumia?: { generation?: ViewportGenerationBridge } }).volumia?.generation;

    if (!renderer || !camera || !scene || !model) {
      throw new Error("Viewport capture unavailable: renderer, camera, scene, or model is missing.");
    }
    if (!generation?.writePngBase64) {
      throw new Error("Viewport capture unavailable: PNG writer bridge is missing.");
    }
    if (!Number.isFinite(args.width) || !Number.isFinite(args.height) || args.width < 32 || args.height < 32) {
      throw new Error("Viewport capture received invalid dimensions.");
    }
    if (!args.outputDir.trim() || !args.baseName.trim()) {
      throw new Error("Viewport capture requires outputDir and baseName.");
    }

    model.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(model);
    if (bbox.isEmpty()) {
      throw new Error("Viewport capture failed: model bounding box is empty.");
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
    const previousTarget = controls ? controls.target.clone() : target.clone();
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
    const views: Array<{ name: "front" | "right" | "rear" | "left"; yawDeg: number }> = [
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
      renderer.setViewport(previousViewport.x, previousViewport.y, previousViewport.z, previousViewport.w);
      renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
      renderer.setScissorTest(previousScissorTest);
      renderer.autoClear = previousAutoClear;
      camera.aspect = previousSize.y > 0 ? previousSize.x / previousSize.y : camera.aspect;
      applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
      invalidate?.();
      renderer.render(scene, camera);
    }
  }, []);

  useEffect(() => {
    if (typeof resetSignal === "number") {
      handleResetView();
    }
  }, [handleResetView, resetSignal]);

  useEffect(() => {
    const generation = (window as { volumia?: { generation?: ViewportGenerationBridge } }).volumia?.generation;
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

  const stopOrbiting = useCallback(() => {
    if (!isOrbitingRef.current) {
      return;
    }
    isOrbitingRef.current = false;
    document.body.classList.remove("is-orbiting");
  }, []);

  const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest("canvas")) {
      return;
    }
    if (VIEWPORT_EVENT_DEBUG) {
      console.debug("[ProjectViewport][events] pointerdown on canvas");
    }
    isOrbitingRef.current = true;
    document.body.classList.add("is-orbiting");
  }, []);

  const handleViewportPointerUp = useCallback(() => {
    stopOrbiting();
  }, [stopOrbiting]);

  const handleViewportPointerCancel = useCallback(() => {
    stopOrbiting();
  }, [stopOrbiting]);

  useEffect(() => {
    return () => {
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
        className={`relative flex h-full w-full min-h-0 min-w-0 select-none flex-col overflow-hidden ${bgClass}`}
      >
        {showChrome ? (
          <div className={headerClass}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`${chipClass} text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]`}>
                  {t("project.viewport")}
                </span>
                <span className={`${hintChipClass} text-[10px] text-[var(--text-muted)]`}>
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
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(86,75,62,0.08)_0%,rgba(24,21,19,0.03)_36%,rgba(8,8,8,0)_100%)]" />
          {loadError ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 rounded-md border border-[#7e2d2d] bg-[#3c1515]/90 px-3 py-2 text-[11px] leading-snug text-[#ffd7d7]">
              {loadError}
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
                style={{ display: "block", width: "100%", height: "100%", pointerEvents: "auto", touchAction: "none" }}
                eventSource={hostRef.current ?? undefined}
                eventPrefix="client"
                camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
                dpr={[1, 2]}
                frameloop="demand"
                shadows
                gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, logarithmicDepthBuffer: true }}
                onCreated={({ gl, camera, scene, invalidate }) => {
                  rendererRef.current = gl;
                  sceneRef.current = scene;
                  invalidateRef.current = invalidate;
                  gl.sortObjects = true;
                  if ("outputColorSpace" in gl) {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                  } else {
                    const legacyEncoding = (THREE as unknown as { sRGBEncoding?: number }).sRGBEncoding;
                    if (legacyEncoding !== undefined) {
                      (gl as THREE.WebGLRenderer & { outputEncoding: number }).outputEncoding = legacyEncoding;
                    }
                  }
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = viewportTheme === "dark" ? 1.15 : 1.0;
                  gl.shadowMap.enabled = true;
                  gl.shadowMap.type = THREE.PCFSoftShadowMap;
                  if ("physicallyCorrectLights" in gl) {
                    (gl as THREE.WebGLRenderer & { physicallyCorrectLights: boolean }).physicallyCorrectLights = true;
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
                    applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
                    controlsRef.current?.update();
                  }
                }}
              >
                <ViewportResizeSync width={size.width} height={size.height} />
                <FrameLimiter fpsLimit={settings.fpsLimit} />
                <color attach="background" args={[themeConfig.background]} />
                <Environment preset={themeConfig.isDark ? "warehouse" : "studio"} background={false} />
                <ambientLight intensity={themeConfig.ambientIntensity} color="#efe5d5" />
                <hemisphereLight args={["#f2e8d8", "#7f7468", themeConfig.hemisphereIntensity]} />
                <directionalLight
                  intensity={themeConfig.keyIntensity}
                  color="#f8f0e3"
                  position={[6, 10, 4]}
                  castShadow
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
                  color="#ece2d1"
                  position={[-8, 5, 6]}
                />
                <directionalLight
                  intensity={themeConfig.rimIntensity}
                  color="#fff6e8"
                  position={[-5, 7, -8]}
                />
                <SceneMassing
                  showMassing={!glbPath}
                  groundColor={themeConfig.ground}
                  gridMain={themeConfig.gridMain}
                  gridSub={themeConfig.gridSub}
                  gridOpacity={themeConfig.gridOpacity}
                />
                <ContactShadows
                  position={[0, 0.002, 0]}
                  opacity={themeConfig.isDark ? 0.5 : 0.4}
                  scale={14}
                  blur={2.2}
                  far={8}
                  resolution={1024}
                />
                <LoadedModel
                  glbPath={glbPath}
                  glbVersion={glbVersion}
                  modelUrl={url}
                  allowFit={allowModelFit}
                  debugRenderEnabled={debugRenderEnabled}
                  fittedForUrlRef={fittedForUrlRef}
                  controlsRef={controlsRef}
                  envMapIntensity={themeConfig.envMapIntensity}
                  wireframe={wireframe}
                  onLoadError={setLoadError}
                  onModelReady={(model) => {
                    loadedModelRef.current = model;
                  }}
                  onCameraFit={(snapshot) => {
                    cameraSnapshotRef.current = snapshot;
                  }}
                  onModelNormalizationDebug={setModelNormalizationDebug}
                />
                <OrbitControls
                  ref={controlsRef}
                  enabled={true}
                  enableRotate={true}
                  enableZoom={true}
                  enablePan={true}
                  makeDefault
                  target={[0, 0, 0]}
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
                    if (VIEWPORT_EVENT_DEBUG) {
                      console.debug("[ProjectViewport][controls] start");
                    }
                  }}
                  onEnd={() => {
                    if (VIEWPORT_EVENT_DEBUG) {
                      console.debug("[ProjectViewport][controls] end");
                    }
                  }}
                />
                <OrbitTargetClamp controlsRef={controlsRef} radius={4} minY={0} maxY={2.5} />
              </Canvas>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
