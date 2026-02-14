import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/projects/factory";
import { ProjectsProvider } from "@/projects/context";
import { STORAGE_KEYS } from "@/storage/keys";
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
      <ProjectsProvider>
        <MemoryRouter initialEntries={[`/project/${project.id}`]}>
          <Routes>
            <Route path="/project/:projectId" element={<ProjectPage />} />
          </Routes>
        </MemoryRouter>
      </ProjectsProvider>
    );

    await user.type(screen.getByRole("textbox", { name: "Project name" }), " Tower");

    const notes = screen.getByPlaceholderText("Capture constraints, zoning intent, and design decisions.");
    await user.type(notes, "Primary axis aligned to north facade.");

    const prompt = screen.getByRole("textbox", { name: "Assistant prompt" });
    await user.type(prompt, "Review massing hierarchy");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText(/Primary axis aligned to north facade/i)).toBeInTheDocument();
    expect(screen.getByText(/Intent captured: Review massing hierarchy/i)).toBeInTheDocument();
  });
});
