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
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <svg
        className="w-24 h-24 mb-6 opacity-20 text-[var(--accent)]"
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
      <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
        No hay proyectos aún
      </h3>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm">
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
      <section className="px-8 py-12">
        <h2 className="text-2xl font-semibold text-[var(--text)] mb-4">
          Proyectos recientes
        </h2>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="px-8 py-12">
        <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
          Proyectos recientes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-[var(--surface-1)] border border-[var(--border)] h-64"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <section className="px-8 py-12">
        <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
          Proyectos recientes
        </h2>
        <EmptyProjectsState />
      </section>
    );
  }

  const recentProjects = showAllProjects ? projects : projects.slice(0, 6);
  const hasMore = projects.length > 6;

  return (
    <section className="px-8 py-12 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-[var(--text)]">
          Proyectos recientes
        </h2>
        {hasMore ? (
          <button
            className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
            onClick={() => setShowAllProjects((current) => !current)}
          >
            {showAllProjects ? "Ver menos" : "Ver todos"} <span>→</span>
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
