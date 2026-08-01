import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  generationClient,
  type ProjectPayload,
  type JobStatus,
} from "@/services/generationClient";
import { Button } from "@/ui/primitives";

export interface ProjectCardProps {
  project: ProjectPayload;
  onOpen: (projectId: string) => void;
  onDelete: (project: ProjectPayload) => void | Promise<void>;
  onCancel: (project: ProjectPayload) => void | Promise<void>;
  isDeleting: boolean;
  isCancelling: boolean;
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function ModelPreview({ projectId }: { projectId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("Cargando vista previa...");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(2.5, 1.7, 2.7);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight("#fff4df", "#302820", 2.4));
    const keyLight = new THREE.DirectionalLight("#fff8eb", 3.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#d8a65f", 1.7);
    rimLight.position.set(-3, 2, -4);
    scene.add(rimLight);

    let model: THREE.Object3D | null = null;
    let disposed = false;

    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };

    const loadModel = async () => {
      try {
        const response = await fetch(generationClient.modelUrl(projectId));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        const loader = new GLTFLoader();
        const loadedModel = await new Promise<THREE.Group>((resolve, reject) => {
          loader.parse(data, "", (gltf) => resolve(gltf.scene), reject);
        });
        if (disposed) {
          disposeModel(loadedModel);
          return;
        }

        const box = new THREE.Box3().setFromObject(loadedModel);
        if (box.isEmpty()) throw new Error("Modelo vacío");
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.7 / Math.max(size.x, size.y, size.z, 0.01);
        loadedModel.position.copy(center).multiplyScalar(-scale);
        loadedModel.scale.setScalar(scale);
        loadedModel.rotation.set(-0.12, 0.5, 0);
        loadedModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        model = loadedModel;
        scene.add(model);
        setMessage("");
        render();
      } catch {
        if (!disposed) setMessage("No se pudo cargar la vista previa.");
      }
    };

    resize();
    void loadModel();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      if (model) disposeModel(model);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [projectId]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {message ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-5 text-center text-xs text-[var(--project-preview-chip-text)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function getStatusColor(status: JobStatus): string {
  switch (status) {
    case "complete":
      return "text-green-600";
    case "cancelled":
      return "text-[var(--text-muted)]";
    case "error":
      return "text-red-600";
    case "running":
    case "queued":
      return "text-amber-600";
    default:
      return "text-gray-500";
  }
}

function getStatusLabel(status: JobStatus): string {
  switch (status) {
    case "idle":
      return "Listo";
    case "queued":
    case "running":
      return "Procesando";
    case "optimizing":
      return "Optimizando";
    case "complete":
      return "Completado";
    case "cancelled":
      return "Interrumpido";
    case "error":
      return "Error";
    default:
      return "Desconocido";
  }
}

function getStatusBgColor(status: JobStatus): string {
  switch (status) {
    case "complete":
      return "bg-green-600";
    case "cancelled":
      return "bg-[var(--text-muted)]";
    case "error":
      return "bg-red-600";
    case "running":
    case "queued":
      return "bg-amber-600";
    default:
      return "bg-gray-400";
  }
}

export function ProjectCard({
  project,
  onOpen,
  onDelete,
  onCancel,
  isDeleting,
  isCancelling,
}: ProjectCardProps) {
  const hasModel = !!project.latestGlb;
  const lastModified = project.job.createdAt
    ? new Date(project.job.createdAt)
    : new Date();
  const formattedDate = lastModified.toLocaleDateString("es-AR", {
    month: "short",
    day: "numeric",
    year: hasModel ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Count input files
  const inputFiles = project.job.inputFiles
    ? Array.from(new Set(project.job.inputFiles)).filter((f) =>
        /\.(jpg|jpeg|png|webp)$/i.test(f)
      )
    : [];

  const statusColorClass = getStatusColor(project.job.status);
  const statusBgClass = getStatusBgColor(project.job.status);
  const isProcessing = ["queued", "running", "optimizing"].includes(
    project.job.status,
  );

  return (
    <div className="group rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-1)] transition-all hover:shadow-lg hover:border-[var(--border-strong)]">
      {/* Preview area */}
      <div
        className="relative h-48 overflow-hidden"
        style={{
          background: hasModel
            ? "var(--project-preview-gradient)"
            : "var(--panel-bg-soft)",
        }}
      >
        {hasModel ? (
          <ModelPreview projectId={project.id} />
        ) : null}

        {!hasModel && (
          <div className="flex items-center justify-center h-full">
            <svg
              className="w-16 h-16 opacity-30 text-[var(--text-faint)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[var(--surface-1)] border border-[var(--border)] text-xs font-medium">
          <span className={`inline-flex items-center gap-1 ${statusColorClass}`}>
            <span className={`w-2 h-2 rounded-full ${statusBgClass}`} />
            {getStatusLabel(project.job.status)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)] truncate">
            {project.id.replace(/^project_/, "").slice(0, 20)}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {formattedDate}
          </p>
        </div>

        {inputFiles.length > 0 && (
          <p className="text-xs text-[var(--text-faint)]">
            {inputFiles.length} {inputFiles.length === 1 ? "imagen" : "imágenes"}
          </p>
        )}

        {project.job.message && (
          <p className="text-xs text-[var(--text-muted)] line-clamp-2">
            {project.job.message}
          </p>
        )}

        {isProcessing ? (
          <Button
            variant="secondary"
            className="h-9 w-full px-2 text-sm"
            onClick={() => void onCancel(project)}
            disabled={isCancelling || isDeleting}
          >
            {isCancelling ? "Cancelando..." : "Cancelar generación"}
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-9 px-2 text-sm"
            onClick={() => onOpen(project.id)}
            disabled={isDeleting || isCancelling}
          >
            Abrir →
          </Button>
          <Button
            variant="danger"
            className="h-9 px-2 text-sm"
            onClick={() => void onDelete(project)}
            disabled={isDeleting || isCancelling}
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
