import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ModelViewerProps = {
  modelUrl: string | null;
};

export function ModelViewer({ modelUrl }: ModelViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("Genera un modelo para verlo aqui.");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10141d");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.7, 2.1, 2.7);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);

    scene.add(new THREE.HemisphereLight("#ffffff", "#252a34", 2.2));
    const key = new THREE.DirectionalLight("#ffffff", 3.1);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    scene.add(key);
    const grid = new THREE.GridHelper(4, 16, "#3f4754", "#252b36");
    scene.add(grid);

    let disposed = false;
    let model: THREE.Object3D | null = null;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const fitModel = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      object.position.sub(center);
      object.position.y += size.y / 2;
      camera.position.set(maxDim * 1.35, maxDim * 1.05, maxDim * 1.35);
      camera.near = Math.max(0.01, maxDim / 100);
      camera.far = Math.max(100, maxDim * 20);
      camera.updateProjectionMatrix();
      controls.target.set(0, Math.max(0.2, size.y * 0.35), 0);
      controls.update();
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
        model = gltf;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        fitModel(model);
        scene.add(model);
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
      if (model) {
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
              material.dispose();
            }
          }
        });
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl]);

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
