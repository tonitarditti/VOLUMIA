import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { validateImageForTexGen } from "./texgenImageValidation";
import { validateMeshForTexGen } from "./texgenMeshValidation";
import { validateTexgenOutput } from "./texgenOutputValidation";
import {
  buildTexgenAttemptPlan,
  shouldRetryTexgenFailure,
} from "./texgenRetryPolicy";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "volumia-texgen-"));
  tempDirs.push(dir);
  return dir;
}

function writeGridObj(filePath: string, options?: { flat?: boolean }) {
  const lines: string[] = [];
  const size = 5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const z = options?.flat ? 0 : (x + y) * 0.05;
      lines.push(`v ${x} ${y} ${z}`);
    }
  }
  for (let index = 0; index < size * size; index += 1) {
    lines.push("vn 0 0 1");
  }
  const vertexAt = (x: number, y: number) => y * size + x + 1;
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const a = vertexAt(x, y);
      const b = vertexAt(x + 1, y);
      const c = vertexAt(x, y + 1);
      const d = vertexAt(x + 1, y + 1);
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      lines.push(`f ${b}//${b} ${d}//${d} ${c}//${c}`);
    }
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeFakePng(filePath: string, width: number, height: number) {
  const buffer = Buffer.alloc(2048, 0);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG\r\n\x1a\n", 1, "binary");
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer.writeUInt8(8, 24);
  buffer.writeUInt8(6, 25);
  fs.writeFileSync(filePath, buffer);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("texgen pipeline utilities", () => {
  it("accepts a volumetric OBJ mesh for texgen", () => {
    const dir = makeTempDir();
    const meshPath = path.join(dir, "mesh.obj");
    writeGridObj(meshPath);

    const result = validateMeshForTexGen(meshPath);

    expect(result.ok).toBe(true);
    expect(result.vertexCount).toBeGreaterThanOrEqual(25);
    expect(result.faceCount).toBeGreaterThanOrEqual(32);
  });

  it("rejects a flat sheet-like OBJ mesh", () => {
    const dir = makeTempDir();
    const meshPath = path.join(dir, "flat.obj");
    writeGridObj(meshPath, { flat: true });

    const result = validateMeshForTexGen(meshPath);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("sheet-like");
  });

  it("validates a usable texgen input image and rejects undersized images", () => {
    const dir = makeTempDir();
    const validImage = path.join(dir, "valid.png");
    const smallImage = path.join(dir, "small.png");
    writeFakePng(validImage, 512, 512);
    writeFakePng(smallImage, 128, 128);

    expect(validateImageForTexGen(validImage).ok).toBe(true);
    expect(validateImageForTexGen(smallImage).ok).toBe(false);
  });

  it("builds retry tiers and only retries retryable texgen failures", () => {
    const plan = buildTexgenAttemptPlan("high");

    expect(plan.map((attempt) => attempt.preset)).toEqual([
      "high",
      "balanced",
      "fast",
    ]);
    expect(
      shouldRetryTexgenFailure("timed_out", {
        attemptIndex: 0,
        totalAttempts: 3,
        reason: "timed out",
        stdout: "",
        stderr: "",
      }),
    ).toBe(true);
    expect(
      shouldRetryTexgenFailure("skipped_invalid_mesh", {
        attemptIndex: 0,
        totalAttempts: 3,
        reason: "invalid mesh",
        stdout: "",
        stderr: "",
      }),
    ).toBe(false);
  });

  it("rejects missing texgen outputs as invalid", () => {
    const dir = makeTempDir();
    const meshPath = path.join(dir, "mesh.obj");
    writeGridObj(meshPath);

    const validation = validateTexgenOutput({
      outputPath: path.join(dir, "missing-textured.glb"),
      sourceMeshPath: meshPath,
    });

    expect(validation.ok).toBe(false);
    expect(validation.reason).toContain("not generated");
  });
});
