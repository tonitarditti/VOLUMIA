import type { ReactNode, WheelEventHandler } from "react";

export type ShellRightPanelTab = {
  id: string;
  label: string;
};

type RightPanelProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  tabs: ShellRightPanelTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
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
  tabs,
  activeTab,
  onTabChange,
  headerSlot,
  children,
  className = "",
  tone = "default",
  onWheelCapture,
}: RightPanelProps) {
  const isContrast = tone === "contrast";
  const rootClass = isContrast
    ? "border-[var(--shell-contrast-border)] bg-[var(--shell-contrast-panel)] text-[var(--shell-contrast-text)]"
    : "border-[var(--border)] bg-[var(--shell-panel)] text-[var(--text)]";
  const headerBorderClass = isContrast ? "border-[var(--shell-contrast-border)]" : "border-[var(--border)]";
  const eyebrowClass = isContrast ? "text-[var(--shell-contrast-text-muted)]" : "text-[var(--text-faint)]";
  const titleClass = isContrast ? "text-[var(--shell-contrast-text)]" : "text-[var(--text)]";
  const subtitleClass = isContrast ? "text-[var(--shell-contrast-text-muted)]" : "text-[var(--text-muted)]";
  const tabRowClass = isContrast ? "border-[var(--shell-contrast-border)]" : "border-[var(--border)]";
  const activeTabClass = isContrast
    ? "border-[var(--accent)] bg-[var(--shell-contrast-surface)] text-[var(--shell-contrast-text)]"
    : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]";
  const inactiveTabClass = isContrast
    ? "border-transparent text-[var(--shell-contrast-text-muted)] hover:bg-[var(--shell-contrast-tag)] hover:text-[var(--shell-contrast-text)]"
    : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

  return (
    <aside
      className={`flex min-h-0 w-[360px] shrink-0 flex-col border-l ${rootClass} ${className}`}
      onWheelCapture={onWheelCapture}
    >
      <div className={`border-b px-5 py-4 ${headerBorderClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${eyebrowClass}`}>{eyebrow}</p>
            <h2 className={`mt-1 text-base font-medium ${titleClass}`}>{title}</h2>
            {subtitle ? <p className={`mt-1 text-xs ${subtitleClass}`}>{subtitle}</p> : null}
          </div>
          {headerSlot}
        </div>
      </div>
      <div className={`flex gap-1 border-b px-3 py-2 ${tabRowClass}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              activeTab === tab.id ? activeTabClass : inactiveTabClass
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  );
}
