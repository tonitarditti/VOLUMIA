import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { desktopApi } from "@/electron/desktopApi";
import { IconButton } from "@/ui/IconButton";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";

export function TopBar() {
  const { t } = useT();
  const { settings } = useSettings();
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
        ? settings.glassStyle
          ? "bg-[var(--glass-bg-strong)] text-[var(--text)]"
          : "bg-[var(--surface-2)] text-[var(--text)]"
        : settings.glassStyle
          ? "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    }`;
  const headerClass = settings.glassStyle
    ? "drag-region relative z-[100] flex h-12 items-center justify-between border-x-0 border-t-0 px-4 glass glass-strong rounded-none"
    : "drag-region relative z-[100] flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-4";
  const dividerClass = settings.glassStyle ? "h-4 w-px bg-[var(--glass-border)]" : "h-4 w-px bg-[var(--border)]";

  return (
    <header className={headerClass}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">{t("topbar.brand")}</div>
        <div className={dividerClass} />
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
