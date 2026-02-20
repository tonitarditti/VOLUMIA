import type { PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type AppFrameProps = PropsWithChildren<{
  notice: string | null;
  onDismissNotice: () => void;
}>;

export function AppFrame({ notice, onDismissNotice, children }: AppFrameProps) {
  const { t } = useT();
  const { settings } = useSettings();
  const location = useLocation();
  const isProjectView = location.pathname.startsWith("/project/");
  const panelClass = settings.glassStyle && isProjectView
    ? "border border-[var(--glass-border)] bg-transparent"
    : "border border-[var(--border)] bg-[var(--surface-1)]";
  const panelStrongClass = "border border-[var(--border)] bg-[var(--surface-2)]";

  return (
    <div className="app-scene flex h-screen w-screen flex-col overflow-hidden text-[var(--text)]">
      <TopBar />
      {notice ? (
        <div className={`${panelStrongClass} border-x-0 border-t-0 px-4 py-2`}>
          <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-muted)]">{notice}</span>
            <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={onDismissNotice}>
              {t("common.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={isProjectView
          ? "flex h-full w-full flex-1 gap-4 overflow-hidden py-4 pl-4 pr-0"
          : "mx-auto flex h-full w-full max-w-[1680px] flex-1 gap-4 overflow-hidden p-4"}
      >
        <Sidebar />
        <main
          className={isProjectView
            ? `flex min-h-0 flex-1 overflow-hidden rounded-l-2xl rounded-r-none p-0 ${panelClass}`
            : `flex min-h-0 flex-1 overflow-hidden rounded-2xl p-4 ${panelClass}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
