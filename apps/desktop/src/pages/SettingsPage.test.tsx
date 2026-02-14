import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/volumia/settings/context";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("triggers data actions", async () => {
    const user = userEvent.setup();
    const onImportProjects = vi.fn(async () => undefined);
    const onExportProjects = vi.fn(async () => undefined);
    const onExportSettings = vi.fn(async () => undefined);
    const onImportSettings = vi.fn(async () => undefined);
    const onResetSettings = vi.fn();
    const onResetAllData = vi.fn(async () => undefined);
    const onResetWindowLayout = vi.fn(async () => undefined);

    render(
      <SettingsProvider>
        <SettingsPage
          onImportProjects={onImportProjects}
          onExportProjects={onExportProjects}
          onExportSettings={onExportSettings}
          onImportSettings={onImportSettings}
          onResetSettings={onResetSettings}
          onResetAllData={onResetAllData}
          onResetWindowLayout={onResetWindowLayout}
        />
      </SettingsProvider>
    );

    await user.click(screen.getByRole("button", { name: /Export JSON|Exportar JSON/i }));
    expect(onExportProjects).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Import JSON|Importar JSON/i }));
    expect(onImportProjects).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Export Settings JSON|Exportar Ajustes JSON/i }));
    expect(onExportSettings).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Import Settings JSON|Importar Ajustes JSON/i }));
    expect(onImportSettings).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Reset settings|Restablecer ajustes/i }));
    expect(onResetSettings).toHaveBeenCalled();
  });
});
