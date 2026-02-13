import { useEffect, useState } from "react";
import { desktopApi } from "@/api/desktopApi";
import { Chip } from "@/components/ui";

type TitleBarProps = {
  appTitle: string;
  projectLabel: string;
  envLabel: string;
  serviceLabel: string;
  serviceOnline: boolean;
};

export function TitleBar({ appTitle, projectLabel, envLabel, serviceLabel, serviceOnline }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const canControlWindow = typeof window !== "undefined" && Boolean(window.volumiaWindow);

  useEffect(() => {
    if (!canControlWindow) {
      setIsMaximized(false);
      return;
    }

    let mounted = true;

    const syncWindowState = async () => {
      try {
        const maximized = await desktopApi.windowIsMaximized();
        if (mounted) {
          setIsMaximized(maximized);
        }
      } catch {
        // ignore bridge availability errors while bootstrapping
      }
    };

    void syncWindowState();

    const onWindowChange = () => {
      void syncWindowState();
    };

    window.addEventListener("resize", onWindowChange);
    window.addEventListener("focus", onWindowChange);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("focus", onWindowChange);
    };
  }, [canControlWindow]);

  return (
    <div className="titleBar">
      <div className="titleBarLeft">
        <img src="/assets/logo.svg" alt="VOLUMIA" className="titleBarLogo" />
        <div className="titleBarMeta">
          <strong>{appTitle}</strong>
          <span>{projectLabel}</span>
        </div>
      </div>

      <div className="titleBarRight">
        <div className="titleBarChips titleBarNoDrag">
          <Chip className="envChip">{envLabel}</Chip>
          <Chip active={serviceOnline}>{serviceLabel}</Chip>
        </div>

        <div className="titleBarWindowControls titleBarNoDrag">
          <button
            type="button"
            className="titleBarWindowButton"
            aria-label="Minimize window"
            disabled={!canControlWindow}
            onClick={async () => {
              try {
                await desktopApi.windowMinimize();
              } catch {
                // ignore if bridge is unavailable in web-only contexts
              }
            }}
          >
            <span className="titleBarIcon minimize" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="titleBarWindowButton"
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            disabled={!canControlWindow}
            onClick={async () => {
              try {
                const maximized = await desktopApi.windowToggleMaximize();
                setIsMaximized(maximized);
              } catch {
                // ignore if bridge is unavailable in web-only contexts
              }
            }}
          >
            <span className={isMaximized ? "titleBarIcon maximizeRestore" : "titleBarIcon maximize"} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="titleBarWindowButton close"
            aria-label="Close window"
            disabled={!canControlWindow}
            onClick={async () => {
              try {
                await desktopApi.windowClose();
              } catch {
                // ignore if bridge is unavailable in web-only contexts
              }
            }}
          >
            <span className="titleBarIcon close" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
