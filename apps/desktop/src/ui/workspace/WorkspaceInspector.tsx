import type { ReactNode, WheelEventHandler } from "react";
import type { Project, GenerationPreset } from "@/projects/types";
import { Button, TextArea } from "@/ui/primitives";
import { RightPanel } from "@/ui/shell";
import type {
  AutoGenerationProfile,
  StudioProfile,
} from "@/volumia/settings/types";
import {
  EmptyState,
  ModeHeader,
  RunSummary,
  Section,
  SummaryGrid,
  Label,
  Value,
  WorkspaceSnapshot,
} from "./InspectorCommon";
import { ModePanel } from "./ModePanel";
import {
  getWorkspaceModeDefinition,
  type WorkspaceMode,
} from "./modes";

type AutoProfile = "auto" | "hard_surface" | "organic";
type MultiviewPreset = "hard_surface" | "balanced" | "organic";
type MultiviewHardSurfaceQuality = "fast" | "balanced" | "pro";
type ReconstructionTier = "preview" | "final";

export type WorkspaceInspectorTab = "inspector" | "references" | "notes";

type WorkspaceInspectorProps = {
  mode: WorkspaceMode;
  tab: WorkspaceInspectorTab;
  project: Project;
  selectedImages: string[];
  reconstructionTier: ReconstructionTier;
  multiviewEnabled: boolean;
  studioProfile: StudioProfile;
  preset: GenerationPreset;
  isNotesOpen: boolean;
  isGenerating: boolean;
  generationStage: string;
  generationPercent: number;
  generationMessage: string;
  engineMessage: string;
  isEngineReady: boolean;
  isRestartingEngine: boolean;
  showEngineLogs: boolean;
  engineLogs: string[];
  multiviewPreset: MultiviewPreset;
  multiviewHardSurfaceQuality: MultiviewHardSurfaceQuality;
  autoGenerationProfile: AutoGenerationProfile;
  autoProfileLabel: string;
  autoUsedEngineLabel: string;
  autoUsedPresetLabel: string;
  generationLogPath: string;
  generationDeviceLabel?: string;
  onTabChange: (tab: WorkspaceInspectorTab) => void;
  onToggleNotes: () => void;
  onUpdateNotes: (value: string) => void;
  onOpenOutputFolder: () => void | Promise<void>;
  onRestartEngine: () => void | Promise<void>;
  onToggleEngineLogs: () => void;
  onOpenGenerationLog: () => void | Promise<void>;
  onGenerateSkp: () => void | Promise<void>;
  onPresetChange: (preset: GenerationPreset) => void;
  onAutoGenerationProfileChange: (profile: AutoProfile) => void;
  onReconstructionTierChange: (tier: ReconstructionTier) => void;
  onMultiviewEnabledChange: (enabled: boolean) => void;
  onMultiviewPresetChange: (preset: MultiviewPreset) => void;
  onMultiviewHardSurfaceQualityChange: (
    quality: MultiviewHardSurfaceQuality,
  ) => void;
  onWheelCapture?: WheelEventHandler<HTMLElement>;
};

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
}

function InspectorTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkspaceInspectorTab;
  onTabChange: (tab: WorkspaceInspectorTab) => void;
}) {
  const tabs = [
    { id: "inspector", label: "Inspector" },
    { id: "references", label: "References" },
    { id: "notes", label: "Notes" },
  ] as const;

  return (
    <div className="space-y-2">
      <p className="px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
        Panels
      </p>
      <div
        role="tablist"
        aria-label="Inspector sections"
        className="grid grid-cols-3 gap-1 rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] p-1"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`rounded-[14px] px-3 py-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                isActive
                  ? "bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                  : "text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotesPanel({
  notes,
  isOpen,
  onToggle,
  onUpdate,
}: {
  notes: string;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate: (value: string) => void;
}) {
  const trimmedNotes = notes.trim();

  return (
    <div className="space-y-6">
      <Section label="Project notes">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            Keep long-form context here and open it only when needed to reduce
            inspector noise during modeling.
          </p>
          <Button
            variant="ghost"
            className="h-8 px-3 text-xs text-[var(--workspace-text-muted)] hover:border-[var(--workspace-divider)] hover:bg-[var(--workspace-surface)] hover:text-[var(--workspace-text)]"
            onClick={onToggle}
          >
            {isOpen ? "Hide" : "Open"}
          </Button>
        </div>
        {!trimmedNotes && !isOpen ? (
          <EmptyState
            title="No notes yet"
            description="Store design intent, reconstruction constraints and export context here."
          />
        ) : null}
        {!isOpen && trimmedNotes ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-3 text-[12px] leading-6 text-[var(--workspace-text-muted)]">
            {trimmedNotes}
          </div>
        ) : null}
        {isOpen ? (
          <TextArea
            value={notes}
            onChange={(event) => onUpdate(event.currentTarget.value)}
            rows={8}
            placeholder="Notas del proyecto"
          />
        ) : null}
      </Section>
    </div>
  );
}

function ReferencesPanel({
  projectName,
  selectedImages,
  currentModeLabel,
}: {
  projectName: string;
  selectedImages: string[];
  currentModeLabel: string;
}) {
  return (
    <div className="space-y-6">
      <Section label="Reference summary">
        <SummaryGrid>
          <Label>Images</Label>
          <Value>{selectedImages.length}</Value>
          <Label>Project</Label>
          <Value>{projectName}</Value>
          <Label>Current mode</Label>
          <Value>{currentModeLabel}</Value>
        </SummaryGrid>
        <p className="text-[12px] leading-5 text-[var(--workspace-text-muted)]">
          Add and review imagery from the docked References column so the
          viewport stays unobstructed.
        </p>
      </Section>

      <Section label="Input imagery">
        {selectedImages.length > 0 ? (
          <div className="space-y-2">
            {selectedImages.map((imagePath) => (
              <div
                key={imagePath}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-2"
              >
                <span className="truncate text-[12px] text-[var(--workspace-text)]">
                  {filenameFromPath(imagePath)}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--workspace-text-muted)]">
                  Input
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No reference images attached"
            description="Drop imagery into the left drawer or use Add images to seed the current reconstruction run."
          />
        )}
      </Section>
    </div>
  );
}

export function WorkspaceInspector({
  mode,
  tab,
  project,
  selectedImages,
  reconstructionTier,
  multiviewEnabled,
  studioProfile,
  preset,
  isNotesOpen,
  isGenerating,
  generationStage,
  generationPercent,
  generationMessage,
  engineMessage,
  isEngineReady,
  isRestartingEngine,
  showEngineLogs,
  engineLogs,
  multiviewPreset,
  multiviewHardSurfaceQuality,
  autoGenerationProfile,
  autoProfileLabel,
  autoUsedEngineLabel,
  autoUsedPresetLabel,
  generationLogPath,
  generationDeviceLabel,
  onTabChange,
  onToggleNotes,
  onUpdateNotes,
  onOpenOutputFolder,
  onRestartEngine,
  onToggleEngineLogs,
  onOpenGenerationLog,
  onGenerateSkp,
  onPresetChange,
  onAutoGenerationProfileChange,
  onReconstructionTierChange,
  onMultiviewEnabledChange,
  onMultiviewPresetChange,
  onMultiviewHardSurfaceQualityChange,
  onWheelCapture,
}: WorkspaceInspectorProps) {
  const hasModel = Boolean(project.model?.glbPath);
  const modeDefinition = getWorkspaceModeDefinition(mode);
  const headerStatus =
    !isEngineReady && mode === "ai"
      ? {
          label: "Engine offline",
          className:
            "border-[var(--badge-danger-border)] bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
        }
      : isGenerating
        ? {
            label: "Generating",
            className:
              "border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]",
          }
        : hasModel
          ? {
              label: "Model ready",
              className:
                "border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
            }
          : {
              label: "In setup",
              className:
                "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)]",
            };

  let body: ReactNode;
  if (tab === "references") {
    body = (
      <ReferencesPanel
        projectName={project.name}
        selectedImages={selectedImages}
        currentModeLabel={modeDefinition.title}
      />
    );
  } else if (tab === "notes") {
    body = (
      <NotesPanel
        notes={project.notes ?? ""}
        isOpen={isNotesOpen}
        onToggle={onToggleNotes}
        onUpdate={onUpdateNotes}
      />
    );
  } else if (mode === "result") {
    body = (
      <RunSummary
        generationStage={generationStage}
        generationPercent={generationPercent}
        generationMessage={generationMessage}
        preset={preset}
        autoUsedEngineLabel={autoUsedEngineLabel}
        autoUsedPresetLabel={autoUsedPresetLabel}
        hasModel={hasModel}
        isGenerating={isGenerating}
        generationLogPath={generationLogPath}
        isEngineReady={isEngineReady}
        onOpenOutputFolder={onOpenOutputFolder}
        onGenerateSkp={onGenerateSkp}
        onOpenGenerationLog={onOpenGenerationLog}
      />
    );
  } else {
    body = (
      <ModePanel
        mode={mode}
        project={project}
        selectedImages={selectedImages}
        reconstructionTier={reconstructionTier}
        multiviewEnabled={multiviewEnabled}
        studioProfile={studioProfile}
        preset={preset}
        isGenerating={isGenerating}
        engineMessage={engineMessage}
        isEngineReady={isEngineReady}
        isRestartingEngine={isRestartingEngine}
        showEngineLogs={showEngineLogs}
        engineLogs={engineLogs}
        multiviewPreset={multiviewPreset}
        multiviewHardSurfaceQuality={multiviewHardSurfaceQuality}
        autoGenerationProfile={autoGenerationProfile}
        autoProfileLabel={autoProfileLabel}
        onOpenOutputFolder={onOpenOutputFolder}
        onRestartEngine={onRestartEngine}
        onToggleEngineLogs={onToggleEngineLogs}
        onPresetChange={onPresetChange}
        onAutoGenerationProfileChange={onAutoGenerationProfileChange}
        onReconstructionTierChange={onReconstructionTierChange}
        onMultiviewEnabledChange={onMultiviewEnabledChange}
        onMultiviewPresetChange={onMultiviewPresetChange}
        onMultiviewHardSurfaceQualityChange={
          onMultiviewHardSurfaceQualityChange
        }
      />
    );
  }

  return (
    <RightPanel
      eyebrow="Workspace"
      title="Inspector"
      subtitle={project.name}
      headerSlot={
        <div
          className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${headerStatus.className}`}
        >
          {headerStatus.label}
        </div>
      }
      tone="contrast"
      onWheelCapture={onWheelCapture}
    >
      <div className="space-y-6">
        <WorkspaceSnapshot
          projectName={project.name}
          selectedImages={selectedImages}
          hasModel={hasModel}
          generationDeviceLabel={generationDeviceLabel}
          modeLabel={modeDefinition.title}
          statusLabel={headerStatus.label}
        />
        <InspectorTabs activeTab={tab} onTabChange={onTabChange} />
        {tab === "inspector" ? (
          <div className="space-y-6">
            <ModeHeader mode={mode} />
            {body}
          </div>
        ) : (
          body
        )}
      </div>
    </RightPanel>
  );
}
