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

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  chatHistory: ChatMessage[];
  modelMetadata: ModelMetadata;
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
    isModelMetadata(value.modelMetadata)
  );
};
