import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
};

type LoadedModelProps = {
  glbPath?: string;
  glbVersion?: number;
  controlsRef: { current: OrbitControlsImpl | null };
  envMapIntensity: number;
  wireframe: boolean;
  onLoadError: (message: string | null) => void;
  onCameraFit: (snapshot: CameraSnapshot) => void;
};

type ViewportTheme = "light" | "dark";

type CameraSnapshot = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
};

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
  envMapIntensity: number;
};

const VIEW_TARGET = new THREE.Vector3(0, 0.4, 0);
const CAMERA_DIRECTION = new THREE.Vector3(1, 0.8, 1).normalize();
const DEFAULT_CAMERA_SNAPSHOT: CameraSnapshot = {
  position: new THREE.Vector3(2.8, 2.2, 2.8),
  target: VIEW_TARGET.clone(),
  near: 0.1,
  far: 200,
};

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
  snapshot: CameraSnapshot
) {
  camera.position.copy(snapshot.position);
  camera.near = snapshot.near;
  camera.far = snapshot.far;
  camera.lookAt(snapshot.target);
  camera.updateProjectionMatrix();

  if (controlsRef.current) {
    controlsRef.current.target.copy(snapshot.target);
    controlsRef.current.update();
  }
}

function fitCameraToObject(
  camera: THREE.Camera,
  object: THREE.Object3D,
  controlsRef: { current: OrbitControlsImpl | null }
): CameraSnapshot | null {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return null;
  }

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return null;
  }

  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = THREE.MathUtils.clamp(
    (maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360))) * 1.35,
    1.2,
    20
  );
  const nextTarget = VIEW_TARGET.clone();
  const nextPosition = nextTarget.clone().add(CAMERA_DIRECTION.clone().multiplyScalar(distance));
  const near = Math.max(0.01, distance / 200);
  const far = Math.max(120, distance * 24);

  applyCameraSnapshot(camera, controlsRef, {
    position: nextPosition,
    target: nextTarget,
    near,
    far,
  });

  return {
    position: nextPosition.clone(),
    target: nextTarget.clone(),
    near,
    far,
  };
}

function normalizeModelForViewport(object: THREE.Object3D, targetSize = 1.0) {
  object.updateMatrixWorld(true);

  const sourceBox = new THREE.Box3().setFromObject(object);
  if (sourceBox.isEmpty()) {
    return;
  }

  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const maxDimension = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  if (Number.isFinite(maxDimension) && maxDimension > 0) {
    const uniformScale = targetSize / maxDimension;
    if (Number.isFinite(uniformScale) && uniformScale > 0) {
      object.scale.multiplyScalar(uniformScale);
      object.updateMatrixWorld(true);
    }
  }

  const centeredBox = new THREE.Box3().setFromObject(object);
  if (centeredBox.isEmpty()) {
    return;
  }

  const center = centeredBox.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.updateMatrixWorld(true);

  const groundedBox = new THREE.Box3().setFromObject(object);
  if (groundedBox.isEmpty()) {
    return;
  }

  object.position.y -= groundedBox.min.y;
  object.updateMatrixWorld(true);
}

function applyModelVisualSettings(object: THREE.Object3D, envMapIntensity: number, wireframe: boolean) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.envMapIntensity = envMapIntensity;
      }

      if ("wireframe" in material) {
        const wireframeMaterial = material as THREE.Material & { wireframe?: boolean };
        if (typeof wireframeMaterial.wireframe === "boolean") {
          wireframeMaterial.wireframe = wireframe;
        }
      }

      material.needsUpdate = true;
    }
  });
}

function LoadedModel({
  glbPath,
  glbVersion,
  controlsRef,
  envMapIntensity,
  wireframe,
  onLoadError,
  onCameraFit,
}: LoadedModelProps) {
  const { camera, scene, invalidate } = useThree();
  const modelRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current = null;
      invalidate();
    }

    if (!glbPath) {
      onLoadError(null);
      return;
    }

    const loader = new GLTFLoader();
    let active = true;
    const readGlb = (window as { volumia?: { generation?: { readGlb?: (path: string) => Promise<ArrayBuffer | Uint8Array> } } }).volumia?.generation?.readGlb;

    if (!readGlb) {
      onLoadError("GLB reader unavailable in this environment.");
      return;
    }

    onLoadError(null);

    void (async () => {
      try {
        const buffer = await readGlb(glbPath);
        const source = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        const bytes = new Uint8Array(source.byteLength);
        bytes.set(source);
        const arrayBuffer = bytes.buffer;
        loader.parse(
          arrayBuffer,
          "",
          (gltf) => {
            if (!active) return;
            const model = gltf.scene ?? gltf.scenes[0];
            if (!model) {
              onLoadError("GLB loaded but no scene was found.");
              return;
            }
            normalizeModelForViewport(model);
            scene.add(model);
            applyModelVisualSettings(model, envMapIntensity, wireframe);
            modelRef.current = model;
            const snapshot = fitCameraToObject(camera, model, controlsRef);
            if (snapshot) {
              onCameraFit(snapshot);
            }
            onLoadError(null);
            invalidate();
          },
          (error) => {
            if (!active) return;
            onLoadError(`GLB parse error: ${extractErrorMessage(error)}`);
            invalidate();
          }
        );
      } catch (error) {
        if (!active) return;
        onLoadError(`GLB load error: ${extractErrorMessage(error)}`);
        invalidate();
      }
    })();

    return () => {
      active = false;
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current = null;
        invalidate();
      }
    };
  }, [camera, controlsRef, envMapIntensity, glbPath, glbVersion, invalidate, onCameraFit, onLoadError, scene, wireframe]);

  useEffect(() => {
    if (!modelRef.current) {
      return;
    }

    applyModelVisualSettings(modelRef.current, envMapIntensity, wireframe);
    invalidate();
  }, [envMapIntensity, invalidate, wireframe]);

  return null;
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
      background: "#f0ebe3",
      ground: "#bfb7ac",
      gridMain: "#6a6358",
      gridSub: "#8a8277",
      gridOpacity: 0.45,
      ambientIntensity: 0.18,
      hemisphereIntensity: 0.6,
      keyIntensity: 1.6,
      fillIntensity: 0.8,
      envMapIntensity: 0.9,
    };
  }

  return {
    isDark: true,
    background: "#2b2926",
    ground: "#4a4640",
    gridMain: "#6a6358",
    gridSub: "#4a443c",
    gridOpacity: 0.35,
    ambientIntensity: 0.22,
    hemisphereIntensity: 0.9,
    keyIntensity: 2.2,
    fillIntensity: 1.1,
    envMapIntensity: 1.1,
  };
}

function SceneRendererSetup({
  theme,
  background,
}: {
  theme: ViewportTheme;
  background: string;
}) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    gl.toneMappingExposure = theme === "dark" ? 1.15 : 1.0;
    gl.setClearColor(background, 1);
    gl.domElement.style.background = background;
    scene.background = new THREE.Color(background);

    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const envMap = pmrem.fromScene(environment, 0.04).texture;
    const previousEnvironment = scene.environment;
    scene.environment = envMap;

    invalidate();

    return () => {
      if (scene.environment === envMap) {
        scene.environment = previousEnvironment ?? null;
      }
      environment.dispose();
      envMap.dispose();
      pmrem.dispose();
    };
  }, [background, gl, invalidate, scene, theme]);

  return null;
}

export function ProjectViewport({ glbPath, glbVersion }: ProjectViewportProps) {
  const { t } = useT();
  const { settings, resolvedTheme } = useSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraSnapshotRef = useRef<CameraSnapshot>({
    position: DEFAULT_CAMERA_SNAPSHOT.position.clone(),
    target: DEFAULT_CAMERA_SNAPSHOT.target.clone(),
    near: DEFAULT_CAMERA_SNAPSHOT.near,
    far: DEFAULT_CAMERA_SNAPSHOT.far,
  });
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [wireframe, setWireframe] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const canRenderCanvas = size.width >= 10 && size.height >= 10;
  const viewportTheme = resolveViewportTheme(resolvedTheme);
  const themeConfig = getViewportThemeConfig(viewportTheme);
  const bgClass = themeConfig.isDark
    ? "bg-[#2b2926]"
    : "bg-[#f0ebe3]";

  useEffect(() => {
    if (glbPath) {
      return;
    }

    cameraSnapshotRef.current = {
      position: DEFAULT_CAMERA_SNAPSHOT.position.clone(),
      target: DEFAULT_CAMERA_SNAPSHOT.target.clone(),
      near: DEFAULT_CAMERA_SNAPSHOT.near,
      far: DEFAULT_CAMERA_SNAPSHOT.far,
    };
    setLoadError(null);
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

  return (
    <div className="relative w-full">
      <div
        ref={hostRef}
        className={`relative w-full min-h-[260px] overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow)] aspect-[16/9] ${bgClass}`}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {t("project.viewport")}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
          {t("project.viewportHint")}
        </div>
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetView}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Reset View
          </button>
          <button
            type="button"
            onClick={() => setWireframe((current) => !current)}
            className={`rounded-md border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors ${
              wireframe
                ? "bg-[var(--surface-3)] text-[var(--text)]"
                : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Wireframe
          </button>
          <button
            type="button"
            onClick={handleScreenshot}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Screenshot
          </button>
        </div>
        {loadError ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-12 z-20 rounded-md border border-[#7e2d2d] bg-[#3c1515]/90 px-3 py-2 text-[11px] leading-snug text-[#ffd7d7]">
            {loadError}
          </div>
        ) : null}
        {canRenderCanvas ? (
          <div className="absolute inset-0">
            <Canvas
              key={`viewport-fps-${settings.fpsLimit}`}
              className="block !h-full !w-full"
              style={{ display: "block" }}
              camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
              dpr={[1, 2]}
              frameloop="demand"
              shadows
              gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
              onCreated={({ gl, camera }) => {
                rendererRef.current = gl;
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
                  cameraRef.current = camera;
                  applyCameraSnapshot(camera, controlsRef, cameraSnapshotRef.current);
                }
              }}
            >
              <ViewportResizeSync width={size.width} height={size.height} />
              <SceneRendererSetup
                theme={viewportTheme}
                background={themeConfig.background}
              />
              <FrameLimiter fpsLimit={settings.fpsLimit} />
              <color attach="background" args={[themeConfig.background]} />
              <ambientLight intensity={themeConfig.ambientIntensity} color="#efe5d5" />
              <hemisphereLight args={["#f2e8d8", "#7f7468", themeConfig.hemisphereIntensity]} />
              <directionalLight
                intensity={themeConfig.keyIntensity}
                color="#f8f0e3"
                position={[5, 10, 5]}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />
              <directionalLight
                intensity={themeConfig.fillIntensity}
                color="#ece2d1"
                position={[-6, 6, -4]}
              />
              <SceneMassing
                showMassing={!glbPath}
                groundColor={themeConfig.ground}
                gridMain={themeConfig.gridMain}
                gridSub={themeConfig.gridSub}
                gridOpacity={themeConfig.gridOpacity}
              />
              <LoadedModel
                glbPath={glbPath}
                glbVersion={glbVersion}
                controlsRef={controlsRef}
                envMapIntensity={themeConfig.envMapIntensity}
                wireframe={wireframe}
                onLoadError={setLoadError}
                onCameraFit={(snapshot) => {
                  cameraSnapshotRef.current = snapshot;
                }}
              />
              <OrbitControls
                ref={controlsRef}
                makeDefault
                target={[0, 0.4, 0]}
                enableDamping
                dampingFactor={0.08}
                minDistance={0.3}
                maxDistance={20}
                minPolarAngle={0}
                maxPolarAngle={Math.PI * 0.49}
                screenSpacePanning={false}
              />
              <OrbitTargetClamp controlsRef={controlsRef} radius={4} minY={0} maxY={2.5} />
            </Canvas>
          </div>
        ) : null}
      </div>
    </div>
  );
}
