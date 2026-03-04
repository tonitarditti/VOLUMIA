import { createDefaultProjectsState } from "@/projects/factory";
import { isProject, type ProjectsState, type ProjectsStorageEnvelope } from "@/projects/types";
import { STORAGE_KEYS } from "./keys";
import { migrateProjectsEnvelope } from "./migrations";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function toState(envelope: ProjectsStorageEnvelope): ProjectsState {
  const projects = envelope.projects.filter((project) => isProject(project));

  if (projects.length === 0) {
    return createDefaultProjectsState();
  }

  const activeExists = projects.some((project) => project.id === envelope.activeProjectId);

  return {
    projects,
    activeProjectId: activeExists ? envelope.activeProjectId : projects[0].id,
  };
}

export function loadProjectsState(): ProjectsState {
  const storage = getStorage();
  if (!storage) {
    return createDefaultProjectsState();
  }

  const raw = storage.getItem(STORAGE_KEYS.projects);
  if (!raw) {
    return createDefaultProjectsState();
  }

  try {
    const parsed = JSON.parse(raw);
    const migrated = migrateProjectsEnvelope(parsed);
    if (!migrated) {
      return createDefaultProjectsState();
    }

    return toState(migrated);
  } catch {
    return createDefaultProjectsState();
  }
}

export function saveProjectsState(state: ProjectsState) {
  const storage = getStorage();
  if (!storage) return;

  const payload: ProjectsStorageEnvelope = {
    schemaVersion: 1,
    activeProjectId: state.activeProjectId,
    projects: state.projects,
  };

  storage.setItem(STORAGE_KEYS.projects, JSON.stringify(payload));
}
