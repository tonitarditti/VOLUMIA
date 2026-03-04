import type { ReactNode } from "react";
import { Badge, Button } from "@/ui/primitives";
import { BottomToolbar } from "@/ui/shell";

type ViewportToolsProps = {
  isGenerating: boolean;
  generationPercent: number;
  generationMessage: string;
  selectedImages: string[];
  hasModel: boolean;
  isEngineReady: boolean;
  gridEnabled: boolean;
  shadowEnabled: boolean;
  onGenerate: () => void | Promise<void>;
  onCancelGeneration: () => void | Promise<void>;
  onResetView: () => void;
  onFrameModel: () => void;
  onToggleGrid: () => void;
  onToggleShadows: () => void;
};

function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-[var(--workspace-text-muted)]">
      {children}
    </span>
  );
}

function ToolToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
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
      title={`${label} ${active ? "enabled" : "disabled"}`}
      className={`h-8 whitespace-nowrap gap-2 rounded-full px-3 text-[11px] ${
        active
          ? "border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)]"
          : "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--workspace-selected-border)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-[var(--accent)]" : "bg-current opacity-45"
        }`}
      />
      <span>{label}</span>
    </Button>
  );
}

export function ViewportTools({
  isGenerating,
  generationPercent,
  generationMessage,
  selectedImages,
  hasModel,
  isEngineReady,
  gridEnabled,
  shadowEnabled,
  onGenerate,
  onCancelGeneration,
  onResetView,
  onFrameModel,
  onToggleGrid,
  onToggleShadows,
}: ViewportToolsProps) {
  const hasImages = selectedImages.length > 0;
  const primaryLabel = hasModel ? "Regenerate 3D" : "Generate 3D";
  const controlsDisabled = isGenerating;
  const actionDisabled = isGenerating || !hasImages || !isEngineReady;

  const toolButtonClass =
    "h-8 whitespace-nowrap rounded-full px-3 text-[11px] border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--accent)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]";
  const secondaryButtonClass =
    "h-8 whitespace-nowrap rounded-full px-3 text-[11px] border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text)] hover:border-[var(--accent)] hover:bg-[var(--workspace-surface-hover)]";
  const primaryButtonClass =
    "h-9 whitespace-nowrap rounded-full px-4 text-[12px] shadow-[var(--shadow)]";

  return (
    <BottomToolbar
      tone="contrast"
      progress={isGenerating ? generationPercent : null}
      left={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Hint>LMB Orbit</Hint>
          <Hint>RMB Pan</Hint>
          <Hint>Wheel Zoom</Hint>
        </div>
      }
      center={
        <div
          className={`flex min-w-0 items-center justify-center gap-2 overflow-x-auto ${
            controlsDisabled ? "opacity-50" : ""
          }`}
        >
          <Button
            variant="ghost"
            className={toolButtonClass}
            disabled={controlsDisabled}
            onClick={onResetView}
          >
            Reset View
          </Button>
          <Button
            variant="ghost"
            className={toolButtonClass}
            disabled={controlsDisabled || !hasModel}
            onClick={onFrameModel}
          >
            Frame Model
          </Button>
          <ToolToggle
            label="Grid"
            active={gridEnabled}
            disabled={controlsDisabled}
            onClick={onToggleGrid}
          />
          <ToolToggle
            label="Shadows"
            active={shadowEnabled}
            disabled={controlsDisabled}
            onClick={onToggleShadows}
          />
        </div>
      }
      right={
        isGenerating ? (
          <div className="flex min-w-0 items-center justify-end gap-3">
            <Badge tone="warning" dot>
              Generating
            </Badge>
            <div className="min-w-0">
              <div className="h-2 w-48 overflow-hidden rounded-full bg-[var(--workspace-surface)]">
                <div
                  className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-150 ease-out"
                  style={{ width: `${generationPercent}%` }}
                />
              </div>
              <p className="mt-1 truncate text-[11px] text-[var(--workspace-text-muted)]">
                {generationMessage}
              </p>
            </div>
            <Button
              variant="ghost"
              className={secondaryButtonClass}
              onClick={() => void onCancelGeneration()}
            >
              Cancel generation
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-end gap-2">
            {!hasImages ? (
              <span className="whitespace-nowrap text-[11px] text-[var(--workspace-text-muted)]">
                Add images from References
              </span>
            ) : null}
            {!isEngineReady && hasImages ? (
              <span className="whitespace-nowrap text-[11px] text-[var(--workspace-text-muted)]">
                Engine offline - Restart in AI
              </span>
            ) : null}
            <Button
              variant="primary"
              className={primaryButtonClass}
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
            {hasModel ? (
              <Button
                variant="secondary"
                className={secondaryButtonClass}
                disabled
                title="Texture workflow is not available in this build"
              >
                Texture
              </Button>
            ) : null}
          </div>
        )
      }
    />
  );
}
