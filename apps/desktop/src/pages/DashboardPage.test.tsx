import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProjectsProvider } from "@/projects/context";
import { SettingsProvider } from "@/volumia/settings/context";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("creates a new project from dashboard", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();

    render(
      <SettingsProvider>
        <ProjectsProvider>
          <MemoryRouter>
            <DashboardPage onImport={vi.fn(async () => undefined)} onExport={vi.fn(async () => undefined)} />
          </MemoryRouter>
        </ProjectsProvider>
      </SettingsProvider>
    );

    const beforeCount = screen.getAllByRole("heading", { level: 2 }).length;

    await user.click(screen.getAllByRole("button", { name: /New Project|Nuevo Proyecto|Novo Projeto/i })[0]!);

    const afterCount = screen.getAllByRole("heading", { level: 2 }).length;
    expect(afterCount).toBe(beforeCount + 1);
  });
});
