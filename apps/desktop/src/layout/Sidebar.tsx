import { NavLink } from "react-router-dom";
import { useT } from "@/volumia/i18n/useT";

function navItemClass(isActive: boolean) {
  return `group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
    isActive
      ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)] shadow-[var(--shadow)]"
      : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
  }`;
}

export function Sidebar() {
  const { t } = useT();

  return (
    <aside className="relative z-[100] hidden w-56 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-3 shadow-[var(--shadow)] md:flex">
      <p className="px-3 pb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("nav.navigation")}</p>
      <nav className="space-y-1.5">
        <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]">
            D
          </span>
          {t("nav.dashboard")}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]">
            S
          </span>
          {t("nav.settings")}
        </NavLink>
      </nav>
    </aside>
  );
}
