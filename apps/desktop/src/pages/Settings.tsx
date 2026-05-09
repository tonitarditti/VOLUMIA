import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/ui/primitives";
import { generationClient, type ToolsStatusResponse } from "@/services/generationClient";

const envNames = [
  "VOLUMIA_ROOT",
  "VOLUMIA_PYTHON",
  "VOLUMIA_BLENDER",
  "VOLUMIA_TRIPOSR_DIR",
  "VOLUMIA_HUNYUAN_DIR",
  "VOLUMIA_MESHROOM_DIR",
];

export function Settings() {
  const navigate = useNavigate();
  const [tools, setTools] = useState<ToolsStatusResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setTools(await generationClient.toolsStatus());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo leer tools/status.");
      }
    };
    void load();
  }, []);

  const toolItems = tools ? Object.entries(tools.tools) : [];

  return (
    <main className="h-full min-h-0 overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">Settings</p>
            <h1 className="mt-2 text-3xl font-medium text-[var(--text)]">Configuracion local</h1>
          </div>
          <Button variant="secondary" onClick={() => navigate("/")}>
            Inicio
          </Button>
        </div>

        <section className="mt-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-sm font-medium text-[var(--text)]">Variables soportadas</h2>
          <div className="mt-4 grid gap-2">
            {envNames.map((name) => (
              <code key={name} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                {name}
              </code>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-sm font-medium text-[var(--text)]">Estado real</h2>
          <div className="mt-4 space-y-3">
            {toolItems.map(([key, tool]) => (
              <div key={key} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--text)]">{tool.name}</span>
                  <span className={tool.exists ? "text-xs text-[var(--status-success)]" : "text-xs text-[var(--text-faint)]"}>
                    {tool.status}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-[var(--text-muted)]">{tool.env}: {tool.path ?? "sin configurar"}</p>
              </div>
            ))}
            {!tools && <p className="text-sm text-[var(--text-muted)]">{message || "Cargando..."}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
