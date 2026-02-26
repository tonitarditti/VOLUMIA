import assert from "node:assert/strict";
import test from "node:test";
import { patchWorkflowCheckpoint } from "./workflowManager";

test("patchWorkflowCheckpoint reemplaza checkpoint invalido por hunyuan_3d_v2.1.safetensors", () => {
  const workflow = {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
  };

  const result = patchWorkflowCheckpoint(workflow);
  const node = (result.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
  const inputs = node.inputs as Record<string, unknown>;

  assert.equal(inputs.ckpt_name, "hunyuan_3d_v2.1.safetensors");
  assert.equal(result.patched, true);
  assert.ok(result.replacements.length > 0);
});
