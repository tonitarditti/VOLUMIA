import { type PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/ui/primitives";
import { LeftNav, TopBar } from "@/ui/shell";

type AppFrameProps = PropsWithChildren<{
  notice: string | null;
  onDismissNotice: () => void;
}>;

function getFrameMeta(pathname: string) {
  if (pathname === "/settings") {
    return {
      eyebrow: "Control",
      title: "Settings",
      breadcrumb: ["Workspace", "Settings"],
    };
  }

  return {
    eyebrow: "Overview",
    title: "Dashboard",
    breadcrumb: ["Workspace", "Projects"],
  };
}

export function AppFrame({ notice, onDismissNotice, children }: AppFrameProps) {
  const location = useLocation();
  const meta = getFrameMeta(location.pathname);

  return (
    <div className="app-scene flex h-screen w-screen overflow-hidden text-[var(--text)]">
      <LeftNav
        sections={[
          {
            id: "primary",
            items: [
              { id: "dashboard", label: "Projects", shortLabel: "P", href: "/dashboard" },
              { id: "settings", label: "Settings", shortLabel: "S", href: "/settings" },
            ],
          },
        ]}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar eyebrow={meta.eyebrow} title={meta.title} breadcrumb={meta.breadcrumb} />

        {notice ? (
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--text-muted)]">{notice}</span>
              <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={onDismissNotice}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-hidden bg-[var(--bg)]">
          {children}
        </main>
      </div>
    </div>
  );
}
