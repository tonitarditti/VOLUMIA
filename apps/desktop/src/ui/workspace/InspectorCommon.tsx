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
    <section className="space-y-3 rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-4 py-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
        {label}
      </p>
      {children}
    </section>
  );
}

export function SummaryGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3">
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
    <span className="inline-flex h-8 items-center rounded-full border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_82%,var(--accent)_18%)] px-3 text-[11px] text-[var(--workspace-text)]">
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
    <div className="rounded-[18px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_88%,black_12%)] px-4 py-4">
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
      className="overflow-hidden rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_82%,var(--accent)_18%)] text-[var(--workspace-text)]">
            {modeDefinition.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
              Current mode
            </p>
            <h3 className="mt-1 text-[16px] font-medium text-[var(--workspace-text)]">
              {modeDefinition.title}
            </h3>
            <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
              {modeDefinition.description}
            </p>
          </div>
        </div>
        <div className="rounded-full border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,transparent_16%)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
          Key {modeDefinition.shortcut}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <MetaChip>{modeDefinition.label}</MetaChip>
        <MetaChip>Mode controls</MetaChip>
      </div>
    </section>
  );
}

export function WorkspaceSnapshot({
  projectName,
  selectedImages,
  hasModel,
  generationDeviceLabel,
  modeLabel,
  statusLabel,
}: {
  projectName: string;
  selectedImages: string[];
  hasModel: boolean;
  generationDeviceLabel?: string;
  modeLabel: string;
  statusLabel: string;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--workspace-selected-border)] bg-[color:color-mix(in_srgb,var(--workspace-selected-bg)_84%,var(--workspace-surface)_16%)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
            Session
          </p>
          <h3 className="mt-1 truncate text-[18px] font-medium text-[var(--workspace-text)]">
            {projectName}
          </h3>
          <p className="mt-2 text-[12px] leading-5 text-[var(--workspace-text-muted)]">
            The inspector keeps project context first, mode controls second and
            supporting panels last so modeling decisions stay ordered.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,transparent_16%)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
            {statusLabel}
          </span>
          <span className="rounded-full border border-[var(--workspace-divider)] bg-[color:color-mix(in_srgb,var(--workspace-surface)_84%,transparent_16%)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-text-muted)]">
            {modeLabel}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
            References
          </p>
          <p className="mt-2 text-[15px] font-medium text-[var(--workspace-text)]">
            {selectedImages.length}
          </p>
        </div>
        <div className="rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
            Output
          </p>
          <p className="mt-2 text-[15px] font-medium text-[var(--workspace-text)]">
            {hasModel ? "GLB ready" : "Pending"}
          </p>
        </div>
        {generationDeviceLabel ? (
          <div className="col-span-2 rounded-[18px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
              Device
            </p>
            <p className="mt-2 text-[13px] font-medium text-[var(--workspace-text)]">
              {generationDeviceLabel}
            </p>
          </div>
        ) : null}
      </div>
    </section>
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
        <div className="h-2 w-full overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--workspace-surface)_76%,black_24%)]">
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
        <div className="grid grid-cols-2 gap-2">
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
            className="col-span-2 text-[var(--workspace-text-muted)] hover:border-[var(--workspace-divider)] hover:bg-[var(--workspace-surface)] hover:text-[var(--workspace-text)]"
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
