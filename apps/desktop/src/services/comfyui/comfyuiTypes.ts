import type {
  ComfyJobOutputs,
  ComfyJobState,
  ComfyJobStatusResponse,
  ComfyStatusResponse,
  ComfySubmitJobPayload,
} from "@/electron/channels";

export type EnsureReadyResult = {
  ready: boolean;
  details?: string;
};

export type SubmitWorkflowParams = ComfySubmitJobPayload;

export type SubmitWorkflowResult = {
  jobId: string;
};

export type JobOutputs = ComfyJobOutputs;

export type JobStatus = {
  jobId: string;
  promptId: string;
  state: ComfyJobState;
  progress: number;
  message: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  queuePosition?: number;
  outputs?: JobOutputs;
  error?: {
    code?: string;
    message: string;
  };
  raw: ComfyJobStatusResponse;
};

export type ComfyReadinessSnapshot = {
  status: ComfyStatusResponse;
  ready: boolean;
};
