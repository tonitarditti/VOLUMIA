import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ModelTransform = {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
};

type ModelViewerProps = {
  modelUrl: string | null;
  projectId?: string;
  transformRevision?: string | null;
};

const DEFAULT_TRANSFORM: ModelTransform = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
};

const ORIENTATION_PRESETS = {
  side_to_ground: {
    rotationX: -Math.PI / 2,
    rotationY: 0,
    rotationZ: 0,
    scale: 1,
  },
  side_to_ground_alt_y: {
    rotationX: 0,
    rotationY: Math.PI / 2,
    rotationZ: 0,
    scale: 1,
  },
} satisfies Record<string, ModelTransform>;

const RIGHT_ANGLE = Math.PI / 2;

function logBoundingBox(label: string, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.info(`[viewer-transform] ${label}`, {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: size.toArray(),
    center: center.toArray(),
  });
}

function toStoredTransform(value: unknown): ModelTransform | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<ModelTransform>;
  if (
    typeof maybe.rotationX !== "number" ||
    typeof maybe.rotationY !== "number" ||
    typeof maybe.rotationZ !== "number"
  ) {
    return null;
  }
  return {
    rotationX: maybe.rotationX,
    rotationY: maybe.rotationY,
    rotationZ: maybe.rotationZ,
    scale: typeof maybe.scale === "number" && Number.isFinite(maybe.scale) && maybe.scale > 0 ? maybe.scale : 1,
  };
}

function storageKey(projectId?: string, modelUrl?: string | null, transformRevision?: string | null) {
  const modelKey = projectId || modelUrl || "default";
  return `volumia.viewerTransform.${modelKey}.${transformRevision || "stable"}`;
}

function loadStoredTransform(key: string): ModelTransform {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? toStoredTransform(JSON.parse(stored)) : null;
    const transform = parsed ?? DEFAULT_TRANSFORM;
    console.info("[viewer-transform] loaded transform", transform);
    return transform;
  } catch {
    console.info("[viewer-transform] loaded transform", DEFAULT_TRANSFORM);
    return DEFAULT_TRANSFORM;
  }
}

function disposeModel(root: THREE.Object3D) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

export function applyModelTransform(model: THREE.Object3D, transform: ModelTransform) {
  console.info("[viewer-transform] applying rotation x/y/z", {
    x: transform.rotationX,
    y: transform.rotationY,
    z: transform.rotationZ,
    scale: transform.scale,
  });
  model.position.set(0, 0, 0);
  model.rotation.set(transform.rotationX, transform.rotationY, transform.rotationZ);
  model.scale.setScalar(transform.scale || 1);
  model.updateMatrixWorld(true);
}

export function normalizeModelToScene(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(model);
  logBoundingBox("bbox before normalize", before);
  if (before.isEmpty()) return before;

  const center = before.getCenter(new THREE.Vector3());
  const yBaseOffset = before.min.y;

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= yBaseOffset;
  model.updateMatrixWorld(true);

  const after = new THREE.Box3().setFromObject(model);
  logBoundingBox("bbox after normalize", after);
  return after;
}

export function ModelViewer({ modelUrl, projectId, transformRevision }: ModelViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const transformRef = useRef<ModelTransform>(DEFAULT_TRANSFORM);
  const [message, setMessage] = useState("Genera un modelo para verlo aqui.");
  const transformKey = useMemo(
    () => storageKey(projectId, modelUrl, transformRevision),
    [modelUrl, projectId, transformRevision],
  );
  const [modelTransform, setModelTransform] = useState<ModelTransform>(() => loadStoredTransform(transformKey));

  useEffect(() => {
    const loaded = loadStoredTransform(transformKey);
    transformRef.current = loaded;
    setModelTransform(loaded);
  }, [transformKey]);

  const fitCamera = useCallback((box: THREE.Box3) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const center = box.getCenter(new THREE.Vector3());
    camera.position.set(maxDim * 1.35, maxDim * 1.05, maxDim * 1.35);
    camera.near = Math.max(0.01, maxDim / 100);
    camera.far = Math.max(100, maxDim * 20);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.target.y = Math.max(0.2, size.y * 0.35);
    controls.update();
  }, []);

  const applyAndNormalize = useCallback((nextTransform: ModelTransform, fit = false) => {
    const model = modelRef.current;
    if (!model) return;
    transformRef.current = nextTransform;
    setModelTransform(nextTransform);
    applyModelTransform(model, nextTransform);
    const box = normalizeModelToScene(model);
    if (fit) {
      fitCamera(box);
    }
  }, [fitCamera]);

  const saveTransform = useCallback(() => {
    try {
      window.localStorage.setItem(transformKey, JSON.stringify(transformRef.current));
      console.info("[viewer-transform] saved transform", transformRef.current);
      setMessage("Orientacion guardada.");
      window.setTimeout(() => setMessage(""), 1400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar orientacion.");
    }
  }, [transformKey]);

  const loadTransform = useCallback(() => {
    const loaded = loadStoredTransform(transformKey);
    applyAndNormalize(loaded, true);
  }, [applyAndNormalize, transformKey]);

  const resetTransform = useCallback(() => {
    console.info("[viewer-transform] reset transform", DEFAULT_TRANSFORM);
    applyAndNormalize(DEFAULT_TRANSFORM, true);
  }, [applyAndNormalize]);

  const rotate = useCallback((axis: "rotationX" | "rotationY" | "rotationZ", delta: number) => {
    const next = {
      ...transformRef.current,
      [axis]: transformRef.current[axis] + delta,
    };
    applyAndNormalize(next, true);
  }, [applyAndNormalize]);

  const straightenTable = useCallback(() => {
    console.info("[viewer-transform] table straighten applied", ORIENTATION_PRESETS.side_to_ground);
    applyAndNormalize(ORIENTATION_PRESETS.side_to_ground, true);
  }, [applyAndNormalize]);

  const centerAndGround = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    const box = normalizeModelToScene(model);
    fitCamera(box);
  }, [fitCamera]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10141d");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.7, 2.1, 2.7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#ffffff", "#252a34", 2.2));
    const key = new THREE.DirectionalLight("#ffffff", 3.1);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    scene.add(key);
    scene.add(new THREE.GridHelper(4, 16, "#3f4754", "#252b36"));

    let disposed = false;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const load = async () => {
      if (!modelUrl) {
        setMessage("Genera un modelo para verlo aqui.");
        return;
      }
      setMessage("Cargando GLB...");
      try {
        const response = await fetch(modelUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const loader = new GLTFLoader();
        const gltf = await new Promise<THREE.Group>((resolve, reject) => {
          loader.parse(
            arrayBuffer,
            "",
            (result) => resolve(result.scene),
            (error) => reject(error),
          );
        });
        if (disposed) return;

        if (modelRef.current) {
          scene.remove(modelRef.current);
          disposeModel(modelRef.current);
        }

        modelRef.current = gltf;
        gltf.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        applyModelTransform(gltf, transformRef.current);
        const box = normalizeModelToScene(gltf);
        scene.add(gltf);
        fitCamera(box);
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? `No se pudo cargar el GLB: ${error.message}` : "No se pudo cargar el GLB.");
      }
    };

    const animate = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      window.requestAnimationFrame(animate);
    };

    resize();
    void load();
    animate();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      if (modelRef.current) {
        disposeModel(modelRef.current);
        modelRef.current = null;
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [fitCamera, modelUrl]);

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[#10141d]">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute left-3 top-3 z-20 max-w-[460px] rounded-[var(--radius-sm)] border border-slate-700/80 bg-slate-950/80 p-2 text-xs text-slate-200 shadow-lg backdrop-blur">
        <div className="mb-2 flex flex-wrap gap-1">
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={straightenTable}>
            Enderezar mesa
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationX", RIGHT_ANGLE)}>
            X +90
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationX", -RIGHT_ANGLE)}>
            X -90
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationY", RIGHT_ANGLE)}>
            Y +90
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationY", -RIGHT_ANGLE)}>
            Y -90
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationZ", RIGHT_ANGLE)}>
            Z +90
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={() => rotate("rotationZ", -RIGHT_ANGLE)}>
            Z -90
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={resetTransform}>
            Reset orientacion
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={saveTransform}>
            Guardar orientacion
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={loadTransform}>
            Cargar orientacion guardada
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" type="button" onClick={centerAndGround}>
            Centrar/apoyar
          </button>
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          X {modelTransform.rotationX.toFixed(2)} · Y {modelTransform.rotationY.toFixed(2)} · Z {modelTransform.rotationZ.toFixed(2)}
        </div>
      </div>
      {message ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">
          {message}
        </div>
      ) : null}
    </div>
  );
}
