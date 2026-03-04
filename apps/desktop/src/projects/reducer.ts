import { nanoid } from "nanoid";
import { createDefaultProjectsState, createProject, duplicateProject, nowIso } from "./factory";
import type { ChatMessage, ModelMetadata, Project, ProjectModel, ProjectsState } from "./types";

export type ProjectsAction =
  | { type: "HYDRATE_FROM_STORAGE"; payload: ProjectsState }
  | { type: "SET_ACTIVE_PROJECT"; payload: { projectId: string } }
  | { type: "CREATE_PROJECT"; payload?: { name?: string } }
  | { type: "RENAME_PROJECT"; payload: { projectId: string; name: string } }
  | { type: "DUPLICATE_PROJECT"; payload: { projectId: string } }
  | { type: "DELETE_PROJECT"; payload: { projectId: string } }
  | { type: "UPDATE_NOTES"; payload: { projectId: string; notes: string } }
  | { type: "APPEND_CHAT_MESSAGE"; payload: { projectId: string; message: ChatMessage } }
  | { type: "UPDATE_MODEL_METADATA"; payload: { projectId: string; modelMetadata: ModelMetadata } }
  | { type: "UPDATE_PROJECT_MODEL"; payload: { projectId: string; model: ProjectModel } }
  | { type: "MERGE_IMPORTED_PROJECTS"; payload: { projects: Project[] } };

function nextStateWithFallback(projects: Project[], activeProjectId: string): ProjectsState {
  if (projects.length > 0) {
    const activeExists = projects.some((project) => project.id === activeProjectId);
    return {
      projects,
      activeProjectId: activeExists ? activeProjectId : projects[0].id,
    };
  }

  return createDefaultProjectsState();
}

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case "HYDRATE_FROM_STORAGE": {
      return nextStateWithFallback(action.payload.projects, action.payload.activeProjectId);
    }

    case "SET_ACTIVE_PROJECT": {
      const exists = state.projects.some((project) => project.id === action.payload.projectId);
      if (!exists) return state;
      return {
        ...state,
        activeProjectId: action.payload.projectId,
      };
    }

    case "CREATE_PROJECT": {
      const name = action.payload?.name?.trim() || undefined;
      const nextProject = createProject(name);
      return {
        projects: [nextProject, ...state.projects],
        activeProjectId: nextProject.id,
      };
    }

    case "RENAME_PROJECT": {
      const nextName = action.payload.name.trim();
      if (!nextName) return state;

      const projects = state.projects.map((project) => {
        if (project.id !== action.payload.projectId) return project;
        return {
          ...project,
          name: nextName,
          updatedAt: nowIso(),
        };
      });

      return {
        ...state,
        projects,
      };
    }

    case "DUPLICATE_PROJECT": {
      const source = state.projects.find((project) => project.id === action.payload.projectId);
      if (!source) return state;

      const nextProject = duplicateProject(
        source,
        state.projects.map((project) => project.name)
      );

      return {
        projects: [nextProject, ...state.projects],
        activeProjectId: nextProject.id,
      };
    }

    case "DELETE_PROJECT": {
      const projects = state.projects.filter((project) => project.id !== action.payload.projectId);
      return nextStateWithFallback(projects, state.activeProjectId);
    }

    case "UPDATE_NOTES": {
      const projects = state.projects.map((project) => {
        if (project.id !== action.payload.projectId) return project;
        return {
          ...project,
          notes: action.payload.notes,
          updatedAt: nowIso(),
        };
      });

      return {
        ...state,
        projects,
      };
    }

    case "APPEND_CHAT_MESSAGE": {
      const projects = state.projects.map((project) => {
        if (project.id !== action.payload.projectId) return project;
        return {
          ...project,
          chatHistory: [...project.chatHistory, action.payload.message],
          updatedAt: nowIso(),
        };
      });

      return {
        ...state,
        projects,
      };
    }

    case "UPDATE_MODEL_METADATA": {
      const projects = state.projects.map((project) => {
        if (project.id !== action.payload.projectId) return project;
        return {
          ...project,
          modelMetadata: action.payload.modelMetadata,
          updatedAt: nowIso(),
        };
      });

      return {
        ...state,
        projects,
      };
    }

    case "UPDATE_PROJECT_MODEL": {
      const projects = state.projects.map((project) => {
        if (project.id !== action.payload.projectId) return project;
        return {
          ...project,
          model: action.payload.model,
          updatedAt: nowIso(),
        };
      });

      return {
        ...state,
        projects,
      };
    }

    case "MERGE_IMPORTED_PROJECTS": {
      if (action.payload.projects.length === 0) {
        return state;
      }

      const existingIds = new Set(state.projects.map((project) => project.id));
      const normalized = action.payload.projects.map((incoming) => {
        if (!existingIds.has(incoming.id)) {
          existingIds.add(incoming.id);
          return incoming;
        }

        const replacementId = nanoid();
        existingIds.add(replacementId);
        return {
          ...incoming,
          id: replacementId,
        };
      });

      return {
        ...state,
        projects: [...normalized, ...state.projects],
      };
    }

    default:
      return state;
  }
}
