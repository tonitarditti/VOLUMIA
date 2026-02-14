import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

type ProjectViewportProps = {
  glbPath?: string;
};

type LoadedModelProps = {
  glbPath?: string;
  controlsRef: { current: OrbitControlsImpl | null };
};

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }

  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }

  return `file://${normalized}`;
}

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

function LoadedModel({ glbPath, controlsRef }: LoadedModelProps) {
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

    loader.load(
      toFileUrl(glbPath),
      (gltf) => {
        if (!active) return;
        const model = gltf.scene ?? gltf.scenes[0];
        if (!model) return;
        scene.add(model);
        modelRef.current = model;
        fitCameraToObject(camera, model, controlsRef);
        invalidate();
      },
      undefined,
      () => {
        if (!active) return;
        invalidate();
      }
    );

    return () => {
      active = false;
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current = null;
        invalidate();
      }
    };
  }, [camera, controlsRef, glbPath, invalidate, scene]);

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

export function ProjectViewport({ glbPath }: ProjectViewportProps) {
  const { t } = useT();
  const { settings } = useSettings();
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

  return (
    <div
      ref={hostRef}
      className="relative h-[360px] min-h-[300px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow)] xl:h-full"
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {t("project.viewport")}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
        {t("project.viewportHint")}
      </div>
      {canRenderCanvas ? (
        <Canvas
          key={`viewport-aa-${settings.antialias}-fps-${settings.fpsLimit}`}
          camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ antialias: settings.antialias }}
        >
          <FrameLimiter fpsLimit={settings.fpsLimit} />
          <color attach="background" args={["#1a1511"]} />
          <ambientLight intensity={0.52} color="#d8ccb9" />
          <hemisphereLight args={["#d3c6b2", "#1b1511", 0.42]} />
          <directionalLight
            intensity={1.0}
            color="#f8f0e3"
            position={[10, 12, 8]}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          {!glbPath ? <SceneMassing /> : null}
          <LoadedModel glbPath={glbPath} controlsRef={controlsRef} />
          <OrbitControls ref={controlsRef} makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={0.08} />
        </Canvas>
      ) : null}
    </div>
  );
}
