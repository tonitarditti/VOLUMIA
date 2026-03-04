import { nanoid } from "nanoid";
import type { ChatMessage, ChatRole, ModelMetadata, Project, ProjectsState } from "./types";

export const DEFAULT_PROJECT_NAME = "Untitled Project";

export function nowIso() {
  return new Date().toISOString();
}

export function buildDefaultModelMetadata(): ModelMetadata {
  return {
    modelVersion: "volumia.mass.v1",
    lastPrompt: "",
    lastAssistantSummary: "",
  };
}

export function createChatMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: nanoid(),
    role,
    content,
    createdAt: nowIso(),
  };
}

export function createProject(name = DEFAULT_PROJECT_NAME): Project {
  const timestamp = nowIso();
  return {
    id: nanoid(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: "",
    chatHistory: [],
    modelMetadata: buildDefaultModelMetadata(),
    model: {
      sourceImages: [],
      mode: "auto",
    },
  };
}

function stripCopySuffix(rawName: string) {
  return rawName.replace(/\s\(copy(?:\s\d+)?\)$/i, "").trim();
}

export function createCopyName(sourceName: string, existingNames: string[]) {
  const lowerExisting = new Set(existingNames.map((name) => name.toLowerCase()));
  const baseName = stripCopySuffix(sourceName);
  const firstCandidate = `${baseName} (Copy)`;

  if (!lowerExisting.has(firstCandidate.toLowerCase())) {
    return firstCandidate;
  }

  let index = 2;
  while (true) {
    const candidate = `${baseName} (Copy ${index})`;
    if (!lowerExisting.has(candidate.toLowerCase())) {
      return candidate;
    }
    index += 1;
  }
}

export function duplicateProject(source: Project, existingNames: string[]): Project {
  const timestamp = nowIso();
  return {
    ...source,
    id: nanoid(),
    name: createCopyName(source.name, existingNames),
    createdAt: timestamp,
    updatedAt: timestamp,
    chatHistory: source.chatHistory.map((message) => ({
      ...message,
      id: nanoid(),
      createdAt: timestamp,
    })),
    modelMetadata: {
      ...source.modelMetadata,
    },
    model: {
      sourceImages: source.model?.sourceImages ? [...source.model.sourceImages] : [],
      glbPath: source.model?.glbPath,
      generatedAt: source.model?.generatedAt,
      preset: source.model?.preset,
      mode: source.model?.mode,
    },
  };
}

export function createDefaultProjectsState(): ProjectsState {
  const project = createProject();
  return {
    projects: [project],
    activeProjectId: project.id,
  };
}
