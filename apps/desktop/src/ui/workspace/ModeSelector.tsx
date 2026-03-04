import type { WheelEventHandler } from "react";
import { BrandMark } from "@/ui/shell";
import { workspaceModeDefinitions, type WorkspaceMode } from "./modes";

type ModeSelectorProps = {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  className?: string;
  onWheelCapture?: WheelEventHandler<HTMLElement>;
};

export function ModeSelector({
  activeMode,
  onModeChange,
  className = "",
  onWheelCapture,
}: ModeSelectorProps) {
  return (
    <aside
      className={`flex h-full w-16 shrink-0 flex-col items-center border-r border-[var(--workspace-divider)] bg-[var(--workspace-rail-bg)] px-2 py-3 text-[var(--workspace-text)] ${className}`}
      onWheelCapture={onWheelCapture}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--accent)] shadow-[var(--shadow)]">
        <BrandMark size={18} />
      </div>
      <div className="mt-3 flex flex-1 flex-col items-center gap-2">
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
              className={`group relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                isActive
                  ? "border-[var(--workspace-selected-border)] bg-[var(--workspace-selected-bg)] text-[var(--workspace-text)]"
                  : "border-[var(--workspace-divider)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)] hover:border-[var(--workspace-selected-border)] hover:bg-[var(--workspace-surface-hover)] hover:text-[var(--workspace-text)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-opacity ${
                  isActive
                    ? "bg-[var(--workspace-selected-border)] opacity-100"
                    : "bg-[var(--workspace-selected-border)] opacity-0 group-hover:opacity-60"
                }`}
              />
              <span className="pointer-events-none">{mode.icon}</span>
              <span className="sr-only">{mode.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
