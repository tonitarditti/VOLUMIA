import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { createChatMessage } from "@/projects/factory";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import type { GenerationPreset, ProjectModel } from "@/projects/types";
import { buildMockAssistantReply, summarizeReply } from "@/projects/mockAssistant";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button, TextArea, TextField } from "@/ui/primitives";
import { ProjectViewport } from "@/three/ProjectViewport";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";

type GenerationDevice = {
  device: "cuda" | "cpu";
  name: string;
};

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

function getProjectModel(model: ProjectModel | undefined): ProjectModel {
  return {
    sourceImages: model?.sourceImages ? [...model.sourceImages] : [],
    glbPath: model?.glbPath,
    generatedAt: model?.generatedAt,
    preset: model?.preset,
  };
}

export function ProjectPage() {
  const { t, language } = useT();
  const { settings, resolvedTheme } = useSettings();
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
        return;
      }

      const nextModel: ProjectModel = {
        ...getProjectModel(project.model),
        sourceImages: payload.sourceImages ?? selectedImages,
        glbPath: payload.glbPath ?? project.model?.glbPath,
        generatedAt: Date.now(),
        preset: payload.preset ?? preset,
      };

      updateProjectModel(project.id, nextModel);
      setSelectedImages(nextModel.sourceImages);
      setIsGenerating(false);
      setGenerationStage("done");
      setGenerationPercent(100);
      setGenerationMessage("Modelo 3D generado correctamente.");
      setGenerationDevice(payload.device ?? null);
    });

    const cleanupError = desktopApi.onGenerationError((payload) => {
      if (payload.projectId !== project.id) {
        return;
      }

      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(payload.message);
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

    const result = await desktopApi.runGeneration({
      projectId: project.id,
      imagePaths: selectedImages,
      preset,
      pythonPath: settings.pythonPath,
      pipeline: "depth_glb",
    });

    if (!result.ok) {
      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(result.error);
      return;
    }

    updateProjectModel(project.id, {
      ...projectModel,
      sourceImages: selectedImages,
      preset,
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
      setGenerationMessage(result.error);
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

  const isLightMode = resolvedTheme === "light";
  const warmPanelClass = isLightMode
    ? "border border-[#d6d3d1]/50 bg-white/40 text-[#1c1917] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.15)]"
    : "border border-[#44403c]/50 bg-[#1c1917]/80 text-[#e7e5e4] backdrop-blur-xl shadow-2xl";
  const warmGlassClass = isLightMode
    ? "bg-white/40 backdrop-blur-md border border-[#d6d3d1]/50 text-[#1c1917] shadow-[0_8px_32px_rgba(0,0,0,0.15)]"
    : "bg-[#0c0a09]/60 backdrop-blur-2xl border border-white/10 text-[#e7e5e4] shadow-[0_8px_32px_rgba(0,0,0,0.5)]";
  const floatingButtonClass = isLightMode
    ? "rounded-lg border border-[#d6d3d1]/50 bg-white/40 px-3 py-2 text-xs text-[#1c1917] backdrop-blur-md transition-all duration-200 ease-out hover:bg-white/60"
    : "rounded-lg border border-[#44403c]/50 bg-[#1c1917]/80 px-3 py-2 text-xs text-[#e7e5e4] backdrop-blur-xl transition-all duration-200 ease-out hover:bg-[#292524]/85";

  return (
    <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div className="absolute inset-0 z-0 h-full w-full">
        <ProjectViewport glbPath={project.model?.glbPath} glbVersion={project.model?.generatedAt} showUtilityButtons={false} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 p-4">
        <div className="relative flex h-full min-h-0 w-full min-w-0 gap-4">
          <aside className={`pointer-events-auto flex h-full min-h-0 w-[320px] flex-col rounded-2xl p-4 ${warmPanelClass}`}>
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
                    <figure
                      key={imagePath}
                      className={`flex items-center gap-2 overflow-hidden rounded-lg p-2 ${
                        isLightMode ? "border border-[#d6d3d1]/50 bg-white/40" : "border border-[#44403c]/50 bg-[#0c0a09]/55"
                      }`}
                    >
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
              </div>
            </div>
          </aside>

          <div className="relative min-h-0 min-w-0 flex-1">
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2">
              <div className={`pointer-events-auto flex items-center gap-2 rounded-full px-3 py-2 transition-all duration-200 ease-out ${isLightMode ? "hover:bg-white/60" : "hover:bg-[#1c1917]/80"} ${warmGlassClass}`}>
                <select
                  value={preset}
                  onChange={(event) => setPreset(event.target.value as GenerationPreset)}
                  className={`h-9 min-w-32 rounded-lg px-3 text-sm outline-none transition duration-150 ease-out focus:border-[#a8a29e] focus:ring-2 focus:ring-[#a8a29e] ${
                    isLightMode
                      ? "border border-[#d6d3d1]/50 bg-white/50 text-[#1c1917]"
                      : "border border-[#44403c]/50 bg-[#1c1917]/85 text-[#e7e5e4]"
                  }`}
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
              </div>
            </div>

            <div className="pointer-events-none absolute right-0 top-0 z-10">
              <div className="flex items-center gap-2">
                <span className={`${floatingButtonClass}`}>
                  {generationDevice
                    ? generationDevice.device === "cuda"
                      ? `GPU: ${shortDeviceName(generationDevice.name)}`
                      : "CPU"
                    : "Detectando..."}
                </span>
                <button
                  type="button"
                  className={`pointer-events-auto ${floatingButtonClass}`}
                  onClick={() => setIsAssistantOpen((current) => !current)}
                >
                  {isAssistantOpen ? "Ocultar asistente" : "Asistente"}
                </button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-16 right-0 top-12 z-10">
              <aside
                className={`pointer-events-auto h-full w-[340px] rounded-2xl p-4 transition-all duration-500 ease-in-out ${
                  isAssistantOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"
                } ${warmPanelClass}`}
              >
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("project.assistant")}</h2>

                <div
                  className={`min-h-0 h-[calc(100%-4.5rem)] space-y-3 overflow-y-auto rounded-xl p-3.5 ${
                    isLightMode ? "border border-[#d6d3d1]/50 bg-white/40" : "border border-[#44403c]/50 bg-[#0c0a09]/55"
                  }`}
                >
                  {project.chatHistory.length === 0 ? <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t("project.noMessages")}</p> : null}

                  {project.chatHistory.map((message) => {
                    const isAssistant = message.role === "assistant";

                    return (
                      <article
                        key={message.id}
                        className={`rounded-xl border p-3 ${
                          isAssistant
                            ? isLightMode
                              ? "border-[#d6d3d1]/60 bg-white/45 text-[#1c1917]"
                              : "border-[#44403c]/50 bg-[#0c0a09]/55 text-[#e7e5e4]"
                            : isLightMode
                              ? "border-[#a8a29e] bg-[#f5f5f4]/75 text-[#1c1917]"
                              : "border-[#78716c] bg-[#1c1917]/80 text-[#e7e5e4]"
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
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10">
              <div
                className={`pointer-events-auto overflow-hidden rounded-2xl transition-all duration-500 ease-in-out ${
                  isNotesOpen ? "h-56" : "h-10"
                } ${warmGlassClass}`}
              >
                <button
                  type="button"
                  className={`pointer-events-auto flex h-10 w-full items-center justify-between px-4 text-left text-xs font-medium uppercase tracking-[0.16em] transition-all duration-200 ease-out ${
                    isLightMode ? "text-[#57534e] hover:bg-white/60" : "text-[#d6d3d1] hover:bg-[#1c1917]/80"
                  }`}
                  onClick={() => setIsNotesOpen((current) => !current)}
                >
                  <span>{t("project.notes")}</span>
                  <span>{isNotesOpen ? "Ocultar" : "Mostrar"}</span>
                </button>
                <div className="h-[calc(100%-2.5rem)] px-4 pb-4">
                  <TextArea
                    value={project.notes}
                    onChange={(event) => updateNotes(project.id, event.target.value)}
                    rows={7}
                    className="h-full min-h-0 leading-relaxed"
                    placeholder={t("project.notesPlaceholder")}
                    label=""
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
