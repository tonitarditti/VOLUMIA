export type ThemeMode = "dark" | "light";
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ModelMetadata = {
  modelVersion: string;
  lastPrompt: string;
  lastAssistantSummary: string;
};

export type GenerationPreset = "fast" | "balanced" | "high" | "quality";
export type GenerationMode = "auto" | "neural" | "architectural";
export type ProjectTextureStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped_invalid_mesh"
  | "skipped_invalid_image"
  | "stalled"
  | "timed_out"
  | "runtime_error"
  | "process_start_failed"
  | "no_output_generated"
  | "invalid_output"
  | "fallback_geometry_only";

export type ProjectTextureValidation = {
  ok: boolean;
  hasMaterials: boolean;
  hasImages: boolean;
  hasTextures: boolean;
  hasMaterialTextureBinding: boolean;
  reason?: string;
  fileSizeBytes?: number;
  sameAsSourceMesh?: boolean;
};

export type ProjectModel = {
  sourceImages: string[];
  glbPath?: string;
  generatedAt?: number;
  preset?: GenerationPreset;
  mode?: GenerationMode;
  textureStatus?: ProjectTextureStatus;
  textureMessage?: string;
  textureValidation?: ProjectTextureValidation;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  chatHistory: ChatMessage[];
  modelMetadata: ModelMetadata;
  model?: ProjectModel;
};

export type ProjectsState = {
  projects: Project[];
  activeProjectId: string;
};

export type ProjectsStorageEnvelope = {
  schemaVersion: 1;
  activeProjectId: string;
  projects: Project[];
};

export type AppSettings = {
  theme: ThemeMode;
  aiApiKeyPlaceholder: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isString = (value: unknown): value is string => typeof value === "string";

const isChatRole = (value: unknown): value is ChatRole => {
  return value === "user" || value === "assistant";
};

const isGenerationPreset = (value: unknown): value is GenerationPreset => {
  return (
    value === "fast" ||
    value === "balanced" ||
    value === "high" ||
    value === "quality"
  );
};

const isGenerationMode = (value: unknown): value is GenerationMode => {
  return value === "auto" || value === "neural" || value === "architectural";
};

const isProjectTextureStatus = (
  value: unknown,
): value is ProjectTextureStatus => {
  return (
    value === "pending" ||
    value === "running" ||
    value === "success" ||
    value === "skipped_invalid_mesh" ||
    value === "skipped_invalid_image" ||
    value === "stalled" ||
    value === "timed_out" ||
    value === "runtime_error" ||
    value === "process_start_failed" ||
    value === "no_output_generated" ||
    value === "invalid_output" ||
    value === "fallback_geometry_only"
  );
};

const isProjectTextureValidation = (
  value: unknown,
): value is ProjectTextureValidation => {
  if (!isRecord(value)) return false;
  return (
    typeof value.ok === "boolean" &&
    typeof value.hasMaterials === "boolean" &&
    typeof value.hasImages === "boolean" &&
    typeof value.hasTextures === "boolean" &&
    typeof value.hasMaterialTextureBinding === "boolean" &&
    (value.reason === undefined || isString(value.reason)) &&
    (value.fileSizeBytes === undefined ||
      typeof value.fileSizeBytes === "number") &&
    (value.sameAsSourceMesh === undefined ||
      typeof value.sameAsSourceMesh === "boolean")
  );
};

export const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isChatRole(value.role) &&
    isString(value.content) &&
    isString(value.createdAt)
  );
};

export const isModelMetadata = (value: unknown): value is ModelMetadata => {
  if (!isRecord(value)) return false;
  return (
    isString(value.modelVersion) &&
    isString(value.lastPrompt) &&
    isString(value.lastAssistantSummary)
  );
};

export const isProjectModel = (value: unknown): value is ProjectModel => {
  if (!isRecord(value)) return false;

  const sourceImages = value.sourceImages;
  if (!Array.isArray(sourceImages) || !sourceImages.every((item) => isString(item))) {
    return false;
  }

  return (
    (value.glbPath === undefined || isString(value.glbPath)) &&
    (value.generatedAt === undefined || typeof value.generatedAt === "number") &&
    (value.preset === undefined || isGenerationPreset(value.preset)) &&
    (value.mode === undefined || isGenerationMode(value.mode)) &&
    (value.textureStatus === undefined ||
      isProjectTextureStatus(value.textureStatus)) &&
    (value.textureMessage === undefined || isString(value.textureMessage)) &&
    (value.textureValidation === undefined ||
      isProjectTextureValidation(value.textureValidation))
  );
};

export const isProject = (value: unknown): value is Project => {
  if (!isRecord(value)) return false;

  const chatHistory = value.chatHistory;
  if (!Array.isArray(chatHistory)) return false;

  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isString(value.notes) &&
    chatHistory.every((item) => isChatMessage(item)) &&
    isModelMetadata(value.modelMetadata) &&
    (value.model === undefined || isProjectModel(value.model))
  );
};
