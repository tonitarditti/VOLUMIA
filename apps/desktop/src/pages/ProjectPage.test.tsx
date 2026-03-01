import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/projects/factory";
import { ProjectsProvider } from "@/projects/context";
import { GenerationJobProvider } from "@/services/comfyui";
import { STORAGE_KEYS } from "@/storage/keys";
import { SettingsProvider } from "@/volumia/settings/context";
import { ProjectPage } from "./ProjectPage";

vi.mock("@/three/ProjectViewport", () => ({
  ProjectViewport: () => <div data-testid="mock-viewport" />,
}));

describe("ProjectPage", () => {
  it("renders the current project workspace shell", () => {
    window.localStorage.clear();
    const project = createProject("Design Core");
    window.localStorage.setItem(
      STORAGE_KEYS.projects,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: project.id,
        projects: [project],
      })
    );
    render(
      <SettingsProvider>
        <GenerationJobProvider>
          <ProjectsProvider>
            <MemoryRouter initialEntries={[`/project/${project.id}`]}>
              <Routes>
                <Route path="/project/:projectId" element={<ProjectPage />} />
              </Routes>
            </MemoryRouter>
          </ProjectsProvider>
        </GenerationJobProvider>
      </SettingsProvider>
    );

    expect(screen.getByTestId("mock-viewport")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar imagenes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generar 3D/i })).toBeDisabled();
  });
});
