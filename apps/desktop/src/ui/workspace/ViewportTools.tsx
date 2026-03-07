import type { ReactNode } from "react";
import { Badge, Button } from "@/ui/primitives";
import { BottomToolbar } from "@/ui/shell";
import type { WorkspaceMode } from "./modes";

type ViewportToolsProps = {
  activeMode: WorkspaceMode;
  isGenerating: boolean;
  generationPercent: number;
  generationMessage: string;
  selectedImages: string[];
  hasModel: boolean;
  isEngineReady: boolean;
  gridEnabled: boolean;
  shadowEnabled: boolean;
  wireframeEnabled: boolean;
  onGenerate: () => void | Promise<void>;
  onCancelGeneration: () => void | Promise<void>;
  onResetView: () => void;
  onFrameModel: () => void;
  onToggleGrid: () => void;
  onToggleShadows: () => void;
  onToggleWireframe: () => void;
  onCaptureViewport: () => void;
};

function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
      {children}
    </span>
  );
}

function ToolbarBlock({
  children,
  emphasis = false,
}: {
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-[18px] border px-2.5 py-2 ${
        emphasis
          ? "border-[var(--workspace-selected-border)] bg-[color:color-mix(in_srgb,var(--workspace-selected-bg)_88%,var(--workspace-surface)_12%)]"
          : "border-[var(--workspace-divider)] bg-[var(--workspace-surface)]"
      }`}
    >
      {children}
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`h-8 whitespace-nowrap rounded-full px-3 text-[11px] ${
        active
          ? "border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)]"
          : "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--workspace-selected-border)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
      }`}
    >
      {label}
    </Button>
  );
}

export function ViewportTools({
  activeMode,
  isGenerating,
  generationPercent,
  generationMessage,
  selectedImages,
  hasModel,
  isEngineReady,
  gridEnabled,
  shadowEnabled,
  wireframeEnabled,
  onGenerate,
  onCancelGeneration,
  onResetView,
  onFrameModel,
  onToggleGrid,
  onToggleShadows,
  onToggleWireframe,
  onCaptureViewport,
}: ViewportToolsProps) {
  const hasImages = selectedImages.length > 0;
  const primaryLabel = hasModel ? "Regenerate 3D" : "Generate 3D";
  const controlsDisabled = isGenerating;
  const actionDisabled = isGenerating || !hasImages || !isEngineReady;
  const compactDetails = activeMode === "result" || activeMode === "ai";

  const readinessTone = isGenerating
    ? ("warning" as const)
    : !hasImages
      ? ("neutral" as const)
      : !isEngineReady
        ? ("danger" as const)
        : ("success" as const);
  const readinessLabel = isGenerating
    ? "Generating"
    : !hasImages
      ? "No refs"
      : !isEngineReady
        ? "Engine offline"
        : "Ready";

  return (
    <BottomToolbar
      tone="contrast"
      progress={isGenerating ? generationPercent : null}
      left={
        <ToolbarBlock>
          <Hint>Orbit</Hint>
          <Hint>Pan</Hint>
          <Hint>Zoom</Hint>
        </ToolbarBlock>
      }
      center={
        <ToolbarBlock>
          <ToolButton
            label="Reset"
            disabled={controlsDisabled}
            onClick={onResetView}
          />
          <ToolButton
            label="Frame"
            disabled={controlsDisabled || !hasModel}
            onClick={onFrameModel}
          />
          <ToolButton
            label="Wire"
            active={wireframeEnabled}
            disabled={controlsDisabled || !hasModel}
            onClick={onToggleWireframe}
          />
          <ToolButton
            label="Grid"
            active={gridEnabled}
            disabled={controlsDisabled}
            onClick={onToggleGrid}
          />
          <ToolButton
            label="Shadow"
            active={shadowEnabled}
            disabled={controlsDisabled}
            onClick={onToggleShadows}
          />
          <ToolButton
            label="Capture"
            disabled={controlsDisabled}
            onClick={() => void onCaptureViewport()}
          />
        </ToolbarBlock>
      }
      right={
        <ToolbarBlock emphasis>
          {isGenerating ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <Badge tone="warning" dot>
                Generating
              </Badge>
              <div
                className="h-2 w-28 overflow-hidden rounded-full bg-[var(--workspace-surface)]"
                title={generationMessage}
              >
                <div
                  className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-150 ease-out"
                  style={{ width: `${generationPercent}%` }}
                />
              </div>
              <Button
                variant="ghost"
                className="h-8 rounded-full px-3 text-[11px]"
                onClick={() => void onCancelGeneration()}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              <Badge tone={readinessTone} dot>
                {readinessLabel}
              </Badge>
              {!compactDetails ? (
                <span className="text-[10px] text-[var(--workspace-text-muted)]">
                  {selectedImages.length} refs
                </span>
              ) : null}
              <Button
                variant="primary"
                className="h-8 rounded-full px-4 text-[11px]"
                onClick={() => void onGenerate()}
                disabled={actionDisabled}
                title={
                  !hasImages
                    ? "Add images from References"
                    : !isEngineReady
                      ? "Engine offline - Restart in AI"
                      : undefined
                }
              >
                {primaryLabel}
              </Button>
            </div>
          )}
        </ToolbarBlock>
      }
    />
  );
}
