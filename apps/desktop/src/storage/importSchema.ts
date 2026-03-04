import type { ProjectsExportEnvelope } from "@/electron/channels";
import { isProject } from "@/projects/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseImportEnvelope(rawJson: string): ProjectsExportEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Invalid import payload.");
  }

  if (parsed.schemaVersion !== 1) {
    throw new Error("Unsupported schema version.");
  }

  if (parsed.app !== "VOLUMIA") {
    throw new Error("Invalid application marker.");
  }

  const projects = Array.isArray(parsed.projects)
    ? parsed.projects.filter((candidate): candidate is ProjectsExportEnvelope["projects"][number] =>
        isProject(candidate)
      )
    : [];

  return {
    schemaVersion: 1,
    app: "VOLUMIA",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    projects,
  };
}
