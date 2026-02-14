import type { PropsWithChildren } from "react";
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      {notice ? (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
          <div className="flex w-full items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-muted)]">{notice}</span>
            <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={onDismissNotice}>
              {t("common.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex h-full w-full flex-1 gap-4 overflow-hidden p-0">
        <Sidebar />
        <main className="flex min-h-0 flex-1 overflow-hidden bg-[var(--surface-1)]">
          {children}
        </main>
      </div>
    </div>
  );
}
