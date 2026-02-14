import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { createChatMessage } from "@/projects/factory";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import type { GenerationPreset, ProjectModel } from "@/projects/types";
import { buildMockAssistantReply, summarizeReply } from "@/projects/mockAssistant";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button, TextArea, TextField } from "@/ui/primitives";
import { getSurfaceClass } from "@/ui/surfaceClass";
import { ProjectViewport } from "@/three/ProjectViewport";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";

type GenerationDevice = {
  device: "cuda" | "cpu";
  name: string;
};
type AutoEngine = "triposr" | "arch" | "blockout";

function formatMessageTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
}

function sanitizePathSegment(value: string) {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  return normalized || "project";
}

function shortDeviceName(value: string) {
  if (value.length <= 24) {
    return value;
  }
  return `${value.slice(0, 24)}...`;
}

function parseDeviceLine(value: string): GenerationDevice | null {
  const fullMatch = value.match(/^\[VOLUMIA_DEVICE\]\s+device=(cuda|cpu)\s+index=-?\d+\s+name="([^"]*)"$/);
  if (fullMatch) {
    return {
      device: fullMatch[1] as "cuda" | "cpu",
      name: fullMatch[2],
    };
  }

  const shortMatch = value.match(/^\[VOLUMIA_DEVICE\]\s+device=(cuda|cpu)$/);
  if (!shortMatch) {
    return null;
  }
  return {
    device: shortMatch[1] as "cuda" | "cpu",
    name: shortMatch[1] === "cuda" ? "CUDA" : "CPU",
  };
}

function formatAutoEngineLabel(engine: AutoEngine) {
  if (engine === "triposr") {
    return "TripoSR";
  }
  if (engine === "arch") {
    return "ARCH";
  }
  return "BLOCKOUT";
}

function getProjectModel(model: ProjectModel | undefined): ProjectModel {
  return {
    sourceImages: model?.sourceImages ? [...model.sourceImages] : [],
    glbPath: model?.glbPath,
    generatedAt: model?.generatedAt,
    preset: model?.preset,
    mode: model?.mode ?? "auto",
  };
}

export function ProjectPage() {
  const { t, language } = useT();
  const { settings } = useSettings();
  const { projectId = "" } = useParams();
  const { state, hydrated, renameProject, updateNotes, appendChatMessage, updateModelMetadata, updateProjectModel } = useProjects();

  const project = useMemo(() => selectProjectById(state, projectId), [projectId, state]);
  const [chatInput, setChatInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [preset, setPreset] = useState<GenerationPreset>("balanced");
  const [generationStage, setGenerationStage] = useState("idle");
  const [generationPercent, setGenerationPercent] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("Selecciona imagenes para iniciar.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDevice, setGenerationDevice] = useState<GenerationDevice | null>(null);
  const [autoUsedEngine, setAutoUsedEngine] = useState<AutoEngine | null>(null);
  const [generationLogPath, setGenerationLogPath] = useState("");
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const historyBottomRef = useRef<HTMLDivElement | null>(null);
  const projectModel = getProjectModel(project?.model);

  useEffect(() => {
    if (historyBottomRef.current) {
      historyBottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [project?.chatHistory.length]);

  useEffect(() => {
    if (!project) {
      return;
    }

    setSelectedImages(projectModel.sourceImages);
    setPreset(projectModel.preset ?? "balanced");
    setGenerationStage("idle");
    setGenerationPercent(0);
    setGenerationMessage("Selecciona imagenes para iniciar.");
    setIsGenerating(false);
    setGenerationDevice(null);
    setAutoUsedEngine(null);
    setGenerationLogPath("");
    setImagePreviews({});
  }, [project?.id]);

  useEffect(() => {
    let active = true;
    if (!hasDesktopBridge()) {
      setImagePreviews({});
      return () => {
        active = false;
      };
    }
    if (selectedImages.length === 0) {
      setImagePreviews({});
      return () => {
        active = false;
      };
    }

    void (async () => {
      const entries = await Promise.all(
        selectedImages.map(async (imagePath) => {
          try {
            const dataUrl = await desktopApi.readGenerationImageAsDataUrl(imagePath);
            return [imagePath, dataUrl] as const;
          } catch {
            return [imagePath, ""] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      const nextMap: Record<string, string> = {};
      for (const [imagePath, dataUrl] of entries) {
        if (dataUrl) {
          nextMap[imagePath] = dataUrl;
        }
      }
      setImagePreviews(nextMap);
    })();

    return () => {
      active = false;
    };
  }, [selectedImages]);

  useEffect(() => {
    if (!hasDesktopBridge() || !project) {
      return;
    }

    const cleanupProgress = desktopApi.onGenerationProgress((payload) => {
      if (payload.projectId !== project.id) {
        return;
      }

      setIsGenerating(true);
      setGenerationStage(payload.stage);
      setGenerationPercent(Math.max(0, Math.min(100, payload.percent)));
      setGenerationMessage(payload.message);
      if (payload.stage !== "error") {
        setGenerationLogPath("");
      }
      if (payload.stage !== "done") {
        setAutoUsedEngine(null);
      }
      if (payload.device) {
        setGenerationDevice({
          device: payload.device,
          name: payload.device === "cuda" ? "CUDA" : "CPU",
        });
      }
      const progressDevice = parseDeviceLine(payload.message);
      if (progressDevice) {
        setGenerationDevice(progressDevice);
      }
    });

    const cleanupDone = desktopApi.onGenerationDone((payload) => {
      if (payload.projectId !== project.id) {
        return;
      }

      if (payload.pipeline === "gen_skp") {
        setIsGenerating(false);
        setGenerationStage("done");
        setGenerationPercent(100);
        setGenerationMessage(payload.skpPath ? `SKP generado: ${payload.skpPath}` : "SKP generado correctamente.");
        setAutoUsedEngine(null);
        setGenerationLogPath("");
        return;
      }

      const nextModel: ProjectModel = {
        ...getProjectModel(project.model),
        sourceImages: payload.sourceImages ?? selectedImages,
        glbPath: payload.glbPath ?? project.model?.glbPath,
        generatedAt: Date.now(),
        preset: payload.preset ?? preset,
        mode: payload.mode ?? "auto",
      };

      updateProjectModel(project.id, nextModel);
      setSelectedImages(nextModel.sourceImages);
      setIsGenerating(false);
      setGenerationStage("done");
      setGenerationPercent(100);
      setGenerationMessage(
        payload.autoUsed
          ? `Modelo 3D generado correctamente. AUTO used: ${formatAutoEngineLabel(payload.autoUsed)}`
          : "Modelo 3D generado correctamente."
      );
      setGenerationDevice(payload.device ?? null);
      setAutoUsedEngine(payload.autoUsed ?? null);
      setGenerationLogPath("");
    });

    const cleanupError = desktopApi.onGenerationError((payload) => {
      if (payload.projectId !== project.id) {
        return;
      }

      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(payload.logPath ? `${payload.message} Ver log: ${payload.logPath}` : payload.message);
      setAutoUsedEngine(null);
      setGenerationLogPath(payload.logPath ?? "");
    });

    return () => {
      cleanupProgress();
      cleanupDone();
      cleanupError();
    };
  }, [preset, project, selectedImages, updateProjectModel]);

  if (!hydrated) {
    return null;
  }

  if (!project) {
    return <Navigate to="/" replace />;
  }

  const submitChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage = createChatMessage("user", trimmed);
    appendChatMessage(project.id, userMessage);

    const assistantReplyText = buildMockAssistantReply(project.name, trimmed, language);
    const assistantMessage = createChatMessage("assistant", assistantReplyText);
    appendChatMessage(project.id, assistantMessage);

    updateModelMetadata(project.id, {
      ...project.modelMetadata,
      lastPrompt: trimmed,
      lastAssistantSummary: summarizeReply(assistantReplyText),
    });

    setChatInput("");
  };

  const handleSelectImages = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    const picked = await desktopApi.selectGenerationImages();
    if (picked.length === 0) {
      return;
    }

    const limited = picked.slice(0, 4);
    console.log("[gen][renderer] selected:", limited.length, limited[0] ?? "");
    setSelectedImages(limited);
    setGenerationMessage(`${limited.length} imagen(es) seleccionada(s).`);
  };

  const handleRunGeneration = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    if (selectedImages.length === 0 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setGenerationStage("running");
    setGenerationPercent(1);
    setGenerationMessage("Iniciando generacion...");
    setGenerationDevice(null);
    setAutoUsedEngine(null);
    setGenerationLogPath("");

    const result = await desktopApi.runGeneration({
      projectId: project.id,
      imagePaths: selectedImages,
      preset,
      mode: "auto",
      pythonPath: settings.pythonPath,
      pipeline: "depth_glb",
    });

    if (!result.ok) {
      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(result.logPath ? `${result.error} Ver log: ${result.logPath}` : result.error);
      setGenerationLogPath(result.logPath ?? "");
      return;
    }

    updateProjectModel(project.id, {
      ...projectModel,
      sourceImages: selectedImages,
      preset,
      mode: "auto",
    });
  };

  const handleRunGenerationSkp = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    if (selectedImages.length < 1 || selectedImages.length > 4 || isGenerating) {
      return;
    }

    const projectName = project.name.trim() || "Untitled Project";
    const userDataPath = await desktopApi.getUserDataPath();
    const safeId = sanitizePathSegment(project.id);
    const workDir = `${userDataPath}\\skp-work\\${safeId}`;
    const outputDir = `${userDataPath}\\skp-output`;

    setIsGenerating(true);
    setGenerationStage("running");
    setGenerationPercent(1);
    setGenerationMessage("Iniciando generacion SKP IA...");
    setGenerationDevice(null);
    setAutoUsedEngine(null);
    setGenerationLogPath("");

    const result = await desktopApi.runGeneration({
      projectId: project.id,
      imagePaths: selectedImages,
      preset,
      pythonPath: settings.pythonPath,
      pipeline: "gen_skp",
      inputs: selectedImages,
      projectName,
      workDir,
      outputDir,
      quality: preset === "fast" ? "fast" : "high",
    });

    if (!result.ok) {
      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(result.logPath ? `${result.error} Ver log: ${result.logPath}` : result.error);
      setGenerationLogPath(result.logPath ?? "");
    }
  };

  const handleCancelGeneration = async () => {
    if (!hasDesktopBridge() || !isGenerating) {
      return;
    }

    await desktopApi.cancelGeneration(project.id);
    setIsGenerating(false);
    setGenerationStage("cancelled");
    setGenerationMessage("Cancelando generacion...");
  };

  const handleOpenOutputFolder = async () => {
    if (!hasDesktopBridge() || !project.model?.glbPath) {
      return;
    }

    await desktopApi.openGenerationOutputFolder(project.model.glbPath);
  };

  const handleOpenGenerationLog = async () => {
    if (!hasDesktopBridge() || !generationLogPath) {
      return;
    }
    await desktopApi.openGenerationLogPath(generationLogPath);
  };

  const panelClass = `${getSurfaceClass(settings.glassStyle, "panel")} text-[var(--text)]`;
  const panelSoftClass = getSurfaceClass(settings.glassStyle, "soft");
  const selectClass = "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]";

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-hidden p-4">
      <div className={`grid h-full min-h-0 w-full min-w-0 gap-4 ${isAssistantOpen ? "grid-cols-[320px_minmax(0,1fr)_340px]" : "grid-cols-[320px_minmax(0,1fr)]"}`}>
        <aside className={`flex min-h-0 flex-col rounded-2xl p-4 ${panelClass}`}>
          <TextField
            value={project.name}
            onChange={(event) => renameProject(project.id, event.target.value)}
            aria-label={t("dashboard.projectNameLabel")}
            label={t("project.projectName")}
          />

          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Image to 3D</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => void handleSelectImages()} disabled={isGenerating}>
                Agregar imagenes
              </Button>
              <Button variant="secondary" onClick={() => void handleOpenOutputFolder()} disabled={!project.model?.glbPath}>
                Abrir salida
              </Button>
            </div>

            {selectedImages.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {selectedImages.map((imagePath) => (
                  <figure key={imagePath} className={`flex items-center gap-2 overflow-hidden rounded-xl p-2 ${panelSoftClass}`}>
                    {imagePreviews[imagePath] ? (
                      <img src={imagePreviews[imagePath]} alt={filenameFromPath(imagePath)} className="h-16 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded bg-[var(--surface-3)]" />
                    )}
                    <figcaption className="truncate text-[11px] text-[var(--text-muted)]">{filenameFromPath(imagePath)}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No hay imagenes seleccionadas.</p>
            )}

            <div className="mt-3 space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="h-full bg-[var(--accent)] transition-all duration-150 ease-out" style={{ width: `${generationPercent}%` }} />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {generationStage}: {generationMessage}
              </p>
              {generationStage === "error" && generationLogPath ? (
                <div className="pt-1">
                  <Button variant="secondary" onClick={() => void handleOpenGenerationLog()}>
                    Abrir log
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className={`shrink-0 rounded-2xl p-3 ${panelClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as GenerationPreset)}
                className={`h-9 min-w-32 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                disabled={isGenerating}
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
              </select>
              <Button variant="primary" onClick={() => void handleRunGeneration()} disabled={selectedImages.length === 0 || isGenerating}>
                Generar 3D
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleRunGenerationSkp()}
                disabled={selectedImages.length < 1 || selectedImages.length > 4 || isGenerating}
              >
                Generar SKP
              </Button>
              <Button variant="ghost" onClick={() => void handleCancelGeneration()} disabled={!isGenerating}>
                Cancelar
              </Button>
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
                MODE: AUTO
              </span>
              {autoUsedEngine ? (
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
                  AUTO used: {formatAutoEngineLabel(autoUsedEngine)}
                </span>
              ) : null}
              {generationDevice ? (
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
                  {generationDevice
                    ? generationDevice.device === "cuda"
                      ? `GPU: ${shortDeviceName(generationDevice.name)}`
                      : "CPU"
                    : "Detectando..."}
                </span>
              ) : null}
              <Button variant="secondary" className="ml-auto" onClick={() => setIsAssistantOpen((current) => !current)}>
                {isAssistantOpen ? "Ocultar asistente" : "Asistente"}
              </Button>
            </div>
          </div>

          <div className={`flex-1 min-h-0 min-w-0 overflow-hidden rounded-2xl ${panelClass}`}>
            <ProjectViewport glbPath={project.model?.glbPath} glbVersion={project.model?.generatedAt} showUtilityButtons />
          </div>

          <div className={`shrink-0 overflow-hidden rounded-2xl ${panelClass}`}>
            <button
              type="button"
              className="flex h-10 w-full items-center justify-between px-4 text-left text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)] transition-all duration-200 ease-out hover:bg-[var(--surface-2)]/80"
              onClick={() => setIsNotesOpen((current) => !current)}
            >
              <span>{t("project.notes").toUpperCase()}</span>
              <span>{isNotesOpen ? "OCULTAR" : "MOSTRAR"}</span>
            </button>
            {isNotesOpen ? (
              <div className="h-40 p-3 pt-0">
                <TextArea
                  value={project.notes}
                  onChange={(event) => updateNotes(project.id, event.target.value)}
                  rows={7}
                  className="h-full min-h-0 leading-relaxed"
                  placeholder={t("project.notesPlaceholder")}
                  label=""
                />
              </div>
            ) : null}
          </div>
        </section>

        {isAssistantOpen ? (
          <aside className={`flex min-h-0 flex-col rounded-2xl p-4 ${panelClass}`}>
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("project.assistant")}</h2>

            <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl p-3.5 ${panelSoftClass}`}>
              {project.chatHistory.length === 0 ? <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t("project.noMessages")}</p> : null}

              {project.chatHistory.map((message) => {
                const isAssistant = message.role === "assistant";

                return (
                  <article
                    key={message.id}
                    className={`rounded-xl border p-3 ${
                      isAssistant
                        ? "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text)]"
                        : "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]"
                    }`}
                  >
                    <header className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      <span>{isAssistant ? t("project.assistantRole") : t("project.userRole")}</span>
                      <time>{formatMessageTime(message.createdAt, language)}</time>
                    </header>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  </article>
                );
              })}
              <div ref={historyBottomRef} />
            </div>

            <div className="mt-3 flex gap-2">
              <TextField
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitChat();
                  }
                }}
                placeholder={t("project.promptPlaceholder")}
                aria-label={t("project.assistant")}
              />
              <Button variant="primary" className="min-w-24" onClick={submitChat}>
                {t("project.send")}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
