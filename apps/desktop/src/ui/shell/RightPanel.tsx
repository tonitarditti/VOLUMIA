import type { ReactNode, WheelEventHandler } from "react";
import { useSettings } from "@/volumia/settings/context";

type RightPanelProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  headerSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "contrast";
  onWheelCapture?: WheelEventHandler<HTMLElement>;
};

export function RightPanel({
  eyebrow,
  title,
  subtitle,
  headerSlot,
  children,
  className = "",
  tone = "default",
  onWheelCapture,
}: RightPanelProps) {
  const { settings } = useSettings();
  const isContrast = tone === "contrast";
  const isGlass = settings.glassStyle;
  const rootClass = isContrast
    ? "border-[var(--workspace-divider)] bg-[var(--workspace-inspector-bg)] text-[var(--workspace-text)]"
    : "border-[var(--panel-border)] bg-[var(--shell-panel)] text-[var(--text)]";
  const headerBorderClass = isContrast
    ? "border-[var(--workspace-divider)]"
    : "border-[var(--panel-border)]";
  const eyebrowClass = isContrast
    ? "text-[var(--workspace-text-muted)]"
    : "text-[var(--text-faint)]";
  const titleClass = isContrast
    ? "text-[var(--workspace-text)]"
    : "text-[var(--text)]";
  const subtitleClass = isContrast
    ? "text-[var(--workspace-text-muted)]"
    : "text-[var(--muted-text)]";
  const glassClass = isGlass ? "backdrop-blur-[var(--glass-blur)]" : "";

  return (
    <aside
      className={`relative isolate flex min-h-0 w-[clamp(264px,24vw,344px)] shrink-0 flex-col overflow-hidden border-l max-[1380px]:w-[316px] max-[1240px]:w-[286px] ${rootClass} ${glassClass} ${className}`}
      onWheelCapture={onWheelCapture}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-24 opacity-55"
        style={{
          background:
            "radial-gradient(circle at top, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 72%)",
        }}
      />
      <div className={`relative z-10 border-b px-5 pb-3.5 pt-4 ${headerBorderClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${eyebrowClass}`}
            >
              {eyebrow}
            </p>
            <h2
              className={`mt-1 truncate text-[16px] font-medium tracking-[0.01em] ${titleClass}`}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className={`mt-1 truncate text-[12px] ${subtitleClass}`}>{subtitle}</p>
            ) : null}
          </div>
          {headerSlot}
        </div>
      </div>
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {children}
      </div>
    </aside>
  );
}
