import { describe, expect, it } from "vitest";
import generate3d from "./generate3d.js";

const {
  QUICK_CANONICAL_ROTATION,
  QUICK_AXIS_NORMALIZATION,
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
