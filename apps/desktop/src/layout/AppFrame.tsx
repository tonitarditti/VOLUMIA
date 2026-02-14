import type { PropsWithChildren } from "react";
import { Button } from "@/ui/Button";
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-volume-bg text-volume-text">
      <TopBar />
      {notice ? (
        <div className="border-b border-volume-stroke/90 bg-volume-panelAlt px-4 py-2">
          <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3 text-sm">
            <span className="text-volume-muted">{notice}</span>
            <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={onDismissNotice}>
              {t("common.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex h-full w-full max-w-[1680px] flex-1 gap-4 overflow-hidden p-4">
        <Sidebar />
        <main className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-volume-stroke/80 bg-volume-panel/40 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
