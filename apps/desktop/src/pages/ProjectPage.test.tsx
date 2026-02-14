import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/projects/factory";
import { ProjectsProvider } from "@/projects/context";
import { STORAGE_KEYS } from "@/storage/keys";
import { SettingsProvider } from "@/volumia/settings/context";
import { ProjectPage } from "./ProjectPage";

vi.mock("@/three/ProjectViewport", () => ({
  ProjectViewport: () => <div data-testid="mock-viewport" />,
}));

describe("ProjectPage", () => {
  it("updates notes and appends chat messages", async () => {
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

    const user = userEvent.setup();

    render(
      <SettingsProvider>
        <ProjectsProvider>
          <MemoryRouter initialEntries={[`/project/${project.id}`]}>
            <Routes>
              <Route path="/project/:projectId" element={<ProjectPage />} />
            </Routes>
          </MemoryRouter>
        </ProjectsProvider>
      </SettingsProvider>
    );

    await user.type(screen.getByRole("textbox", { name: /Project name|Nombre del proyecto|Nome do projeto/i }), " Tower");

    const notes = screen.getByPlaceholderText(
      /Capture constraints|Captura restricciones|Registre restricoes/i
    );
    await user.type(notes, "Primary axis aligned to north facade.");

    const prompt = screen.getByRole("textbox", { name: /Assistant|Asistente|Assistente/i });
    await user.type(prompt, "Review massing hierarchy");
    await user.click(screen.getByRole("button", { name: /Send|Enviar/i }));

    expect(screen.getByText(/Primary axis aligned to north facade/i)).toBeInTheDocument();
    expect(screen.getByText(/Intent captured: Review massing hierarchy/i)).toBeInTheDocument();
  });
});
