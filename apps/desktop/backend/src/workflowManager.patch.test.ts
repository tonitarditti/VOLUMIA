import assert from "node:assert/strict";
import test from "node:test";
import { applyImageInputToWorkflow, getCheckpointUsages, patchWorkflowCheckpoints } from "./workflowManager";

test("applyImageInputToWorkflow actualiza nodos LoadImage", () => {
  const workflow = {
    "4": {
      class_type: "LoadImage",
      inputs: {
        image: "placeholder.png",
      },
    },
  };

  const result = applyImageInputToWorkflow(workflow, "uploaded.png", "volumia");
  const node = (result.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
  const inputs = node.inputs as Record<string, unknown>;

  assert.equal(inputs.image, "volumia/uploaded.png");
  assert.equal(result.appliedNodeIds.length, 1);
});

test("getCheckpointUsages lee ckpt_name sin override", () => {
  const workflow = {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "hunyuan_3d_v2.1.safetensors",
      },
    },
  };

  const usages = getCheckpointUsages(workflow);
  assert.equal(usages.length, 1);
  assert.equal(usages[0]?.ckptName, "hunyuan_3d_v2.1.safetensors");
});

test("patchWorkflowCheckpoints reemplaza ckpt invalido por checkpoint disponible", () => {
  const workflow = {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
  };

  const patched = patchWorkflowCheckpoints(workflow, ["hunyuan_3d_v2.1.safetensors"]);
  assert.equal(patched.replaced.length, 1);
  const node = (patched.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
  const inputs = node.inputs as Record<string, unknown>;
  assert.equal(inputs.ckpt_name, "hunyuan_3d_v2.1.safetensors");
});
