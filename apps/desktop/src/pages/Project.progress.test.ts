import { describe, expect, it } from "vitest";
import { formatDuration } from "./Project";

describe("formatDuration", () => {
  it("uses MM:SS below one hour and HH:MM:SS from one hour onward", () => {
    expect(formatDuration(4 * 60_000 + 21_000)).toBe("04:21");
    expect(formatDuration(3_170 * 60_000 + 37_000)).toBe("52:50:37");
  });
});
