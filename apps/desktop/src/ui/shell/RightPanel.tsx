import type { ReactNode } from "react";

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
}: RightPanelProps) {
  return (
    <aside className={`flex min-h-0 w-[360px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--shell-panel)] ${className}`}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">{eyebrow}</p>
            <h2 className="mt-1 text-base font-medium text-[var(--text)]">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
          </div>
          {headerSlot}
        </div>
      </div>
      <div className="flex gap-1 border-b border-[var(--border)] px-3 py-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              activeTab === tab.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
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
