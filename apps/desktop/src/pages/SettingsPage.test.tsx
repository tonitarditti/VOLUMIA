import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("changes theme and edits api key placeholder", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    const onAiApiKeyPlaceholderChange = vi.fn();

    render(
      <SettingsPage
        theme="dark"
        onThemeChange={onThemeChange}
        aiApiKeyPlaceholder=""
        onAiApiKeyPlaceholderChange={onAiApiKeyPlaceholderChange}
        onImport={vi.fn(async () => undefined)}
        onExport={vi.fn(async () => undefined)}
      />
    );

    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(onThemeChange).toHaveBeenCalledWith("light");

    await user.type(screen.getByLabelText("Future AI API key"), "sample");
    expect(onAiApiKeyPlaceholderChange).toHaveBeenCalled();
  });
});
