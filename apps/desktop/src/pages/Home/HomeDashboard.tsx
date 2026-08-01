import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generationClient, type ProjectPayload } from "@/services/generationClient";
import { BrandLogo } from "@/components/branding";
import { WelcomeSection } from "./WelcomeSection";
import { RecentProjects } from "./RecentProjects";

export function HomeDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
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
    };

    void loadProjects();
  }, []);

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

  return (
    <main className="flex-1 overflow-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-1)] backdrop-blur-sm">
        <div className="h-16 px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <BrandLogo size={20} tone="accent" emphasis="glow" label="VOLUMIA" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text)]">VOLUMIA</h1>
              <p className="text-xs text-[var(--text-muted)]">Your Creative 3D Assistant</p>
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
          onViewAll={() => {
            // TODO: Implement view all projects
            alert("Ver todos los proyectos - próximamente");
          }}
        />
      </div>
    </main>
  );
}
