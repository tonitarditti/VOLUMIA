import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Dropzone } from "@/components/Dropzone";
import { ModelViewer } from "@/components/ModelViewer";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import {
  generationClient,
  type GenerationMode,
  type GenerationStage,
  type ProjectPayload,
  type ReferenceAngle,
  type ToolsStatusResponse,
} from "@/services/generationClient";
import { Badge, Button } from "@/ui/primitives";

const modeOptions: Array<{
  id: GenerationMode;
  title: string;
  images: string;
  quality: string;
  time: string;
  gpu: string;
  output: string;
  tool: "triposr" | "hunyuan" | "meshroom";
}> = [
  {
    id: "quick",
    title: "Borrador rápido",
    images: "1 imagen",
    quality: "Volumen aproximado",
    time: "3–8 min",
    gpu: "Media",
    output: "GLB",
    tool: "triposr",
  },
  {
    id: "textured",
    title: "Objeto texturizado",
    images: "1–4 imágenes",
    quality: "Mayor fidelidad visual",
    time: "8–20 min",
    gpu: "Alta",
    output: "GLB texturizado",
    tool: "hunyuan",
  },
  {
    id: "photogrammetry",
    title: "Reconstrucción fotográfica",
    images: "6+ fotos",
    quality: "Cobertura fotográfica",
    time: "20–90 min",
    gpu: "Alta",
    output: "GLB / editable",
    tool: "meshroom",
  },
];
const angles: Array<[ReferenceAngle, string]> = [
  ["front", "Frontal"],
  ["side", "Lateral"],
  ["back", "Trasera"],
  ["top", "Superior"],
  ["detail", "Detalle"],
];
const stages: Record<string, string> = {
  queued: "Validando referencias",
  running: "Reconstruyendo geometría",
  optimizing: "Optimizando malla",
  complete: "Finalizado",
  cancelled: "Cancelado",
  error: "Error",
};

function formatMode(mode?: string | null) {
  return mode === "quick"
    ? "Borrador rápido"
    : mode === "textured"
      ? "Objeto texturizado"
      : mode === "photogrammetry"
        ? "Reconstrucción fotográfica"
        : "—";
}
function dimensions(value: number, unit: "cm" | "m") {
  const converted = unit === "cm" ? value * 100 : value;
  return `${converted.toFixed(converted < 10 ? 1 : 0)} ${unit}`;
}

export function formatDuration(durationMs?: number | null) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return "00:00";
  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function stageDuration(stage: GenerationStage) {
  if (typeof stage.durationMs === "number" && Number.isFinite(stage.durationMs)) return stage.durationMs;
  if (stage.startedAt && stage.state === "running") {
    return Math.max(0, Date.now() - new Date(stage.startedAt).getTime());
  }
  return null;
}

function stageStateLabel(stage: GenerationStage) {
  return stage.state === "complete"
    ? "Finalizado"
    : stage.state === "skipped"
      ? "No requerido"
      : stage.state === "blocked"
        ? "Bloqueado"
        : stage.state === "queued"
          ? "En cola"
    : stage.state === "running"
      ? "En proceso"
      : stage.state === "cancelled"
        ? "Cancelado"
        : stage.state === "error"
          ? "Error"
          : "Pendiente";
}

function StageStateIcon({ stage }: { stage: GenerationStage }) {
  const tone = stage.state === "error"
    ? "text-[var(--danger)]"
    : stage.state === "cancelled"
      ? "text-[var(--warning)]"
      : stage.state === "blocked"
        ? "text-[var(--warning)]"
        : stage.state === "queued" || stage.state === "running"
        ? "text-[var(--accent)]"
        : stage.state === "complete"
          ? "text-[var(--success)]"
          : "text-[var(--text-faint)]";
  if (stage.state === "complete") {
    return (
      <svg className={`h-4 w-4 shrink-0 ${tone}`} viewBox="0 0 16 16" fill="none" aria-label="Completado">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="m4.7 8.1 2.05 2.05 4.55-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (stage.state === "error" || stage.state === "cancelled" || stage.state === "blocked") {
    return (
      <svg className={`h-4 w-4 shrink-0 ${tone}`} viewBox="0 0 16 16" fill="none" aria-label={stageStateLabel(stage)}>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <span
      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current ${tone} ${stage.state === "running" || stage.state === "queued" ? "animate-pulse bg-current/20" : ""}`}
      aria-label={stageStateLabel(stage)}
    />
  );
}

function GenerationProgressPanel({
  stages,
  totalDurationMs,
  running,
  runner,
  mode,
  outputFiles,
}: {
  stages: GenerationStage[];
  totalDurationMs?: number | null;
  running: boolean;
  runner?: string | null;
  mode?: string | null;
  outputFiles?: string[];
}) {
  return (
    <section className="max-h-[min(48vh,420px)] shrink-0 overflow-auto border-t border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-8px_20px_rgb(15_23_42/0.08)]">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          {running ? "Progreso de generación" : "Resumen de generación"}
        </h2>
        <span className="text-xs text-[var(--text-secondary)]">
          Total: {formatDuration(totalDurationMs)}
        </span>
      </div>
      <div className="space-y-3">
        {stages.map((stage) => {
          const duration = stageDuration(stage);
          const hasDeterminateProgress =
            typeof stage.progress === "number" && Number.isFinite(stage.progress);
          return (
            <div key={stage.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
              <div className="flex items-start gap-2">
                <StageStateIcon stage={stage} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-xs font-medium text-[var(--text)]">
                      {stage.label}
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {stage.state === "running"
                        ? `En proceso · ${formatDuration(duration)}`
                        : stage.state === "queued"
                          ? "En cola de GPU"
                        : duration !== null
                          ? formatDuration(duration)
                          : stageStateLabel(stage)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                    {stage.detail || stageStateLabel(stage)}
                    {stage.startedAt
                      ? ` · Inicio ${new Date(stage.startedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                      : ""}
                  </p>
                  {(stage.state === "running" || stage.state === "queued") && (hasDeterminateProgress || stage.indeterminate) ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-label={`Avance de ${stage.label}`}>
                      {hasDeterminateProgress ? (
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--volumia-blue),var(--volumia-cyan),var(--volumia-violet))] transition-[width] duration-200"
                          style={{ width: `${stage.progress}%` }}
                        />
                      ) : (
                        <div className="h-full w-2/5 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,var(--volumia-blue),var(--volumia-cyan),var(--volumia-violet))]" />
                      )}
                    </div>
                  ) : null}
                  {hasDeterminateProgress ? (
                    <span className="mt-1 block text-[11px] text-[var(--text-secondary)]">
                      {stage.progress}%
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!running ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-secondary)]">
          <p>Runner: {runner || "—"} · Modo: {formatMode(mode)}</p>
          <p className="mt-1 break-all">Archivos generados: {outputFiles?.length ? outputFiles.join(" · ") : "—"}</p>
        </div>
      ) : null}
    </section>
  );
}

export function Project() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [tools, setTools] = useState<ToolsStatusResponse | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<GenerationMode>("quick");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [renderMode, setRenderMode] = useState<
    "textures" | "shaded" | "clay" | "wireframe" | "normals"
  >("textures");
  const [cameraView, setCameraView] = useState<
    "perspective" | "front" | "side" | "top"
  >("perspective");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [stats, setStats] = useState<{
    width: number;
    depth: number;
    height: number;
    triangles: number;
    vertices: number;
    materials: number;
    pieces: number;
  } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [referenceValue, setReferenceValue] = useState("");
  const [referenceLabel, setReferenceLabel] = useState("Ancho real");
  const [optimizationPreset, setOptimizationPreset] = useState<
    "ligero" | "equilibrado" | "liviano"
  >("equilibrado");
  const running = Boolean(
    project && ["queued", "running", "optimizing"].includes(project.job.status),
  );
  const refresh = useCallback(async () => {
    const [status, toolStatus] = await Promise.all([
      generationClient.status(projectId),
      generationClient.toolsStatus(),
    ]);
    setProject(status.project);
    setTools(toolStatus);
  }, [projectId]);
  useEffect(() => {
    void refresh().catch((error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo abrir el proyecto.",
      ),
    );
  }, [refresh]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => void refresh().catch(() => undefined),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [refresh, running]);
  useEffect(() => {
    if (project?.latestGlb) setStep(3);
  }, [project?.latestGlb]);
  const update = async (
    patch: Parameters<typeof generationClient.updateProject>[1],
  ) => {
    if (!project) return;
    const result = await generationClient.updateProject(project.id, patch);
    setProject(result.project);
  };
  const upload = async (nextFiles: File[]) => {
    if (!project) return;
    setFiles(nextFiles);
    setBusy(true);
    try {
      const result = await generationClient.uploadInput(project.id, nextFiles);
      setProject(result.project);
      setMessage(`${result.files.length} referencia(s) validada(s).`);
      setStep(2);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron validar las imágenes.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selectPrimary = async (id: string) => {
    if (!project) return;
    await update({
      references: project.metadata.references.map((reference) => ({
        ...reference,
        primary: reference.id === id,
      })),
    });
  };
  const updateAngle = async (id: string, angle: ReferenceAngle) => {
    if (!project) return;
    await update({
      references: project.metadata.references.map((reference) =>
        reference.id === id ? { ...reference, angle } : reference,
      ),
    });
  };
  const saveScale = async () => {
    if (!project) return;
    const value = Number(referenceValue);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Ingresá una medida real mayor a cero.");
      return;
    }
    const label = referenceLabel.trim() || "Medida de referencia";
    const targetMeters = project.metadata.units === "cm" ? value / 100 : value;
    const axis = /profund|depth/i.test(label)
      ? "depth"
      : /alto|height/i.test(label)
        ? "height"
        : "width";
    const measuredDimension = stats?.[axis];
    const scaleFactor =
      measuredDimension && measuredDimension > 0
        ? targetMeters / measuredDimension
        : project.metadata.scaleFactor;
    await update({
      referenceMeasurement: { label, value, unit: project.metadata.units },
      scaleFactor,
    });
    setMessage(
      measuredDimension
        ? "Escala real calculada y guardada en los metadatos del activo."
        : "Medida guardada. Cargá el modelo para calcular el factor de escala.",
    );
  };
  const generate = async () => {
    if (!project) return;
    const option = modeOptions.find((item) => item.id === mode);
    if (!option) return;
    if (project.metadata.references.length === 0) {
      setMessage("Cargá al menos una referencia válida.");
      setStep(1);
      return;
    }
    if (!tools?.tools[option.tool]?.exists) {
      setMessage(
        `${option.title} no está disponible: ${tools?.tools[option.tool]?.details ?? "falta configurar su herramienta local"}`,
      );
      return;
    }
    if (mode === "photogrammetry" && project.metadata.references.length < 6) {
      setMessage(
        "La reconstrucción fotográfica requiere una secuencia amplia de 6 o más fotos; el pack actual no alcanza.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await generationClient.generate(project.id, mode);
      setProject((current) =>
        current ? { ...current, job: result.job } : current,
      );
      setStep(3);
      setMessage("Trabajo agregado a la cola local.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la generación.",
      );
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await generationClient.cancelProjectGeneration(project.id);
      setProject({ ...project, job: result.job });
    } finally {
      setBusy(false);
    }
  };
  const prepareForSketchUp = async (
    operation: "separate" | "scale" | "optimize",
  ) => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await generationClient.prepare(project.id, {
        operation,
        scale: project.metadata.scaleFactor,
        ratio:
          operation === "optimize"
            ? { ligero: 0.75, equilibrado: 0.5, liviano: 0.25 }[
                optimizationPreset
              ]
            : undefined,
        preset: operation === "optimize" ? optimizationPreset : undefined,
      });
      setProject(result.project);
      setStep(3);
      setMessage("Preparando una versión derivada con Blender…");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el activo.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportGlb = async () => {
    if (!project?.latestGlb) return;
    if (hasDesktopBridge()) {
      const result = await desktopApi.exportModel({
        glbPath: project.latestGlb,
        format: "glb",
      });
      setMessage(
        result.canceled
          ? "Exportación cancelada."
          : result.path
            ? `GLB exportado: ${result.path}`
            : (result.error ?? "No se pudo exportar GLB."),
      );
      return;
    }
    const response = await fetch(generationClient.modelUrl(project.id));
    if (!response.ok) {
      setMessage("El GLB no está disponible.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.metadata.name}.glb`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const onStatsChange = useCallback((next: typeof stats) => setStats(next), []);
  const modelUrl = useMemo(
    () =>
      project?.latestGlb
        ? generationClient.modelUrl(
            project.id,
            new Date(project.job.updatedAt || Date.now()).getTime(),
          )
        : null,
    [project?.id, project?.job.updatedAt, project?.latestGlb],
  );
  const option = modeOptions.find((item) => item.id === mode);
  const modeReady = option ? tools?.tools[option.tool]?.exists : false;
  const activeSketchUpReady = Boolean(
    tools?.tools.blender.verificationStatus === "Verificado" &&
    tools.tools.sketchup.verificationStatus === "Verificado" &&
    tools.tools.dae.verificationStatus === "Verificado",
  );
  const latestDaeVersion = project?.metadata.versions
    .slice()
    .reverse()
    .find((version) => Boolean(version.daePath));
  const editableStats = latestDaeVersion?.editableStats;
  if (!project)
    return (
      <main className="grid h-full place-items-center bg-[var(--background)] text-sm text-[var(--text-secondary)]">
        Cargando proyecto…
      </main>
    );
  const lastGeneration = project.metadata.versions
    .slice()
    .reverse()
    .find((version) => version.generation)?.generation;
  const generationStages = project.job.progress?.stages?.length
    ? project.job.progress.stages
    : lastGeneration?.stages ?? [];
  const activeStage = generationStages.find(
    (stage) => stage.id === project.job.progress?.currentStageId,
  ) ?? generationStages.find((stage) => stage.state === "running");
  const activeStageIndex = activeStage
    ? generationStages.findIndex((stage) => stage.id === activeStage.id) + 1
    : generationStages.filter((stage) => stage.state === "complete").length;
  const progressSnapshot = project.job.progress;
  const stageCount = progressSnapshot?.stageCount || generationStages.length || 7;
  const overallProgress = Math.max(
    0,
    Math.min(
      100,
      progressSnapshot?.overallProgress ??
        lastGeneration?.overallProgress ??
        (project.job.status === "complete" ? 100 : 0),
    ),
  );
  const elapsedDurationMs = running
    ? project.job.startedAt
      ? Math.max(0, Date.now() - new Date(project.job.startedAt).getTime())
      : null
    : project.job.totalDurationMs ?? lastGeneration?.totalDurationMs ?? null;
  return (
    <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="min-w-0">
          <button
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)]"
            onClick={() => navigate("/")}
          >
            Biblioteca
          </button>
          <h1 className="mt-1 truncate text-base font-semibold text-[var(--text)]">
            {project.metadata.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            className="h-8 text-xs"
            disabled={
              !project.latestGlb ||
              busy ||
              running ||
              !tools?.tools.blender.exists
            }
            onClick={() => void prepareForSketchUp("separate")}
            title={
              tools?.tools.blender.exists
                ? "Separar componentes desconectados en una versión derivada"
                : "Blender no está configurado"
            }
          >
            Preparar para SketchUp
          </Button>
          <Badge
            tone={
              running
                ? "warning"
                : project.latestGlb
                  ? "success"
                  : project.job.status === "error"
                    ? "danger"
                    : "neutral"
            }
            dot
          >
            {running
              ? "Procesando"
              : project.latestGlb
                ? "Activo listo"
                : "Borrador"}
          </Badge>
          <Button
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => navigate("/settings")}
          >
            Diagnóstico
          </Button>
        </div>
      </header>
      <div className="grid shrink-0 grid-cols-3 border-b border-[var(--border)] bg-[var(--surface-1)]">
        {([1, 2, 3] as const).map((item) => (
          <button
            key={item}
            onClick={() => setStep(item)}
            className={`border-b-2 px-3 py-3 text-left text-xs ${step === item ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-transparent text-[var(--text-secondary)]"}`}
          >
            <span className="mr-2 font-semibold">{item}</span>
            {item === 1
              ? "Referencias"
              : item === 2
                ? "Objetivo y calidad"
                : "Activo 3D"}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,280px)_minmax(0,1fr)_minmax(250px,320px)] max-[960px]:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-faint)]">
            Referencias · {project.metadata.references.length}/4
          </p>
          <div className="mt-3">
            <Dropzone
              files={files}
              disabled={busy || running}
              onFiles={(next) => void upload(next)}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
            PNG, JPG o WebP válidos; mínimo 256 px. Seleccioná la vista
            principal y el ángulo de cada imagen.
          </p>
          <div className="mt-4 space-y-3">
            {project.metadata.references.map((reference) => (
              <div
                key={reference.id}
                className={`rounded-lg border p-2 ${reference.primary ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"}`}
              >
                <img
                  src={generationClient.referenceUrl(project.id, reference.id)}
                  alt={reference.filename}
                  className="h-24 w-full rounded object-cover"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    className="min-w-0 flex-1 truncate text-left text-xs text-[var(--text)]"
                    onClick={() => void selectPrimary(reference.id)}
                  >
                    {reference.primary
                      ? "Vista principal"
                      : "Usar como principal"}
                  </button>
                  <select
                    aria-label={`Ángulo de ${reference.filename}`}
                    value={reference.angle}
                    onChange={(event) =>
                      void updateAngle(
                        reference.id,
                        event.target.value as ReferenceAngle,
                      )
                    }
                    className="h-7 max-w-24 rounded border border-[var(--border)] bg-[var(--surface)] px-1 text-[10px]"
                  >
                    {angles.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-xs font-medium text-[var(--text)]">
              Máscaras y recorte
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Preparado para el pipeline, pero no disponible hasta conectar un
              preprocesador de máscara real.
            </p>
            <Button
              variant="ghost"
              className="mt-2 h-8 w-full text-xs"
              disabled
            >
              Recortar objeto
            </Button>
          </div>
        </aside>
        <section className="relative min-h-0 bg-[var(--shell-viewport)]">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/90 p-1.5">
            {(
              ["textures", "shaded", "clay", "wireframe", "normals"] as const
            ).map((item) => (
              <button
                key={item}
                onClick={() => setRenderMode(item)}
                className={`rounded px-2 py-1 text-[10px] ${renderMode === item ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-[var(--text-secondary)]"}`}
              >
                {
                  (
                    {
                      textures: "Texturas",
                      shaded: "Shaded",
                      clay: "Clay",
                      wireframe: "Wire",
                      normals: "Normales",
                    } as Record<string, string>
                  )[item]
                }
              </button>
            ))}
          </div>
          <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)]/90 p-1.5">
            {(["perspective", "front", "side", "top"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setCameraView(item)}
                className={`rounded px-2 py-1 text-[10px] ${cameraView === item ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-[var(--text-secondary)]"}`}
              >
                {
                  (
                    {
                      perspective: "Persp.",
                      front: "Frente",
                      side: "Lateral",
                      top: "Superior",
                    } as Record<string, string>
                  )[item]
                }
              </button>
            ))}
            <button
              onClick={() => setGridEnabled((value) => !value)}
              className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)]"
            >
              Grilla
            </button>
          </div>
          <ModelViewer
            modelUrl={modelUrl}
            renderMode={renderMode}
            cameraView={cameraView}
            gridEnabled={gridEnabled}
            onStatsChange={onStatsChange}
          />
          {renderMode === "textures" && !project.latestGlb ? null : null}
        </section>
        <aside className="min-h-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 max-[960px]:hidden">
          {step === 1 ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Datos del activo
              </h2>
              <label className="block text-xs text-[var(--text-secondary)]">
                Categoría
                <select
                  value={project.metadata.category}
                  onChange={(event) =>
                    void update({ category: event.target.value })
                  }
                  className="mt-1 h-9 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm"
                >
                  <option value="chair">Silla</option>
                  <option value="table">Mesa</option>
                  <option value="sofa">Sillón</option>
                  <option value="lighting">Luminaria</option>
                  <option value="faucet">Grifería</option>
                  <option value="surface">Revestimiento</option>
                  <option value="free_object">Objeto libre</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--text-secondary)]">
                Medida de referencia
                <input
                  value={referenceLabel}
                  onChange={(event) => setReferenceLabel(event.target.value)}
                  className="mt-1 h-9 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <input
                  value={referenceValue}
                  onChange={(event) => setReferenceValue(event.target.value)}
                  inputMode="decimal"
                  placeholder="120"
                  className="h-9 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm"
                />
                <select
                  value={project.metadata.units}
                  onChange={(event) =>
                    void update({ units: event.target.value as "cm" | "m" })
                  }
                  className="h-9 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm"
                >
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
              <Button
                variant="secondary"
                className="h-9 w-full text-xs"
                onClick={() => void saveScale()}
              >
                Guardar escala
              </Button>
              {project.metadata.referenceMeasurement ? (
                <p className="text-xs text-[var(--success)]">
                  {project.metadata.referenceMeasurement.label}:{" "}
                  {project.metadata.referenceMeasurement.value}{" "}
                  {project.metadata.referenceMeasurement.unit}
                </p>
              ) : null}
            </div>
          ) : step === 2 ? (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Objetivo y calidad
              </h2>
              <div className="mt-3 space-y-2">
                {modeOptions.map((item) => {
                  const available = tools?.tools[item.tool]?.exists;
                  const selected = mode === item.id;
                  return (
                    <button
                      key={item.id}
                      disabled={!available || running}
                      onClick={() => setMode(item.id)}
                      className={`w-full rounded-lg border p-3 text-left ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"} disabled:opacity-55`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text)]">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          {available ? "Disponible" : "No disponible"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
                        {item.images} · {item.quality}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                        {item.time} · GPU {item.gpu} · {item.output}
                      </p>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="primary"
                className="mt-4 h-10 w-full text-xs"
                disabled={busy || running || !modeReady}
                onClick={() => void generate()}
              >
                {project.latestGlb
                  ? "Crear nueva versión"
                  : "Generar activo 3D"}
              </Button>
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-xs font-medium text-[var(--text)]">
                  Activo SketchUp
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {activeSketchUpReady
                    ? "GLB + DAE habilitados. Meshroom no es necesario para este modo."
                    : "Requiere Blender, SketchUp y una exportación DAE verificada. Revisá las pruebas individuales en Configuración."}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {tools?.tools.sketchupBridge.verificationStatus ===
                  "Verificado"
                    ? "El bridge está verificado para importar DAE desde SketchUp."
                    : "Exportación directa a SKP no disponible. Podés exportar DAE y abrirlo en SketchUp."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Revisión y exportación
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={
                    !project.latestGlb ||
                    busy ||
                    running ||
                    !tools?.tools.blender.exists
                  }
                  onClick={() => void prepareForSketchUp("scale")}
                >
                  Escalar
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={
                    !project.latestGlb ||
                    busy ||
                    running ||
                    !tools?.tools.blender.exists
                  }
                  onClick={() => void prepareForSketchUp("separate")}
                >
                  Separar piezas
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled
                  title="La edición PBR exportable requiere el pipeline de materiales de Blender."
                >
                  Materiales
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={
                    !project.latestGlb ||
                    busy ||
                    running ||
                    !tools?.tools.blender.exists
                  }
                  onClick={() => void prepareForSketchUp("optimize")}
                >
                  Optimizar ({optimizationPreset})
                </Button>
              </div>
              <label className="block text-[11px] text-[var(--text-secondary)]">
                Optimización previa a SketchUp
                <select
                  value={optimizationPreset}
                  onChange={(event) =>
                    setOptimizationPreset(
                      event.target.value as
                        | "ligero"
                        | "equilibrado"
                        | "liviano",
                    )
                  }
                  className="mt-1 h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)]"
                >
                  <option value="ligero">
                    Ligero · conserva más geometría
                  </option>
                  <option value="equilibrado">
                    Equilibrado · 50% por pieza
                  </option>
                  <option value="liviano">Liviano · 25% por pieza</option>
                </select>
              </label>
              <p className="text-[11px] leading-4 text-[var(--text-secondary)]">
                Las operaciones crean una versión derivada y conservan intacto
                el GLB fuente. Separar piezas sólo actúa sobre componentes
                geométricamente desconectados; no aplica decimación hasta que
                elijas Optimizar.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
                <span>Ancho</span>
                <strong>
                  {stats
                    ? dimensions(
                        stats.width * project.metadata.scaleFactor,
                        project.metadata.units,
                      )
                    : "—"}
                </strong>
                <span>Profundidad</span>
                <strong>
                  {stats
                    ? dimensions(
                        stats.depth * project.metadata.scaleFactor,
                        project.metadata.units,
                      )
                    : "—"}
                </strong>
                <span>Alto</span>
                <strong>
                  {stats
                    ? dimensions(
                        stats.height * project.metadata.scaleFactor,
                        project.metadata.units,
                      )
                    : "—"}
                </strong>
                <span>Polígonos</span>
                <strong>
                  {(
                    editableStats?.polygons ?? stats?.triangles
                  )?.toLocaleString() ?? "—"}
                </strong>
                <span>Vértices</span>
                <strong>
                  {(
                    editableStats?.vertices ?? stats?.vertices
                  )?.toLocaleString() ?? "—"}
                </strong>
                <span>Piezas / mats.</span>
                <strong>
                  {editableStats
                    ? `${editableStats.pieces} / ${editableStats.materials}`
                    : stats
                      ? `${stats.pieces} / ${stats.materials}`
                      : "—"}
                </strong>
              </div>
              {latestDaeVersion?.sourceStats && editableStats ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text)]">
                    Versión editable: antes → después
                  </p>
                  <p className="mt-1">
                    Polígonos:{" "}
                    {latestDaeVersion.sourceStats.polygons.toLocaleString()} →{" "}
                    {editableStats.polygons.toLocaleString()} · Vértices:{" "}
                    {latestDaeVersion.sourceStats.vertices.toLocaleString()} →{" "}
                    {editableStats.vertices.toLocaleString()}
                  </p>
                  <p className="mt-1">
                    Piezas: {editableStats.pieces} · Materiales:{" "}
                    {editableStats.materials} · DAE:{" "}
                    {editableStats.fileBytes
                      ? `${(editableStats.fileBytes / 1024 / 1024).toFixed(1)} MB`
                      : "—"}
                  </p>
                </div>
              ) : null}
              {latestDaeVersion?.separation ? (
                <p className="text-[11px] leading-4 text-[var(--text-secondary)]">
                  {latestDaeVersion.separation.notice} Componentes adicionales
                  detectados:{" "}
                  {latestDaeVersion.separation.additionalDisconnectedComponents}
                  .
                </p>
              ) : null}
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Modelo visual: GLB texturizado para visor y render. El activo
                editable se habilita únicamente cuando el pipeline de Blender
                termine una salida real.
              </p>
              <Button
                variant="primary"
                className="h-10 w-full text-xs"
                disabled={!project.latestGlb || running}
                onClick={() => void exportGlb()}
              >
                Exportar GLB visual
              </Button>
              <Button
                variant="ghost"
                className="h-9 w-full text-xs"
                disabled={!activeSketchUpReady || !latestDaeVersion}
                onClick={() => {
                  if (!project || !latestDaeVersion) return;
                  const link = document.createElement("a");
                  link.href = generationClient.versionDaeUrl(
                    project.id,
                    latestDaeVersion.id,
                  );
                  link.download = `${project.metadata.name}.dae`;
                  link.click();
                }}
                title={
                  latestDaeVersion
                    ? "Descargar DAE de la última versión preparada"
                    : "Prepará una versión con Blender para generar el DAE"
                }
              >
                Exportar DAE editable
              </Button>
              <Button
                variant="ghost"
                className="h-9 w-full text-xs"
                disabled
                title="La exportación directa a SKP requiere una integración de guardado desde VOLUMIA."
              >
                Exportar SKP (integración directa pendiente)
              </Button>
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--text-faint)]">
                Versiones
              </h3>
              {project.metadata.versions
                .slice()
                .reverse()
                .map((version) => (
                  <div
                    key={version.id}
                    className="rounded border border-[var(--border)] p-2 text-xs"
                  >
                    <p className="text-[var(--text)]">
                      {formatMode(version.mode)}
                    </p>
                    <p className="mt-1 text-[var(--text-secondary)]">
                      {new Date(version.createdAt).toLocaleString("es-AR")} ·{" "}
                      {version.status}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
      {showProgress && generationStages.length ? (
        <GenerationProgressPanel
          stages={generationStages}
          totalDurationMs={elapsedDurationMs}
          running={running}
          runner={project.job.runner ?? lastGeneration?.runner}
          mode={project.job.mode ?? lastGeneration?.generationMode ?? lastGeneration?.mode}
          outputFiles={project.job.resultFiles ?? lastGeneration?.outputFiles ?? lastGeneration?.resultFiles}
        />
      ) : null}
      <footer className="grid min-h-[64px] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`truncate font-medium ${project.job.status === "error" ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
              {project.job.status === "complete"
                ? "Activo 3D generado correctamente"
                : running
                  ? "Generando activo 3D"
                  : `${stages[project.job.status] ?? "Listo"}: ${project.job.message || message || "Esperando referencias"}`}
            </p>
            <div className="flex shrink-0 items-baseline gap-3 font-medium text-[var(--text-secondary)]">
              <span>{overallProgress}%</span>
              <span>{project.job.status === "complete" ? `Tiempo total: ${formatDuration(elapsedDurationMs)}` : formatDuration(elapsedDurationMs)}</span>
            </div>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
            {activeStage?.label || stages[project.job.status] || "Esperando referencias"} · Proceso {Math.max(1, progressSnapshot?.stageIndex || activeStageIndex)} de {stageCount}
          </p>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-label="Avance global de generación">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--volumia-blue),var(--volumia-cyan),var(--volumia-violet))] transition-[width] duration-200"
              style={{ width: `${overallProgress}%` }}
            />
            {running && activeStage?.indeterminate ? (
              <div className="absolute inset-y-0 w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-white/25" style={{ left: `${Math.max(0, overallProgress - 8)}%` }} />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <Button
              variant="danger"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancelar
            </Button>
          ) : null}
          <button
            className="text-xs text-[var(--text-secondary)] underline"
            onClick={() => setShowProgress((value) => !value)}
            aria-expanded={showProgress}
          >
            {running ? "Ver detalle" : "Ver resumen"}
          </button>
          <button
            className="text-xs text-[var(--text-secondary)] underline"
            onClick={() => setShowLogs((value) => !value)}
          >
            Diagnóstico técnico
          </button>
        </div>
      </footer>
      {showLogs ? (
        <div className="absolute bottom-10 right-4 z-20 max-h-52 w-[min(600px,calc(100%-2rem))] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-[var(--text-secondary)]">
          <button
            className="float-right text-xs underline"
            onClick={() =>
              navigator.clipboard?.writeText(
                (project.job.logs || []).join("\n"),
              )
            }
          >
            Copiar diagnóstico
          </button>
          <pre className="whitespace-pre-wrap">
            {(
              project.job.logs || [
                project.job.error?.message || "Sin logs técnicos.",
              ]
            ).join("\n")}
          </pre>
        </div>
      ) : null}
    </main>
  );
}
