import type { ReactNode } from "react";
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
  "pointer-events-auto h-11 w-full appearance-none rounded-[16px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)] px-3 text-sm text-[var(--workspace-text)] outline-none transition-colors hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]";
const contrastToggleClass =
  "inline-flex h-11 w-full items-center justify-between gap-3 rounded-[16px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)] px-3 text-xs text-[var(--workspace-text)]";

function InsightCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)] px-4 py-3">
      <p className="text-[12px] font-medium text-[var(--workspace-text)]">
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--workspace-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function ControlCard({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-[18px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)] px-4 py-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--workspace-text)]">
          {label}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--workspace-text-muted)]">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

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
        <Section label="Input pack">
          <SummaryGrid>
            <Label>Images</Label>
            <Value>{selectedImages.length} / 4</Value>
            <Label>Notes</Label>
            <Value>{project.notes?.trim() ? "Stored" : "Empty"}</Value>
            <Label>Drawer</Label>
            <Value>Docked</Value>
          </SummaryGrid>
        </Section>

        <Section label="Preparation">
          {selectedImages.length > 0 ? (
            <div className="grid gap-3">
              <InsightCard
                title="Primary reference locked"
                description="The first image in the drawer becomes the visual anchor for the next reconstruction run."
              />
              <InsightCard
                title="Compact image set"
                description="Keep the pack tight and intentional so the model converges around one clear design language."
              />
            </div>
          ) : (
            <EmptyState
              title="Reference pack is empty"
              description="Add imagery in the drawer to build the visual brief before opening AI controls."
            />
          )}
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

        <Section label="Readiness">
          <div className="grid gap-3">
            <InsightCard
              title={hasModel ? "Geometry available" : "Awaiting geometry"}
              description={
                hasModel
                  ? "Use this stage to validate massing and framing before moving into material review."
                  : "The viewport remains in prep mode until the first reconstruction produces a GLB."
              }
            />
          </div>
        </Section>
      </div>
    );
  }

  if (mode === "material") {
    return (
      <div className="space-y-6">
        <Section label="Material staging">
          {hasModel ? (
            <div className="grid gap-3">
              <InsightCard
                title="GLB preserved"
                description="Texture and mapping review happen on top of the current geometry so the reconstruction baseline stays intact."
              />
              <InsightCard
                title="Next release path"
                description="This panel is reserved for texture controls, library selection and UV checks in the next workflow pass."
              />
            </div>
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
        <Section label="Studio atmosphere">
          <div className="grid gap-3">
            <InsightCard
              title={`Profile: ${studioProfile}`}
              description="The viewport keeps the model as the brightest element while preserving depth and edge readability."
            />
            <InsightCard
              title="Presentation first"
              description="Orbit, ground and shadow balance are tuned to make review feel deliberate instead of purely technical."
            />
          </div>
        </Section>

        <Section label="Navigation">
          <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            Docked columns keep orbit and wheel interactions isolated from inspector scrolling.
          </p>
        </Section>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="space-y-6">
        {!isEngineReady ? (
          <div className="rounded-[20px] border border-[var(--danger)] bg-[var(--danger-bg)] p-4">
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

        <Section label="Generation recipe">
          <div className="grid gap-3">
            <ControlCard
              label="Preset"
              description="Choose the balance between turnaround speed and geometric confidence."
            >
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
                <option value="high">High</option>
              </select>
            </ControlCard>

            <ControlCard
              label="Auto profile"
              description="Bias the run toward the dominant type of object before routing through the pipeline."
            >
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
            </ControlCard>

            <ControlCard
              label="Reconstruction tier"
              description="Preview for speed, Final for denser evaluation before committing the output."
            >
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
            </ControlCard>
          </div>
        </Section>

        <Section label="Local reconstruction">
          <div className="grid gap-3">
            <ControlCard
              label="Multiview"
              description="Enable extra local image synthesis before the main pass when you need more spatial coverage."
            >
              <label className={contrastToggleClass}>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--workspace-text)]">
                    Multiview local
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--workspace-text-muted)]">
                    Expands reference coverage around the main image.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={multiviewEnabled}
                  onChange={(event) =>
                    onMultiviewEnabledChange(event.currentTarget.checked)
                  }
                  disabled={isGenerating}
                />
              </label>
            </ControlCard>

            <ControlCard
              label="Multiview preset"
              description="Tune the synthetic image family for the kind of geometry you want to preserve."
            >
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
            </ControlCard>

            {multiviewPreset === "hard_surface" ? (
              <ControlCard
                label="Hard-surface quality"
                description="Increase edge discipline for structured objects and architectural surfaces."
              >
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
              </ControlCard>
            ) : null}
          </div>
        </Section>

        <Section label="Session actions">
          <div className="grid gap-2">
            <Button
              variant="secondary"
              className={contrastButtonClass}
              onClick={() => void onOpenOutputFolder()}
              disabled={!project.model?.glbPath}
            >
              Open output
            </Button>
            <Button
              variant="secondary"
              className={contrastButtonClass}
              onClick={() => void onRestartEngine()}
              disabled={isRestartingEngine}
            >
              {isRestartingEngine ? "Restarting..." : "Restart Engine"}
            </Button>
            <Button
              variant="ghost"
              className={contrastGhostButtonClass}
              onClick={onToggleEngineLogs}
            >
              {showEngineLogs ? "Hide logs" : "Show logs"}
            </Button>
          </div>
        </Section>

        <Section label="Engine details">
          <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            {engineMessage}
          </p>
          {showEngineLogs ? (
            <div className="mt-4 max-h-44 space-y-2 overflow-y-auto rounded-[18px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,black_16%)] p-3">
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
