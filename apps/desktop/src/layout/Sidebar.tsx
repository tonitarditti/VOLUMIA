import { NavLink } from "react-router-dom";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";

type SidebarProps = {
  className?: string;
  drawer?: boolean;
  pinned?: boolean;
  onTogglePinned?: () => void;
};

function navItemClass(isActive: boolean) {
  return `group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
    isActive
      ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)] shadow-[var(--shadow)]"
      : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
  }`;
}

export function Sidebar({ className = "", drawer = false, pinned = false, onTogglePinned }: SidebarProps = {}) {
  const { t } = useT();
  const { settings } = useSettings();
  const panelClass = drawer
    ? "border-r border-[var(--border)] bg-[var(--surface-1)] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    : settings.glassStyle
      ? "glass"
      : "border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow)]";
  const iconClass = "inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]";
  const visibilityClass = drawer ? "flex" : "hidden md:flex";

  return (
    <aside className={`relative z-[100] w-56 flex-col p-3 ${visibilityClass} ${panelClass} ${className}`}>
      <div className="flex items-center justify-between px-3 pb-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("nav.navigation")}</p>
        {drawer ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            onClick={onTogglePinned}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin navigation drawer" : "Pin navigation drawer"}
            title={pinned ? "Unpin drawer" : "Pin drawer"}
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
      </div>
      <nav className="space-y-1.5">
        <NavLink to="/dashboard" end className={({ isActive }) => navItemClass(isActive)}>
          <span className={iconClass}>
            D
          </span>
          {t("nav.dashboard")}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
          <span className={iconClass}>
            S
          </span>
          {t("nav.settings")}
        </NavLink>
      </nav>
    </aside>
  );
}
