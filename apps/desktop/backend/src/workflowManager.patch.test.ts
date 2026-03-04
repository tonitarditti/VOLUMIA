import { describe, expect, it } from "vitest";
import { applyImageInputToWorkflow, getCheckpointUsages, patchWorkflowCheckpoints } from "./workflowManager";

describe("workflowManager", () => {
  it("updates LoadImage nodes with the uploaded path", () => {
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

    expect(inputs.image).toBe("volumia/uploaded.png");
    expect(result.appliedNodeIds).toHaveLength(1);
  });

  it("reads checkpoint usages without overrides", () => {
    const workflow = {
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "hunyuan_3d_v2.1.safetensors",
        },
      },
    };

    const usages = getCheckpointUsages(workflow);
    expect(usages).toHaveLength(1);
    expect(usages[0]?.ckptName).toBe("hunyuan_3d_v2.1.safetensors");
  });

  it("replaces an invalid checkpoint with an available one", () => {
    const workflow = {
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "sd_xl_base_1.0.safetensors",
        },
      },
    };

    const patched = patchWorkflowCheckpoints(workflow, ["hunyuan_3d_v2.1.safetensors"]);
    expect(patched.replaced).toHaveLength(1);
    const node = (patched.workflowJson as Record<string, unknown>)["4"] as Record<string, unknown>;
    const inputs = node.inputs as Record<string, unknown>;
    expect(inputs.ckpt_name).toBe("hunyuan_3d_v2.1.safetensors");
  });
});
