import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/ui/primitives";
import { generationClient, type ToolsStatusResponse } from "@/services/generationClient";

function ToolLine({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] py-3 last:border-0">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className={ready ? "text-sm text-[var(--status-success)]" : "text-sm text-[var(--text-faint)]"}>
        {ready ? "Configurada" : "No configurada"}
      </span>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [tools, setTools] = useState<ToolsStatusResponse | null>(null);
  const [message, setMessage] = useState("Backend pendiente.");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [health, toolStatus] = await Promise.all([
          generationClient.health(),
          generationClient.toolsStatus(),
        ]);
        if (!active) return;
        setTools(toolStatus);
        setMessage(`Backend activo. Proyectos: ${health.projectsRoot}`);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "No se pudo conectar al backend.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const createProject = async () => {
    setCreating(true);
    try {
      const project = await generationClient.createProject();
      navigate(`/project/${project.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el proyecto.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
      <section className="flex min-h-0 flex-col justify-center px-10 py-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">VOLUMIA MVP Local</p>
          <h1 className="mt-4 text-4xl font-medium tracking-normal text-[var(--text)]">Generacion 3D local, limpia y verificable.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
            Crea un proyecto, sube una imagen y valida el flujo completo con demo. Luego conecta TripoSR y Blender para el modo quick real.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" className="px-6" disabled={creating} onClick={() => void createProject()}>
              {creating ? "Creando..." : "Crear proyecto"}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/settings")}>
              Configuracion
            </Button>
          </div>
          <p className="mt-5 text-sm text-[var(--text-muted)]">{message}</p>
        </div>
      </section>
      <aside className="min-h-0 border-l border-[var(--border)] bg-[var(--surface-1)] p-6">
        <h2 className="text-sm font-medium text-[var(--text)]">Herramientas</h2>
        <div className="mt-4">
          <ToolLine label="Python" ready={Boolean(tools?.tools.python.exists)} />
          <ToolLine label="Blender" ready={Boolean(tools?.tools.blender.exists)} />
          <ToolLine label="TripoSR" ready={Boolean(tools?.tools.triposr.exists)} />
          <ToolLine label="Hunyuan3D" ready={Boolean(tools?.tools.hunyuan.exists)} />
          <ToolLine label="Meshroom" ready={Boolean(tools?.tools.meshroom.exists)} />
        </div>
      </aside>
    </main>
  );
}
