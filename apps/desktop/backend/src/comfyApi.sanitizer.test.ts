import { describe, expect, it } from "vitest";
import { ComfyApi } from "./comfyApi";

describe("ComfyApi", () => {
  it("accepts an explicit baseUrl", () => {
    const api = new ComfyApi("http://127.0.0.1:8188");
    expect(api).toBeTruthy();
  });
});
