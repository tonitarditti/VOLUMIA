import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type PropsWithChildren,
} from "react";
import { createDefaultProjectsState } from "./factory";
import { projectsReducer, type ProjectsAction } from "./reducer";
import { loadProjectsState, saveProjectsState } from "@/storage/projectsStorage";
import type { ChatMessage, ModelMetadata, Project, ProjectsState } from "./types";
import { STORAGE_KEYS } from "@/storage/keys";

type ProjectsContextValue = {
  state: ProjectsState;
  hydrated: boolean;
  setActiveProject: (projectId: string) => void;
  createProject: (name?: string) => void;
  renameProject: (projectId: string, name: string) => void;
  duplicateProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  updateNotes: (projectId: string, notes: string) => void;
  appendChatMessage: (projectId: string, message: ChatMessage) => void;
  updateModelMetadata: (projectId: string, modelMetadata: ModelMetadata) => void;
  mergeImportedProjects: (projects: Project[]) => void;
  resetProjects: () => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

const AUTOSAVE_DEBOUNCE_MS = 250;

export function ProjectsProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(projectsReducer, undefined, createDefaultProjectsState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromStorage = loadProjectsState();
    dispatch({
      type: "HYDRATE_FROM_STORAGE",
      payload: fromStorage,
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const timer = window.setTimeout(() => {
      saveProjectsState(state);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hydrated, state]);

  const value = useMemo<ProjectsContextValue>(() => {
    const run = (action: ProjectsAction) => dispatch(action);

    return {
      state,
      hydrated,
      setActiveProject: (projectId: string) => run({ type: "SET_ACTIVE_PROJECT", payload: { projectId } }),
      createProject: (name?: string) => run({ type: "CREATE_PROJECT", payload: { name } }),
      renameProject: (projectId: string, name: string) =>
        run({ type: "RENAME_PROJECT", payload: { projectId, name } }),
      duplicateProject: (projectId: string) => run({ type: "DUPLICATE_PROJECT", payload: { projectId } }),
      deleteProject: (projectId: string) => run({ type: "DELETE_PROJECT", payload: { projectId } }),
      updateNotes: (projectId: string, notes: string) => run({ type: "UPDATE_NOTES", payload: { projectId, notes } }),
      appendChatMessage: (projectId: string, message: ChatMessage) =>
        run({ type: "APPEND_CHAT_MESSAGE", payload: { projectId, message } }),
      updateModelMetadata: (projectId: string, modelMetadata: ModelMetadata) =>
        run({ type: "UPDATE_MODEL_METADATA", payload: { projectId, modelMetadata } }),
      mergeImportedProjects: (projects: Project[]) => run({ type: "MERGE_IMPORTED_PROJECTS", payload: { projects } }),
      resetProjects: () => {
        const initial = createDefaultProjectsState();
        run({ type: "HYDRATE_FROM_STORAGE", payload: initial });

        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEYS.projects);
        }
      },
    };
  }, [hydrated, state]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider.");
  }
  return context;
}
