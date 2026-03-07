import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppCommandsProvider } from "@/app/AppCommandsContext";
import { ProjectsProvider } from "@/projects/context";
import { SettingsProvider } from "@/volumia/settings/context";
import { TopBar } from "./TopBar";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("TopBar", () => {
  it("opens desktop menus and runs the selected command", async () => {
    const user = userEvent.setup();
    const exportProjects = vi.fn(async () => undefined);

    render(
      <SettingsProvider>
        <ProjectsProvider>
          <AppCommandsProvider
            value={{
              importProjects: vi.fn(async () => undefined),
              exportProjects,
              importSettings: vi.fn(async () => undefined),
              exportSettings: vi.fn(async () => undefined),
              resetWindowLayout: vi.fn(async () => undefined),
              resetAllData: vi.fn(async () => undefined),
            }}
          >
            <MemoryRouter initialEntries={["/dashboard"]}>
              <Routes>
                <Route
                  path="*"
                  element={
                    <>
                      <TopBar eyebrow="Overview" title="Dashboard" />
                      <LocationProbe />
                    </>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AppCommandsProvider>
        </ProjectsProvider>
      </SettingsProvider>
    );

    await user.click(screen.getByRole("button", { name: "File" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Export projects..." }),
    );

    expect(exportProjects).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(
      screen.getByRole("menuitem", { name: /Open Untitled Project/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/workspace\/.+$/,
      );
    });
  });
});
