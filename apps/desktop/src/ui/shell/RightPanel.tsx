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
      className={`flex min-h-0 w-[368px] shrink-0 flex-col border-l ${rootClass} ${glassClass} ${className}`}
      onWheelCapture={onWheelCapture}
    >
      <div className={`border-b px-6 py-4 ${headerBorderClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${eyebrowClass}`}
            >
              {eyebrow}
            </p>
            <h2 className={`mt-1 text-[15px] font-medium tracking-[0.01em] ${titleClass}`}>
              {title}
            </h2>
            {subtitle ? (
              <p className={`mt-1 text-[11px] ${subtitleClass}`}>{subtitle}</p>
            ) : null}
          </div>
          {headerSlot}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>
    </aside>
  );
}
