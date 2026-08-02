export type GenerationMode = "demo" | "quick" | "textured" | "photogrammetry";
export type JobStatus =
  | "idle"
  | "queued"
  | "running"
  | "optimizing"
  | "complete"
  | "cancelled"
  | "error";

export type ToolStatus = {
  name: string;
  env: string;
  type: "file" | "directory";
  configured: boolean;
  path: string | null;
  exists: boolean;
  status: "Configurada" | "No configurada";
  details?: string;
  entrypoint?: string | null;
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
  createdAt?: string | null;
  updatedAt?: string | null;
  finishedAt?: string | null;
};

export type ReferenceAngle = "front" | "side" | "back" | "top" | "detail";
export type ProjectReference = {
  id: string;
  path: string;
  filename: string;
  angle: ReferenceAngle;
  primary: boolean;
  width?: number;
  height?: number;
};
export type AssetVersion = {
  id: string;
  createdAt: string;
  finishedAt?: string;
  mode: GenerationMode;
  status: JobStatus;
  inputFiles: string[];
  glbPath?: string;
};
export type ProjectMetadata = {
  schemaVersion: number;
  name: string;
  category: string;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  units: "cm" | "m";
  referenceMeasurement: { label: string; value: number; unit: "cm" | "m" } | null;
  scaleFactor: number;
  references: ProjectReference[];
  versions: AssetVersion[];
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPayload = {
  id: string;
  root: string;
  input: string;
  output: string;
  latestGlb: string | null;
  modelUrl: string | null;
  job: ProjectJob;
  metadata: ProjectMetadata;
};

export type ProjectStatusResponse = {
  ok: boolean;
  project: ProjectPayload;
  job: ProjectJob;
};

export type DeleteProjectResponse = {
  ok: boolean;
  id: string;
};

export type CancelProjectResponse = {
  ok: boolean;
  projectId: string;
  job: ProjectJob;
};

export type LocalSettings = Partial<Record<
  | "VOLUMIA_PYTHON"
  | "VOLUMIA_BLENDER"
  | "VOLUMIA_SKETCHUP"
  | "VOLUMIA_TRIPOSR_DIR"
  | "VOLUMIA_HUNYUAN_DIR"
  | "VOLUMIA_HUNYUAN_MODEL_PATH"
  | "VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER"
  | "VOLUMIA_HUNYUAN_PAINT_SUBFOLDER"
  | "VOLUMIA_MESHROOM_DIR"
  | "VOLUMIA_QUICK_ROTATION_X"
  | "VOLUMIA_QUICK_ROTATION_Y"
  | "VOLUMIA_QUICK_ROTATION_Z"
  | "VOLUMIA_HUNYUAN_ROTATION_X"
  | "VOLUMIA_HUNYUAN_ROTATION_Y"
  | "VOLUMIA_HUNYUAN_ROTATION_Z",
  string
>>;

export type SettingsResponse = {
  ok: boolean;
  settings: LocalSettings;
  settingsPath: string;
  tools: ToolsStatusResponse["tools"];
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

  referenceUrl(projectId: string, referenceId: string) {
    return `${backendBaseUrl}/api/projects/${encodeURIComponent(projectId)}/reference/${encodeURIComponent(referenceId)}`;
  },

  async health() {
    return await requestJson<{ ok: boolean; service: string; projectsRoot: string; logPath: string }>("/api/health");
  },

  async toolsStatus() {
    return await requestJson<ToolsStatusResponse>("/api/tools/status");
  },

  async detectTools() {
    return await requestJson<ToolsStatusResponse>("/api/tools/detect", { method: "POST" });
  },

  async settings() {
    return await requestJson<SettingsResponse>("/api/settings");
  },

  async saveSettings(settings: LocalSettings) {
    return await requestJson<SettingsResponse>("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },

  async createProject(payload: Partial<Pick<ProjectMetadata, "name" | "category" | "tags" | "units" | "referenceMeasurement">> & { id?: string } = {}) {
    return await requestJson<ProjectPayload>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateProject(projectId: string, patch: Partial<ProjectMetadata>) {
    return await requestJson<{ ok: boolean; project: ProjectPayload }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  },

  async duplicateProject(projectId: string, name?: string) {
    return await requestJson<ProjectPayload>(
      `/api/projects/${encodeURIComponent(projectId)}/duplicate`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
  },

  async deleteProject(projectId: string) {
    return await requestJson<DeleteProjectResponse>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    );
  },

  async cancelProjectGeneration(projectId: string) {
    return await requestJson<CancelProjectResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/cancel`,
      { method: "POST" },
    );
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
