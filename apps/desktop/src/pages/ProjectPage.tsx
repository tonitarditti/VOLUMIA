import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Navigate, useParams } from "react-router-dom";
import { createChatMessage } from "@/projects/factory";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import type { GenerationPreset, ProjectModel } from "@/projects/types";
import {
  buildMockAssistantReply,
  summarizeReply,
} from "@/projects/mockAssistant";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button, TextArea } from "@/ui/primitives";
import { BottomToolbar, RightPanel, TopBar } from "@/ui/shell";
import { ProjectViewport } from "@/three/ProjectViewport";
import {
  DEFAULT_COMFY_WORKFLOW_ID,
  useGenerationJobStore,
} from "@/services/comfyui";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";

type GenerationDevice = {
  device: "cuda" | "cpu";
  name: string;
};
type AutoEngine = "instantmesh" | "triposr" | "arch" | "blockout";
type AutoPreset = "hard_surface" | "organic";
type AutoProfile = "auto" | "hard_surface" | "organic";
type MultiviewPreset = "hard_surface" | "balanced" | "organic";
type MultiviewHardSurfaceQuality = "fast" | "balanced" | "pro";
type ReconstructionTier = "preview" | "final";
type PendingGenerationRun = {
  jobId?: string;
  pipeline?: "depth_glb" | "gen_skp";
  sourceImages: string[];
  preset: GenerationPreset;
};
type InspectorTab = "model" | "material" | "light" | "ai" | "result";
type WorkspaceStatus = "idle" | "generating" | "ready" | "error";

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "model", label: "MODEL" },
  { id: "material", label: "MATERIAL" },
  { id: "light", label: "LIGHT" },
  { id: "ai", label: "AI" },
  { id: "result", label: "RESULT" },
];

function formatMessageTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
}

function formatAutoEngineLabel(engine: AutoEngine) {
  if (engine === "instantmesh") {
    return "InstantMesh";
  }
  if (engine === "triposr") {
    return "TripoSR";
  }
  if (engine === "arch") {
    return "ARCH";
  }
  return "BLOCKOUT";
}

function formatAutoPresetLabel(preset: AutoPreset) {
  if (preset === "hard_surface") {
    return "HardSurface";
  }
  return "Organic";
}

function formatAutoProfileLabel(profile: AutoProfile) {
  if (profile === "hard_surface") {
    return "HARD-SURFACE";
  }
  if (profile === "organic") {
    return "ORGANICO";
  }
  return "AUTO";
}

function resolveDefaultMultiviewPreset(
  profile: AutoProfile | undefined,
): MultiviewPreset {
  if (profile === "hard_surface") {
    return "hard_surface";
  }
  if (profile === "organic") {
    return "organic";
  }
  return "hard_surface";
}

const MULTIVIEW_ENABLED_KEY = "volumia.multiview.enabled";
const MULTIVIEW_HARD_SURFACE_QUALITY_KEY =
  "volumia.multiview.hard_surface.quality";
const RECONSTRUCTION_TIER_KEY = "volumia.reconstruction.tier";

function isMultiviewHardSurfaceQuality(
  value: string,
): value is MultiviewHardSurfaceQuality {
  return value === "fast" || value === "balanced" || value === "pro";
}

function resolveStoredMultiviewHardSurfaceQuality(): MultiviewHardSurfaceQuality {
  if (typeof window === "undefined") {
    return "balanced";
  }
  try {
    const stored = window.localStorage.getItem(
      MULTIVIEW_HARD_SURFACE_QUALITY_KEY,
    );
    if (stored && isMultiviewHardSurfaceQuality(stored)) {
      return stored;
    }
  } catch {
    // No-op by design.
  }
  return "balanced";
}

function isReconstructionTier(value: string): value is ReconstructionTier {
  return value === "preview" || value === "final";
}

function resolveStoredReconstructionTier(): ReconstructionTier {
  if (typeof window === "undefined") {
    return "preview";
  }
  try {
    const stored = window.localStorage.getItem(RECONSTRUCTION_TIER_KEY);
    if (stored && isReconstructionTier(stored)) {
      return stored;
    }
  } catch {
    // No-op by design.
  }
  return "preview";
}

function resolveStoredMultiviewEnabled(tier: ReconstructionTier): {
  enabled: boolean;
  hasStoredPreference: boolean;
} {
  if (typeof window === "undefined") {
    return {
      enabled: tier === "final",
      hasStoredPreference: false,
    };
  }
  try {
    const stored = window.localStorage.getItem(MULTIVIEW_ENABLED_KEY);
    if (stored === "true") {
      return { enabled: true, hasStoredPreference: true };
    }
    if (stored === "false") {
      return { enabled: false, hasStoredPreference: true };
    }
  } catch {
    // No-op by design.
  }
  return {
    enabled: tier === "final",
    hasStoredPreference: false,
  };
}

function resolveInitialGenerationUiState() {
  const reconstructionTier = resolveStoredReconstructionTier();
  const multiview = resolveStoredMultiviewEnabled(reconstructionTier);
  return {
    reconstructionTier,
    multiviewEnabled: multiview.enabled,
    hasStoredMultiviewPreference: multiview.hasStoredPreference,
  };
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
  const initialGenerationUiState = useMemo(
    () => resolveInitialGenerationUiState(),
    [],
  );
  const hasStoredMultiviewPreferenceRef = useRef(
    initialGenerationUiState.hasStoredMultiviewPreference,
  );
  const { t, language } = useT();
  const { settings, setAutoGenerationProfile } = useSettings();
  const {
    state: generationJob,
    runGeneration,
    cancelGeneration,
  } = useGenerationJobStore();
  const { projectId = "" } = useParams();
  const {
    state,
    hydrated,
    renameProject,
    updateNotes,
    appendChatMessage,
    updateModelMetadata,
    updateProjectModel,
  } = useProjects();

  const project = useMemo(
    () => selectProjectById(state, projectId),
    [projectId, state],
  );
  const [chatInput, setChatInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [preset, setPreset] = useState<GenerationPreset>("balanced");
  const [generationStage, setGenerationStage] = useState("idle");
  const [generationPercent, setGenerationPercent] = useState(0);
  const [generationMessage, setGenerationMessage] = useState(
    "Selecciona imagenes para iniciar.",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDevice, setGenerationDevice] =
    useState<GenerationDevice | null>(null);
  const [autoUsedEngine, setAutoUsedEngine] = useState<AutoEngine | null>(null);
  const [autoUsedPreset, setAutoUsedPreset] = useState<AutoPreset | null>(null);
  const [generationLogPath, setGenerationLogPath] = useState("");
  const [multiviewEnabled, setMultiviewEnabled] = useState(
    initialGenerationUiState.multiviewEnabled,
  );
  const [multiviewPreset, setMultiviewPreset] = useState<MultiviewPreset>(
    resolveDefaultMultiviewPreset(settings.autoGenerationProfile),
  );
  const [multiviewHardSurfaceQuality, setMultiviewHardSurfaceQuality] =
    useState<MultiviewHardSurfaceQuality>(
      resolveStoredMultiviewHardSurfaceQuality,
    );
  const [reconstructionTier, setReconstructionTier] =
    useState<ReconstructionTier>(initialGenerationUiState.reconstructionTier);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>(
    {},
  );
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("model");
  const [isReferenceDrawerOpen, setIsReferenceDrawerOpen] = useState(true);
  const [toolShortcut, setToolShortcut] = useState("tools");
  const [comfyStatus, setComfyStatus] = useState<Awaited<
    ReturnType<typeof desktopApi.getComfyStatus>
  > | null>(null);
  const [engineMessage, setEngineMessage] = useState("Checking AI engine...");
  const [isRestartingEngine, setIsRestartingEngine] = useState(false);
  const [showEngineLogs, setShowEngineLogs] = useState(false);
  const historyBottomRef = useRef<HTMLDivElement | null>(null);
  const projectModel = getProjectModel(project?.model);
  const currentProjectId = project?.id ?? "";
  const projectRef = useRef(project);
  const selectedImagesRef = useRef(selectedImages);
  const presetRef = useRef(preset);
  const updateProjectModelRef = useRef(updateProjectModel);
  const pendingGenerationRef = useRef<PendingGenerationRun | null>(null);
  const handledGenerationStateRef = useRef("");
  const workspaceStatusRef = useRef<WorkspaceStatus>("idle");

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    updateProjectModelRef.current = updateProjectModel;
  }, [updateProjectModel]);

  useEffect(() => {
    if (historyBottomRef.current) {
      historyBottomRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
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
    setAutoUsedPreset(null);
    setGenerationLogPath("");
    const storedMultiview = resolveStoredMultiviewEnabled(reconstructionTier);
    hasStoredMultiviewPreferenceRef.current =
      storedMultiview.hasStoredPreference;
    setMultiviewEnabled(storedMultiview.enabled);
    setMultiviewPreset(
      resolveDefaultMultiviewPreset(settings.autoGenerationProfile),
    );
    setImagePreviews({});
    pendingGenerationRef.current = null;
    handledGenerationStateRef.current = "";
    setActiveTab("model");
    setIsReferenceDrawerOpen(true);
    setToolShortcut("tools");
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
            const dataUrl =
              await desktopApi.readGenerationImageAsDataUrl(imagePath);
            return [imagePath, dataUrl] as const;
          } catch {
            return [imagePath, ""] as const;
          }
        }),
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
    if (!hasDesktopBridge()) {
      setEngineMessage("Desktop bridge unavailable.");
      return;
    }

    let active = true;

    const readEngineStatus = async () => {
      try {
        const status = await desktopApi.getComfyStatus();
        if (!active) {
          return;
        }
        setComfyStatus(status);
        setEngineMessage(status.lastError ?? status.message);
      } catch (error) {
        if (!active) {
          return;
        }
        setEngineMessage(
          error instanceof Error
            ? error.message
            : "Could not read AI engine state.",
        );
      }
    };

    void readEngineStatus();
    const timer = window.setInterval(() => void readEngineStatus(), 4_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleGenerationDone = useCallback(
    (payload: {
      projectId: string;
      pipeline?: "depth_glb" | "gen_skp";
      glbPath?: string;
      skpPath?: string;
      message?: string;
      sourceImages?: string[];
      preset?: GenerationPreset;
      mode?: "auto" | "neural" | "architectural";
      autoUsed?: AutoEngine;
      autoPreset?: AutoPreset;
      device?: { device: "cuda" | "cpu"; name: string } | null;
      warnings?: string[];
    }) => {
      const currentProject = projectRef.current;
      if (!currentProject || payload.projectId !== currentProject.id) {
        return;
      }

      if (payload.pipeline === "gen_skp" && payload.skpPath) {
        setIsGenerating(false);
        setGenerationStage("done");
        setGenerationPercent(100);
        const skpMessage =
          payload.message ??
          (payload.skpPath
            ? `SKP generado: ${payload.skpPath}`
            : "SKP generado correctamente.");
        setGenerationMessage(skpMessage);
        setAutoUsedEngine(null);
        setAutoUsedPreset(null);
        setGenerationLogPath("");
        return;
      }

      const nextModel: ProjectModel = {
        ...getProjectModel(currentProject.model),
        sourceImages: payload.sourceImages ?? selectedImagesRef.current,
        glbPath: payload.glbPath ?? currentProject.model?.glbPath,
        generatedAt: Date.now(),
        preset: payload.preset ?? presetRef.current,
        mode: payload.mode ?? "auto",
      };

      updateProjectModelRef.current(currentProject.id, nextModel);
      setSelectedImages(nextModel.sourceImages);
      setIsGenerating(false);
      setGenerationStage("done");
      setGenerationPercent(100);
      const baseMessage =
        payload.message ??
        (payload.autoUsed === "blockout" &&
        payload.autoPreset === "hard_surface"
          ? "Modelo 3D generado correctamente. AUTO used: BLOCKOUT (hard-surface fallback)"
          : payload.autoUsed
            ? `Modelo 3D generado correctamente. AUTO used: ${formatAutoEngineLabel(payload.autoUsed)}${payload.autoPreset ? ` / ${formatAutoPresetLabel(payload.autoPreset)}` : ""}`
            : "Modelo 3D generado correctamente.");
      const warningSuffix =
        Array.isArray(payload.warnings) && payload.warnings.length > 0
          ? ` Aviso: ${payload.warnings.join(" | ")}`
          : "";
      setGenerationMessage(`${baseMessage}${warningSuffix}`);
      setGenerationDevice(payload.device ?? null);
      setAutoUsedEngine(payload.autoUsed ?? null);
      setAutoUsedPreset(payload.autoPreset ?? null);
      setGenerationLogPath("");
    },
    [],
  );

  const handleGenerationError = useCallback(
    (payload: { projectId: string; message: string; logPath?: string }) => {
      const currentProject = projectRef.current;
      if (!currentProject || payload.projectId !== currentProject.id) {
        return;
      }

      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage(
        payload.logPath
          ? `${payload.message} Ver log: ${payload.logPath}`
          : payload.message,
      );
      setAutoUsedEngine(null);
      setAutoUsedPreset(null);
      setGenerationLogPath(payload.logPath ?? "");
    },
    [],
  );

  useEffect(() => {
    if (!currentProjectId || generationJob.projectId !== currentProjectId) {
      return;
    }

    if (generationJob.status === "generating") {
      setIsGenerating(true);
      setGenerationStage(
        (generationJob.progress ?? 0) < 10 ? "queued" : "running",
      );
      setGenerationPercent(generationJob.progress ?? 0);
      setGenerationMessage(generationJob.message ?? "Procesando en ComfyUI...");
      setGenerationLogPath("");
      return;
    }

    if (generationJob.status === "idle") {
      return;
    }

    const stateKey = `${generationJob.status}:${generationJob.jobId ?? "none"}:${generationJob.finishedAt ?? generationJob.startedAt ?? 0}`;
    if (handledGenerationStateRef.current === stateKey) {
      return;
    }
    handledGenerationStateRef.current = stateKey;

    if (generationJob.status === "result") {
      const pendingRun = pendingGenerationRef.current;
      const glbPath = generationJob.outputs?.glbPath;

      if (!glbPath) {
        handleGenerationError({
          projectId: currentProjectId,
          message:
            generationJob.message || "ComfyUI finalizo sin producir un GLB.",
        });
        return;
      }

      handleGenerationDone({
        projectId: currentProjectId,
        pipeline: pendingRun?.pipeline,
        glbPath,
        sourceImages: pendingRun?.sourceImages ?? selectedImagesRef.current,
        preset: pendingRun?.preset ?? presetRef.current,
        mode: "auto",
        message: generationJob.message,
      });
      pendingGenerationRef.current = null;
      return;
    }

    if (generationJob.status === "error") {
      handleGenerationError({
        projectId: currentProjectId,
        message:
          generationJob.error?.message ??
          generationJob.message ??
          "Error ejecutando ComfyUI.",
      });
      pendingGenerationRef.current = null;
    }
  }, [
    currentProjectId,
    generationJob,
    handleGenerationDone,
    handleGenerationError,
  ]);

  const runComfyWorkflow = useCallback(
    async (payload: {
      imagePath: string;
      sourceImages: string[];
      pipeline?: "depth_glb" | "gen_skp";
      label: string;
    }) => {
      console.info("[gen][renderer] ComfyUI submit requested.", {
        label: payload.label,
        imagePath: payload.imagePath,
        projectId: currentProjectId,
      });

      pendingGenerationRef.current = {
        pipeline: payload.pipeline,
        sourceImages: [...payload.sourceImages],
        preset,
      };
      handledGenerationStateRef.current = "";

      try {
        const submitted = await runGeneration({
          workflowId: DEFAULT_COMFY_WORKFLOW_ID,
          imagePath: payload.imagePath,
          projectId: currentProjectId,
        });

        pendingGenerationRef.current = {
          ...(pendingGenerationRef.current ?? {
            pipeline: payload.pipeline,
            sourceImages: [...payload.sourceImages],
            preset,
          }),
          jobId: submitted.jobId,
        };
      } catch (error) {
        pendingGenerationRef.current = null;
        handleGenerationError({
          projectId: currentProjectId,
          message:
            error instanceof Error
              ? error.message
              : "Error ejecutando ComfyUI.",
        });
      }
    },
    [currentProjectId, handleGenerationError, preset, runGeneration],
  );

  // TODO(cleanup): remove legacy local generation IPC + python pipeline once Comfy-only flow is stable.

  const workspaceStatus: WorkspaceStatus =
    generationJob.projectId === currentProjectId &&
    generationJob.status === "error"
      ? "error"
      : isGenerating
        ? "generating"
        : project?.model?.glbPath
          ? "ready"
          : "idle";

  useEffect(() => {
    if (workspaceStatusRef.current === workspaceStatus) {
      return;
    }

    if (workspaceStatus === "generating") {
      setActiveTab("ai");
    } else if (workspaceStatus === "ready") {
      setActiveTab("result");
    } else if (workspaceStatus === "error") {
      setActiveTab("ai");
    }

    workspaceStatusRef.current = workspaceStatus;
  }, [workspaceStatus]);

  const engineState =
    isRestartingEngine || comfyStatus?.state === "STARTING"
      ? "busy"
      : comfyStatus?.state === "ERROR" || Boolean(comfyStatus?.lastError)
        ? "error"
        : comfyStatus?.running
          ? "ready"
          : "busy";
  const isEngineReady = engineState === "ready";
  const engineLogs = comfyStatus?.lastLogs?.slice(-10) ?? [];
  const engineBadgeClass =
    engineState === "ready"
      ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]"
      : engineState === "error"
        ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
        : "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]";
  const engineBadgeLabel =
    engineState === "ready"
      ? "Ready"
      : engineState === "error"
        ? "Error"
        : "Busy";

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

    const assistantReplyText = buildMockAssistantReply(
      project.name,
      trimmed,
      language,
    );
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

  const restartEngine = async () => {
    if (!hasDesktopBridge()) {
      setEngineMessage("Desktop bridge unavailable.");
      return;
    }

    setIsRestartingEngine(true);
    try {
      if (comfyStatus?.running) {
        await desktopApi.stopComfy();
      }
      const nextStatus = await desktopApi.startComfy();
      setComfyStatus(nextStatus);
      setEngineMessage(nextStatus.lastError ?? nextStatus.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not restart AI engine.";
      setEngineMessage(message);
    } finally {
      setIsRestartingEngine(false);
    }
  };

  const handleRunGeneration = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    if (selectedImages.length === 0 || isGenerating) {
      return;
    }

    if (!comfyStatus?.running || comfyStatus.state === "ERROR") {
      setActiveTab("ai");
      setGenerationStage("error");
      setGenerationMessage(
        "Engine offline - Restart the AI engine to continue.",
      );
      return;
    }

    setIsGenerating(true);
    setGenerationStage("running");
    setGenerationPercent(5);
    setGenerationMessage("Iniciando generacion en ComfyUI...");
    setGenerationDevice(null);
    setAutoUsedEngine(null);
    setGenerationLogPath("");

    const imagePath = selectedImages[0];
    if (!imagePath) {
      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage("No hay imagen valida para ComfyUI.");
      return;
    }
    if (selectedImages.length > 1) {
      console.info(
        "[gen][renderer] ComfyUI usa solo la primera imagen seleccionada.",
        {
          count: selectedImages.length,
        },
      );
    }

    await runComfyWorkflow({
      imagePath,
      sourceImages: selectedImages,
      pipeline: "depth_glb",
      label: "Generar 3D",
    });
  };

  const handleRunGenerationSkp = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    if (
      selectedImages.length < 1 ||
      selectedImages.length > 4 ||
      isGenerating
    ) {
      return;
    }

    if (!comfyStatus?.running || comfyStatus.state === "ERROR") {
      setActiveTab("ai");
      setGenerationStage("error");
      setGenerationMessage(
        "Engine offline - Restart the AI engine to continue.",
      );
      return;
    }

    setIsGenerating(true);
    setGenerationStage("running");
    setGenerationPercent(5);
    setGenerationMessage("Iniciando generacion ComfyUI (SKP)...");
    setGenerationDevice(null);
    setAutoUsedEngine(null);
    setGenerationLogPath("");

    const imagePath = selectedImages[0];
    if (!imagePath) {
      setIsGenerating(false);
      setGenerationStage("error");
      setGenerationMessage("No hay imagen valida para ComfyUI.");
      return;
    }
    if (selectedImages.length > 1) {
      console.info(
        "[gen][renderer] ComfyUI usa solo la primera imagen seleccionada.",
        {
          count: selectedImages.length,
        },
      );
    }

    await runComfyWorkflow({
      imagePath,
      sourceImages: selectedImages,
      pipeline: "gen_skp",
      label: "Generar SKP",
    });
  };

  const handleCancelGeneration = async () => {
    if (!isGenerating) {
      return;
    }

    await cancelGeneration();
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

  const handleToolShortcut = async (value: string) => {
    setToolShortcut(value);

    if (value === "references") {
      setIsReferenceDrawerOpen((current) => !current);
    } else if (value === "notes") {
      setIsReferenceDrawerOpen(true);
    } else if (value === "result") {
      setActiveTab("result");
    } else if (value === "output") {
      await handleOpenOutputFolder();
    }

    window.setTimeout(() => {
      setToolShortcut("tools");
    }, 0);
  };

  const topMetaClass =
    "rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]";
  const viewportMetaClass =
    "rounded-full border border-[var(--border)] bg-[var(--glass-bg-strong)] px-3 py-1.5 text-[11px] text-[var(--text)] shadow-[var(--glass-shadow)] backdrop-blur";
  const contrastMetaClass =
    "rounded-full border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-tag)] px-3 py-1.5 text-[11px] text-[var(--shell-contrast-text-muted)]";
  const contrastSectionClass =
    "rounded-2xl border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-surface)] p-4";
  const contrastLabelClass =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-contrast-text-muted)]";
  const contrastBodyClass =
    "text-[13px] leading-6 text-[var(--shell-contrast-text)]";
  const contrastSubtleClass =
    "text-[12px] leading-5 text-[var(--shell-contrast-text-muted)]";
  const contrastButtonClass =
    "border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-surface)] text-[var(--shell-contrast-text)] hover:border-[var(--accent)] hover:bg-[var(--shell-contrast-tag)]";
  const contrastGhostButtonClass =
    "border-transparent bg-transparent text-[var(--shell-contrast-text-muted)] hover:border-[var(--shell-contrast-border)] hover:bg-[var(--shell-contrast-surface)] hover:text-[var(--shell-contrast-text)]";
  const contrastSelectClass =
    "pointer-events-auto h-10 w-full appearance-none rounded-xl border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-surface)] px-3 text-sm text-[var(--shell-contrast-text)] outline-none hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]";
  const contrastToggleClass =
    "inline-flex h-10 w-full items-center gap-2 rounded-xl border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-surface)] px-3 text-xs text-[var(--shell-contrast-text)]";
  const railButtonClass = (isActive: boolean) =>
    `relative flex h-11 w-11 items-center justify-center rounded-xl border text-[10px] font-semibold tracking-[0.14em] transition-colors ${
      isActive
        ? "border-[var(--accent)] bg-[var(--shell-contrast-surface)] text-[var(--shell-contrast-text)]"
        : "border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-tag)] text-[var(--shell-contrast-text-muted)] hover:text-[var(--shell-contrast-text)]"
    }`;
  const bottomZoneClass = "flex h-full min-w-0 items-center gap-2 px-4";
  const workspaceBadgeClass =
    workspaceStatus === "generating"
      ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]"
      : workspaceStatus === "ready"
        ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]"
        : workspaceStatus === "error"
          ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]";
  const stopPanelWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          eyebrow="Workspace"
          title={project.name}
          breadcrumb={["Projects", project.name]}
          statusSlot={
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${engineBadgeClass}`}
            >
              Engine {engineBadgeLabel}
            </span>
          }
          rightSlot={
            <div className="flex items-center gap-2">
              <span className={topMetaClass}>Preset {preset}</span>
              <span className={topMetaClass}>{selectedImages.length} refs</span>
            </div>
          }
        />
        <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--surface-1)]">
          <aside
            className="flex h-full w-16 shrink-0 flex-col items-center gap-3 border-r border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-panel)] px-2 py-3 text-[var(--shell-contrast-text)]"
            onWheelCapture={stopPanelWheel}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-tag)] text-[11px] font-semibold tracking-[0.24em] text-[var(--accent)]">
              VD
            </div>
            <div className="flex flex-1 flex-col items-center gap-2">
              {INSPECTOR_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={railButtonClass(activeTab === tab.id)}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                >
                  {tab.label.slice(0, 1)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={railButtonClass(isReferenceDrawerOpen)}
              onClick={() => setIsReferenceDrawerOpen((value) => !value)}
              title="Toggle references"
            >
              REF
            </button>
          </aside>

          {isReferenceDrawerOpen ? (
            <aside
              className="flex min-h-0 w-[292px] shrink-0 flex-col gap-5 border-r border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-panel)] px-5 py-5 text-[var(--shell-contrast-text)]"
              onWheelCapture={stopPanelWheel}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={contrastLabelClass}>Reference Drawer</p>
                  <p className="mt-1 text-sm font-medium text-[var(--shell-contrast-text)]">
                    Input imagery
                  </p>
                </div>
                <span className={contrastMetaClass}>
                  {selectedImages.length} imgs
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {selectedImages.length > 0 ? (
                  selectedImages.map((imagePath) => (
                    <figure
                      key={imagePath}
                      className={`${contrastSectionClass} overflow-hidden`}
                    >
                      {imagePreviews[imagePath] ? (
                        <img
                          src={imagePreviews[imagePath]}
                          alt={filenameFromPath(imagePath)}
                          className="h-36 w-full rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-36 w-full rounded-xl bg-[var(--shell-contrast-tag)]" />
                      )}
                      <figcaption className="mt-3 truncate text-[11px] text-[var(--shell-contrast-text-muted)]">
                        {filenameFromPath(imagePath)}
                      </figcaption>
                    </figure>
                  ))
                ) : (
                  <div
                    className={`${contrastSectionClass} text-xs text-[var(--shell-contrast-text-muted)]`}
                  >
                    The reference drawer stays docked in its own column, so the
                    viewport remains clear for orbit and zoom.
                  </div>
                )}
              </div>

              <div className={contrastSectionClass}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className={contrastLabelClass}>Notes</p>
                  <Button
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${contrastGhostButtonClass}`}
                    onClick={() => setIsNotesOpen((current) => !current)}
                  >
                    {isNotesOpen ? "Hide" : "Open"}
                  </Button>
                </div>
                {isNotesOpen ? (
                  <TextArea
                    value={project.notes}
                    onChange={(event) =>
                      updateNotes(project.id, event.currentTarget.value)
                    }
                    rows={5}
                    placeholder="Notas del proyecto"
                  />
                ) : (
                  <p className={contrastSubtleClass}>
                    Project notes stay alongside the references instead of
                    floating above the model.
                  </p>
                )}
              </div>
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <section className="relative min-w-0 flex-1 border-r border-[var(--border)] bg-[var(--shell-viewport)]">
                <ProjectViewport
                  glbPath={project.model?.glbPath}
                  glbVersion={project.model?.generatedAt}
                  isGenerating={isGenerating}
                  generationStage={generationStage}
                  showUtilityButtons={false}
                  showChrome={false}
                />
                <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div>
                      <h1 className="truncate text-[22px] font-medium tracking-[0.01em] text-[var(--text)]">
                        {project.name}
                      </h1>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {project.model?.glbPath
                          ? filenameFromPath(project.model.glbPath)
                          : "No model generated yet"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={viewportMetaClass}>Preset {preset}</span>
                      <span className={viewportMetaClass}>
                        {selectedImages.length} references
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${workspaceBadgeClass}`}
                    >
                      {workspaceStatus === "ready"
                        ? "Ready"
                        : workspaceStatus === "generating"
                          ? "Generating"
                          : workspaceStatus === "error"
                            ? "Error"
                            : "Idle"}
                    </span>
                    {generationDevice ? (
                      <span className={viewportMetaClass}>
                        {generationDevice.device.toUpperCase()}{" "}
                        {generationDevice.name}
                      </span>
                    ) : null}
                  </div>
                </div>
                {!isEngineReady ? (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-end">
                    <div className="rounded-full border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2 text-[11px] text-[var(--danger)] shadow-[var(--shadow)]">
                      Engine offline - Restart in AI panel.
                    </div>
                  </div>
                ) : null}
              </section>

              <RightPanel
                eyebrow="Inspector"
                title="Workspace controls"
                subtitle={comfyStatus?.url ?? "AI engine"}
                tabs={INSPECTOR_TABS}
                activeTab={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as InspectorTab)}
                tone="contrast"
                onWheelCapture={stopPanelWheel}
                headerSlot={
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${engineBadgeClass}`}
                  >
                    {engineBadgeLabel}
                  </span>
                }
              >
                {activeTab === "model" ? (
                  <div className="space-y-4">
                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Model summary</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className={contrastMetaClass}>
                          Images {selectedImages.length}
                        </div>
                        <div className={contrastMetaClass}>
                          Tier {reconstructionTier}
                        </div>
                        <div className={contrastMetaClass}>Mode auto</div>
                        <div className={contrastMetaClass}>
                          Multiview {multiviewEnabled ? "on" : "off"}
                        </div>
                      </div>
                    </div>

                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Asset path</p>
                      <p className="mt-3 break-all text-[12px] leading-5 text-[var(--shell-contrast-text-muted)]">
                        {project.model?.glbPath ??
                          "No generated model attached yet."}
                      </p>
                    </div>
                  </div>
                ) : null}

                {activeTab === "material" ? (
                  <div className="space-y-4">
                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Material pipeline</p>
                      <p className="mt-3 text-[13px] leading-6 text-[var(--shell-contrast-text)]">
                        Material slots stay intact here so the texture pass can
                        continue without replacing the loaded GLB.
                      </p>
                    </div>
                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Current state</p>
                      <p className="mt-3 text-[12px] leading-5 text-[var(--shell-contrast-text-muted)]">
                        Use the model tab to verify geometry output, then
                        continue with texture and mapping work in the existing
                        pipeline.
                      </p>
                    </div>
                  </div>
                ) : null}

                {activeTab === "light" ? (
                  <div className="space-y-4">
                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Viewport lighting</p>
                      <p className={contrastBodyClass}>
                        The light-mode ground, grid and shadow balance were
                        tuned to keep the model as the brightest element while
                        preserving depth.
                      </p>
                    </div>
                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Navigation</p>
                      <p className={contrastSubtleClass}>
                        The drawer and inspector remain in dedicated columns, so
                        wheel and scroll interactions stay away from the orbit
                        surface.
                      </p>
                    </div>
                  </div>
                ) : null}

                {activeTab === "ai" ? (
                  <div className="space-y-4">
                    {!isEngineReady ? (
                      <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-bg)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
                              Engine status
                            </p>
                            <p className="mt-2 text-sm font-medium text-[var(--shell-contrast-text)]">
                              AI engine stopped
                            </p>
                            <p className="mt-2 text-[12px] leading-5 text-[var(--shell-contrast-text-muted)]">
                              {engineMessage}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            className={`h-9 px-4 text-xs ${contrastButtonClass}`}
                            onClick={() => void restartEngine()}
                            disabled={isRestartingEngine}
                          >
                            {isRestartingEngine
                              ? "Restarting..."
                              : "Restart Engine"}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Generation controls</p>
                      <div className="mt-4 grid gap-3">
                        <Button
                          variant="secondary"
                          className={contrastButtonClass}
                          onClick={() => void handleSelectImages()}
                          disabled={isGenerating}
                        >
                          Agregar imagenes
                        </Button>
                        <Button
                          variant="secondary"
                          className={contrastButtonClass}
                          onClick={() => void handleOpenOutputFolder()}
                          disabled={!project.model?.glbPath}
                        >
                          Abrir salida
                        </Button>
                        <select
                          value={preset}
                          onChange={(event) =>
                            setPreset(
                              event.currentTarget.value as GenerationPreset,
                            )
                          }
                          className={contrastSelectClass}
                          disabled={isGenerating}
                        >
                          <option value="fast">Fast</option>
                          <option value="balanced">Balanced</option>
                          <option value="quality">Quality</option>
                        </select>
                        <select
                          value={settings.autoGenerationProfile}
                          onChange={(event) =>
                            setAutoGenerationProfile(
                              event.currentTarget.value as AutoProfile,
                            )
                          }
                          className={contrastSelectClass}
                          disabled={isGenerating}
                        >
                          <option value="auto">AUTO (recomendado)</option>
                          <option value="hard_surface">HARD-SURFACE</option>
                          <option value="organic">ORGANICO</option>
                        </select>
                        <select
                          value={reconstructionTier}
                          onChange={(event) => {
                            const nextValue = event.currentTarget
                              .value as ReconstructionTier;
                            setReconstructionTier(nextValue);
                            if (!hasStoredMultiviewPreferenceRef.current) {
                              setMultiviewEnabled(nextValue === "final");
                            }
                            try {
                              window.localStorage.setItem(
                                RECONSTRUCTION_TIER_KEY,
                                nextValue,
                              );
                            } catch {
                              // No-op by design.
                            }
                          }}
                          className={contrastSelectClass}
                          disabled={isGenerating}
                        >
                          <option value="preview">Preview (rapido)</option>
                          <option value="final">Final (HQ)</option>
                        </select>
                        <label className={contrastToggleClass}>
                          <input
                            type="checkbox"
                            checked={multiviewEnabled}
                            onChange={(event) => {
                              const nextValue = event.currentTarget.checked;
                              setMultiviewEnabled(nextValue);
                              hasStoredMultiviewPreferenceRef.current = true;
                              try {
                                window.localStorage.setItem(
                                  MULTIVIEW_ENABLED_KEY,
                                  String(nextValue),
                                );
                              } catch {
                                // No-op by design.
                              }
                            }}
                            disabled={isGenerating}
                          />
                          Multiview (Local)
                        </label>
                        <select
                          value={multiviewPreset}
                          onChange={(event) =>
                            setMultiviewPreset(
                              event.currentTarget.value as MultiviewPreset,
                            )
                          }
                          className={contrastSelectClass}
                          disabled={isGenerating || !multiviewEnabled}
                        >
                          <option value="hard_surface">HardSurface</option>
                          <option value="balanced">Balanced</option>
                          <option value="organic">Organic</option>
                        </select>
                        {multiviewPreset === "hard_surface" ? (
                          <select
                            value={multiviewHardSurfaceQuality}
                            onChange={(event) => {
                              const nextValue = event.currentTarget
                                .value as MultiviewHardSurfaceQuality;
                              setMultiviewHardSurfaceQuality(nextValue);
                              try {
                                window.localStorage.setItem(
                                  MULTIVIEW_HARD_SURFACE_QUALITY_KEY,
                                  nextValue,
                                );
                              } catch {
                                // No-op by design.
                              }
                            }}
                            className={contrastSelectClass}
                            disabled={isGenerating || !multiviewEnabled}
                          >
                            <option value="fast">Fast</option>
                            <option value="balanced">Balanced</option>
                            <option value="pro">Pro</option>
                          </select>
                        ) : null}
                      </div>
                    </div>

                    <div className={contrastSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={contrastLabelClass}>Engine details</p>
                          <p className="mt-2 text-[12px] leading-5 text-[var(--shell-contrast-text-muted)]">
                            {engineMessage}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          className={`h-8 px-3 text-xs ${contrastGhostButtonClass}`}
                          onClick={() =>
                            setShowEngineLogs((current) => !current)
                          }
                        >
                          {showEngineLogs ? "Hide logs" : "Show logs"}
                        </Button>
                      </div>
                      {showEngineLogs ? (
                        <div className="mt-4 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-tag)] p-3">
                          {engineLogs.length > 0 ? (
                            engineLogs.map((line, index) => (
                              <p
                                key={`${index}-${line}`}
                                className="font-mono text-[11px] leading-5 text-[var(--shell-contrast-text-muted)]"
                              >
                                {line}
                              </p>
                            ))
                          ) : (
                            <p className="text-xs text-[var(--shell-contrast-text-muted)]">
                              No logs available.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {activeTab === "result" ? (
                  <div className="space-y-4">
                    <div className={contrastSectionClass}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={contrastMetaClass}>
                          {generationStage}
                        </span>
                        <span className={contrastMetaClass}>
                          Progress {generationPercent}%
                        </span>
                        <span className={contrastMetaClass}>
                          Profile{" "}
                          {formatAutoProfileLabel(
                            settings.autoGenerationProfile,
                          )}
                        </span>
                      </div>
                      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--shell-contrast-tag)]">
                        <div
                          className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-150 ease-out"
                          style={{ width: `${generationPercent}%` }}
                        />
                      </div>
                      <p className="mt-4 text-[13px] leading-6 text-[var(--shell-contrast-text)]">
                        {generationMessage}
                      </p>
                    </div>

                    <div className={contrastSectionClass}>
                      <p className={contrastLabelClass}>Run metadata</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className={contrastMetaClass}>Preset {preset}</div>
                        <div className={contrastMetaClass}>
                          Engine{" "}
                          {autoUsedEngine
                            ? formatAutoEngineLabel(autoUsedEngine)
                            : "pending"}
                        </div>
                        <div className={contrastMetaClass}>
                          Auto{" "}
                          {autoUsedPreset
                            ? formatAutoPresetLabel(autoUsedPreset)
                            : "n/a"}
                        </div>
                        <div className={contrastMetaClass}>
                          {project.model?.glbPath
                            ? "GLB ready"
                            : "Awaiting GLB"}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className={contrastButtonClass}
                          onClick={() => void handleOpenOutputFolder()}
                          disabled={!project.model?.glbPath}
                        >
                          Abrir salida
                        </Button>
                        <Button
                          variant="ghost"
                          className={contrastGhostButtonClass}
                          onClick={() => void handleOpenGenerationLog()}
                          disabled={!generationLogPath}
                        >
                          Abrir log
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </RightPanel>
            </div>

            <BottomToolbar
              tone="contrast"
              progress={isGenerating ? generationPercent : null}
              left={
                <div
                  className={`${bottomZoneClass} ${isGenerating ? "opacity-45" : ""}`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-contrast-text-muted)]">
                    Transform
                  </span>
                  <Button
                    variant="ghost"
                    className={`h-9 px-3 text-xs ${contrastGhostButtonClass}`}
                    disabled={isGenerating}
                    onClick={() => setActiveTab("model")}
                  >
                    Model
                  </Button>
                  <Button
                    variant="ghost"
                    className={`h-9 px-3 text-xs ${contrastGhostButtonClass}`}
                    disabled={isGenerating}
                    onClick={() => setActiveTab("light")}
                  >
                    Light
                  </Button>
                  <Button
                    variant="ghost"
                    className={`h-9 px-3 text-xs ${contrastGhostButtonClass}`}
                    disabled={isGenerating}
                    onClick={() => setActiveTab("material")}
                  >
                    Material
                  </Button>
                </div>
              }
              center={
                <div className={bottomZoneClass}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-contrast-text-muted)]">
                    Tools
                  </span>
                  <select
                    value={toolShortcut}
                    onChange={(event) =>
                      void handleToolShortcut(event.currentTarget.value)
                    }
                    className={`min-w-40 ${contrastSelectClass}`}
                  >
                    <option value="tools">Workspace tools</option>
                    <option value="references">
                      {isReferenceDrawerOpen
                        ? "Hide references"
                        : "Show references"}
                    </option>
                    <option value="notes">Open notes</option>
                    <option value="result">Open result tab</option>
                    <option value="output">Open output folder</option>
                  </select>
                </div>
              }
              right={
                isGenerating ? (
                  <div className={`${bottomZoneClass} justify-end`}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--warning)]">
                      Generating
                    </span>
                    <div className="w-52">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--shell-contrast-tag)]">
                        <div
                          className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-150 ease-out"
                          style={{ width: `${generationPercent}%` }}
                        />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[var(--shell-contrast-text-muted)]">
                        {generationMessage}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className={`h-9 px-3 text-xs ${contrastGhostButtonClass}`}
                      onClick={() => void handleCancelGeneration()}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className={`${bottomZoneClass} justify-end`}>
                    {!isEngineReady ? (
                      <span className="text-[11px] text-[var(--shell-contrast-text-muted)]">
                        Engine offline - Restart
                      </span>
                    ) : null}
                    <Button
                      variant="secondary"
                      className={contrastButtonClass}
                      onClick={() => void handleSelectImages()}
                    >
                      Agregar imagenes
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void handleRunGeneration()}
                      disabled={selectedImages.length === 0 || !isEngineReady}
                      title={
                        !isEngineReady ? "Engine offline - Restart" : undefined
                      }
                    >
                      {workspaceStatus === "idle"
                        ? "Generar 3D"
                        : "Regenerar 3D"}
                    </Button>
                    <Button
                      variant="secondary"
                      className={contrastButtonClass}
                      onClick={() => void handleRunGenerationSkp()}
                      disabled={
                        selectedImages.length < 1 ||
                        selectedImages.length > 4 ||
                        !isEngineReady
                      }
                      title={
                        !isEngineReady ? "Engine offline - Restart" : undefined
                      }
                    >
                      Generar SKP
                    </Button>
                    {!isEngineReady ? (
                      <Button
                        variant="secondary"
                        className={contrastButtonClass}
                        onClick={() => void restartEngine()}
                        disabled={isRestartingEngine}
                      >
                        {isRestartingEngine
                          ? "Restarting..."
                          : "Restart Engine"}
                      </Button>
                    ) : null}
                  </div>
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
