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
      className={`relative isolate min-h-[64px] shrink-0 border-t ${rootClass} ${glassClass} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-3"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent)",
        }}
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
      <div className="flex h-full min-w-0 items-center gap-2 px-3 py-2">
        <div className="flex shrink-0 items-center">{left}</div>
        <div className={`hidden h-8 w-px border-r ${dividerClass} min-[1180px]:block`} />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center justify-center px-1">
            {center}
          </div>
        </div>
        <div className={`hidden h-8 w-px border-r ${dividerClass} min-[1320px]:block`} />
        <div className="flex shrink-0 items-center justify-end">{right}</div>
      </div>
    </footer>
  );
}
