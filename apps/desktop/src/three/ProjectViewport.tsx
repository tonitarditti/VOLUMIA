import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

type ProjectViewportProps = {
  glbPath?: string;
  glbVersion?: number;
};

type LoadedModelProps = {
  glbPath?: string;
  glbVersion?: number;
  controlsRef: { current: OrbitControlsImpl | null };
  envMapIntensity: number;
};

type ViewportTheme = "light" | "dark";

type ViewportThemeConfig = {
  isDark: boolean;
  background: string;
  ground: string;
  gridMain: string;
  gridSub: string;
  gridOpacity: number;
  exposure: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  envMapIntensity: number;
};

function fitCameraToObject(
  camera: THREE.Camera,
  object: THREE.Object3D,
  controlsRef: { current: OrbitControlsImpl | null }
) {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return;
  }

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = Math.max(2.5, (maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360))) * 1.5);
  const direction = new THREE.Vector3(1, 0.75, 1).normalize();
  const nextPosition = center.clone().add(direction.multiplyScalar(distance));

  camera.position.copy(nextPosition);
  camera.near = Math.max(0.01, distance / 200);
  camera.far = Math.max(120, distance * 20);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  if (controlsRef.current) {
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }
}

function applyModelEnvironmentIntensity(object: THREE.Object3D, envMapIntensity: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || !("envMapIntensity" in material)) {
        continue;
      }

      const mat = material as THREE.Material & { envMapIntensity: number };
      mat.envMapIntensity = envMapIntensity;
      mat.needsUpdate = true;
    }
  });
}

function LoadedModel({ glbPath, glbVersion, controlsRef, envMapIntensity }: LoadedModelProps) {
  const { camera, scene, invalidate } = useThree();
  const modelRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current = null;
      invalidate();
    }

    if (!glbPath) {
      return;
    }

    const loader = new GLTFLoader();
    let active = true;
    const readGlb = (window as { volumia?: { generation?: { readGlb?: (path: string) => Promise<ArrayBuffer | Uint8Array> } } }).volumia?.generation?.readGlb;

    if (!readGlb) {
      return;
    }

    void (async () => {
      try {
        console.log("[glb] path", glbPath);
        const buffer = await readGlb(glbPath);
        const source = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        const bytes = new Uint8Array(source.byteLength);
        bytes.set(source);
        const arrayBuffer = bytes.buffer;
        console.log("[glb] bytes", arrayBuffer.byteLength);
        loader.parse(
          arrayBuffer,
          "",
          (gltf) => {
            if (!active) return;
            const model = gltf.scene ?? gltf.scenes[0];
            if (!model) return;
            scene.add(model);
            applyModelEnvironmentIntensity(model, envMapIntensity);
            modelRef.current = model;
            fitCameraToObject(camera, model, controlsRef);
            console.log("[glb] loaded", true);
            invalidate();
          },
          (error) => {
            if (!active) return;
            console.error("GLB parse error", error);
            invalidate();
          }
        );
      } catch (error) {
        if (!active) return;
        console.error("GLB parse error", error);
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
  }, [camera, controlsRef, envMapIntensity, glbPath, glbVersion, invalidate, scene]);

  useEffect(() => {
    if (!modelRef.current) {
      return;
    }

    applyModelEnvironmentIntensity(modelRef.current, envMapIntensity);
    invalidate();
  }, [envMapIntensity, invalidate]);

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
      exposure: 1.0,
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
    exposure: 1.25,
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
  exposure,
}: {
  theme: ViewportTheme;
  background: string;
  exposure: number;
}) {
  const { gl, scene, invalidate } = useThree();
  const debugLoggedRef = useRef(false);

  useEffect(() => {
    if ("outputColorSpace" in gl) {
      gl.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      const legacyEncoding = (THREE as unknown as { sRGBEncoding?: number }).sRGBEncoding;
      if (legacyEncoding !== undefined) {
        (gl as THREE.WebGLRenderer & { outputEncoding: number }).outputEncoding = legacyEncoding;
      }
    }
    if ("physicallyCorrectLights" in gl) {
      (gl as THREE.WebGLRenderer & { physicallyCorrectLights: boolean }).physicallyCorrectLights = true;
    }
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = theme === "dark" ? 1.15 : 1.0;
    gl.setClearColor(background, 1);
    gl.domElement.style.background = background;
    scene.background = new THREE.Color(background);

    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const envMap = pmrem.fromScene(environment, 0.04).texture;
    const previousEnvironment = scene.environment;
    scene.environment = envMap;

    if (!debugLoggedRef.current) {
      console.log("[ViewportPro] theme:", theme, "bg:", background, "exposure:", gl.toneMappingExposure);
      debugLoggedRef.current = true;
    }

    invalidate();

    return () => {
      if (scene.environment === envMap) {
        scene.environment = previousEnvironment ?? null;
      }
      environment.dispose();
      envMap.dispose();
      pmrem.dispose();
    };
  }, [background, exposure, gl, invalidate, scene, theme]);

  return null;
}

export function ProjectViewport({ glbPath, glbVersion }: ProjectViewportProps) {
  const { t } = useT();
  const { settings, resolvedTheme } = useSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });

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
        {canRenderCanvas ? (
          <div className="absolute inset-0">
            <Canvas
              key={`viewport-aa-${settings.antialias}-fps-${settings.fpsLimit}`}
              className="block !h-full !w-full"
              style={{ display: "block" }}
              camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
              dpr={[1, 2]}
              frameloop="demand"
              gl={{ antialias: settings.antialias, alpha: false }}
            >
              <ViewportResizeSync width={size.width} height={size.height} />
              <SceneRendererSetup
                theme={viewportTheme}
                background={themeConfig.background}
                exposure={themeConfig.exposure}
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
              />
              <OrbitControls ref={controlsRef} makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={0.08} />
            </Canvas>
          </div>
        ) : null}
      </div>
    </div>
  );
}
