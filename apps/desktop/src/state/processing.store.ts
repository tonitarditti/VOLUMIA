import { create } from "zustand";

export type ProcessingStepStatus = "pending" | "active" | "done" | "error";

type ProcessingStep = {
  id: string;
  status: ProcessingStepStatus;
};

type ProcessingMessageKey =
  | "processing.message.waiting"
  | "processing.message.generating"
  | "processing.message.ready"
  | "processing.message.failed";

type ProcessingState = {
  progress: number;
  messageKey: ProcessingMessageKey;
  errorDetail: string | null;
  startedAt: number | null;
  failed: boolean;
  steps: ProcessingStep[];
  start: () => void;
  advance: (amount: number) => void;
  complete: () => void;
  fail: (message: string) => void;
  reset: () => void;
};

const baseSteps = (): ProcessingStep[] => [
  { id: "analyze", status: "pending" },
  { id: "reconstruct", status: "pending" },
  { id: "optimize", status: "pending" },
  { id: "package", status: "pending" },
];

function resolveStepStatuses(progress: number): ProcessingStep[] {
  const thresholds = [20, 60, 85, 100];
  return baseSteps().map((step, index) => {
    const min = index === 0 ? 0 : thresholds[index - 1];
    const max = thresholds[index];

    if (progress >= max) return { ...step, status: "done" as const };
    if (progress >= min && progress < max) return { ...step, status: "active" as const };
    return step;
  });
}

export const useProcessingStore = create<ProcessingState>((set, get) => ({
  progress: 0,
  messageKey: "processing.message.waiting",
  errorDetail: null,
  startedAt: null,
  failed: false,
  steps: baseSteps(),

  start: () =>
    set({
      progress: 3,
      messageKey: "processing.message.generating",
      errorDetail: null,
      startedAt: Date.now(),
      failed: false,
      steps: resolveStepStatuses(3),
    }),

  advance: (amount) => {
    const current = get().progress;
    const next = Math.min(95, current + amount);
    set({ progress: next, steps: resolveStepStatuses(next) });
  },

  complete: () =>
    set({
      progress: 100,
      messageKey: "processing.message.ready",
      errorDetail: null,
      failed: false,
      steps: resolveStepStatuses(100),
    }),

  fail: (message) =>
    set((state) => ({
      failed: true,
      messageKey: "processing.message.failed",
      errorDetail: message,
      steps: state.steps.map((step) => (step.status === "active" ? { ...step, status: "error" } : step)),
    })),

  reset: () =>
    set({
      progress: 0,
      messageKey: "processing.message.waiting",
      errorDetail: null,
      startedAt: null,
      failed: false,
      steps: baseSteps(),
    }),
}));
