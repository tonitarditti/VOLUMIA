import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generationClient, type ProjectPayload } from "@/services/generationClient";
import brandIcon from "@/assets/branding/VOLUMIA-dorado-transparente.png";
import { WelcomeSection } from "./WelcomeSection";
import { RecentProjects } from "./RecentProjects";

export function HomeDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );
  const [cancellingProjectId, setCancellingProjectId] = useState<string | null>(
    null,
  );

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://127.0.0.1:9360/api/projects");
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.ok && Array.isArray(data.projects)) {
        setProjects(data.projects);
      } else {
        setProjects([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar proyectos";
      setError(message);
      console.error("Error loading projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createNewProject = async () => {
    setCreating(true);
    try {
      const project = await generationClient.createProject();
      navigate(`/project/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear proyecto";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const handleDeleteProject = async (project: ProjectPayload) => {
    const projectName = project.id.replace(/^project_/, "");
    const confirmed = window.confirm(
      `¿Eliminar el proyecto ${projectName}? Esta acción también borrará su modelo y no se puede deshacer.`,
    );
    if (!confirmed) return;

    setDeletingProjectId(project.id);
    try {
      await generationClient.deleteProject(project.id);
      setProjects((current) =>
        current.filter((currentProject) => currentProject.id !== project.id),
      );
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "No se pudo eliminar el proyecto.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleCancelProject = async (project: ProjectPayload) => {
    const confirmed = window.confirm(
      `¿Cancelar la generación de ${project.id.replace(/^project_/, "")}?`,
    );
    if (!confirmed) return;

    setCancellingProjectId(project.id);
    try {
      const result = await generationClient.cancelProjectGeneration(project.id);
      setProjects((current) =>
        current.map((currentProject) =>
          currentProject.id === project.id
            ? { ...currentProject, job: result.job }
            : currentProject,
        ),
      );
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "No se pudo cancelar la generación.",
      );
    } finally {
      setCancellingProjectId(null);
    }
  };

  return (
    <main className="h-full min-h-0 overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-1)] backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-8">
          <div className="flex min-h-[48px] items-center gap-3 border-0 bg-transparent shadow-none">
            <img
              src={brandIcon}
              alt="VOLUMIA"
              className="h-9 w-9 shrink-0 border-0 bg-transparent object-contain opacity-100 shadow-none mix-blend-normal [filter:brightness(1.38)_saturate(1.12)]"
              style={{
                background: "transparent",
                border: "none",
                boxShadow: "none",
                filter: "brightness(1.38) saturate(1.12)",
                mixBlendMode: "normal",
                opacity: 1,
              }}
              draggable={false}
            />
            <div className="flex flex-col justify-center gap-1">
              <p className="text-[17px] font-semibold uppercase leading-none tracking-[0.06em] text-[var(--accent)]">
                VOLUMIA
              </p>
              <p className="text-[10px] leading-none text-[var(--text-muted)]">
                Your Creative 3D Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              LOCAL ENGINE: READY
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="bg-[var(--app-bg)]">
        <WelcomeSection
          onNewProject={createNewProject}
          onImportImages={() => {
            // TODO: Implement import dialog
            alert("Importar imágenes - próximamente");
          }}
          loading={creating}
        />

        <RecentProjects
          projects={projects}
          loading={loading}
          error={error}
          onOpen={handleOpenProject}
          onDelete={handleDeleteProject}
          onCancel={handleCancelProject}
          deletingProjectId={deletingProjectId}
          cancellingProjectId={cancellingProjectId}
        />
      </div>
    </main>
  );
}
