import type { ReactNode } from "react";
import { Button } from "@/ui/primitives";
import type { WorkspaceMode } from "./modes";
import { getWorkspaceModeDefinition } from "./modes";

export function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5 border-b border-[var(--workspace-divider)] pb-5 last:border-b-0 last:pb-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
        {label}
      </p>
      {children}
    </section>
  );
}

export function SummaryGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3">
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] text-[var(--workspace-text-muted)]">
      {children}
    </span>
  );
}

export function Value({ children }: { children: ReactNode }) {
  return (
    <span className="text-right text-[11px] font-medium text-[var(--workspace-text)]">
      {children}
    </span>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 text-[11px] text-[var(--workspace-text-muted)]">
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-4 py-4">
      <p className="text-[13px] font-medium text-[var(--workspace-text)]">
        {title}
      </p>
      <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ModeHeader({
  mode,
}: {
  mode: WorkspaceMode;
}) {
  const modeDefinition = getWorkspaceModeDefinition(mode);

  return (
    <section
      aria-live="polite"
      className="space-y-4 border-b border-[var(--workspace-divider)] pb-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)]">
          {modeDefinition.icon}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
            Active mode
          </p>
          <h3 className="mt-1 text-[17px] font-medium text-[var(--workspace-text)]">
            {modeDefinition.title}
          </h3>
          <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            {modeDefinition.description}
          </p>
        </div>
      </div>
    </section>
  );
}

export function ProjectBadges({
  projectName,
  selectedImages,
  hasModel,
  generationDeviceLabel,
}: {
  projectName: string;
  selectedImages: string[];
  hasModel: boolean;
  generationDeviceLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <MetaChip>{selectedImages.length} refs</MetaChip>
      <MetaChip>{hasModel ? "Model attached" : "Awaiting GLB"}</MetaChip>
      <MetaChip>{projectName}</MetaChip>
      {generationDeviceLabel ? <MetaChip>{generationDeviceLabel}</MetaChip> : null}
    </div>
  );
}

export function RunSummary({
  generationStage,
  generationPercent,
  generationMessage,
  preset,
  autoUsedEngineLabel,
  autoUsedPresetLabel,
  hasModel,
  isGenerating,
  generationLogPath,
  isEngineReady,
  onOpenOutputFolder,
  onGenerateSkp,
  onOpenGenerationLog,
}: {
  generationStage: string;
  generationPercent: number;
  generationMessage: string;
  preset: string;
  autoUsedEngineLabel: string;
  autoUsedPresetLabel: string;
  hasModel: boolean;
  isGenerating: boolean;
  generationLogPath: string;
  isEngineReady: boolean;
  onOpenOutputFolder: () => void | Promise<void>;
  onGenerateSkp: () => void | Promise<void>;
  onOpenGenerationLog: () => void | Promise<void>;
}) {
  const skpDisabled = isGenerating || !hasModel || !isEngineReady;

  return (
    <div className="space-y-6">
      <Section label="Run summary">
        <SummaryGrid>
          <Label>Stage</Label>
          <Value>{generationStage}</Value>
          <Label>Progress</Label>
          <Value>{generationPercent}%</Value>
          <Label>Preset</Label>
          <Value>{preset}</Value>
          <Label>Engine</Label>
          <Value>{autoUsedEngineLabel}</Value>
          <Label>Auto mode</Label>
          <Value>{autoUsedPresetLabel}</Value>
          <Label>Output</Label>
          <Value>{hasModel ? "Model attached" : "Awaiting GLB"}</Value>
        </SummaryGrid>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--workspace-surface)]">
          <div
            className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-150 ease-out"
            style={{ width: `${generationPercent}%` }}
          />
        </div>
        <p className="text-[13px] leading-6 text-[var(--workspace-text)]">
          {generationMessage}
        </p>
      </Section>

      <Section label="Output actions">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--accent)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
            onClick={() => void onOpenOutputFolder()}
            disabled={!hasModel}
          >
            Open output
          </Button>
          <Button
            variant="secondary"
            className="border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--accent)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
            onClick={() => void onGenerateSkp()}
            disabled={skpDisabled}
            title={!isEngineReady ? "Engine offline - Restart" : undefined}
          >
            Generate SKP
          </Button>
          <Button
            variant="ghost"
            className="text-[var(--workspace-text-muted)] hover:border-[var(--workspace-divider)] hover:bg-[var(--workspace-surface)] hover:text-[var(--workspace-text)]"
            onClick={() => void onOpenGenerationLog()}
            disabled={!generationLogPath}
          >
            Open log
          </Button>
        </div>
      </Section>
    </div>
  );
}
