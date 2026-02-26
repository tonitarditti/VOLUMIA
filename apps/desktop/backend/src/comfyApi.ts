import { logger } from "./logger";

type RequestJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export type ComfyHealthResult = {
  ok: boolean;
  message: string;
};

export type QueuePromptResult = {
  promptId: string;
};

export type CompletionResult = {
  promptId: string;
  completed: boolean;
  history: unknown;
};

export type CheckpointReplacement = {
  nodeId: string;
  previous: string;
  next: string;
};

export type CheckpointSanitizationResult = {
  workflowJson: unknown;
  availableCheckpoints: string[];
  fallbackCheckpoint: string | null;
  replacements: CheckpointReplacement[];
};

const DEFAULT_CHECKPOINT_FALLBACK = "hunyuan_3d_v2.1.safetensors";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractCheckpointOptions(payload: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown, keyHint?: string) => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      if (
        keyHint === "ckpt_name" &&
        node.length > 0 &&
        Array.isArray(node[0]) &&
        (node[0] as unknown[]).every((item) => typeof item === "string")
      ) {
        for (const item of node[0] as string[]) {
          found.add(item);
        }
      } else if (keyHint === "ckpt_name" && node.every((item) => typeof item === "string")) {
        for (const item of node as string[]) {
          found.add(item);
        }
      }

      for (const item of node) {
        walk(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      walk(value, key);
    }
  };

  walk(payload);
  return Array.from(found);
}

function pickFallbackCheckpoint(availableCheckpoints: string[], preferred: string) {
  if (availableCheckpoints.includes(preferred)) {
    return preferred;
  }
  if (availableCheckpoints.length > 0) {
    return availableCheckpoints[0] ?? null;
  }
  return null;
}

function extractValidationError(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const directError = payload.error;
  if (typeof directError === "string") {
    const lower = directError.toLowerCase();
    if (lower.includes("prompt outputs failed validation") || lower.includes("prompt_outputs_failed_validation")) {
      return directError;
    }
  }

  if (isRecord(directError)) {
    const typeValue = String(directError.type ?? "").toLowerCase();
    const messageValue = String(directError.message ?? "").trim();
    if (typeValue.includes("prompt_outputs_failed_validation")) {
      return messageValue || "prompt_outputs_failed_validation";
    }
  }

  if (isRecord(payload.node_errors)) {
    const serializedNodeErrors = JSON.stringify(payload.node_errors);
    const lower = serializedNodeErrors.toLowerCase();
    if (lower.includes("prompt outputs failed validation") || lower.includes("prompt_outputs_failed_validation")) {
      return serializedNodeErrors;
    }
  }

  return null;
}

export function sanitizeCheckpointLoaders(
  workflowJson: unknown,
  availableCheckpoints: string[],
  preferredCheckpoint = DEFAULT_CHECKPOINT_FALLBACK
): CheckpointSanitizationResult {
  const normalizedAvailable = Array.from(
    new Set(availableCheckpoints.map((item) => item.trim()).filter((item) => item.length > 0))
  );
  const fallbackCheckpoint = pickFallbackCheckpoint(normalizedAvailable, preferredCheckpoint);
  const replacements: CheckpointReplacement[] = [];

  if (!isRecord(workflowJson) || !fallbackCheckpoint) {
    return {
      workflowJson,
      availableCheckpoints: normalizedAvailable,
      fallbackCheckpoint,
      replacements,
    };
  }

  const cloned = JSON.parse(JSON.stringify(workflowJson)) as Record<string, unknown>;
  for (const [nodeId, nodeValue] of Object.entries(cloned)) {
    if (!isRecord(nodeValue)) {
      continue;
    }
    if (nodeValue.class_type !== "CheckpointLoaderSimple") {
      continue;
    }
    const inputs = isRecord(nodeValue.inputs) ? nodeValue.inputs : {};
    const currentCheckpoint = typeof inputs.ckpt_name === "string" ? inputs.ckpt_name : "";
    if (normalizedAvailable.includes(currentCheckpoint)) {
      continue;
    }

    const nextCheckpoint = fallbackCheckpoint;
    inputs.ckpt_name = nextCheckpoint;
    nodeValue.inputs = inputs;
    replacements.push({
      nodeId,
      previous: currentCheckpoint || "<missing>",
      next: nextCheckpoint,
    });
  }

  return {
    workflowJson: cloned,
    availableCheckpoints: normalizedAvailable,
    fallbackCheckpoint,
    replacements,
  };
}

export class ComfyApi {
  constructor(private readonly baseUrl: string) {}

  private normalizeRoute(route: string) {
    if (route.startsWith("/")) {
      return route;
    }
    return `/${route}`;
  }

  private async requestJson(route: string, init?: RequestInit, options?: RequestJsonOptions): Promise<unknown> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const retries = options?.retries ?? 0;
    const retryDelayMs = options?.retryDelayMs ?? 600;
    const normalizedRoute = this.normalizeRoute(route);

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${normalizedRoute}`, {
          ...init,
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `ComfyUI ${normalizedRoute} respondio ${response.status}: ${body || response.statusText || "sin detalle"}`
          );
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, retryDelayMs));
        }
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw lastError;
  }

  private async getAvailableCheckpoints() {
    const objectInfo = await this.requestJson("/object_info/CheckpointLoaderSimple", undefined, {
      timeoutMs: 6_000,
      retries: 1,
      retryDelayMs: 400,
    });
    return extractCheckpointOptions(objectInfo);
  }

  async health(): Promise<ComfyHealthResult> {
    try {
      await this.requestJson("/system_stats", undefined, { retries: 2, timeoutMs: 4_000, retryDelayMs: 500 });
      return { ok: true, message: "ComfyUI reachable via /system_stats." };
    } catch (systemStatsError) {
      try {
        await this.requestJson("/", undefined, { retries: 1, timeoutMs: 3_500, retryDelayMs: 300 });
        return { ok: true, message: "ComfyUI reachable via /." };
      } catch {
        return {
          ok: false,
          message: `ComfyUI no responde en ${this.baseUrl}. Error: ${toErrorMessage(systemStatsError)}`,
        };
      }
    }
  }

  async queuePrompt(workflowJson: unknown): Promise<QueuePromptResult> {
    let sanitizedWorkflow = workflowJson;
    try {
      const availableCheckpoints = await this.getAvailableCheckpoints();
      const sanitization = sanitizeCheckpointLoaders(
        workflowJson,
        availableCheckpoints,
        DEFAULT_CHECKPOINT_FALLBACK
      );
      sanitizedWorkflow = sanitization.workflowJson;
      if (sanitization.replacements.length > 0) {
        logger.warn("Checkpoint de workflow reemplazado antes de /prompt.", {
          replacements: sanitization.replacements,
          fallbackCheckpoint: sanitization.fallbackCheckpoint,
          availableCheckpoints: sanitization.availableCheckpoints,
        });
      }
    } catch (error) {
      logger.warn("No se pudo ejecutar sanitizer de checkpoints antes de /prompt.", toErrorMessage(error));
    }

    const payload = await this.requestJson(
      "/prompt",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: sanitizedWorkflow }),
      },
      { timeoutMs: 15_000, retries: 1, retryDelayMs: 500 }
    );

    const validationError = extractValidationError(payload);
    if (validationError) {
      throw new Error(`ComfyUI rechazo el prompt por validacion: ${validationError}`);
    }

    const promptId = String((payload as Record<string, unknown>)?.prompt_id ?? "").trim();
    if (!promptId) {
      throw new Error("ComfyUI /prompt no devolvio prompt_id.");
    }

    logger.info("Prompt encolado en ComfyUI.", { promptId });
    return { promptId };
  }

  async waitForCompletion(promptId: string, timeoutMs = 120_000): Promise<CompletionResult> {
    const startedAt = Date.now();
    let backoffMs = 800;

    while (Date.now() - startedAt < timeoutMs) {
      const history = await this.requestJson(`/history/${encodeURIComponent(promptId)}`, undefined, {
        timeoutMs: 8_000,
        retries: 1,
        retryDelayMs: 300,
      });
      const entry =
        history && typeof history === "object"
          ? (history as Record<string, unknown>)[promptId]
          : undefined;

      if (entry && typeof entry === "object") {
        const outputs = (entry as Record<string, unknown>).outputs;
        if (outputs && typeof outputs === "object" && Object.keys(outputs as object).length > 0) {
          return {
            promptId,
            completed: true,
            history: entry,
          };
        }
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, backoffMs));
      backoffMs = Math.min(5000, Math.round(backoffMs * 1.35));
    }

    throw new Error(`Timeout esperando completion para prompt_id=${promptId}.`);
  }
}
