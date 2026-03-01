import type { ReactNode } from "react";

type BottomToolbarProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  progress?: number | null;
};

export function BottomToolbar({ left, center, right, progress }: BottomToolbarProps) {
  return (
    <footer className="relative grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] border-t border-[var(--border)] bg-[var(--shell-toolbar)]">
      {typeof progress === "number" ? (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--border)]">
          <div className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 border-r border-[var(--border)] px-4">{left}</div>
      <div className="flex min-w-0 items-center gap-2 border-r border-[var(--border)] px-4">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-2 px-4">{right}</div>
    </footer>
  );
}
