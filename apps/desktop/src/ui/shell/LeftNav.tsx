import { NavLink } from "react-router-dom";
import { LogoIcon } from "@/components/branding";

export type ShellNavItem = {
  id: string;
  label: string;
  shortLabel: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export type ShellNavSection = {
  id: string;
  items: ShellNavItem[];
};

function NavButton({ item }: { item: ShellNavItem }) {
  const content = (
    <>
      <span className="text-[14px] font-medium leading-none">{item.shortLabel}</span>
      <span className="text-[7px] font-semibold uppercase tracking-[0.08em]">{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <NavLink
        to={item.href}
        title={item.label}
        className={({ isActive }) =>
          `relative flex w-full flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
            isActive || item.active
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          }`
        }
      >
        {content}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      title={item.label}
      onClick={item.onClick}
      className={`relative flex w-full flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
        item.active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
    >
      {content}
    </button>
  );
}

type LeftNavProps = {
  sections: ShellNavSection[];
  footerItems?: ShellNavItem[];
  className?: string;
};

export function LeftNav({ sections, footerItems = [], className = "" }: LeftNavProps) {
  return (
    <aside className={`flex w-16 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--shell-panel)] ${className}`}>
      <div className="px-2 pt-3">
        <div className="flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <LogoIcon size={16} variant="brand" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-2 py-3">
        {sections.map((section) => (
          <div key={section.id} className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
      {footerItems.length ? (
        <div className="border-t border-[var(--border)] px-2 py-3">
          <div className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
            {footerItems.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
