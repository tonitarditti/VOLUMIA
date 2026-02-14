import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/projects/factory";
import { STORAGE_KEYS } from "./keys";
import { loadProjectsState, saveProjectsState } from "./projectsStorage";

describe("projectsStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and restores projects", () => {
    const project = createProject("Stored Project");

    saveProjectsState({
      projects: [project],
      activeProjectId: project.id,
    });

    const loaded = loadProjectsState();

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].name).toBe("Stored Project");
    expect(loaded.activeProjectId).toBe(project.id);
  });

  it("falls back safely on malformed payload", () => {
    window.localStorage.setItem(STORAGE_KEYS.projects, "{broken-json");

    const loaded = loadProjectsState();

    expect(loaded.projects.length).toBeGreaterThan(0);
    expect(loaded.activeProjectId).toBe(loaded.projects[0].id);
  });
});
