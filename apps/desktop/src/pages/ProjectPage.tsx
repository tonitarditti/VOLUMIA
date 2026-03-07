import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import type { GenerationPreset, ProjectModel } from "@/projects/types";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Badge, type BadgeTone } from "@/ui/primitives";
import { TopBar } from "@/ui/shell";
import {
  ModeSelector,
  ViewportHud,
  ViewportTools,
  WorkspaceInspector,
  workspaceModeDefinitions,
  type WorkspaceMode,
} from "@/ui/workspace";
import {
  ProjectViewport,
} from "@/three/ProjectViewport";
import {
  DEFAULT_COMFY_WORKFLOW_ID,
  useGenerationJobStore,
} from "@/services/comfyui";
import { useSettings } from "@/volumia/settings/context";

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
type WorkspaceStatus = "idle" | "generating" | "ready" | "error";

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
}

type DroppedDesktopFile = File & { path?: string };

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;

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
  const navigate = useNavigate();
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
    updateNotes,
    updateProjectModel,
  } = useProjects();

  const project = useMemo(
    () => selectProjectById(state, projectId),
    [projectId, state],
  );
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [preset, setPreset] = useState<GenerationPreset>("balanced");
  const [generationStage, setGenerationStage] = useState("idle");
  const [generationPercent, setGenerationPercent] = useState(0);
  const [generationMessage, setGenerationMessage] = useState(
    "Selecciona imagenes para iniciar.",
  );
  const [isGenerating, setIsGenerating] = useState(false);
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
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<
    "inspector" | "references" | "notes"
  >("inspector");
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceMode>("references");
  const [viewportResetSignal, setViewportResetSignal] = useState(0);
  const [viewportFitSignal, setViewportFitSignal] = useState(0);
  const [viewportGridEnabled, setViewportGridEnabled] = useState(true);
  const [viewportShadowEnabled, setViewportShadowEnabled] = useState(true);
  const [viewportWireframeEnabled, setViewportWireframeEnabled] =
    useState(false);
  const [viewportScreenshotSignal, setViewportScreenshotSignal] = useState(0);
  const [isReferenceDropActive, setIsReferenceDropActive] = useState(false);
  const [comfyStatus, setComfyStatus] = useState<Awaited<
    ReturnType<typeof desktopApi.getComfyStatus>
  > | null>(null);
  const [engineMessage, setEngineMessage] = useState("Checking AI engine...");
  const [isRestartingEngine, setIsRestartingEngine] = useState(false);
  const [showEngineLogs, setShowEngineLogs] = useState(false);
  const projectModel = getProjectModel(project?.model);
  const currentProjectId = project?.id ?? "";
  const projectRef = useRef(project);
  const selectedImagesRef = useRef(selectedImages);
  const presetRef = useRef(preset);
  const updateProjectModelRef = useRef(updateProjectModel);
  const pendingGenerationRef = useRef<PendingGenerationRun | null>(null);
  const handledGenerationStateRef = useRef("");
  const workspaceStatusRef = useRef<WorkspaceStatus>("idle");
  const projectModelRef = useRef(projectModel);
  const reconstructionTierRef = useRef(reconstructionTier);
  const autoGenerationProfileRef = useRef(settings.autoGenerationProfile);

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
    projectModelRef.current = projectModel;
  }, [projectModel]);

  useEffect(() => {
    reconstructionTierRef.current = reconstructionTier;
  }, [reconstructionTier]);

  useEffect(() => {
    autoGenerationProfileRef.current = settings.autoGenerationProfile;
  }, [settings.autoGenerationProfile]);

  useEffect(() => {
    if (!project?.id) {
      return;
    }

    setSelectedImages(projectModelRef.current.sourceImages);
    setPreset(projectModelRef.current.preset ?? "balanced");
    setGenerationStage("idle");
    setGenerationPercent(0);
    setGenerationMessage("Selecciona imagenes para iniciar.");
    setIsGenerating(false);
    setAutoUsedEngine(null);
    setAutoUsedPreset(null);
    setGenerationLogPath("");
    const storedMultiview = resolveStoredMultiviewEnabled(
      reconstructionTierRef.current,
    );
    hasStoredMultiviewPreferenceRef.current =
      storedMultiview.hasStoredPreference;
    setMultiviewEnabled(storedMultiview.enabled);
    setMultiviewPreset(
      resolveDefaultMultiviewPreset(autoGenerationProfileRef.current),
    );
    setImagePreviews({});
    pendingGenerationRef.current = null;
    handledGenerationStateRef.current = "";
    setInspectorTab("inspector");
    setWorkspaceMode("references");
    setViewportResetSignal(0);
    setViewportFitSignal(0);
    setViewportGridEnabled(true);
    setViewportShadowEnabled(true);
    setViewportWireframeEnabled(false);
    setViewportScreenshotSignal(0);
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
      setWorkspaceMode("ai");
    } else if (workspaceStatus === "ready") {
      setWorkspaceMode("result");
    } else if (workspaceStatus === "error") {
      setWorkspaceMode("ai");
    }

    workspaceStatusRef.current = workspaceStatus;
  }, [workspaceStatus]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const key = event.key;
      if (!["1", "2", "3", "4", "5", "6"].includes(key)) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const nextMode = workspaceModeDefinitions.find(
        (mode) => mode.shortcut === key,
      )?.id;
      if (nextMode) {
        setWorkspaceMode(nextMode);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

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
  const engineBadgeTone: BadgeTone =
    engineState === "ready"
      ? "success"
      : engineState === "error"
        ? "danger"
        : "warning";
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

  const applySelectedImages = (nextImages: string[]) => {
    const limited = nextImages
      .filter((imagePath, index, array) => {
        return (
          IMAGE_FILE_PATTERN.test(imagePath) &&
          array.indexOf(imagePath) === index
        );
      })
      .slice(0, 4);

    setSelectedImages(limited);
    updateProjectModel(project.id, {
      ...projectModel,
      sourceImages: limited,
    });
    setGenerationMessage(
      limited.length > 0
        ? `${limited.length} image(s) attached.`
        : "Select images to start.",
    );
  };

  const handleSelectImages = async () => {
    if (!hasDesktopBridge()) {
      return;
    }

    const picked = await desktopApi.selectGenerationImages();
    if (picked.length === 0) {
      return;
    }

    console.log("[gen][renderer] selected:", picked.length, picked[0] ?? "");
    applySelectedImages(picked);
  };

  const handleReferenceDragOver = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isReferenceDropActive) {
      setIsReferenceDropActive(true);
    }
  };

  const handleReferenceDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setIsReferenceDropActive(false);
  };

  const handleReferenceDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsReferenceDropActive(false);

    const dropped = Array.from(event.dataTransfer.files)
      .map((file) => (file as DroppedDesktopFile).path)
      .filter((value): value is string => Boolean(value));

    if (dropped.length === 0) {
      return;
    }

    applySelectedImages(dropped);
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
      setWorkspaceMode("ai");
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
      setWorkspaceMode("ai");
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

  const handleReconstructionTierChange = (nextValue: ReconstructionTier) => {
    setReconstructionTier(nextValue);
    if (!hasStoredMultiviewPreferenceRef.current) {
      setMultiviewEnabled(nextValue === "final");
    }
    try {
      window.localStorage.setItem(RECONSTRUCTION_TIER_KEY, nextValue);
    } catch {
      // No-op by design.
    }
  };

  const handleMultiviewEnabledChange = (nextValue: boolean) => {
    setMultiviewEnabled(nextValue);
    hasStoredMultiviewPreferenceRef.current = true;
    try {
      window.localStorage.setItem(MULTIVIEW_ENABLED_KEY, String(nextValue));
    } catch {
      // No-op by design.
    }
  };

  const handleMultiviewHardSurfaceQualityChange = (
    nextValue: MultiviewHardSurfaceQuality,
  ) => {
    setMultiviewHardSurfaceQuality(nextValue);
    try {
      window.localStorage.setItem(MULTIVIEW_HARD_SURFACE_QUALITY_KEY, nextValue);
    } catch {
      // No-op by design.
    }
  };

  const handleViewportReset = () => {
    setViewportResetSignal((current) => current + 1);
  };

  const handleViewportFit = () => {
    setViewportFitSignal((current) => current + 1);
  };

  const handleViewportToggleGrid = () => {
    setViewportGridEnabled((current) => !current);
  };

  const handleViewportToggleShadows = () => {
    setViewportShadowEnabled((current) => !current);
  };

  const handleViewportToggleWireframe = () => {
    setViewportWireframeEnabled((current) => !current);
  };

  const handleViewportScreenshot = () => {
    setViewportScreenshotSignal((current) => current + 1);
  };

  const drawerLabelClass =
    "text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]";
  const drawerMetaClass =
    "rounded-full border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-1.5 text-[11px] text-[var(--workspace-text-muted)]";
  const drawerCardClass =
    "rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] p-4";
  const drawerDropClass = isReferenceDropActive
    ? "border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)]"
    : "border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)]";
  const isReferenceDrawerOpen = workspaceMode === "references";
  const hasModel = Boolean(project.model?.glbPath);
  const autoProfileLabel = formatAutoProfileLabel(
    settings.autoGenerationProfile,
  );
  const autoUsedEngineLabel = autoUsedEngine
    ? formatAutoEngineLabel(autoUsedEngine)
    : "pending";
  const autoUsedPresetLabel = autoUsedPreset
    ? formatAutoPresetLabel(autoUsedPreset)
    : "n/a";
  const stopPanelWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--app-bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          eyebrow="Studio"
          title="Workspace"
          centerSlot={
            <div className="no-drag min-w-0 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Project
              </p>
              <h1 className="truncate text-[17px] font-medium tracking-[0.01em] text-[var(--text)]">
                {project.name}
              </h1>
            </div>
          }
          statusSlot={
            <Badge tone={engineBadgeTone} dot>
              ENGINE {engineBadgeLabel.toUpperCase()}
            </Badge>
          }
          rightSlot={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 text-[11px] text-[var(--muted-text)] transition-colors hover:border-[var(--panel-border-strong)] hover:bg-[var(--panel-elevated)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-3.5 w-3.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="10" cy="10" r="2.5" />
                  <path d="M10 2.75v2.1" />
                  <path d="M10 15.15v2.1" />
                  <path d="m4.86 4.86 1.48 1.48" />
                  <path d="m13.66 13.66 1.48 1.48" />
                  <path d="M2.75 10h2.1" />
                  <path d="M15.15 10h2.1" />
                  <path d="m4.86 15.14 1.48-1.48" />
                  <path d="m13.66 6.34 1.48-1.48" />
                </svg>
                <span>Settings</span>
              </button>
            </div>
          }
        />
        <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--panel-bg)]">
          <ModeSelector
            activeMode={workspaceMode}
            onModeChange={setWorkspaceMode}
            workflowStatus={workspaceStatus}
            selectedImagesCount={selectedImages.length}
            hasModel={hasModel}
            onWheelCapture={stopPanelWheel}
          />

          {isReferenceDrawerOpen ? (
            <aside
              className="flex min-h-0 w-[clamp(220px,20vw,288px)] shrink-0 flex-col gap-4 border-r border-[var(--workspace-divider)] bg-[var(--workspace-rail-bg)] px-4 py-4 text-[var(--workspace-text)] max-[1300px]:w-[220px]"
              onWheelCapture={stopPanelWheel}
              onDragOver={handleReferenceDragOver}
              onDragLeave={handleReferenceDragLeave}
              onDrop={handleReferenceDrop}
            >
              <div className={drawerCardClass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={drawerLabelClass}>Reference pack</p>
                    <p className="mt-1 text-[15px] font-medium text-[var(--workspace-text)]">
                      Input imagery
                    </p>
                  </div>
                  <span className={drawerMetaClass}>{selectedImages.length} / 4</span>
                </div>
                <div className="mt-3">
                  <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
                    Curate only the images that really define silhouette, material or proportion.
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={drawerMetaClass}>
                      {selectedImages[0] ? "Primary locked" : "No primary yet"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSelectImages()}
                    className="inline-flex h-9 items-center rounded-full border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-4 text-[11px] font-medium text-[var(--accent-contrast)] transition-colors hover:border-[var(--accent-primary-hover)] hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    + Add images
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <div
                  className={`${drawerCardClass} ${drawerDropClass} transition-colors`}
                >
                  <p className={drawerLabelClass}>Drop zone</p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
                    Drag images here or use Add images. Keep the pack compact and intentional so the next run has a clear visual direction.
                  </p>
                </div>

                {selectedImages.length > 0 ? (
                  selectedImages.map((imagePath, index) => (
                    <figure
                      key={imagePath}
                      className={`${drawerCardClass} overflow-hidden`}
                    >
                      <div className="relative">
                        {imagePreviews[imagePath] ? (
                          <img
                            src={imagePreviews[imagePath]}
                            alt={filenameFromPath(imagePath)}
                            className="h-32 w-full rounded-[14px] object-cover"
                          />
                        ) : (
                          <div className="h-32 w-full rounded-[14px] bg-[var(--shell-contrast-tag)]" />
                        )}
                        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                          <span className="rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(0,0,0,0.26)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
                            {index === 0 ? "Primary" : `Ref ${index + 1}`}
                          </span>
                        </div>
                      </div>
                      <figcaption className="mt-2 flex items-center justify-between gap-3">
                        <span className="truncate text-[11px] text-[var(--workspace-text-muted)]">
                          {filenameFromPath(imagePath)}
                        </span>
                      </figcaption>
                    </figure>
                  ))
                ) : (
                  <div className={drawerCardClass}>
                    <p className="text-[13px] font-medium text-[var(--workspace-text)]">
                      No references attached yet
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
                      Start with one strong image, then add only the references that truly reinforce silhouette, material or proportion.
                    </p>
                  </div>
                )}
              </div>
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <section className="relative min-w-0 flex-1 border-r border-[var(--workspace-divider)] bg-[var(--shell-viewport)]">
                <ViewportHud
                  mode={workspaceMode}
                  hasModel={hasModel}
                />

                <ProjectViewport
                  glbPath={project.model?.glbPath}
                  glbVersion={project.model?.generatedAt}
                  isGenerating={isGenerating}
                  generationStage={generationStage}
                  showUtilityButtons={false}
                  showChrome={false}
                  resetSignal={viewportResetSignal}
                  fitSignal={viewportFitSignal}
                  gridEnabled={viewportGridEnabled}
                  shadowEnabled={viewportShadowEnabled}
                  wireframe={viewportWireframeEnabled}
                  screenshotSignal={viewportScreenshotSignal}
                />
              </section>

              <WorkspaceInspector
                mode={workspaceMode}
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                project={project}
                selectedImages={selectedImages}
                reconstructionTier={reconstructionTier}
                multiviewEnabled={multiviewEnabled}
                studioProfile={settings.studioProfile}
                preset={preset}
                isNotesOpen={isNotesOpen}
                isGenerating={isGenerating}
                generationStage={generationStage}
                generationPercent={generationPercent}
                generationMessage={generationMessage}
                engineMessage={engineMessage}
                isEngineReady={isEngineReady}
                isRestartingEngine={isRestartingEngine}
                showEngineLogs={showEngineLogs}
                engineLogs={engineLogs}
                multiviewPreset={multiviewPreset}
                multiviewHardSurfaceQuality={multiviewHardSurfaceQuality}
                autoGenerationProfile={settings.autoGenerationProfile}
                autoProfileLabel={autoProfileLabel}
                autoUsedEngineLabel={autoUsedEngineLabel}
                autoUsedPresetLabel={autoUsedPresetLabel}
                generationLogPath={generationLogPath}
                onToggleNotes={() => setIsNotesOpen((current) => !current)}
                onUpdateNotes={(value) => updateNotes(project.id, value)}
                onOpenOutputFolder={handleOpenOutputFolder}
                onRestartEngine={restartEngine}
                onToggleEngineLogs={() =>
                  setShowEngineLogs((current) => !current)
                }
                onOpenGenerationLog={handleOpenGenerationLog}
                onGenerateSkp={handleRunGenerationSkp}
                onPresetChange={setPreset}
                onAutoGenerationProfileChange={setAutoGenerationProfile}
                onReconstructionTierChange={handleReconstructionTierChange}
                onMultiviewEnabledChange={handleMultiviewEnabledChange}
                onMultiviewPresetChange={setMultiviewPreset}
                onMultiviewHardSurfaceQualityChange={
                  handleMultiviewHardSurfaceQualityChange
                }
                onWheelCapture={stopPanelWheel}
              />
            </div>

            <ViewportTools
              activeMode={workspaceMode}
              isGenerating={isGenerating}
              generationPercent={generationPercent}
              generationMessage={generationMessage}
              selectedImages={selectedImages}
              hasModel={hasModel}
              isEngineReady={isEngineReady}
              gridEnabled={viewportGridEnabled}
              shadowEnabled={viewportShadowEnabled}
              wireframeEnabled={viewportWireframeEnabled}
              onGenerate={handleRunGeneration}
              onCancelGeneration={handleCancelGeneration}
              onResetView={handleViewportReset}
              onFrameModel={handleViewportFit}
              onToggleGrid={handleViewportToggleGrid}
              onToggleShadows={handleViewportToggleShadows}
              onToggleWireframe={handleViewportToggleWireframe}
              onCaptureViewport={handleViewportScreenshot}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
