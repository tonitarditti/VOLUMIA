import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCheckpointLoaders } from "./comfyApi";

test("sanitizeCheckpointLoaders reemplaza ckpt_name invalido por hunyuan_3d_v2.1.safetensors", () => {
  const workflow = {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
  };

  const result = sanitizeCheckpointLoaders(workflow, ["hunyuan_3d_v2.1.safetensors"]);
  const node = (result.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
  const inputs = node.inputs as Record<string, unknown>;

  assert.equal(inputs.ckpt_name, "hunyuan_3d_v2.1.safetensors");
  assert.equal(result.replacements.length, 1);
  assert.equal(result.replacements[0]?.previous, "sd_xl_base_1.0.safetensors");
  assert.equal(result.replacements[0]?.next, "hunyuan_3d_v2.1.safetensors");
});

test("sanitizeCheckpointLoaders no modifica ckpt_name cuando ya es valido", () => {
  const workflow = {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "hunyuan_3d_v2.1.safetensors",
      },
    },
  };

  const result = sanitizeCheckpointLoaders(workflow, ["hunyuan_3d_v2.1.safetensors"]);
  const node = (result.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
  const inputs = node.inputs as Record<string, unknown>;

  assert.equal(inputs.ckpt_name, "hunyuan_3d_v2.1.safetensors");
  assert.equal(result.replacements.length, 0);
});

