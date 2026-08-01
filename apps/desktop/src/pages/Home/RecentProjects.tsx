import { useState } from "react";
import { ProjectPayload } from "@/services/generationClient";
import { ProjectCard } from "./ProjectCard";

export interface RecentProjectsProps {
  projects: ProjectPayload[];
  loading?: boolean;
  error?: string | null;
  onOpen: (projectId: string) => void;
  onDelete: (project: ProjectPayload) => void | Promise<void>;
  onCancel: (project: ProjectPayload) => void | Promise<void>;
  deletingProjectId: string | null;
  cancellingProjectId: string | null;
}

function EmptyProjectsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-8 py-16 text-center">
      <svg
        className="mb-6 h-20 w-20 text-[var(--text-muted)] opacity-60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
        No hay proyectos aún
      </h3>
      <p className="mb-6 max-w-sm text-sm text-[var(--text-secondary)]">
        Crea tu primer proyecto para comenzar a convertir imágenes en modelos 3D
        editables.
      </p>
    </div>
  );
}

export function RecentProjects({
  projects,
  loading,
  error,
  onOpen,
  onDelete,
  onCancel,
  deletingProjectId,
  cancellingProjectId,
}: RecentProjectsProps) {
  const [showAllProjects, setShowAllProjects] = useState(false);

  if (error) {
    return (
      <section className="px-5 py-10 sm:px-8">
        <h2 className="mb-4 text-2xl font-semibold text-[var(--text-primary)]">
          Proyectos recientes
        </h2>
        <div className="rounded-xl border border-[var(--badge-danger-border)] bg-[var(--danger-soft)] p-4">
          <p className="text-sm text-[var(--badge-danger-text)]">{error}</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="px-5 py-10 sm:px-8">
        <h2 className="mb-6 text-2xl font-semibold text-[var(--text-primary)]">
          Proyectos recientes
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)] motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <section className="px-5 py-10 sm:px-8">
        <h2 className="mb-6 text-2xl font-semibold text-[var(--text-primary)]">
          Proyectos recientes
        </h2>
        <EmptyProjectsState />
      </section>
    );
  }

  const recentProjects = showAllProjects ? projects : projects.slice(0, 6);
  const hasMore = projects.length > 6;

  return (
    <section className="border-t border-[var(--border)] px-5 py-10 sm:px-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
          Proyectos recientes
        </h2>
        {hasMore ? (
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[var(--volumia-blue)] hover:bg-[var(--accent-soft)] hover:text-[var(--volumia-blue-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={() => setShowAllProjects((current) => !current)}
          >
            {showAllProjects ? "Ver menos" : "Ver todos"} <span>→</span>
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {recentProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={onOpen}
            onDelete={onDelete}
            onCancel={onCancel}
            isDeleting={deletingProjectId === project.id}
            isCancelling={cancellingProjectId === project.id}
          />
        ))}
      </div>
    </section>
  );
}
