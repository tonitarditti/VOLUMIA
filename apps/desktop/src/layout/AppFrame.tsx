import type { PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type AppFrameProps = PropsWithChildren<{
  notice: string | null;
  onDismissNotice: () => void;
}>;

export function AppFrame({ notice, onDismissNotice, children }: AppFrameProps) {
  const { t } = useT();
  const location = useLocation();
  const isProjectView = location.pathname.startsWith("/project/");

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      {notice ? (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
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
            ? "flex min-h-0 flex-1 overflow-hidden rounded-l-2xl rounded-r-none border border-[var(--border)] bg-[var(--surface-1)] p-0"
            : "flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4"}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
