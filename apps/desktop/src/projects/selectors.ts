import type { Project, ProjectsState } from "./types";

export function selectProjectsSortedByUpdatedAt(projects: Project[]) {
  return [...projects].sort((a, b) => {
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function selectProjectById(state: ProjectsState, projectId: string) {
  return state.projects.find((project) => project.id === projectId);
}

export function selectActiveProject(state: ProjectsState) {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0] ?? null;
}
