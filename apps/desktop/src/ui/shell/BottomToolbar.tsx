import type { ReactNode } from "react";
import { useSettings } from "@/volumia/settings/context";

type BottomToolbarProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  progress?: number | null;
  className?: string;
  tone?: "default" | "contrast";
};

export function BottomToolbar({
  left,
  center,
  right,
  progress,
  className = "",
  tone = "default",
}: BottomToolbarProps) {
  const { settings } = useSettings();
  const isContrast = tone === "contrast";
  const isGlass = settings.glassStyle;
  const rootClass = isContrast
    ? "border-[var(--workspace-divider)] bg-[var(--workspace-toolbar-bg)]"
    : "border-[var(--panel-border)] bg-[var(--shell-toolbar)]";
  const dividerClass = isContrast
    ? "border-[var(--workspace-divider)]"
    : "border-[var(--panel-border)]";
  const glassClass = isGlass ? "backdrop-blur-[var(--glass-blur)]" : "";

  return (
    <footer
      className={`relative grid h-[62px] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-t ${rootClass} ${glassClass} ${className}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-px ${isContrast ? "bg-[var(--workspace-divider)]" : "bg-[var(--panel-border)]"}`}
      />
      {typeof progress === "number" ? (
        <div
          className={`absolute inset-x-0 top-0 h-0.5 ${isContrast ? "bg-[var(--workspace-divider)]" : "bg-[var(--panel-border)]"}`}
        >
          <div
            className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 px-4">
        {left}
      </div>
      <div
        className={`flex min-w-0 items-center justify-center gap-2 border-x px-5 ${dividerClass}`}
      >
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 px-4">
        {right}
      </div>
    </footer>
  );
}
