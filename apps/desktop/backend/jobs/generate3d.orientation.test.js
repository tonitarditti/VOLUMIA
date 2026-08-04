import { describe, expect, it } from "vitest";
import generate3d from "./generate3d.js";

const {
  QUICK_CANONICAL_ROTATION,
  QUICK_AXIS_NORMALIZATION,
  buildHunyuanRunnerArgs,
  buildHunyuanTexgenArgs,
  getRequiredStages,
  normalizeGenerationMode,
} = generate3d;

describe("Quick canonical orientation", () => {
  it("converts TripoSR to Y-up and faces the default VOLUMIA camera", () => {
    expect(QUICK_CANONICAL_ROTATION).toEqual({
      preset: "triposr_to_volumia_y_up_grounded_front_positive_z",
      rotationXDeg: -90,
      rotationYDeg: -90,
      rotationZDeg: -90,
    });
    expect(QUICK_AXIS_NORMALIZATION).toMatchObject({
      source: "TripoSR Z-up",
      target: "VOLUMIA Y-up",
      rotationXDeg: -90,
      rotationYDeg: -90,
      rotationZDeg: -90,
      forwardAxis: "+Z",
      supportPlaneLeveling: true,
      centered: true,
      grounded: true,
    });
  });
});

describe("Hunyuan runner arguments", () => {
  it("always passes the job ID required by hunyuan_runner.py", () => {
    const args = buildHunyuanRunnerArgs({
      jobId: "job_123",
      hunyuanDir: "E:/AI/Hunyuan3D-2",
      inputPath: "E:/VOLUMIA/projects/project_1/input/reference.png",
      outputDir: "E:/VOLUMIA/projects/project_1/output/hunyuan",
    });

    expect(args).toContain("--job-id");
    expect(args[args.indexOf("--job-id") + 1]).toBe("job_123");
  });

  it("does not allow launching Hunyuan without a job ID", () => {
    expect(() => buildHunyuanRunnerArgs({
      jobId: "",
      hunyuanDir: "E:/AI/Hunyuan3D-2",
      inputPath: "reference.png",
      outputDir: "output",
    })).toThrow("jobId válido");
  });
});

describe("Textured pipeline requirements", () => {
  it("normalizes the UI label and requires texture before export", () => {
    expect(normalizeGenerationMode("Objeto texturizado")).toBe("textured");
    expect(getRequiredStages("textured")).toContain("texture");
    expect(getRequiredStages("textured").at(-1)).toBe("exporting");
  });

  it("passes the same job ID to the texture runner", () => {
    const args = buildHunyuanTexgenArgs({
      jobId: "project_test_001",
      inputPath: "reference.png",
      meshPath: "optimized.glb",
      outputDir: "texture-output",
      hunyuanDir: "E:/AI/Hunyuan3D-2",
    });
    expect(args[args.indexOf("--job-id") + 1]).toBe("project_test_001");
  });
});
