import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { desktopApi } from "@/electron/desktopApi";
import { IconButton } from "@/ui/IconButton";
import { useT } from "@/volumia/i18n/useT";

export function TopBar() {
  const { t } = useT();
  const canUseDesktopBridge = typeof window !== "undefined" && Boolean(window.volumia);
  const location = useLocation();
  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith("/project/")) return t("topbar.projectWorkspace");
    if (location.pathname === "/settings") return t("topbar.settings");
    return t("topbar.dashboard");
  }, [location.pathname, t]);

  const compactNavClass = (isActive: boolean) =>
    `no-drag rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.14em] transition ${
      isActive
        ? "bg-volume-panelAlt text-volume-text"
        : "text-volume-muted hover:bg-volume-panelAlt/70 hover:text-volume-text"
    }`;

  return (
    <header className="drag-region flex h-12 items-center justify-between border-b border-volume-stroke/90 bg-volume-panel px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-volume-accent">{t("topbar.brand")}</div>
        <div className="h-4 w-px bg-volume-stroke" />
        <h1 className="truncate text-sm font-medium tracking-[0.08em] text-volume-text">{pageTitle}</h1>
        <nav className="ml-1 flex items-center gap-1 md:hidden">
          <NavLink to="/" end className={({ isActive }) => compactNavClass(isActive)}>
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => compactNavClass(isActive)}>
            {t("nav.settings")}
          </NavLink>
        </nav>
      </div>

      <div className="no-drag flex items-center gap-1">
        <IconButton
          type="button"
          onClick={() => {
            if (canUseDesktopBridge) {
              void desktopApi.minimizeWindow();
            }
          }}
          aria-label="Minimize"
          title="Minimize"
        >
          <span className="text-lg leading-none">-</span>
        </IconButton>
        <IconButton
          type="button"
          onClick={() => {
            if (canUseDesktopBridge) {
              void desktopApi.toggleMaximizeWindow();
            }
          }}
          aria-label="Toggle maximize"
          title="Maximize"
        >
          <span className="text-sm">[]</span>
        </IconButton>
        <IconButton
          type="button"
          className="hover:border-rose-500/60 hover:bg-rose-500/20 hover:text-rose-100"
          onClick={() => {
            if (canUseDesktopBridge) {
              void desktopApi.closeWindow();
            }
          }}
          aria-label="Close"
          title="Close"
        >
          <span className="text-sm">x</span>
        </IconButton>
      </div>
    </header>
  );
}
