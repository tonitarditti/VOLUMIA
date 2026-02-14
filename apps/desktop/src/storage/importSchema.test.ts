import { describe, expect, it } from "vitest";
import { createProject } from "@/projects/factory";
import { parseImportEnvelope } from "./importSchema";

describe("parseImportEnvelope", () => {
  it("parses valid payload", () => {
    const project = createProject("Imported");
    const raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: "VOLUMIA",
      projects: [project],
    });

    const parsed = parseImportEnvelope(raw);

    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].name).toBe("Imported");
  });

  it("throws on malformed json", () => {
    expect(() => parseImportEnvelope("{" )).toThrow("Invalid JSON file.");
  });

  it("filters invalid projects", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: "VOLUMIA",
      projects: [{ id: "x" }, { id: "y", name: "bad" }],
    });

    const parsed = parseImportEnvelope(raw);

    expect(parsed.projects).toHaveLength(0);
  });
});
