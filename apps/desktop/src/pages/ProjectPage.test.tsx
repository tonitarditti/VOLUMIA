import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppCommandsProvider } from "@/app/AppCommandsContext";
import { createProject } from "@/projects/factory";
import { ProjectsProvider } from "@/projects/context";
import { GenerationJobProvider } from "@/services/comfyui";
import { STORAGE_KEYS } from "@/storage/keys";
import { SettingsProvider } from "@/volumia/settings/context";
import { ProjectPage } from "./ProjectPage";

type MockViewportProps = {
  resetSignal?: number;
  fitSignal?: number;
  shadowEnabled?: boolean;
  gridEnabled?: boolean;
  wireframe?: boolean;
  screenshotSignal?: number;
};

vi.mock("@/three/ProjectViewport", () => ({
  ProjectViewport: (props: MockViewportProps) => {
    return (
      <div
        data-testid="mock-viewport"
        data-reset={String(props.resetSignal ?? 0)}
        data-fit={String(props.fitSignal ?? 0)}
        data-grid={String(props.gridEnabled ?? true)}
        data-shadow={String(props.shadowEnabled ?? true)}
        data-wire={String(props.wireframe ?? false)}
        data-screenshot={String(props.screenshotSignal ?? 0)}
      />
    );
  },
}));

function renderWorkspace(project = createProject("Design Core")) {
  window.localStorage.clear();
  window.localStorage.setItem(
    STORAGE_KEYS.projects,
    JSON.stringify({
      schemaVersion: 1,
      activeProjectId: project.id,
      projects: [project],
    }),
  );

  render(
    <SettingsProvider>
      <AppCommandsProvider
        value={{
          importProjects: vi.fn(async () => undefined),
          exportProjects: vi.fn(async () => undefined),
          importSettings: vi.fn(async () => undefined),
          exportSettings: vi.fn(async () => undefined),
          resetWindowLayout: vi.fn(async () => undefined),
          resetAllData: vi.fn(async () => undefined),
        }}
      >
        <GenerationJobProvider>
          <ProjectsProvider>
            <MemoryRouter initialEntries={[`/project/${project.id}`]}>
              <Routes>
                <Route path="/project/:projectId" element={<ProjectPage />} />
              </Routes>
            </MemoryRouter>
          </ProjectsProvider>
        </GenerationJobProvider>
      </AppCommandsProvider>
    </SettingsProvider>,
  );
}

describe("ProjectPage", () => {
  it("renders the viewport, keeps add images in references, and disables generate without refs", () => {
    renderWorkspace();

    expect(screen.getByTestId("mock-viewport")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /\+ Add images/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate 3D/i }),
    ).toBeDisabled();
  });

  it("switches modes via rail and keyboard shortcuts", async () => {
    renderWorkspace();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /AI/i }));
    expect(screen.getByRole("heading", { name: "AI" })).toBeInTheDocument();

    await user.keyboard("1");
    expect(
      screen.getByRole("heading", { name: "References" }),
    ).toBeInTheDocument();

    await user.keyboard("5");
    expect(screen.getByRole("heading", { name: "AI" })).toBeInTheDocument();
  });

  it("switches right-panel tabs and keeps viewport controls wired", async () => {
    const project = createProject("Studio Shell");
    project.model = {
      ...project.model,
      sourceImages: ["a.png"],
      glbPath: "c:/temp/model.glb",
      generatedAt: Date.now(),
    };
    renderWorkspace(project);

    expect(
      screen.getByRole("button", { name: /Regenerate 3D/i }),
    ).toBeDisabled();
    for (const openOutputButton of screen.getAllByRole("button", {
      name: /Open Output/i,
    })) {
      expect(openOutputButton).toBeEnabled();
    }

    const user = userEvent.setup();
    const viewport = screen.getByTestId("mock-viewport");

    await user.click(screen.getByRole("tab", { name: /References/i }));
    expect(screen.getByText(/Input imagery/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Notes/i }));
    expect(screen.getByText(/Project notes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Inspector/i }));
    expect(screen.getByRole("heading", { name: "Result" })).toBeInTheDocument();

    expect(viewport.dataset.grid).toBe("true");
    await user.click(screen.getByRole("button", { name: /Grid/i }));
    expect(viewport.dataset.grid).toBe("false");

    expect(viewport.dataset.shadow).toBe("true");
    await user.click(screen.getByRole("button", { name: /Shadows/i }));
    expect(viewport.dataset.shadow).toBe("false");

    expect(viewport.dataset.wire).toBe("false");
    await user.click(screen.getAllByRole("button", { name: /Wire/i })[0]!);
    expect(viewport.dataset.wire).toBe("true");

    const prevReset = Number(viewport.dataset.reset ?? 0);
    await user.click(screen.getByRole("button", { name: /Reset View/i }));
    expect(Number(viewport.dataset.reset)).toBe(prevReset + 1);

    const prevFit = Number(viewport.dataset.fit ?? 0);
    await user.click(screen.getByRole("button", { name: /Frame Model/i }));
    expect(Number(viewport.dataset.fit)).toBe(prevFit + 1);

    const prevScreenshot = Number(viewport.dataset.screenshot ?? 0);
    await user.click(screen.getByRole("button", { name: /Capture PNG/i }));
    expect(Number(viewport.dataset.screenshot)).toBe(prevScreenshot + 1);
  });
});
