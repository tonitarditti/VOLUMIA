import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { JobStatus, SubmitWorkflowParams } from "./comfyuiTypes";
import { comfyuiService } from "./comfyuiService";
import { COMFYUI_JOB_POLL_MS } from "./comfyuiConfig";

export type GenerationJobStoreState = {
  status: "idle" | "generating" | "result" | "error";
  projectId?: string;
  jobId?: string;
  progress?: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
  outputs?: {
    glbPath?: string;
    texturedGlbPath?: string;
    textureStatus?:
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
    textureMessage?: string;
    textureValidation?: {
      ok: boolean;
      hasMaterials: boolean;
      hasImages: boolean;
      hasTextures: boolean;
      hasMaterialTextureBinding: boolean;
      reason?: string;
      fileSizeBytes?: number;
      sameAsSourceMesh?: boolean;
    };
    previewImages?: string[];
    raw?: unknown;
  };
  error?: { code?: string; message: string };
};

type GenerationJobStoreValue = {
  state: GenerationJobStoreState;
  runGeneration: (params: SubmitWorkflowParams) => Promise<{ jobId: string }>;
  cancelGeneration: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearState: () => void;
};

const GenerationJobStoreContext = createContext<GenerationJobStoreValue | null>(null);

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function hydrateTerminalJobState(jobState: JobStatus): Promise<JobStatus> {
  if (jobState.state !== "RESULT_READY") {
    return jobState;
  }

  if (jobState.outputs?.glbPath || (jobState.outputs?.previewImages?.length ?? 0) > 0) {
    return jobState;
  }

  try {
    const outputs = await comfyuiService.resolveOutputs(jobState.jobId);
    return {
      ...jobState,
      outputs,
    };
  } catch (error) {
    console.warn("[VOLUMIA][comfyui][job] resolveOutputs failed", jobState.jobId, error);
    return jobState;
  }
}

export function GenerationJobProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GenerationJobStoreState>({
    status: "idle",
  });
  const pollGenerationRef = useRef(0);

  const applyRemoteStatus = useCallback((jobState: Awaited<ReturnType<typeof comfyuiService.getJobStatus>>) => {
    if (jobState.state === "RESULT_READY") {
      setState((current) => ({
        ...current,
        status: "result",
        progress: 100,
        message: jobState.message,
        finishedAt: jobState.finishedAt ?? Date.now(),
        outputs: jobState.outputs,
        error: undefined,
      }));
      return;
    }

    if (jobState.state === "ERROR") {
      setState((current) => ({
        ...current,
        status: "error",
        progress: jobState.progress,
        message: jobState.message,
        finishedAt: jobState.finishedAt ?? Date.now(),
        outputs: jobState.outputs,
        error: jobState.error ?? { message: jobState.message },
      }));
      return;
    }

    if (jobState.state === "CANCELED") {
      setState((current) => ({
        ...current,
        status: "idle",
        progress: 0,
        message: "Generation canceled.",
        finishedAt: jobState.finishedAt ?? Date.now(),
        error: undefined,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      status: "generating",
      progress: jobState.progress,
      message: jobState.message,
      error: undefined,
    }));
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!state.jobId) {
      return;
    }

    const jobState = await hydrateTerminalJobState(await comfyuiService.getJobStatus(state.jobId));
    applyRemoteStatus(jobState);
  }, [applyRemoteStatus, state.jobId]);

  const runGeneration = useCallback(async (params: SubmitWorkflowParams) => {
    const pollToken = Date.now();
    pollGenerationRef.current = pollToken;

    const startedAt = Date.now();
    setState({
      status: "generating",
      projectId: params.projectId,
      progress: 2,
      message: "Submitting workflow to ComfyUI...",
      startedAt,
      finishedAt: undefined,
      outputs: undefined,
      error: undefined,
    });

    console.info("[VOLUMIA][comfyui][job] run", params.projectId ?? "unknown-project");
    const submitted = await comfyuiService.submitWorkflow(params);
    setState((current) => ({
      ...current,
      jobId: submitted.jobId,
      progress: 8,
      message: "Workflow queued in ComfyUI.",
    }));

    void (async () => {
      while (pollGenerationRef.current === pollToken) {
        const jobState = await hydrateTerminalJobState(await comfyuiService.getJobStatus(submitted.jobId));
        applyRemoteStatus(jobState);

        if (jobState.state === "RESULT_READY" || jobState.state === "ERROR" || jobState.state === "CANCELED") {
          console.info("[VOLUMIA][comfyui][job] terminal", submitted.jobId, jobState.state);
          return;
        }

        await wait(COMFYUI_JOB_POLL_MS);
      }
    })();

    return submitted;
  }, [applyRemoteStatus]);

  const cancelGeneration = useCallback(async () => {
    if (!state.jobId) {
      return;
    }

    pollGenerationRef.current = 0;
    await comfyuiService.cancelJob(state.jobId);
    setState((current) => ({
      ...current,
      status: "idle",
      progress: 0,
      finishedAt: Date.now(),
      message: "Generation canceled.",
      error: undefined,
    }));
  }, [state.jobId]);

  const clearState = useCallback(() => {
    pollGenerationRef.current = 0;
    setState({
      status: "idle",
    });
  }, []);

  const value = useMemo<GenerationJobStoreValue>(() => {
    return {
      state,
      runGeneration,
      cancelGeneration,
      refreshStatus,
      clearState,
    };
  }, [cancelGeneration, clearState, refreshStatus, runGeneration, state]);

  return <GenerationJobStoreContext.Provider value={value}>{children}</GenerationJobStoreContext.Provider>;
}

export function useGenerationJobStore() {
  const context = useContext(GenerationJobStoreContext);
  if (!context) {
    throw new Error("useGenerationJobStore must be used within GenerationJobProvider.");
  }
  return context;
}
