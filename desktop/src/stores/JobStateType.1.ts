import { engineClient } from '@/services/engineClient';
import { create } from 'zustand';
import { useSettingsStore } from './settings.store';

type JobStateType = 'idle' | 'processing' | 'done' | 'error';
interface JobStore {
  jobState: JobStateType;
  jobId: string | null;
  progress: number;
  stageMessage: string;
  logs: string[];
  outputs: Record<string, string>;
  error: string | null;

  // Actions
  submitJob: (images: File[]) => Promise<void>;
  pollJobStatus: (jobId: string) => Promise<void>;
  clearJob: () => void;
}

export const useJobStore = create<JobStore>((set, get) => ({
  jobState: 'idle',
  jobId: null,
  progress: 0,
  stageMessage: 'Ready',
  logs: [],
  outputs: {},
  error: null,

  submitJob: async (images: File[]) => {
    try {
      set({ jobState: 'processing', progress: 0, stageMessage: 'Uploading images...' });

      const settings = useSettingsStore.getState();
      const response = await engineClient.createJob(
        images,
        settings.preset,
        settings.units,
        settings.detail,
        settings.outputObj,
        settings.outputGlb,
        settings.textures
      );

      set({ jobId: response.id });

      // Poll for job status
      const pollInterval = setInterval(async () => {
        try {
          const status = await engineClient.getJobStatus(response.id);

          set({
            progress: status.progress,
            stageMessage: status.message,
            logs: status.logs || [],
            outputs: status.outputs || {},
          });

          if (status.state === 'done') {
            set({ jobState: 'done' });
            clearInterval(pollInterval);
          } else if (status.state === 'failed' || status.state === 'warning') {
            set({ jobState: 'error', error: status.error || 'Job failed' });
            clearInterval(pollInterval);
          }
        } catch (err) {
          console.error('Error polling job status:', err);
          clearInterval(pollInterval);
        }
      }, 500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit job';
      set({ jobState: 'error', stageMessage: errorMsg, error: errorMsg });
    }
  },

  pollJobStatus: async (jobId: string) => {
    try {
      const status = await engineClient.getJobStatus(jobId);
      set({
        progress: status.progress,
        stageMessage: status.message,
        logs: status.logs || [],
      });
    } catch (err) {
      console.error('Error polling job:', err);
    }
  },

  clearJob: () => set({
    jobState: 'idle',
    jobId: null,
    progress: 0,
    stageMessage: 'Ready',
    logs: [],
    outputs: {},
    error: null,
  }),
}));
