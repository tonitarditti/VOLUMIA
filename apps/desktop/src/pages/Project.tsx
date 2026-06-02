import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Dropzone } from "@/components/Dropzone";
import { GenerateButton } from "@/components/GenerateButton";
import { GenerationModeSelector } from "@/components/GenerationModeSelector";
import { JobStatus } from "@/components/JobStatus";
import { ModelViewer } from "@/components/ModelViewer";
import { Button } from "@/ui/primitives";
import {
  generationClient,
  type GenerationMode,
  type ProjectJob,
  type ProjectPayload,
  type ToolsStatusResponse,
} from "@/services/generationClient";

function ToolStatusGrid({ tools }: { tools: ToolsStatusResponse | null }) {
  const items = [
    ["Python", tools?.tools.python.exists],
    ["Blender", tools?.tools.blender.exists],
    ["TripoSR", tools?.tools.triposr.exists],
    ["Hunyuan", tools?.tools.hunyuan.exists],
    ["Meshroom", tools?.tools.meshroom.exists],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, ready]) => (
        <div key={label} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <div className="text-xs text-[var(--text-muted)]">{label}</div>
          <div className={ready ? "mt-1 text-xs text-[var(--status-success)]" : "mt-1 text-xs text-[var(--text-faint)]"}>
            {ready ? "Configurada" : "No configurada"}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Project() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<GenerationMode>("demo");
  const [files, setFiles] = useState<File[]>([]);
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [job, setJob] = useState<ProjectJob | null>(null);
  const [tools, setTools] = useState<ToolsStatusResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelVersion, setModelVersion] = useState(0);

  const running = job?.status === "queued" || job?.status === "running" || job?.status === "optimizing";
  const modelUrl = useMemo(() => {
    if (project?.modelUrl || job?.status === "complete") {
      return generationClient.modelUrl(projectId, modelVersion);
    }
    return null;
  }, [job?.status, modelVersion, project?.modelUrl, projectId]);

  const refresh = async () => {
    const [status, toolStatus] = await Promise.all([
      generationClient.status(projectId),
      generationClient.toolsStatus(),
    ]);
    setProject(status.project);
    setJob(status.job);
    setTools(toolStatus);
    if (status.job.status === "complete") {
      setModelVersion((value) => value + 1);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [status, toolStatus] = await Promise.all([
          generationClient.status(projectId),
          generationClient.toolsStatus(),
        ]);
        if (!active) return;
        setProject(status.project);
        setJob(status.job);
        setTools(toolStatus);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "No se pudo abrir el proyecto.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo refrescar el job."));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const upload = async (nextFiles: File[]) => {
    setFiles(nextFiles);
    setBusy(true);
    try {
      const result = await generationClient.uploadInput(projectId, nextFiles);
      setProject(result.project);
      setJob(result.project.job);
      setMessage(`${result.files.length} imagen(es) cargada(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const result = await generationClient.generate(projectId, mode);
      setJob(result.job);
      setMessage("Job enviado.");
      window.setTimeout(() => void refresh(), 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar la generacion.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-1)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">Proyecto</p>
            <h1 className="mt-1 text-lg font-medium text-[var(--text)]">{projectId}</h1>
          </div>
          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => navigate("/")}>
            Inicio
          </Button>
        </div>

        <div className="mt-5 space-y-5">
          <Dropzone files={files} disabled={busy || running} onFiles={(nextFiles) => void upload(nextFiles)} />
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Modo</p>
            <GenerationModeSelector value={mode} disabled={busy || running} onChange={setMode} />
          </div>
          <GenerateButton disabled={busy || running || (files.length === 0 && mode !== "demo")} running={busy || running} onClick={() => void generate()} />
          <JobStatus job={job} />
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Configuracion real</p>
            <ToolStatusGrid tools={tools} />
          </div>
          {message ? <p className="text-sm leading-5 text-[var(--text-muted)]">{message}</p> : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-[var(--shell-viewport)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">Viewer</p>
            <h2 className="mt-1 text-xl font-medium text-[var(--text)]">latest.glb</h2>
          </div>
          <Button variant="secondary" className="h-9 px-4 text-xs" onClick={() => void refresh()}>
            Refrescar
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <ModelViewer modelUrl={modelUrl} projectId={projectId} transformRevision={job?.finishedAt ?? null} />
        </div>
      </section>
    </main>
  );
}
