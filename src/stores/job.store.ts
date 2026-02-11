import { create } from "zustand";

export type JobStatus =
  | "idle"
  | "preprocessing"
  | "reconstructing"
  | "postprocessing"
  | "exporting"
  | "done"
  | "failed";

type State = {
  status: JobStatus;
  message: string;
  progress: number; // 0..100
  lastOutputName?: string;

  startFakeJob: () => void;
  reset: () => void;
};

export const useJobStore = create<State>((set) => ({
  status: "idle",
  message: "Ready",
  progress: 0,
  lastOutputName: undefined,

  startFakeJob: () => {
    const steps: Array<{ s: JobStatus; m: string; p: number; ms: number }> = [
      { s: "preprocessing", m: "Analyzing image...", p: 12, ms: 800 },
      { s: "reconstructing", m: "Reconstructing volume...", p: 48, ms: 1200 },
      { s: "postprocessing", m: "Cleaning geometry...", p: 72, ms: 900 },
      { s: "exporting", m: "Preparing editable model...", p: 90, ms: 700 },
      { s: "done", m: "Model ready (editable).", p: 100, ms: 400 },
    ];

    set({ status: "preprocessing", message: "Starting...", progress: 1 });

    let i = 0;
    const tick = () => {
      const step = steps[i++];
      if (!step) return;
      set({ status: step.s, message: step.m, progress: step.p });
      if (step.s === "done") set({ lastOutputName: `volumia_model_${Date.now()}` });
      if (i < steps.length) setTimeout(tick, step.ms);
    };
    setTimeout(tick, 350);
  },

  reset: () => set({ status: "idle", message: "Ready", progress: 0, lastOutputName: undefined }),
}));
