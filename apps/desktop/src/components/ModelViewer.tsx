import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useSettings } from "@/volumia/settings/context";

type ModelViewerProps = {
  modelUrl: string | null;
  renderMode?: "textures" | "shaded" | "clay" | "wireframe" | "normals";
  cameraView?: "perspective" | "front" | "side" | "top";
  gridEnabled?: boolean;
  onStatsChange?: (stats: { width: number; depth: number; height: number; triangles: number; vertices: number; materials: number; pieces: number } | null) => void;
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

export function ModelViewer({ modelUrl, renderMode = "textures", cameraView = "perspective", gridEnabled = true, onStatsChange }: ModelViewerProps) {
  const { resolvedTheme } = useSettings();
  const isDarkTheme = resolvedTheme === "dark";
  const viewportBackground = isDarkTheme ? "#182333" : "#edf3f9";
  const viewportGround = isDarkTheme ? "#7186a0" : "#94a7bc";
  const viewportSubGrid = isDarkTheme ? "#2c3d53" : "#ced9e5";
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
    const distance = maxDim * 1.7;
    if (cameraView === "front") camera.position.set(0, maxDim * 0.6, distance);
    else if (cameraView === "side") camera.position.set(distance, maxDim * 0.6, 0);
    else if (cameraView === "top") camera.position.set(0, distance, 0.001);
    else camera.position.set(maxDim * 1.35, maxDim * 1.05, maxDim * 1.35);
    camera.near = Math.max(0.01, maxDim / 100);
    camera.far = Math.max(100, maxDim * 20);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.target.y = Math.max(0.2, size.y * 0.35);
    controls.update();
  }, [cameraView]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(viewportBackground);
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

    scene.add(new THREE.HemisphereLight("#ffffff", isDarkTheme ? "#26384d" : "#a8b8ca", 2.2));
    const key = new THREE.DirectionalLight("#ffffff", 3.1);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    scene.add(key);
    const grid = new THREE.GridHelper(4, 16, viewportGround, viewportSubGrid);
    grid.visible = gridEnabled;
    scene.add(grid);

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
            if (renderMode !== "textures") {
              const source = Array.isArray(child.material) ? child.material[0] : child.material;
              const standard = new THREE.MeshStandardMaterial({
                color: renderMode === "clay" ? "#9aa7b8" : "#c5d0df",
                roughness: 0.72,
                metalness: 0,
                wireframe: renderMode === "wireframe",
              });
              child.material = renderMode === "normals" ? new THREE.MeshNormalMaterial() : standard;
              if (source) source.dispose();
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const box = normalizeModelToScene(gltf);
        let triangles = 0;
        let vertices = 0;
        let pieces = 0;
        const materials = new Set<THREE.Material>();
        gltf.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          pieces += 1;
          const position = child.geometry.getAttribute("position");
          vertices += position?.count ?? 0;
          triangles += child.geometry.index
            ? child.geometry.index.count / 3
            : (position?.count ?? 0) / 3;
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
        });
        const dimensions = box.getSize(new THREE.Vector3());
        onStatsChange?.({ width: dimensions.x, depth: dimensions.z, height: dimensions.y, triangles: Math.round(triangles), vertices, materials: materials.size, pieces });
        scene.add(gltf);
        fitCamera(box);
        setMessage("");
      } catch (error) {
        onStatsChange?.(null);
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
  }, [fitCamera, gridEnabled, isDarkTheme, modelUrl, onStatsChange, renderMode, viewportBackground, viewportGround, viewportSubGrid]);

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]" style={{ backgroundColor: viewportBackground }}>
      <div ref={hostRef} className="h-full w-full" />
      {message ? (
        <div className={`pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm ${isDarkTheme ? "text-slate-200" : "text-slate-600"}`}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
