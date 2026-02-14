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
        ? "bg-[var(--surface-2)] text-[var(--text)]"
        : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    }`;

  return (
    <header className="drag-region flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">{t("topbar.brand")}</div>
        <div className="h-4 w-px bg-[var(--border)]" />
        <h1 className="truncate text-sm font-medium tracking-[0.08em] text-[var(--text)]">{pageTitle}</h1>
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
          aria-label={t("topbar.minimize")}
          title={t("topbar.minimize")}
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
          aria-label={t("topbar.maximize")}
          title={t("topbar.maximize")}
        >
          <span className="text-sm">[]</span>
        </IconButton>
        <IconButton
          type="button"
          className="hover:border-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--surface-1)]"
          onClick={() => {
            if (canUseDesktopBridge) {
              void desktopApi.closeWindow();
            }
          }}
          aria-label={t("topbar.close")}
          title={t("topbar.close")}
        >
          <span className="text-sm">x</span>
        </IconButton>
      </div>
    </header>
  );
}
