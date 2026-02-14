import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProjectsProvider } from "@/projects/context";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("creates a new project from dashboard", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();

    render(
      <ProjectsProvider>
        <MemoryRouter>
          <DashboardPage onImport={vi.fn(async () => undefined)} onExport={vi.fn(async () => undefined)} />
        </MemoryRouter>
      </ProjectsProvider>
    );

    const beforeCount = screen.getAllByText(/Updated/i).length;

    await user.click(screen.getByRole("button", { name: "New Project" }));

    const afterCount = screen.getAllByText(/Updated/i).length;
    expect(afterCount).toBe(beforeCount + 1);
  });
});
