import { useEffect, useRef, useState, type PropsWithChildren } from "react";
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

type NavDrawerProps = {
  visible: boolean;
  pinned: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTogglePinned: () => void;
};

function NavDrawer({ visible, pinned, onMouseEnter, onMouseLeave, onTogglePinned }: NavDrawerProps) {
  return (
    <div
      className={`absolute bottom-0 left-0 top-12 z-50 w-56 transition-[transform,opacity] duration-200 ease-out ${
        visible ? "translate-x-0 opacity-100 pointer-events-auto visible" : "-translate-x-full opacity-95 pointer-events-none invisible"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-hidden={!visible}
    >
      <Sidebar
        drawer
        pinned={pinned}
        onTogglePinned={onTogglePinned}
        className="h-full w-full rounded-none rounded-r-2xl border-l-0"
      />
    </div>
  );
}

export function AppFrame({ notice, onDismissNotice, children }: AppFrameProps) {
  const { t } = useT();
  const { settings } = useSettings();
  const location = useLocation();
  const isProjectView = location.pathname.startsWith("/project/");
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isNavPinned, setIsNavPinned] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const isNavVisible = isNavOpen || isNavPinned;

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openNav = () => {
    clearCloseTimer();
    setIsNavOpen(true);
  };

  const scheduleNavClose = () => {
    clearCloseTimer();
    if (isNavPinned) {
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      setIsNavOpen(false);
      closeTimerRef.current = null;
    }, 200);
  };

  const togglePinned = () => {
    setIsNavPinned((current) => {
      const next = !current;
      if (next) {
        clearCloseTimer();
        setIsNavOpen(true);
      }
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        clearCloseTimer();
        if (isNavVisible) {
          setIsNavPinned(false);
          setIsNavOpen(false);
        } else {
          setIsNavOpen(true);
        }
        return;
      }

      if (event.key === "Escape" && isNavVisible && !isNavPinned) {
        clearCloseTimer();
        setIsNavOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isNavPinned, isNavVisible]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  const panelClass = settings.glassStyle && isProjectView
    ? "border border-[var(--glass-border)] bg-transparent"
    : "border border-[var(--border)] bg-[var(--surface-1)]";
  const panelStrongClass = "border border-[var(--border)] bg-[var(--surface-2)]";

  return (
    <div className="app-scene relative flex h-screen w-screen flex-col overflow-hidden text-[var(--text)]">
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
        className="absolute bottom-0 left-0 top-12 z-[60] w-3"
        onMouseEnter={openNav}
        onMouseLeave={scheduleNavClose}
        aria-hidden
      />
      <NavDrawer
        visible={isNavVisible}
        pinned={isNavPinned}
        onMouseEnter={openNav}
        onMouseLeave={scheduleNavClose}
        onTogglePinned={togglePinned}
      />

      <div
        className={isProjectView
          ? "flex h-full w-full flex-1 overflow-hidden p-0"
          : "mx-auto flex h-full w-full max-w-[1680px] flex-1 gap-4 overflow-hidden p-4"}
      >
        {!isProjectView ? <div className="hidden w-56 shrink-0 md:block" aria-hidden /> : null}
        <main
          className={isProjectView
            ? `flex min-h-0 flex-1 overflow-hidden rounded-none p-0 ${panelClass}`
            : `flex min-h-0 flex-1 overflow-hidden rounded-2xl p-4 ${panelClass}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
