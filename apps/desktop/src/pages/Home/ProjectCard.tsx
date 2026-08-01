import { ProjectPayload, JobStatus } from "@/services/generationClient";
import { Button } from "@/ui/primitives";

export interface ProjectCardProps {
  project: ProjectPayload;
  onOpen: (projectId: string) => void;
}

function getStatusColor(status: JobStatus): string {
  switch (status) {
    case "complete":
      return "text-green-600";
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
    case "error":
      return "bg-red-600";
    case "running":
    case "queued":
      return "bg-amber-600";
    default:
      return "bg-gray-400";
  }
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
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

  const previewBgClass = hasModel
    ? "from-slate-100 to-slate-50"
    : "from-[var(--panel-bg-soft)] to-[var(--surface-1)]";

  const statusColorClass = getStatusColor(project.job.status);
  const statusBgClass = getStatusBgColor(project.job.status);

  return (
    <div className="group rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-1)] transition-all hover:shadow-lg hover:border-[var(--border-strong)]">
      {/* Preview area */}
      <div
        className={`relative h-48 bg-gradient-to-br overflow-hidden ${previewBgClass}`}
      >
        {hasModel ? (
          <img
            src={project.modelUrl || undefined}
            alt={project.id}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
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

        <Button
          variant="secondary"
          className="w-full h-9 text-sm"
          onClick={() => onOpen(project.id)}
        >
          Abrir proyecto →
        </Button>
      </div>
    </div>
  );
}
