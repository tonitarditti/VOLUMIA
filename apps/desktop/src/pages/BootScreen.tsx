import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasDesktopBridge } from "@/electron/desktopApi";
import { comfyuiService } from "@/services/comfyui";

export function BootScreen() {
  const navigate = useNavigate();
  const [detail, setDetail] = useState("Waiting for ComfyUI readiness...");
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const completeBoot = () => {
      if (!active) {
        return;
      }
      navigate("/dashboard", { replace: true });
    };

    if (!hasDesktopBridge()) {
      const timer = window.setTimeout(completeBoot, 900);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    void (async () => {
      try {
        setDetail("Starting ComfyUI engine...");
        setBootError(null);
        const ready = await comfyuiService.ensureReady();
        if (!active) {
          return;
        }
        setDetail(ready.details ?? "Waiting for ComfyUI readiness...");
        if (ready.ready) {
          completeBoot();
          return;
        }
        setBootError(ready.details ?? "ComfyUI did not become ready.");
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to start ComfyUI.";
        setDetail(message);
        setBootError(message);
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-1)] px-6 text-[var(--text)]">
      <div className="w-full max-w-lg rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] px-8 py-10 shadow-[var(--shadow)]">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Boot</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[0.02em]">Initializing AI Engine...</h1>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
        <p className="mt-4 text-sm text-[var(--text-muted)]">{detail}</p>
        {bootError ? <p className="mt-3 text-sm text-[var(--danger)]">{bootError}</p> : null}
      </div>
    </div>
  );
}
