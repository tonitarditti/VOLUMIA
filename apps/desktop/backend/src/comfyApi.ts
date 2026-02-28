import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { getComfyBaseUrl, loadBackendConfig } from "./runtimeConfig";

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

export type QueueSnapshot = {
  running: string[];
  pending: string[];
  raw: unknown;
};

export type UploadImageResult = {
  name: string;
  subfolder: string;
  type: string;
};

export type ComfyApiOptions = {
  baseUrl?: string;
  getBaseUrl?: () => string;
};

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
export class ComfyApi {
  private readonly fixedBaseUrl: string | null;
  private readonly baseUrlResolver: (() => string) | null;

  constructor(options?: string | ComfyApiOptions) {
    if (typeof options === "string") {
      this.fixedBaseUrl = options;
      this.baseUrlResolver = null;
      return;
    }
    this.fixedBaseUrl = options?.baseUrl ?? null;
    this.baseUrlResolver = options?.getBaseUrl ?? null;
  }

  private getBaseUrl() {
    if (this.baseUrlResolver) {
      return this.baseUrlResolver();
    }
    if (this.fixedBaseUrl) {
      return this.fixedBaseUrl;
    }
    return getComfyBaseUrl(loadBackendConfig());
  }

  private normalizeRoute(route: string) {
    if (route.startsWith("/")) {
      return route;
    }
    return `/${route}`;
  }

  private async request(route: string, init?: RequestInit, options?: RequestJsonOptions): Promise<Response> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const retries = options?.retries ?? 0;
    const retryDelayMs = options?.retryDelayMs ?? 600;
    const normalizedRoute = this.normalizeRoute(route);
    const baseUrl = this.getBaseUrl();

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetch(`${baseUrl}${normalizedRoute}`, {
          ...init,
          signal: controller.signal,
        });
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

  private async requestJson(route: string, init?: RequestInit, options?: RequestJsonOptions): Promise<unknown> {
    const normalizedRoute = this.normalizeRoute(route);
    const response = await this.request(route, init, options);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ComfyUI ${normalizedRoute} respondio ${response.status}: ${body || response.statusText || "sin detalle"}`);
    }
    return await response.json();
  }

  async getObjectInfo() {
    return await this.requestJson("/object_info", undefined, {
      timeoutMs: 6_000,
      retries: 1,
      retryDelayMs: 400,
    });
  }

  async getAvailableCheckpoints() {
    try {
      const objectInfo = await this.requestJson("/object_info/CheckpointLoaderSimple", undefined, {
        timeoutMs: 6_000,
        retries: 1,
        retryDelayMs: 400,
      });
      const options = extractCheckpointOptions(objectInfo);
      if (options.length > 0) {
        return options;
      }
    } catch {
      // Try fallback endpoint below.
    }

    const fallbackObjectInfo = await this.getObjectInfo();
    return extractCheckpointOptions(fallbackObjectInfo);
  }

  async uploadImage(imagePath: string): Promise<UploadImageResult> {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Imagen no encontrada para upload: ${absolutePath}`);
    }

    const fileBuffer = fs.readFileSync(absolutePath);
    const fileName = path.basename(absolutePath);
    const formData = new FormData();
    formData.set("image", new Blob([fileBuffer]), fileName);
    formData.set("overwrite", "true");

    const payload = await this.requestJson(
      "/upload/image",
      {
        method: "POST",
        body: formData,
      },
      { timeoutMs: 20_000, retries: 1, retryDelayMs: 500 }
    );

    if (!isRecord(payload)) {
      throw new Error("ComfyUI /upload/image devolvio un payload invalido.");
    }
    const name = String(payload.name ?? "").trim();
    if (!name) {
      throw new Error("ComfyUI /upload/image no devolvio 'name'.");
    }

    const result: UploadImageResult = {
      name,
      subfolder: String(payload.subfolder ?? "").trim(),
      type: String(payload.type ?? "input").trim() || "input",
    };
    logger.info("Imagen subida a ComfyUI.", { imagePath: absolutePath, name: result.name, subfolder: result.subfolder });
    return result;
  }

  async health(): Promise<ComfyHealthResult> {
    const baseUrl = this.getBaseUrl();
    try {
      await this.requestJson("/system_stats", undefined, { retries: 2, timeoutMs: 4_000, retryDelayMs: 500 });
      return { ok: true, message: `Backend OK (${baseUrl})` };
    } catch (systemStatsError) {
      try {
        await this.requestJson("/queue", undefined, { retries: 1, timeoutMs: 3_500, retryDelayMs: 300 });
        return { ok: true, message: `Backend OK (${baseUrl})` };
      } catch {
        return {
          ok: false,
          message: `ComfyUI no responde en ${baseUrl} (esta corriendo?). Error: ${toErrorMessage(systemStatsError)}`,
        };
      }
    }
  }

  async queuePrompt(workflowJson: unknown): Promise<QueuePromptResult> {
    const payload = await this.requestJson(
      "/prompt",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: workflowJson }),
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

  async getQueueSnapshot(): Promise<QueueSnapshot> {
    const payload = await this.requestJson("/queue", undefined, {
      timeoutMs: 8_000,
      retries: 1,
      retryDelayMs: 300,
    });

    const extractPromptIds = (value: unknown) => {
      if (!Array.isArray(value)) {
        return [] as string[];
      }

      const promptIds: string[] = [];
      for (const item of value) {
        if (Array.isArray(item) && item.length > 1 && typeof item[1] === "string") {
          promptIds.push(item[1]);
          continue;
        }
        if (isRecord(item) && typeof item.prompt_id === "string") {
          promptIds.push(item.prompt_id);
        }
      }
      return promptIds;
    };

    const running = isRecord(payload) ? extractPromptIds(payload.queue_running) : [];
    const pending = isRecord(payload) ? extractPromptIds(payload.queue_pending) : [];

    return {
      running,
      pending,
      raw: payload,
    };
  }

  async getHistoryEntry(promptId: string): Promise<unknown | null> {
    const history = await this.requestJson(`/history/${encodeURIComponent(promptId)}`, undefined, {
      timeoutMs: 8_000,
      retries: 1,
      retryDelayMs: 300,
    });

    if (!history || typeof history !== "object") {
      return null;
    }

    const record = history as Record<string, unknown>;
    return record[promptId] ?? Object.values(record)[0] ?? null;
  }

  async interrupt(): Promise<void> {
    const response = await this.request(
      "/interrupt",
      {
        method: "POST",
      },
      { timeoutMs: 8_000, retries: 0 }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ComfyUI /interrupt respondio ${response.status}: ${body || response.statusText || "sin detalle"}`);
    }
  }

  async deleteQueuedPrompt(promptId: string): Promise<void> {
    const response = await this.request(
      "/queue",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          delete: [promptId],
        }),
      },
      { timeoutMs: 8_000, retries: 0 }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ComfyUI /queue delete respondio ${response.status}: ${body || response.statusText || "sin detalle"}`);
    }
  }

  async waitForCompletion(promptId: string, timeoutMs = 120_000): Promise<CompletionResult> {
    const startedAt = Date.now();
    let backoffMs = 800;

    while (Date.now() - startedAt < timeoutMs) {
      const entry = await this.getHistoryEntry(promptId);

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
