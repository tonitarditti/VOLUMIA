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

export type GenerationPreset = "fast" | "balanced" | "quality";
export type GenerationMode = "auto" | "neural" | "architectural";

export type ProjectModel = {
  sourceImages: string[];
  glbPath?: string;
  generatedAt?: number;
  preset?: GenerationPreset;
  mode?: GenerationMode;
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
  return value === "fast" || value === "balanced" || value === "quality";
};

const isGenerationMode = (value: unknown): value is GenerationMode => {
  return value === "auto" || value === "neural" || value === "architectural";
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
    (value.mode === undefined || isGenerationMode(value.mode))
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
