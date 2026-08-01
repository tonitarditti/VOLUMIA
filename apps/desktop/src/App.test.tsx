import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/pages/Home", () => ({
  Home: () => <div>Home page</div>,
}));

vi.mock("@/pages/Project", () => ({
  Project: () => <div>Project page</div>,
}));

vi.mock("@/pages/Settings", () => ({
  Settings: () => <div>Settings page</div>,
}));

describe("App startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.location.hash = "#/project/launch-target";
  });

  afterEach(() => {
    vi.useRealTimers();
    window.location.hash = "";
  });

  it("renders the splash within the router and opens Home after it completes", () => {
    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByText("Initializing workspace...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3300);
    });

    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/");
  });
});
