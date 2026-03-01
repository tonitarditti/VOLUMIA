import type { ReactNode } from "react";

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
  const isContrast = tone === "contrast";
  const rootClass = isContrast
    ? "border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-panel)]"
    : "border-[var(--border)] bg-[var(--shell-toolbar)]";
  const dividerClass = isContrast
    ? "border-[var(--shell-contrast-border)]"
    : "border-[var(--border)]";

  return (
    <footer
      className={`relative grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] border-t ${rootClass} ${className}`}
    >
      {typeof progress === "number" ? (
        <div
          className={`absolute inset-x-0 top-0 h-0.5 ${isContrast ? "bg-[var(--shell-contrast-border)]" : "bg-[var(--border)]"}`}
        >
          <div
            className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <div
        className={`flex min-w-0 items-center gap-2 border-r px-4 ${dividerClass}`}
      >
        {left}
      </div>
      <div
        className={`flex min-w-0 items-center gap-2 border-r px-4 ${dividerClass}`}
      >
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 px-4">
        {right}
      </div>
    </footer>
  );
}
