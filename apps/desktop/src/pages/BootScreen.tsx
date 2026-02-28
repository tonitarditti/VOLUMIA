import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";

const READY_STATE = "READY";
const BOOT_FALLBACK_MS = 3200;
const STATUS_POLL_MS = 800;

export function BootScreen() {
  const navigate = useNavigate();
  const [detail, setDetail] = useState("Waiting for ComfyUI readiness...");

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

    const fallbackTimer = window.setTimeout(() => {
      setDetail("Using temporary readiness fallback.");
      completeBoot();
    }, BOOT_FALLBACK_MS);

    const checkReadiness = async () => {
      try {
        const status = await desktopApi.getComfyStatus();
        if (!active) {
          return;
        }
        setDetail(status.message || `ComfyUI ${status.state.toLowerCase()}.`);
        if (status.state === READY_STATE) {
          window.clearTimeout(fallbackTimer);
          completeBoot();
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setDetail(error instanceof Error ? error.message : "Unable to read ComfyUI status.");
      }
    };

    void checkReadiness();
    const pollTimer = window.setInterval(() => {
      void checkReadiness();
    }, STATUS_POLL_MS);

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      window.clearInterval(pollTimer);
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
      </div>
    </div>
  );
}
