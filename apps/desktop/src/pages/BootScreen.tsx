import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  BackendStatusResponse,
  ComfyStatusResponse,
} from "@/electron/channels";
import { SplashLogo } from "@/components/branding";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { useSettings } from "@/volumia/settings/context";

type StartupStage =
  | "initializing_shell"
  | "loading_workspace"
  | "launching_comfyui"
  | "connecting_local_engine"
  | "loading_nodes_and_models"
  | "verifying_engine_ready"
  | "finalizing_ui"
  | "ready";

type StageSpec = {
  min: number;
  max: number;
  label: string;
};

const STARTUP_STAGE_ORDER: StartupStage[] = [
  "initializing_shell",
  "loading_workspace",
  "launching_comfyui",
  "connecting_local_engine",
  "loading_nodes_and_models",
  "verifying_engine_ready",
  "finalizing_ui",
  "ready",
];

const STARTUP_STAGE_SPEC: Record<StartupStage, StageSpec> = {
  initializing_shell: {
    min: 0,
    max: 15,
    label: "Initializing shell runtime",
  },
  loading_workspace: {
    min: 15,
    max: 28,
    label: "Loading workspace context",
  },
  launching_comfyui: {
    min: 28,
    max: 42,
    label: "Launching ComfyUI process",
  },
  connecting_local_engine: {
    min: 42,
    max: 55,
    label: "Connecting local AI engine",
  },
  loading_nodes_and_models: {
    min: 55,
    max: 75,
    label: "Loading nodes and model registry",
  },
  verifying_engine_ready: {
    min: 75,
    max: 88,
    label: "Verifying engine readiness",
  },
  finalizing_ui: {
    min: 88,
    max: 97,
    label: "Finalizing interactive UI",
  },
  ready: {
    min: 100,
    max: 100,
    label: "Ready",
  },
};

type BootState = {
  stage: StartupStage;
  actualProgress: number;
  detail: string;
  error: string | null;
};

const INITIAL_BOOT_STATE: BootState = {
  stage: "initializing_shell",
  actualProgress: 0,
  detail: "Preparing runtime shell...",
  error: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stageProgress(stage: StartupStage, ratio: number) {
  const spec = STARTUP_STAGE_SPEC[stage];
  const boundedRatio = clamp(ratio, 0, 1);
  return spec.min + (spec.max - spec.min) * boundedRatio;
}

function nextBootState(
  prev: BootState,
  update: {
    stage: StartupStage;
    ratio: number;
    detail?: string;
  },
) {
  const target =
    update.stage === "ready" ? 100 : stageProgress(update.stage, update.ratio);
  return {
    stage: update.stage,
    actualProgress: Math.max(prev.actualProgress, target),
    detail: update.detail ?? prev.detail,
    error: null,
  };
}

function describeComfyStatus(status: ComfyStatusResponse) {
  const stateToken = status.state.toLowerCase();
  if (status.running) {
    return `Engine online at ${status.url}`;
  }
  return status.message || `ComfyUI ${stateToken}.`;
}

function summarizeNodeAndModelStage(backend: BackendStatusResponse) {
  const workflowPart = backend.workflows.activeName
    ? `Workflow ${backend.workflows.activeName}`
    : "Resolving workflow graph";
  const modelPart = backend.models.message || "Scanning model registry";
  return `${workflowPart} - ${modelPart}`;
}

export function BootScreen() {
  const { resolvedTheme } = useSettings();
  const navigate = useNavigate();
  const [boot, setBoot] = useState<BootState>(INITIAL_BOOT_STATE);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const displayedProgressRef = useRef(0);
  const actualProgressRef = useRef(boot.actualProgress);

  const steps = useMemo(() => {
    const currentIndex = STARTUP_STAGE_ORDER.indexOf(boot.stage);
    return STARTUP_STAGE_ORDER.filter((stage) => stage !== "ready").map(
      (stage) => {
        const index = STARTUP_STAGE_ORDER.indexOf(stage);
        const isCurrent = index === currentIndex;
        const done = boot.stage === "ready" || index < currentIndex;
        const active = isCurrent && !boot.error;
        return {
          id: stage,
          text: STARTUP_STAGE_SPEC[stage].label,
          done,
          active,
          error: isCurrent && Boolean(boot.error),
        };
      },
    );
  }, [boot.error, boot.stage]);

  useEffect(() => {
    displayedProgressRef.current = displayedProgress;
  }, [displayedProgress]);

  useEffect(() => {
    actualProgressRef.current = boot.actualProgress;
  }, [boot.actualProgress]);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.max(8, now - lastTime);
      lastTime = now;

      setDisplayedProgress((current) => {
        const target = actualProgressRef.current;
        const delta = target - current;
        if (Math.abs(delta) < 0.02) {
          return target;
        }

        const dtFactor = dt / 16.67;
        const baseStep = Math.max(0.06, Math.abs(delta) * 0.18);
        const maxStep = 1.3 * dtFactor;
        const step = Math.min(Math.abs(delta), baseStep * dtFactor, maxStep);
        return current + Math.sign(delta) * step;
      });

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const applyStage = (
      stage: StartupStage,
      ratio: number,
      detail?: string,
    ) => {
      if (!active) {
        return;
      }
      setBoot((prev) => nextBootState(prev, { stage, ratio, detail }));
    };

    const applyError = (message: string, detail?: string) => {
      if (!active) {
        return;
      }
      setBoot((prev) => ({
        ...prev,
        detail: detail ?? prev.detail,
        error: message,
      }));
    };

    const waitForDisplayedAtLeast = async (target: number, timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (active && Date.now() < deadline) {
        if (displayedProgressRef.current >= target) {
          return;
        }
        await wait(16);
      }
    };

    const runBoot = async () => {
      try {
        applyStage("initializing_shell", 0.2, "Preparing shell runtime...");
        await wait(80);
        applyStage(
          "initializing_shell",
          0.85,
          "Shell initialized. Loading startup context...",
        );

        if (!hasDesktopBridge()) {
          applyStage(
            "loading_workspace",
            1,
            "Desktop bridge unavailable. Starting standalone workspace.",
          );
          applyStage("finalizing_ui", 1, "Finalizing standalone UI...");
          applyStage("ready", 1, "Workspace ready.");
          await waitForDisplayedAtLeast(99.5, 3_000);
          if (active) {
            navigate("/dashboard", { replace: true });
          }
          return;
        }

        applyStage("loading_workspace", 0.15, "Reading backend status...");
        const initialBackend = await desktopApi.getBackendStatus();
        if (!active) {
          return;
        }
        applyStage(
          "loading_workspace",
          1,
          initialBackend.workflows.activeName
            ? `Workspace loaded - ${initialBackend.workflows.activeName}`
            : initialBackend.workflows.error
              ? initialBackend.workflows.error
              : "Workspace shell loaded.",
        );

        let comfy = await desktopApi.getComfyStatus();
        if (!active) {
          return;
        }

        applyStage("launching_comfyui", 0.1, describeComfyStatus(comfy));
        if (!comfy.running && comfy.state !== "STARTING") {
          comfy = await desktopApi.startComfy();
          if (!active) {
            return;
          }
        }

        const launchStart = Date.now();
        while (
          active &&
          !comfy.running &&
          comfy.state !== "STARTING" &&
          Date.now() - launchStart < 15_000
        ) {
          const ratio = clamp((Date.now() - launchStart) / 12_000, 0.12, 0.94);
          applyStage("launching_comfyui", ratio, describeComfyStatus(comfy));
          await wait(700);
          comfy = await desktopApi.getComfyStatus();
        }
        applyStage("launching_comfyui", 1, describeComfyStatus(comfy));

        const connectStart = Date.now();
        while (active) {
          comfy = await desktopApi.getComfyStatus();
          if (comfy.running) {
            applyStage(
              "connecting_local_engine",
              1,
              `Connected to local engine at ${comfy.url}`,
            );
            break;
          }
          if (comfy.state === "ERROR") {
            throw new Error(comfy.lastError ?? comfy.message);
          }
          const ratio = clamp((Date.now() - connectStart) / 32_000, 0.08, 0.94);
          applyStage(
            "connecting_local_engine",
            ratio,
            describeComfyStatus(comfy),
          );
          if (Date.now() - connectStart > Math.max(45_000, comfy.config.startupTimeoutMs + 10_000)) {
            throw new Error(
              comfy.lastError ??
                "Timed out while connecting to local ComfyUI engine.",
            );
          }
          await wait(700);
        }

        const nodesStart = Date.now();
        while (active) {
          const [backend, comfyStatus] = await Promise.all([
            desktopApi.getBackendStatus(),
            desktopApi.getComfyStatus(),
          ]);

          if (comfyStatus.state === "ERROR") {
            throw new Error(comfyStatus.lastError ?? comfyStatus.message);
          }

          const workflowSettled =
            Boolean(backend.workflows.activeName) ||
            Boolean(backend.workflows.lastSyncAt) ||
            Boolean(backend.workflows.error);
          const modelsSettled =
            backend.models.ok ||
            backend.models.totalFiles > 0 ||
            Boolean(backend.models.error);
          const settled = workflowSettled && modelsSettled;

          if (settled) {
            applyStage(
              "loading_nodes_and_models",
              1,
              summarizeNodeAndModelStage(backend),
            );
            break;
          }

          const ratio = clamp((Date.now() - nodesStart) / 30_000, 0.06, 0.94);
          applyStage(
            "loading_nodes_and_models",
            ratio,
            summarizeNodeAndModelStage(backend),
          );

          if (Date.now() - nodesStart > 45_000) {
            applyStage(
              "loading_nodes_and_models",
              0.94,
              `${summarizeNodeAndModelStage(backend)} - continuing with current availability`,
            );
            break;
          }

          await wait(850);
        }

        const verifyStart = Date.now();
        while (active) {
          const [backend, comfyStatus] = await Promise.all([
            desktopApi.getBackendStatus(),
            desktopApi.getComfyStatus(),
          ]);

          if (comfyStatus.state === "ERROR" || backend.comfy.state === "error") {
            throw new Error(
              backend.comfy.lastError ??
                comfyStatus.lastError ??
                comfyStatus.message,
            );
          }

          const engineReady =
            comfyStatus.running &&
            backend.comfy.running &&
            backend.comfy.healthy;

          if (engineReady) {
            applyStage(
              "verifying_engine_ready",
              1,
              "Engine ready and health checks passed.",
            );
            break;
          }

          const ratio = clamp((Date.now() - verifyStart) / 20_000, 0.08, 0.94);
          applyStage(
            "verifying_engine_ready",
            ratio,
            comfyStatus.message || backend.comfy.message,
          );

          if (Date.now() - verifyStart > 30_000) {
            throw new Error(
              backend.comfy.lastError ??
                comfyStatus.lastError ??
                "Engine verification timed out.",
            );
          }

          await wait(700);
        }

        applyStage("finalizing_ui", 0.2, "Finalizing interface state...");
        await wait(80);
        applyStage("finalizing_ui", 0.7, "Preparing interactive workspace...");
        await wait(90);
        applyStage("finalizing_ui", 1, "UI finalized.");

        applyStage("ready", 1, "Workspace ready.");
        await waitForDisplayedAtLeast(99.5, 6_000);

        if (active) {
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Startup sequence failed unexpectedly.";
        applyError(message, `Startup halted: ${message}`);
      }
    };

    void runBoot();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 text-[var(--text)]">
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "var(--boot-glow)" }}
      />
      <div className="relative flex w-full max-w-xl flex-col items-center gap-10 rounded-[32px] border border-[var(--border)] bg-[var(--surface-2)] px-10 py-14 shadow-[var(--shadow-panel)]">
        <SplashLogo
          size={72}
          variant={resolvedTheme === "dark" ? "dark" : "light"}
          glow
        />

        <div className="w-full max-w-[360px] space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3">
              <div className="grid h-4 w-4 place-items-center">
                {step.error ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
                ) : step.done ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
                ) : (
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${step.active ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                  />
                )}
              </div>
              <p
                className={`text-[13px] ${step.error ? "text-[var(--danger)]" : step.active ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}
              >
                {step.text}
              </p>
            </div>
          ))}
        </div>

        <div className="w-full max-w-[360px]">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
              style={{ width: `${clamp(displayedProgress, 0, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
            <span>
              {boot.error
                ? `error - ${STARTUP_STAGE_SPEC[boot.stage].label}`
                : STARTUP_STAGE_SPEC[boot.stage].label}
            </span>
            <span>{Math.floor(clamp(displayedProgress, 0, 100))}%</span>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">
            {boot.detail}
          </p>
          {boot.error ? (
            <p className="mt-3 text-[12px] leading-5 text-[var(--danger)]">
              Startup stopped. Open diagnostics from Dashboard once engine is
              reachable.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
