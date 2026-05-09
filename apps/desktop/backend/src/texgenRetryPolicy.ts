import type {
  TextureStageStatus,
  TexgenAttemptTimings,
  TexgenPreset,
} from "./texgenTypes";

const DEFAULT_ATTEMPT_TIMINGS: Record<TexgenPreset, TexgenAttemptTimings> = {
  high: {
    hardTimeoutMs: 8 * 60 * 1000,
    stallTimeoutMs: 120 * 1000,
    stallGraceMs: 45 * 1000,
    outputGraceMs: 30 * 1000,
  },
  balanced: {
    hardTimeoutMs: 5 * 60 * 1000,
    stallTimeoutMs: 90 * 1000,
    stallGraceMs: 35 * 1000,
    outputGraceMs: 20 * 1000,
  },
  fast: {
    hardTimeoutMs: 3 * 60 * 1000,
    stallTimeoutMs: 60 * 1000,
    stallGraceMs: 25 * 1000,
    outputGraceMs: 15 * 1000,
  },
};

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim() ?? "";
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveAttemptTimings(preset: TexgenPreset): TexgenAttemptTimings {
  const fallback = DEFAULT_ATTEMPT_TIMINGS[preset];
  const envPrefix = `VOLUMIA_TEXGEN_${preset.toUpperCase()}`;
  return {
    hardTimeoutMs: parsePositiveIntEnv(
      `${envPrefix}_TIMEOUT_MS`,
      parsePositiveIntEnv("VOLUMIA_TEXGEN_TIMEOUT_MS", fallback.hardTimeoutMs),
    ),
    stallTimeoutMs: parsePositiveIntEnv(
      `${envPrefix}_STALL_TIMEOUT_MS`,
      fallback.stallTimeoutMs,
    ),
    stallGraceMs: parsePositiveIntEnv(
      `${envPrefix}_STALL_GRACE_MS`,
      fallback.stallGraceMs,
    ),
    outputGraceMs: parsePositiveIntEnv(
      `${envPrefix}_OUTPUT_GRACE_MS`,
      fallback.outputGraceMs,
    ),
  };
}

export function buildTexgenAttemptPlan(
  requestedPreset: TexgenPreset,
): Array<{ preset: TexgenPreset; timings: TexgenAttemptTimings }> {
  const sequence: TexgenPreset[] =
    requestedPreset === "high"
      ? ["high", "balanced", "fast"]
      : requestedPreset === "balanced"
        ? ["balanced", "fast"]
        : ["fast"];
  return sequence.map((preset) => ({
    preset,
    timings: resolveAttemptTimings(preset),
  }));
}

export function isProbablyResourcePressure(text: string) {
  const haystack = text.toLowerCase();
  return [
    "out of memory",
    "cuda out of memory",
    "cublas",
    "allocation",
    "insufficient memory",
    "memoryerror",
    "oom",
    "device-side assert",
  ].some((needle) => haystack.includes(needle));
}

export function shouldRetryTexgenFailure(
  status: TextureStageStatus,
  context: {
    attemptIndex: number;
    totalAttempts: number;
    reason: string;
    stdout: string;
    stderr: string;
  },
) {
  if (context.attemptIndex >= context.totalAttempts - 1) {
    return false;
  }

  if (status === "timed_out" || status === "stalled") {
    return true;
  }

  if (status === "runtime_error" || status === "no_output_generated") {
    const combined = [context.reason, context.stdout, context.stderr].join("\n");
    return isProbablyResourcePressure(combined);
  }

  return false;
}
