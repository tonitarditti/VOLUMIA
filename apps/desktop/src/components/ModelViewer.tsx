import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ModelViewerProps = {
  modelUrl: string | null;
};

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

export function ModelViewer({ modelUrl }: ModelViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const [message, setMessage] = useState("Genera un modelo para verlo aqui.");

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
      {message ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">
          {message}
        </div>
      ) : null}
    </div>
  );
}
