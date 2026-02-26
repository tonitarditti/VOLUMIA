import assert from "node:assert/strict";
import test from "node:test";
import { ComfyApi } from "./comfyApi";

test("ComfyApi acepta baseUrl explicita", () => {
  const api = new ComfyApi("http://127.0.0.1:8188");
  assert.ok(api);
});
