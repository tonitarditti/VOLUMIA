import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Splash } from "./Splash";

describe("Splash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for its exit animation before completing", () => {
    const onComplete = vi.fn();

    render(<Splash onComplete={onComplete} />);

    expect(screen.getByText("Initializing workspace...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2800);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
