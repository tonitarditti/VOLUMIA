import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generationClient, type ProjectPayload } from "@/services/generationClient";
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
    <main className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[var(--background)]">
      <div>
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
