import type { Project, GenerationPreset } from "@/projects/types";
import { Button } from "@/ui/primitives";
import type {
  AutoGenerationProfile,
  StudioProfile,
} from "@/volumia/settings/types";
import {
  EmptyState,
  Label,
  Section,
  SummaryGrid,
  Value,
} from "./InspectorCommon";
import type { WorkspaceMode } from "./modes";

type AutoProfile = "auto" | "hard_surface" | "organic";
type MultiviewPreset = "hard_surface" | "balanced" | "organic";
type MultiviewHardSurfaceQuality = "fast" | "balanced" | "pro";
type ReconstructionTier = "preview" | "final";

type ModePanelProps = {
  mode: WorkspaceMode;
  project: Project;
  selectedImages: string[];
  reconstructionTier: ReconstructionTier;
  multiviewEnabled: boolean;
  studioProfile: StudioProfile;
  preset: GenerationPreset;
  isGenerating: boolean;
  engineMessage: string;
  isEngineReady: boolean;
  isRestartingEngine: boolean;
  showEngineLogs: boolean;
  engineLogs: string[];
  multiviewPreset: MultiviewPreset;
  multiviewHardSurfaceQuality: MultiviewHardSurfaceQuality;
  autoGenerationProfile: AutoGenerationProfile;
  autoProfileLabel: string;
  onOpenOutputFolder: () => void | Promise<void>;
  onRestartEngine: () => void | Promise<void>;
  onToggleEngineLogs: () => void;
  onPresetChange: (preset: GenerationPreset) => void;
  onAutoGenerationProfileChange: (profile: AutoProfile) => void;
  onReconstructionTierChange: (tier: ReconstructionTier) => void;
  onMultiviewEnabledChange: (enabled: boolean) => void;
  onMultiviewPresetChange: (preset: MultiviewPreset) => void;
  onMultiviewHardSurfaceQualityChange: (
    quality: MultiviewHardSurfaceQuality,
  ) => void;
};

const contrastButtonClass =
  "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--accent)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]";
const contrastGhostButtonClass =
  "border-transparent bg-transparent text-[var(--workspace-text-muted)] hover:border-[var(--workspace-divider)] hover:bg-[var(--workspace-surface)] hover:text-[var(--workspace-text)]";
const contrastSelectClass =
  "pointer-events-auto h-10 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 text-sm text-[var(--workspace-text)] outline-none transition-colors hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]";
const contrastToggleClass =
  "inline-flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 text-xs text-[var(--workspace-text)]";

export function ModePanel({
  mode,
  project,
  selectedImages,
  reconstructionTier,
  multiviewEnabled,
  studioProfile,
  preset,
  isGenerating,
  engineMessage,
  isEngineReady,
  isRestartingEngine,
  showEngineLogs,
  engineLogs,
  multiviewPreset,
  multiviewHardSurfaceQuality,
  autoGenerationProfile,
  autoProfileLabel,
  onOpenOutputFolder,
  onRestartEngine,
  onToggleEngineLogs,
  onPresetChange,
  onAutoGenerationProfileChange,
  onReconstructionTierChange,
  onMultiviewEnabledChange,
  onMultiviewPresetChange,
  onMultiviewHardSurfaceQualityChange,
}: ModePanelProps) {
  const hasModel = Boolean(project.model?.glbPath);

  if (mode === "references") {
    return (
      <div className="space-y-6">
        <Section label="Preparation">
          <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            Use this mode to verify the input set before launching a new run.
            The add-images action lives in the left drawer to keep flow actions
            out of the viewport toolbar.
          </p>
        </Section>
        <Section label="Reference context">
          <SummaryGrid>
            <Label>Images</Label>
            <Value>{selectedImages.length}</Value>
            <Label>Notes</Label>
            <Value>{project.notes?.trim() ? "Stored" : "Empty"}</Value>
            <Label>Drawer</Label>
            <Value>Docked</Value>
          </SummaryGrid>
        </Section>
      </div>
    );
  }

  if (mode === "model") {
    return (
      <div className="space-y-6">
        <Section label="Model summary">
          <SummaryGrid>
            <Label>Images</Label>
            <Value>{selectedImages.length}</Value>
            <Label>Reconstruction tier</Label>
            <Value>{reconstructionTier}</Value>
            <Label>Profile</Label>
            <Value>{autoProfileLabel}</Value>
            <Label>Multiview</Label>
            <Value>{multiviewEnabled ? "Enabled" : "Disabled"}</Value>
          </SummaryGrid>
        </Section>

        <Section label="Asset path">
          {project.model?.glbPath ? (
            <p className="break-all text-[12px] leading-5 text-[var(--workspace-text-muted)]">
              {project.model.glbPath}
            </p>
          ) : (
            <EmptyState
              title="No model attached"
              description="Generate a GLB from the current references to inspect geometry metadata here."
            />
          )}
        </Section>
      </div>
    );
  }

  if (mode === "material") {
    return (
      <div className="space-y-6">
        <Section label="Material pipeline">
          {hasModel ? (
            <p className="text-[13px] leading-6 text-[var(--workspace-text)]">
              Material slots stay intact here so the texture pass can continue
              without replacing the loaded GLB.
            </p>
          ) : (
            <EmptyState
              title="Material review pending"
              description="Generate a model first, then continue with texture and mapping review without replacing the current pipeline."
            />
          )}
        </Section>
      </div>
    );
  }

  if (mode === "light") {
    return (
      <div className="space-y-6">
        <Section label="Viewport lighting">
          <p className="text-[13px] leading-6 text-[var(--workspace-text)]">
            The current studio profile is <strong>{studioProfile}</strong>.
            Ground, grid and shadow balance stay tuned to keep the model as the
            brightest element while preserving depth.
          </p>
        </Section>
        <Section label="Navigation">
          <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            Docked columns keep orbit and wheel interactions isolated from
            inspector scrolling.
          </p>
        </Section>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="space-y-6">
        {!isEngineReady ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
                  Engine status
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--workspace-text)]">
                  AI engine stopped
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
                  {engineMessage}
                </p>
              </div>
              <Button
                variant="secondary"
                className={`h-9 px-4 text-xs ${contrastButtonClass}`}
                onClick={() => void onRestartEngine()}
                disabled={isRestartingEngine}
              >
                {isRestartingEngine ? "Restarting..." : "Restart Engine"}
              </Button>
            </div>
          </div>
        ) : null}

        <Section label="Generation controls">
          <div className="grid gap-3">
            <Button
              variant="secondary"
              className={contrastButtonClass}
              onClick={() => void onOpenOutputFolder()}
              disabled={!project.model?.glbPath}
            >
              Open output
            </Button>
            <select
              value={preset}
              onChange={(event) =>
                onPresetChange(event.currentTarget.value as GenerationPreset)
              }
              className={contrastSelectClass}
              disabled={isGenerating}
            >
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="quality">Quality</option>
            </select>
            <select
              value={autoGenerationProfile}
              onChange={(event) =>
                onAutoGenerationProfileChange(
                  event.currentTarget.value as AutoProfile,
                )
              }
              className={contrastSelectClass}
              disabled={isGenerating}
            >
              <option value="auto">AUTO (recommended)</option>
              <option value="hard_surface">HARD-SURFACE</option>
              <option value="organic">ORGANIC</option>
            </select>
            <select
              value={reconstructionTier}
              onChange={(event) =>
                onReconstructionTierChange(
                  event.currentTarget.value as ReconstructionTier,
                )
              }
              className={contrastSelectClass}
              disabled={isGenerating}
            >
              <option value="preview">Preview (fast)</option>
              <option value="final">Final (HQ)</option>
            </select>
            <label className={contrastToggleClass}>
              <input
                type="checkbox"
                checked={multiviewEnabled}
                onChange={(event) =>
                  onMultiviewEnabledChange(event.currentTarget.checked)
                }
                disabled={isGenerating}
              />
              Multiview local
            </label>
            <select
              value={multiviewPreset}
              onChange={(event) =>
                onMultiviewPresetChange(
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
                onChange={(event) =>
                  onMultiviewHardSurfaceQualityChange(
                    event.currentTarget.value as MultiviewHardSurfaceQuality,
                  )
                }
                className={contrastSelectClass}
                disabled={isGenerating || !multiviewEnabled}
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="pro">Pro</option>
              </select>
            ) : null}
          </div>
        </Section>

        <Section label="Engine details">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
              {engineMessage}
            </p>
            <Button
              variant="ghost"
              className={`h-8 px-3 text-xs ${contrastGhostButtonClass}`}
              onClick={onToggleEngineLogs}
            >
              {showEngineLogs ? "Hide logs" : "Show logs"}
            </Button>
          </div>
          {showEngineLogs ? (
            <div className="mt-4 max-h-44 space-y-2 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] p-3">
              {engineLogs.length > 0 ? (
                engineLogs.map((line, index) => (
                  <p
                    key={`${index}-${line}`}
                    className="font-mono text-[11px] leading-5 text-[var(--workspace-text-muted)]"
                  >
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-xs text-[var(--workspace-text-muted)]">
                  No logs available.
                </p>
              )}
            </div>
          ) : null}
        </Section>
      </div>
    );
  }

  return (
    <EmptyState
      title="Result summary is centralized"
      description="Run status, metadata and export actions are now shown once in the shared inspector shell."
    />
  );
}
