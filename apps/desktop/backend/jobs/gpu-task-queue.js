class GpuQueueCancelledError extends Error {
  constructor(jobId) {
    super(`GPU task cancelled before execution: ${jobId}`);
    this.name = "GpuQueueCancelledError";
    this.code = "GPU_QUEUE_CANCELLED";
  }
}

class GpuTaskQueue {
  constructor() {
    this.active = null;
    this.pending = [];
    this.keys = new Set();
    this.cancelledJobs = new Set();
  }

  runExclusive(options, task) {
    const jobId = String(options?.jobId || "unknown");
    const stage = String(options?.stage || "gpu");
    const key = `${jobId}:${stage}`;
    if (this.keys.has(key)) {
      return Promise.reject(new Error(`GPU task already queued or running: ${key}`));
    }
    this.keys.add(key);
    return new Promise((resolve, reject) => {
      this.pending.push({ jobId, stage, key, task, resolve, reject, options });
      options?.onQueued?.(this.snapshot());
      this.drain();
    });
  }

  cancel(jobId) {
    const normalized = String(jobId);
    this.cancelledJobs.add(normalized);
    const retained = [];
    for (const entry of this.pending) {
      if (entry.jobId === normalized) {
        this.keys.delete(entry.key);
        entry.reject(new GpuQueueCancelledError(normalized));
      } else {
        retained.push(entry);
      }
    }
    this.pending = retained;
  }

  resetCancellation(jobId) {
    this.cancelledJobs.delete(String(jobId));
  }

  snapshot() {
    return {
      active: this.active ? { jobId: this.active.jobId, stage: this.active.stage } : null,
      pending: this.pending.map(({ jobId, stage }) => ({ jobId, stage })),
    };
  }

  async drain() {
    if (this.active || this.pending.length === 0) return;
    const entry = this.pending.shift();
    if (this.cancelledJobs.has(entry.jobId) || entry.options?.isCancelled?.()) {
      this.keys.delete(entry.key);
      entry.reject(new GpuQueueCancelledError(entry.jobId));
      queueMicrotask(() => this.drain());
      return;
    }

    this.active = entry;
    entry.options?.onStart?.(this.snapshot());
    try {
      entry.resolve(await entry.task());
    } catch (error) {
      entry.reject(error);
    } finally {
      this.keys.delete(entry.key);
      this.active = null;
      queueMicrotask(() => this.drain());
    }
  }
}

const gpuTaskQueue = new GpuTaskQueue();

module.exports = { GpuTaskQueue, GpuQueueCancelledError, gpuTaskQueue };
