import { describe, expect, it } from "vitest";
import { createProject } from "./factory";
import { projectsReducer } from "./reducer";
import type { ProjectsState } from "./types";

function buildState(): ProjectsState {
  const project = createProject("Core");
  return {
    projects: [project],
    activeProjectId: project.id,
  };
}

describe("projectsReducer", () => {
  it("creates a project and sets it active", () => {
    const state = buildState();
    const next = projectsReducer(state, { type: "CREATE_PROJECT", payload: { name: "Annex" } });

    expect(next.projects).toHaveLength(2);
    expect(next.projects[0].name).toBe("Annex");
    expect(next.activeProjectId).toBe(next.projects[0].id);
  });

  it("renames and updates timestamp", () => {
    const state = buildState();
    const project = state.projects[0];

    const next = projectsReducer(state, {
      type: "RENAME_PROJECT",
      payload: { projectId: project.id, name: "Renamed" },
    });

    expect(next.projects[0].name).toBe("Renamed");
    expect(Date.parse(next.projects[0].updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
  });

  it("duplicates with fresh id", () => {
    const state = buildState();
    const source = state.projects[0];

    const next = projectsReducer(state, {
      type: "DUPLICATE_PROJECT",
      payload: { projectId: source.id },
    });

    expect(next.projects[0].id).not.toBe(source.id);
    expect(next.projects[0].name).toContain("Copy");
  });

  it("deletes last project and creates fallback", () => {
    const state = buildState();

    const next = projectsReducer(state, {
      type: "DELETE_PROJECT",
      payload: { projectId: state.projects[0].id },
    });

    expect(next.projects).toHaveLength(1);
    expect(next.activeProjectId).toBe(next.projects[0].id);
  });
});
