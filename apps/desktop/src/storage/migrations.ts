import type { ProjectsStorageEnvelope } from "@/projects/types";

export function migrateProjectsEnvelope(input: unknown): ProjectsStorageEnvelope | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const candidate = input as Partial<ProjectsStorageEnvelope>;
  if (candidate.schemaVersion === 1) {
    return candidate as ProjectsStorageEnvelope;
  }

  return null;
}
