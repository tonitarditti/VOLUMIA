import { NavLink } from "react-router-dom";
import { useT } from "@/volumia/i18n/useT";

function navItemClass(isActive: boolean) {
  return `group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition duration-200 ${
    isActive
      ? "border-volume-accent/45 bg-volume-panelAlt text-volume-text shadow-panel"
      : "border-transparent text-volume-muted hover:border-volume-stroke hover:bg-volume-panelAlt/65 hover:text-volume-text"
  }`;
}

export function Sidebar() {
  const { t } = useT();

  return (
    <aside className="hidden w-56 flex-col rounded-2xl border border-volume-stroke/90 bg-volume-panel p-3 shadow-panel md:flex">
      <p className="px-3 pb-2 text-[11px] uppercase tracking-[0.2em] text-volume-muted">{t("nav.navigation")}</p>
      <nav className="space-y-1.5">
        <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-volume-stroke/90 bg-volume-panelAlt text-[10px] text-volume-muted">
            D
          </span>
          {t("nav.dashboard")}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-volume-stroke/90 bg-volume-panelAlt text-[10px] text-volume-muted">
            S
          </span>
          {t("nav.settings")}
        </NavLink>
      </nav>
    </aside>
  );
}
