import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasDesktopBridge } from "@/electron/desktopApi";
import { comfyuiService } from "@/services/comfyui";
import { BrandMark } from "@/ui/shell";

function bootSteps(detail: string, bootError: string | null) {
  return [
    { text: "Initializing AI engine", done: true },
    { text: "Loading workspace shell", done: !bootError },
    { text: detail, done: !bootError, active: !bootError },
    { text: bootError ?? "Awaiting ready signal", done: false, error: Boolean(bootError) },
  ];
}

export function BootScreen() {
  const navigate = useNavigate();
  const [detail, setDetail] = useState("Waiting for ComfyUI readiness...");
  const [bootError, setBootError] = useState<string | null>(null);
  const [progress, setProgress] = useState(18);
  const steps = useMemo(() => bootSteps(detail, bootError), [bootError, detail]);

  useEffect(() => {
    let active = true;

    const completeBoot = () => {
      if (!active) {
        return;
      }
      navigate("/dashboard", { replace: true });
    };

    if (!hasDesktopBridge()) {
      setProgress(100);
      const timer = window.setTimeout(completeBoot, 900);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    void (async () => {
      try {
        setDetail("Starting ComfyUI engine...");
        setProgress(42);
        setBootError(null);
        const ready = await comfyuiService.ensureReady();
        if (!active) {
          return;
        }
        setDetail(ready.details ?? "Waiting for ComfyUI readiness...");
        if (ready.ready) {
          setProgress(100);
          window.setTimeout(completeBoot, 250);
          return;
        }
        setProgress(72);
        setBootError(ready.details ?? "ComfyUI did not become ready.");
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to start ComfyUI.";
        setDetail(message);
        setProgress(72);
        setBootError(message);
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 text-[var(--text)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(154,110,58,0.12),transparent_30%)]" />
      <div className="relative flex w-full max-w-xl flex-col items-center gap-10 rounded-[32px] border border-[var(--border)] bg-[var(--surface-2)] px-10 py-14 shadow-[var(--shadow-panel)]">
        <div className="flex flex-col items-center gap-5 text-center">
          <BrandMark size={72} />
          <div>
            <h1 className="text-[26px] font-light tracking-[0.28em] text-[var(--text)]">VOLUMIA</h1>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              3D Architectural Intelligence
            </p>
          </div>
        </div>

        <div className="w-full max-w-[340px] space-y-4">
          {steps.map((step, index) => (
            <div key={`${step.text}-${index}`} className="flex items-center gap-3">
              <div className="grid h-4 w-4 place-items-center">
                {step.error ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
                ) : step.done ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
                ) : (
                  <div className={`h-2.5 w-2.5 rounded-full ${step.active ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                )}
              </div>
              <p className={`text-sm ${step.error ? "text-[var(--danger)]" : step.active ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                {step.text}
              </p>
            </div>
          ))}
        </div>

        <div className="w-full max-w-[340px]">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
            <span>{bootError ? "Attention" : progress >= 100 ? "Ready" : "Loading"}</span>
            <span>{Math.floor(progress)}%</span>
          </div>
          {bootError ? <p className="mt-4 text-sm text-[var(--text-muted)]">Retry from Dashboard via Advanced / Engine after the app loads.</p> : null}
        </div>
      </div>
    </div>
  );
}
