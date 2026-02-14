import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { SplitView } from "@/layout/SplitView";
import { createChatMessage } from "@/projects/factory";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import type { GenerationPreset, ProjectModel } from "@/projects/types";
import { buildMockAssistantReply, summarizeReply } from "@/projects/mockAssistant";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button, Card, TextArea, TextField } from "@/ui/primitives";
import { ProjectViewport } from "@/three/ProjectViewport";
import { useT } from "@/volumia/i18n/useT";

function formatMessageTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return `file://${normalized}`;
}

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
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
  }, [project?.id]);

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
    });

    const cleanupDone = desktopApi.onGenerationDone((payload) => {
      if (payload.projectId !== project.id) {
        return;
      }

      const nextModel: ProjectModel = {
        ...getProjectModel(project.model),
        sourceImages: payload.sourceImages ?? selectedImages,
        glbPath: payload.glbPath,
        generatedAt: Date.now(),
        preset: payload.preset ?? preset,
      };

      updateProjectModel(project.id, nextModel);
      setSelectedImages(nextModel.sourceImages);
      setIsGenerating(false);
      setGenerationStage("done");
      setGenerationPercent(100);
      setGenerationMessage("Modelo 3D generado correctamente.");
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

    const assistantReplyText = buildMockAssistantReply(project.name, trimmed);
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

    setSelectedImages(picked);
    setGenerationMessage(`${picked.length} imagen(es) seleccionada(s).`);
  };

  const handleRunGeneration = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    if (selectedImages.length === 0 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setGenerationStage("queue");
    setGenerationPercent(1);
    setGenerationMessage("Iniciando generacion...");

    const result = await desktopApi.runGeneration({
      projectId: project.id,
      imagePaths: selectedImages,
      preset,
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

  const handleCancelGeneration = async () => {
    if (!hasDesktopBridge() || !isGenerating) {
      return;
    }

    await desktopApi.cancelGeneration(project.id);
    setIsGenerating(false);
    setGenerationStage("cancelled");
    setGenerationMessage("Cancelando generacion...");
  };

  return (
    <SplitView
      left={
        <>
          <Card padding="md">
            <TextField
              value={project.name}
              onChange={(event) => renameProject(project.id, event.target.value)}
              aria-label={t("dashboard.projectNameLabel")}
              label={t("project.projectName")}
            />
          </Card>

          <Card padding="md">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Image to 3D</h2>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
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
                <Button variant="ghost" onClick={() => void handleCancelGeneration()} disabled={!isGenerating}>
                  Cancelar
                </Button>
              </div>

              {selectedImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6">
                  {selectedImages.map((imagePath) => (
                    <figure key={imagePath} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                      <img src={toFileUrl(imagePath)} alt={filenameFromPath(imagePath)} className="h-20 w-full object-cover" />
                      <figcaption className="truncate px-2 py-1 text-[10px] text-[var(--text-muted)]">{filenameFromPath(imagePath)}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">No hay imagenes seleccionadas.</p>
              )}

              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div className="h-full bg-[var(--accent)] transition-all duration-150 ease-out" style={{ width: `${generationPercent}%` }} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">{generationStage}: {generationMessage}</p>
              </div>
            </div>
          </Card>

          <Card padding="md" className="flex min-h-0 flex-1 flex-col">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("project.viewport")}</h2>
            <div className="min-h-0 flex-1">
              <ProjectViewport glbPath={project.model?.glbPath} />
            </div>
          </Card>

          <Card padding="md">
            <TextArea
              value={project.notes}
              onChange={(event) => updateNotes(project.id, event.target.value)}
              rows={7}
              className="min-h-36 leading-relaxed"
              placeholder={t("project.notesPlaceholder")}
              label={t("project.notes")}
            />
          </Card>
        </>
      }
      right={
        <Card padding="md" className="flex h-full min-h-0 flex-1 flex-col">
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
        </Card>
      }
    />
  );
}
