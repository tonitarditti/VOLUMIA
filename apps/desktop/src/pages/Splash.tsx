import { useEffect, useState } from "react";
import { BrandLogo, LoadingDots } from "@/components/branding";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";

export type SplashProps = {
  onComplete: () => void;
};

export function Splash({ onComplete }: SplashProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [status, setStatus] = useState("Inicializando VOLUMIA");

  useEffect(() => {
    let active = true;
    let exitTimer: number | undefined;

    const finish = () => {
      if (!active) return;
      setStatus("Preparando interfaz");
      setIsExiting(true);
      // This timer is only the brief opacity transition. Readiness itself is
      // determined by the desktop backend check below.
      exitTimer = window.setTimeout(onComplete, 180);
    };

    if (!hasDesktopBridge()) {
      finish();
    } else {
      void (async () => {
        setStatus("Comprobando motor local");
        try {
          await desktopApi.getBackendStatus();
        } catch {
          // The normal application shell can still provide a recoverable
          // settings path when the local engine is unavailable.
          if (active) setStatus("Motor local no disponible");
        }
        finish();
      })();
    }

    return () => {
      active = false;
      if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    };
  }, [onComplete]);

  return (
    <main
      className={`fixed inset-0 z-50 grid place-items-center bg-[var(--bg)] px-6 transition-opacity duration-200 ${isExiting ? "pointer-events-none opacity-0" : "opacity-100"}`}
      aria-label="Inicializando VOLUMIA"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <BrandLogo size={132} showText={false} label="VOLUMIA" />
        <h1
          className="mt-8 text-3xl font-medium tracking-[0.18em] text-[var(--text)]"
          style={{ fontFamily: '"Aptos Display", Aptos, Inter, sans-serif' }}
        >
          VOLUMIA
        </h1>
        <p className="mt-3 text-sm tracking-[0.04em] text-[var(--text-muted)]">
          Your Creative 3D Assistant
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <LoadingDots size={6} color="var(--volumia-primary)" />
          <p className="text-xs text-[var(--text-muted)]">{status}</p>
        </div>
      </div>
    </main>
  );
}
