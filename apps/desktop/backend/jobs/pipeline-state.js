const PIPELINE_STATES = [
  "queued",
  "preparing",
  "segmenting",
  "geometry_running",
  "geometry_completed",
  "optimizing",
  "uv_processing",
  "gpu_cleanup",
  "texture_queued",
  "texture_running",
  "texture_completed",
  "exporting",
  "completed",
  "failed",
  "cancelled",
];

const transitions = new Map([
  ["queued", new Set(["preparing"])],
  ["preparing", new Set(["segmenting", "geometry_running"])],
  ["segmenting", new Set(["geometry_running"])],
  ["geometry_running", new Set(["geometry_completed"])],
  ["geometry_completed", new Set(["optimizing"])],
  ["optimizing", new Set(["uv_processing"])],
  ["uv_processing", new Set(["gpu_cleanup"])],
  ["gpu_cleanup", new Set(["texture_queued", "exporting"])],
  ["texture_queued", new Set(["texture_running"])],
  ["texture_running", new Set(["texture_completed"])],
  ["texture_completed", new Set(["exporting"])],
  ["exporting", new Set(["completed"])],
]);
const terminalStates = new Set(["completed", "failed", "cancelled"]);

function createPipelineState(jobId, timestamp = new Date().toISOString()) {
  return {
    jobId: jobId || null,
    state: "queued",
    activeStage: "validating",
    completedStages: [],
    errors: [],
    outputPaths: [],
    activePids: [],
    startedAt: timestamp,
    finishedAt: null,
    sequenceNumber: 0,
    updatedAt: timestamp,
    history: [{ state: "queued", stage: "validating", detail: "Trabajo en cola.", timestamp, sequenceNumber: 0 }],
  };
}

function transitionPipeline(current, nextState, options = {}) {
  if (!PIPELINE_STATES.includes(nextState)) {
    throw new Error(`Unknown pipeline state: ${nextState}`);
  }
  if (!current || !PIPELINE_STATES.includes(current.state)) {
    throw new Error("Invalid persisted pipeline state.");
  }
  if (current.state === nextState) return current;
  if (terminalStates.has(current.state)) {
    throw new Error(`Pipeline is already terminal: ${current.state}`);
  }
  const failureTransition = nextState === "failed" || nextState === "cancelled";
  if (!failureTransition && !transitions.get(current.state)?.has(nextState)) {
    throw new Error(`Invalid pipeline transition: ${current.state} -> ${nextState}`);
  }

  const timestamp = options.timestamp || new Date().toISOString();
  const sequenceNumber = Number(current.sequenceNumber || 0) + 1;
  const completedStages = new Set(current.completedStages || []);
  if (options.completedStage) completedStages.add(options.completedStage);
  const errors = [...(current.errors || [])];
  if (options.error) errors.push({ stage: options.stage || current.activeStage, message: String(options.error), timestamp });
  return {
    ...current,
    state: nextState,
    activeStage: options.stage || current.activeStage,
    completedStages: [...completedStages],
    errors,
    outputPaths: options.outputPaths || current.outputPaths || [],
    finishedAt: terminalStates.has(nextState) ? timestamp : null,
    sequenceNumber,
    updatedAt: timestamp,
    history: [
      ...(current.history || []),
      {
        state: nextState,
        stage: options.stage || current.activeStage,
        detail: options.detail || "",
        timestamp,
        sequenceNumber,
      },
    ].slice(-200),
  };
}

module.exports = { PIPELINE_STATES, createPipelineState, transitionPipeline };
