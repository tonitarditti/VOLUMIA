import type { WheelEventHandler } from "react";
import { BrandLogo } from "@/components/branding";
import { workspaceModeDefinitions, type WorkspaceMode } from "./modes";

type ModeSelectorProps = {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  workflowStatus?: "idle" | "generating" | "ready" | "error";
  selectedImagesCount?: number;
  hasModel?: boolean;
  className?: string;
  onWheelCapture?: WheelEventHandler<HTMLElement>;
};

const statusToneClass: Record<
  NonNullable<ModeSelectorProps["workflowStatus"]>,
  string
> = {
  idle: "bg-[var(--workspace-text-muted)]",
  generating: "bg-[var(--warning)]",
  ready: "bg-[var(--success)]",
  error: "bg-[var(--danger)]",
};

export function ModeSelector({
  activeMode,
  onModeChange,
  workflowStatus = "idle",
  selectedImagesCount = 0,
  hasModel = false,
  className = "",
  onWheelCapture,
}: ModeSelectorProps) {
  return (
    <aside
      className={`flex h-full w-16 shrink-0 flex-col items-center border-r border-[var(--workspace-divider)] bg-[var(--workspace-rail-bg)] px-1.5 py-2 text-[var(--workspace-text)] ${className}`}
      onWheelCapture={onWheelCapture}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text)]">
        <BrandLogo size={16} showText={false} label="VOLUMIA" />
      </div>

      <div className="mt-2 flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {workspaceModeDefinitions.map((mode) => {
          const isActive = activeMode === mode.id;
          const tooltip = `${mode.tooltip} (${mode.shortcut})`;
          return (
            <button
              key={mode.id}
              type="button"
              title={tooltip}
              aria-label={tooltip}
              aria-keyshortcuts={mode.shortcut}
              aria-pressed={isActive}
              onClick={() => onModeChange(mode.id)}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-[12px] border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                isActive
                  ? "border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)]"
                  : "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--workspace-selected-border)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-1 top-1 rounded-full px-1.5 py-[1px] text-[7px] font-semibold uppercase tracking-[0.12em] ${
                  isActive
                    ? "text-[var(--workspace-text)]"
                    : "text-[var(--workspace-text-muted)]"
                }`}
              >
                {mode.shortcut}
              </span>
              <span className="pointer-events-none">{mode.icon}</span>
              <span className="sr-only">{mode.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex w-full flex-col items-center gap-1.5 rounded-[12px] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] px-2 py-2">
        <span
          className={`h-2 w-2 rounded-full ${statusToneClass[workflowStatus]}`}
        />
        <p className="text-[8px] text-[var(--workspace-text-muted)]">
          {selectedImagesCount}
        </p>
        <p className="text-[8px] text-[var(--workspace-text-muted)]">
          {hasModel ? "GLB" : "-"}
        </p>
      </div>
    </aside>
  );
}
