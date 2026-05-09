export type GenerationMode = "demo" | "quick" | "textured" | "photogrammetry";
export type JobStatus = "idle" | "queued" | "running" | "optimizing" | "complete" | "error";

export type ToolStatus = {
  name: string;
  env: string;
  type: "file" | "directory";
  configured: boolean;
  path: string | null;
  exists: boolean;
  status: "Configurada" | "No configurada";
};

export type ToolsStatusResponse = {
  ok: boolean;
  tools: Record<"python" | "blender" | "triposr" | "hunyuan" | "meshroom", ToolStatus>;
};

export type ProjectJob = {
  id?: string;
  projectId: string;
  mode?: GenerationMode | null;
  status: JobStatus;
  message?: string;
  warnings?: string[];
  error?: { message?: string } | null;
  latestGlb?: string;
  inputFiles?: string[];
  logs?: string[];
};

export type ProjectPayload = {
  id: string;
  root: string;
  input: string;
  output: string;
  latestGlb: string | null;
  modelUrl: string | null;
  job: ProjectJob;
};

export type ProjectStatusResponse = {
  ok: boolean;
  project: ProjectPayload;
  job: ProjectJob;
};

const backendBaseUrl =
  import.meta.env.VITE_UNIFIED_BACKEND_URL ??
  import.meta.env.VITE_VOLUMIA_BACKEND_URL ??
  "http://127.0.0.1:9360";

async function requestJson<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Backend ${route} failed (${response.status}): ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export const generationClient = {
  backendBaseUrl,

  modelUrl(projectId: string, version?: number) {
    const suffix = typeof version === "number" ? `?v=${version}` : "";
    return `${backendBaseUrl}/api/projects/${encodeURIComponent(projectId)}/model${suffix}`;
  },

  async health() {
    return await requestJson<{ ok: boolean; service: string; projectsRoot: string; logPath: string }>("/api/health");
  },

  async toolsStatus() {
    return await requestJson<ToolsStatusResponse>("/api/tools/status");
  },

  async createProject(id?: string) {
    return await requestJson<ProjectPayload>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  },

  async uploadInput(projectId: string, files: File[]) {
    const body = new FormData();
    for (const file of files) {
      body.append("images", file, file.name);
    }
    const response = await fetch(`${backendBaseUrl}/api/projects/${encodeURIComponent(projectId)}/input`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Upload failed (${response.status}): ${detail || response.statusText}`);
    }
    return (await response.json()) as { ok: boolean; project: ProjectPayload; files: Array<{ path: string; size: number }> };
  },

  async generate(projectId: string, mode: GenerationMode) {
    return await requestJson<{ ok: boolean; projectId: string; job: ProjectJob }>(
      `/api/projects/${encodeURIComponent(projectId)}/generate`,
      {
        method: "POST",
        body: JSON.stringify({ mode }),
      },
    );
  },

  async status(projectId: string) {
    return await requestJson<ProjectStatusResponse>(`/api/projects/${encodeURIComponent(projectId)}/status`);
  },
};
