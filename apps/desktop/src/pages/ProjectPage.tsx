import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type AutoEngine = "instantmesh" | "triposr" | "arch" | "blockout";
type AutoPreset = "hard_surface" | "organic";
type AutoProfile = "auto" | "hard_surface" | "organic";
type MultiviewPreset = "hard_surface" | "balanced" | "organic";
type MultiviewHardSurfaceQuality = "fast" | "balanced" | "pro";
type ReconstructionTier = "preview" | "final";
type InspectorTab = "model" | "material" | "light" | "ai" | "result";
type WorkspaceStatus = "idle" | "generating" | "result";

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "model", label: "MODEL" },
  { id: "material", label: "MATERIAL" },
  { id: "light", label: "LIGHT" },
  { id: "ai", label: "AI" },
  { id: "result", label: "RESULT" },
];

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

function resolveDefaultMultiviewPreset(profile: AutoProfile | undefined): MultiviewPreset {
  if (profile === "hard_surface") {
    return "hard_surface";
  }
  if (profile === "organic") {
    return "organic";
  }
  return "hard_surface";
}

const MULTIVIEW_ENABLED_KEY = "volumia.multiview.enabled";
const MULTIVIEW_HARD_SURFACE_QUALITY_KEY = "volumia.multiview.hard_surface.quality";
const RECONSTRUCTION_TIER_KEY = "volumia.reconstruction.tier";

function isMultiviewHardSurfaceQuality(value: string): value is MultiviewHardSurfaceQuality {
  return value === "fast" || value === "balanced" || value === "pro";
}

function resolveStoredMultiviewHardSurfaceQuality(): MultiviewHardSurfaceQuality {
  if (typeof window === "undefined") {
    return "balanced";
  }
  try {
    const stored = window.localStorage.getItem(MULTIVIEW_HARD_SURFACE_QUALITY_KEY);
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

function resolveStoredMultiviewEnabled(tier: ReconstructionTier): { enabled: boolean; hasStoredPreference: boolean } {
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
  const initialGenerationUiState = useMemo(() => resolveInitialGenerationUiState(), []);
  const hasStoredMultiviewPreferenceRef = useRef(initialGenerationUiState.hasStoredMultiviewPreference);
  const { t, language } = useT();
  const { settings, setAutoGenerationProfile } = useSettings();
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
  const [autoUsedPreset, setAutoUsedPreset] = useState<AutoPreset | null>(null);
  const [generationLogPath, setGenerationLogPath] = useState("");
  const [multiviewEnabled, setMultiviewEnabled] = useState(initialGenerationUiState.multiviewEnabled);
  const [multiviewPreset, setMultiviewPreset] = useState<MultiviewPreset>(resolveDefaultMultiviewPreset(settings.autoGenerationProfile));
  const [multiviewHardSurfaceQuality, setMultiviewHardSurfaceQuality] =
    useState<MultiviewHardSurfaceQuality>(resolveStoredMultiviewHardSurfaceQuality);
  const [reconstructionTier, setReconstructionTier] = useState<ReconstructionTier>(initialGenerationUiState.reconstructionTier);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("ai");
  const [isReferenceDrawerOpen, setIsReferenceDrawerOpen] = useState(true);
  const historyBottomRef = useRef<HTMLDivElement | null>(null);
  const projectModel = getProjectModel(project?.model);
  const projectRef = useRef(project);
  const selectedImagesRef = useRef(selectedImages);
  const presetRef = useRef(preset);
  const updateProjectModelRef = useRef(updateProjectModel);
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
    setAutoUsedPreset(null);
    setGenerationLogPath("");
    const storedMultiview = resolveStoredMultiviewEnabled(reconstructionTier);
    hasStoredMultiviewPreferenceRef.current = storedMultiview.hasStoredPreference;
    setMultiviewEnabled(storedMultiview.enabled);
    setMultiviewPreset(resolveDefaultMultiviewPreset(settings.autoGenerationProfile));
    setImagePreviews({});
    setActiveTab(projectModel.glbPath ? "result" : "ai");
    setIsReferenceDrawerOpen(true);
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

  const handleGenerationProgress = useCallback((payload: {
    projectId: string;
    stage: string;
    percent: number;
    message: string;
    device?: "cuda" | "cpu";
  }) => {
    const currentProject = projectRef.current;
    if (!currentProject || payload.projectId !== currentProject.id) {
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
      setAutoUsedPreset(null);
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
  }, []);

  const handleGenerationDone = useCallback((payload: {
    projectId: string;
    pipeline?: "depth_glb" | "gen_skp";
    glbPath?: string;
    skpPath?: string;
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

    if (payload.pipeline === "gen_skp") {
      setIsGenerating(false);
      setGenerationStage("done");
      setGenerationPercent(100);
      setGenerationMessage(payload.skpPath ? `SKP generado: ${payload.skpPath}` : "SKP generado correctamente.");
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
      payload.autoUsed === "blockout" && payload.autoPreset === "hard_surface"
        ? "Modelo 3D generado correctamente. AUTO used: BLOCKOUT (hard-surface fallback)"
        : payload.autoUsed
          ? `Modelo 3D generado correctamente. AUTO used: ${formatAutoEngineLabel(payload.autoUsed)}${payload.autoPreset ? ` / ${formatAutoPresetLabel(payload.autoPreset)}` : ""}`
          : "Modelo 3D generado correctamente.";
    const warningSuffix =
      Array.isArray(payload.warnings) && payload.warnings.length > 0
        ? ` Aviso: ${payload.warnings.join(" | ")}`
        : "";
    setGenerationMessage(`${baseMessage}${warningSuffix}`);
    setGenerationDevice(payload.device ?? null);
    setAutoUsedEngine(payload.autoUsed ?? null);
    setAutoUsedPreset(payload.autoPreset ?? null);
    setGenerationLogPath("");
  }, []);

  const handleGenerationError = useCallback((payload: {
    projectId: string;
    message: string;
    logPath?: string;
  }) => {
    const currentProject = projectRef.current;
    if (!currentProject || payload.projectId !== currentProject.id) {
      return;
    }

    setIsGenerating(false);
    setGenerationStage("error");
    setGenerationMessage(payload.logPath ? `${payload.message} Ver log: ${payload.logPath}` : payload.message);
    setAutoUsedEngine(null);
    setAutoUsedPreset(null);
    setGenerationLogPath(payload.logPath ?? "");
  }, []);

  const handleGenerationProgressRef = useRef(handleGenerationProgress);
  const handleGenerationDoneRef = useRef(handleGenerationDone);
  const handleGenerationErrorRef = useRef(handleGenerationError);

  useEffect(() => {
    handleGenerationProgressRef.current = handleGenerationProgress;
  }, [handleGenerationProgress]);

  useEffect(() => {
    handleGenerationDoneRef.current = handleGenerationDone;
  }, [handleGenerationDone]);

  useEffect(() => {
    handleGenerationErrorRef.current = handleGenerationError;
  }, [handleGenerationError]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }

    const cleanupProgress = desktopApi.onGenerationProgress((payload) => {
      handleGenerationProgressRef.current(payload);
    });
    const cleanupDone = desktopApi.onGenerationDone((payload) => {
      handleGenerationDoneRef.current(payload);
    });
    const cleanupError = desktopApi.onGenerationError((payload) => {
      handleGenerationErrorRef.current(payload);
    });

    return () => {
      cleanupProgress();
      cleanupDone();
      cleanupError();
    };
  }, []);

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
      autoProfile: settings.autoGenerationProfile,
      reconstructionTier,
      multiviewEnabled,
      multiviewPreset,
      ...(multiviewPreset === "hard_surface" ? { multiviewHardSurfaceQuality } : {}),
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
      reconstructionTier,
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

  const floatingPanelClass = settings.glassStyle
    ? "glass text-[var(--text)]"
    : `${getSurfaceClass(false, "panel")} text-[var(--text)]`;
  const panelSoftClass = getSurfaceClass(false, "soft");
  const selectClass = "pointer-events-auto border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]";

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1">
        <ProjectViewport
          glbPath={project.model?.glbPath}
          glbVersion={project.model?.generatedAt}
          isGenerating={isGenerating}
          generationStage={generationStage}
          showUtilityButtons={false}
          showChrome={false}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 min-w-0">
        <section className="pointer-events-none flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
          <div className={`pointer-events-auto shrink-0 self-start max-w-full rounded-2xl p-3 ${floatingPanelClass}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button className="pointer-events-auto" variant="secondary" onClick={() => void handleSelectImages()} disabled={isGenerating}>
                Agregar imagenes
              </Button>
              <Button
                className="pointer-events-auto"
                variant="secondary"
                onClick={() => void handleOpenOutputFolder()}
                disabled={!project.model?.glbPath}
              >
                Abrir salida
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={preset}
                onChange={(event) => setPreset(event.currentTarget.value as GenerationPreset)}
                className={`pointer-events-auto h-9 min-w-32 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                disabled={isGenerating}
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
              </select>

              <select
                value={settings.autoGenerationProfile}
                onChange={(event) => setAutoGenerationProfile(event.currentTarget.value as AutoProfile)}
                className={`pointer-events-auto h-9 min-w-48 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                disabled={isGenerating}
                aria-label="AUTO mode selector"
              >
                <option value="auto">AUTO (recomendado)</option>
                <option value="hard_surface">HARD-SURFACE</option>
                <option value="organic">ORGANICO</option>
              </select>

              <select
                value={reconstructionTier}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value as ReconstructionTier;
                  setReconstructionTier(nextValue);
                  if (!hasStoredMultiviewPreferenceRef.current) {
                    setMultiviewEnabled(nextValue === "final");
                  }
                  try {
                    window.localStorage.setItem(RECONSTRUCTION_TIER_KEY, nextValue);
                  } catch {
                    // No-op by design.
                  }
                }}
                className={`pointer-events-auto h-9 min-w-44 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                disabled={isGenerating}
                aria-label="Reconstruction tier selector"
              >
                <option value="preview">Preview (rapido)</option>
                <option value="final">Final (HQ)</option>
              </select>

              <label className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs text-[var(--text)]">
                <input
                  className="pointer-events-auto"
                  type="checkbox"
                  checked={multiviewEnabled}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.checked;
                    setMultiviewEnabled(nextValue);
                    hasStoredMultiviewPreferenceRef.current = true;
                    try {
                      window.localStorage.setItem(MULTIVIEW_ENABLED_KEY, String(nextValue));
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
                onChange={(event) => setMultiviewPreset(event.currentTarget.value as MultiviewPreset)}
                className={`pointer-events-auto h-9 min-w-44 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                disabled={isGenerating || !multiviewEnabled}
                aria-label="Multiview preset selector"
              >
                <option value="hard_surface">HardSurface</option>
                <option value="balanced">Balanced</option>
                <option value="organic">Organic</option>
              </select>

              {multiviewPreset === "hard_surface" ? (
                <select
                  value={multiviewHardSurfaceQuality}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value as MultiviewHardSurfaceQuality;
                    setMultiviewHardSurfaceQuality(nextValue);
                    try {
                      window.localStorage.setItem(MULTIVIEW_HARD_SURFACE_QUALITY_KEY, nextValue);
                    } catch {
                      // No-op by design.
                    }
                  }}
                  className={`pointer-events-auto h-9 min-w-36 appearance-none rounded-lg border px-3 text-sm outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[#8c7e6d]/50 ${selectClass}`}
                  disabled={isGenerating || !multiviewEnabled}
                  aria-label="HardSurface quality selector"
                >
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="pro">Pro</option>
                </select>
              ) : null}

              <Button className="pointer-events-auto" variant="primary" onClick={() => void handleRunGeneration()} disabled={selectedImages.length === 0 || isGenerating}>
                Generar 3D
              </Button>
              <Button
                className="pointer-events-auto"
                variant="primary"
                onClick={() => void handleRunGenerationSkp()}
                disabled={selectedImages.length < 1 || selectedImages.length > 4 || isGenerating}
              >
                Generar SKP
              </Button>
              <Button className="pointer-events-auto" variant="ghost" onClick={() => void handleCancelGeneration()} disabled={!isGenerating}>
                Cancelar
              </Button>
            </div>
          </div>
        </section>

        <aside className="pointer-events-auto min-h-0 w-[360px] max-w-[40vw] p-3">
          <div className={`flex h-full min-h-0 flex-col rounded-2xl p-3 ${floatingPanelClass}`}>
            {selectedImages.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {selectedImages.map((imagePath) => (
                  <figure
                    key={imagePath}
                    className={`flex items-center gap-2 overflow-hidden rounded-xl p-2 ${panelSoftClass}`}
                  >
                    {imagePreviews[imagePath] ? (
                      <img
                        src={imagePreviews[imagePath]}
                        alt={filenameFromPath(imagePath)}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded bg-[var(--surface-3)]" />
                    )}
                    <figcaption className="truncate text-[11px] text-[var(--text-muted)]">
                      {filenameFromPath(imagePath)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No hay imagenes seleccionadas.</p>
            )}

            <div className="mt-3 space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-150 ease-out"
                  style={{ width: `${generationPercent}%` }}
                />
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                {generationStage}: {generationMessage}
              </p>

              {generationStage === "error" && generationLogPath ? (
                <div className="pt-1">
                  <Button
                    className="pointer-events-auto"
                    variant="secondary"
                    onClick={() => void handleOpenGenerationLog()}
                  >
                    Abrir log
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

