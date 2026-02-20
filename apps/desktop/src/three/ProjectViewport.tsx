import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  showUtilityButtons?: boolean;
  showChrome?: boolean;
  resetSignal?: number;
  wireframe?: boolean;
  onToggleWireframe?: () => void;
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
  rimIntensity: number;
  envMapIntensity: number;
};

const VIEW_TARGET = new THREE.Vector3(0, 0.4, 0);
const SHADOW_CAMERA_BOUNDS = 12;
const SHADOW_CAMERA_NEAR = 0.5;
const SHADOW_CAMERA_FAR = 40;
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
  const { camera, controls, invalidate } = useThree();
  const modelRef = useRef<THREE.Group>(null);
  const loadedSceneRef = useRef<THREE.Object3D | null>(null);
  const [loadedModel, setLoadedModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    const container = modelRef.current;
    if (container && loadedSceneRef.current) {
      container.remove(loadedSceneRef.current);
      loadedSceneRef.current = null;
      setLoadedModel(null);
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
            const container = modelRef.current;
            if (!container) {
              onLoadError("Model container unavailable.");
              return;
            }
            container.add(model);
            applyModelVisualSettings(model, envMapIntensity, wireframe);
            loadedSceneRef.current = model;
            setLoadedModel(model);
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
      const container = modelRef.current;
      if (container && loadedSceneRef.current) {
        container.remove(loadedSceneRef.current);
        loadedSceneRef.current = null;
        setLoadedModel(null);
        invalidate();
      }
    };
  }, [envMapIntensity, glbPath, glbVersion, invalidate, onLoadError, wireframe]);

  useEffect(() => {
    if (!loadedModel || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    loadedModel.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(loadedModel);
    if (box.isEmpty()) {
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    loadedModel.position.x -= center.x;
    loadedModel.position.z -= center.z;
    loadedModel.updateMatrixWorld(true);

    const groundedBox = new THREE.Box3().setFromObject(loadedModel);
    if (groundedBox.isEmpty()) {
      return;
    }
    if (Number.isFinite(groundedBox.min.y)) {
      loadedModel.position.y -= groundedBox.min.y;
      loadedModel.updateMatrixWorld(true);
    }

    const finalBox = new THREE.Box3().setFromObject(loadedModel);
    if (finalBox.isEmpty()) {
      return;
    }

    const size = finalBox.getSize(new THREE.Vector3());
    const finalCenter = finalBox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0) {
      return;
    }

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const cameraZ = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.4;
    const near = Math.max(0.01, cameraZ / 100);
    const far = Math.max(50, cameraZ * 20);
    const nextTarget = new THREE.Vector3(0, finalCenter.y, 0);
    const nextPosition = new THREE.Vector3(0, finalCenter.y + maxDim * 0.35, cameraZ);
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
    invalidate();
  }, [camera, controls, controlsRef, invalidate, loadedModel, onCameraFit]);

  useEffect(() => {
    if (!loadedModel) {
      return;
    }

    applyModelVisualSettings(loadedModel, envMapIntensity, wireframe);
    invalidate();
  }, [envMapIntensity, invalidate, loadedModel, wireframe]);

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
    background: "#0c0a09",
    ground: "#433f39",
    gridMain: "#3a352f",
    gridSub: "#36322d",
    gridOpacity: 0.35,
    ambientIntensity: 0.22,
    hemisphereIntensity: 0.9,
    keyIntensity: 2.2,
    fillIntensity: 1.1,
    rimIntensity: 0.6,
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

export function ProjectViewport({
  glbPath,
  glbVersion,
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
  const cameraSnapshotRef = useRef<CameraSnapshot>({
    position: DEFAULT_CAMERA_SNAPSHOT.position.clone(),
    target: DEFAULT_CAMERA_SNAPSHOT.target.clone(),
    near: DEFAULT_CAMERA_SNAPSHOT.near,
    far: DEFAULT_CAMERA_SNAPSHOT.far,
  });
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [wireframeInternal, setWireframeInternal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wireframe = wireframeProp ?? wireframeInternal;
  const isOrbitingRef = useRef(false);

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

  useEffect(() => {
    if (typeof resetSignal === "number") {
      handleResetView();
    }
  }, [handleResetView, resetSignal]);

  const handleToggleWireframe = useCallback(() => {
    if (onToggleWireframe) {
      onToggleWireframe();
      return;
    }
    setWireframeInternal((current) => !current);
  }, [onToggleWireframe]);

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
    const element = event.currentTarget;
    if (!element.hasPointerCapture(event.pointerId)) {
      element.setPointerCapture(event.pointerId);
    }
    isOrbitingRef.current = true;
    document.body.classList.add("is-orbiting");
  }, []);

  const handleViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    stopOrbiting();
  }, [stopOrbiting]);

  const handleViewportPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    stopOrbiting();
  }, [stopOrbiting]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-orbiting");
    };
  }, []);

  return (
    <div
      className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden"
      onPointerDown={handleViewportPointerDown}
      onPointerUp={handleViewportPointerUp}
      onPointerCancel={handleViewportPointerCancel}
      onMouseLeave={stopOrbiting}
    >
      <div
        ref={hostRef}
        className={`relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden ${bgClass}`}
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
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="relative flex-1 min-h-0 w-full overflow-hidden">
          {loadError ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 rounded-md border border-[#7e2d2d] bg-[#3c1515]/90 px-3 py-2 text-[11px] leading-snug text-[#ffd7d7]">
              {loadError}
            </div>
          ) : null}
          {canRenderCanvas ? (
            <div className="relative h-full w-full min-h-0 overflow-hidden">
              <Canvas
                key={`viewport-fps-${settings.fpsLimit}`}
                className="block h-full w-full"
                style={{ display: "block", width: "100%", height: "100%" }}
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
                    const host = hostRef.current;
                    if (host) {
                      const width = Math.max(1, host.clientWidth);
                      const height = Math.max(1, host.clientHeight);
                      gl.setSize(width, height, false);
                      camera.aspect = width / height;
                      camera.updateProjectionMatrix();
                      setSize({ width, height });
                    }
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
                  shadow-bias={-0.00012}
                  shadow-normalBias={0.025}
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
    </div>
  );
}
