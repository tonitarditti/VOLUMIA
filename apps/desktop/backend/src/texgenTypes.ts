export type TexgenPreset = "fast" | "balanced" | "high";

export type TextureStageStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped_invalid_mesh"
  | "skipped_invalid_image"
  | "stalled"
  | "timed_out"
  | "runtime_error"
  | "process_start_failed"
  | "no_output_generated"
  | "invalid_output"
  | "fallback_geometry_only";

export type TexgenDependencySnapshot = {
  moduleRoots: string[];
  validModuleRoots: string[];
  hasCustomRasterizer: boolean;
  hasDifferentiableRenderer: boolean;
  missingPaths: string[];
  pythonExecutable: string | null;
  pythonRunnerDetails: string | null;
  importChecks: Record<string, string>;
};

export type TexturedGlbValidation = {
  ok: boolean;
  hasMaterials: boolean;
  hasImages: boolean;
  hasTextures: boolean;
  hasMaterialTextureBinding: boolean;
  reason?: string;
  fileSizeBytes?: number;
  sameAsSourceMesh?: boolean;
};

export type TexgenBounds = {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  diagonal: number;
  volume: number;
};

export type TexgenMeshValidation = {
  ok: boolean;
  meshPath: string;
  format: "obj" | "glb" | "gltf" | "unknown";
  fileSizeBytes: number;
  readable: boolean;
  vertexCount: number;
  faceCount: number;
  componentCount: number | null;
  hasNormals: boolean;
  normalsRegenerable: boolean;
  flatnessRatio: number | null;
  bounds: TexgenBounds | null;
  warnings: string[];
  reason?: string;
};

export type TexgenImageValidation = {
  ok: boolean;
  imagePath: string;
  format: "png" | "jpeg" | "webp" | "gif" | "bmp" | "unknown";
  fileSizeBytes: number;
  readable: boolean;
  width: number;
  height: number;
  hasAlpha: boolean | null;
  warnings: string[];
  reason?: string;
};

export type TexgenOutputValidation = TexturedGlbValidation & {
  outputPath: string;
};

export type TexgenAttemptTimings = {
  hardTimeoutMs: number;
  stallTimeoutMs: number;
  stallGraceMs: number;
  outputGraceMs: number;
};

export type TexgenAttemptRecord = {
  attempt: number;
  preset: TexgenPreset;
  status: Exclude<TextureStageStatus, "pending" | "running" | "fallback_geometry_only">;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  hardTimeoutMs: number;
  stallTimeoutMs: number;
  outputGraceMs: number;
  exitCode: number;
  timedOut: boolean;
  stalled: boolean;
  retryScheduled: boolean;
  reason: string;
  stdoutTail: string[];
  stderrTail: string[];
  outputPath?: string;
  metadataPath?: string;
};

export type TexgenAttemptOutcome = {
  status: Exclude<TextureStageStatus, "pending" | "running" | "fallback_geometry_only">;
  reason: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stalled: boolean;
  runnerDetails: string;
  commandLine: string;
  metadata?: Record<string, unknown> | null;
  outputPath?: string;
};

export type TexgenPreflightSummary = {
  mesh: TexgenMeshValidation;
  image: TexgenImageValidation;
};
