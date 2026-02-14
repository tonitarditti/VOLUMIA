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
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
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
    setIsNotesOpen(false);
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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 gap-4 overflow-hidden p-0">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ProjectViewport glbPath={project.model?.glbPath} glbVersion={project.model?.generatedAt} />

        <div className="absolute left-4 top-4 z-30 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/70 p-3 backdrop-blur">
          <TextField
            value={project.name}
            onChange={(event) => renameProject(project.id, event.target.value)}
            aria-label={t("dashboard.projectNameLabel")}
            label={t("project.projectName")}
          />
        </div>

        <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/50 px-4 py-3 backdrop-blur">
          <Button variant="secondary" onClick={() => void handleSelectImages()} disabled={isGenerating}>
            Agregar imagenes
          </Button>
          <select
            value={preset}
            onChange={(event) => setPreset(event.target.value as GenerationPreset)}
            className="h-10 min-w-40 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text)] outline-none transition duration-150 ease-out focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]"
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
            Generar SKP (IA)
          </Button>
          <Button variant="ghost" onClick={() => void handleCancelGeneration()} disabled={!isGenerating}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => void handleOpenOutputFolder()} disabled={!project.model?.glbPath}>
            Abrir salida
          </Button>
          <span className="inline-flex h-10 items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs text-[var(--text-muted)]">
            {generationDevice
              ? generationDevice.device === "cuda"
                ? `GPU: ${shortDeviceName(generationDevice.name)}`
                : "CPU"
              : "Detectando..."}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{generationStage}: {generationMessage}</span>
        </div>

        {selectedImages.length > 0 ? (
          <div className="absolute left-4 top-24 z-20 w-72 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/75 p-2 backdrop-blur">
            {selectedImages.map((imagePath) => (
              <figure key={imagePath} className="flex items-center gap-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
                {imagePreviews[imagePath] ? (
                  <img src={imagePreviews[imagePath]} alt={filenameFromPath(imagePath)} className="h-14 w-14 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded bg-[var(--surface-3)]" />
                )}
                <figcaption className="truncate text-[11px] text-[var(--text-muted)]">{filenameFromPath(imagePath)}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        <div
          className="absolute inset-x-4 bottom-4 z-30 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/70 backdrop-blur transition-[max-height] duration-200 ease-out"
          style={{ maxHeight: isNotesOpen ? 200 : 40 }}
        >
          <div className="flex h-10 items-center justify-between px-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("project.notes")}</h2>
            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setIsNotesOpen((value) => !value)}>
              {isNotesOpen ? "Ocultar" : "Abrir"}
            </Button>
          </div>
          <div className="h-[160px] px-3 pb-3">
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

        <button
          type="button"
          onClick={() => setIsAssistantOpen((value) => !value)}
          className="absolute right-4 top-4 z-40 rounded-md border border-[var(--border)] bg-[var(--surface-1)]/70 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] backdrop-blur transition-colors hover:text-[var(--text)]"
        >
          {isAssistantOpen ? "Ocultar asistente" : "Mostrar asistente"}
        </button>
      </div>

      <aside
        className={`relative h-full min-h-0 overflow-hidden border-l border-[var(--border)] bg-[var(--surface-1)] transition-[width,opacity] duration-200 ease-out ${
          isAssistantOpen ? "w-[300px] opacity-100" : "w-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex h-full w-[300px] min-h-0 flex-col p-4">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("project.assistant")}</h2>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            {project.chatHistory.length === 0 ? (
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {t("project.noMessages")}
              </p>
            ) : null}

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

          <div className="mt-4 flex gap-4">
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
        </div>
      </aside>
    </div>
  );
}
