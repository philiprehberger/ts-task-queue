import type { QueueOptions, AddOptions, Job, JobHandler, QueueEvents, Priority } from './types.js';
import { parseDuration } from './duration.js';

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export function createQueue<T>(options: QueueOptions = {}, events: QueueEvents<T> = {}) {
  const {
    concurrency = 1,
    retries = 0,
    backoffMultiplier = 2,
    initialBackoff = 1000,
    timeout: queueTimeout,
  } = options;

  const defaultTimeout = queueTimeout ? parseDuration(queueTimeout) : undefined;

  let idCounter = 0;
  function generateId(): string {
    return `job_${Date.now()}_${++idCounter}`;
  }

  const pending: Job<T>[] = [];
  const activeJobs = new Set<Job<T>>();
  const knownKeys = new Set<string>();
  let handler: JobHandler<T> | null = null;
  let paused = false;
  let drainResolvers: Array<() => void> = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  function sortPending(): void {
    pending.sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt - b.createdAt;
    });
  }

  function checkDrained(): void {
    if (pending.length === 0 && activeJobs.size === 0) {
      events.onDrained?.();
      for (const resolve of drainResolvers) resolve();
      drainResolvers = [];
    }
  }

  async function processJob(job: Job<T>): Promise<void> {
    if (!handler) return;

    job.status = 'active';
    activeJobs.add(job);

    try {
      job.attempts++;

      const jobTimeout = job.timeout ?? defaultTimeout;

      let result: Promise<void>;
      if (jobTimeout != null && jobTimeout > 0) {
        result = Promise.race([
          handler(job),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Job timed out after ${jobTimeout}ms`)), jobTimeout);
          }),
        ]);
      } else {
        result = handler(job);
      }

      await result;
      job.status = 'completed';
      if (job.key) knownKeys.delete(job.key);
      events.onComplete?.(job);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      job.error = err;

      if (job.attempts < job.maxRetries + 1) {
        events.onRetry?.(job, err, job.attempts);
        const delay = initialBackoff * Math.pow(backoffMultiplier, job.attempts - 1);
        job.status = 'delayed';
        job.processAt = Date.now() + delay;
        pending.push(job);
        sortPending();
      } else {
        job.status = 'failed';
        if (job.key) knownKeys.delete(job.key);
        events.onFailed?.(job, err);
      }
    } finally {
      activeJobs.delete(job);
      tick();
      checkDrained();
    }
  }

  function tick(): void {
    if (paused || !handler) return;

    const now = Date.now();
    while (activeJobs.size < concurrency && pending.length > 0) {
      const idx = pending.findIndex((j) => j.processAt <= now);
      if (idx === -1) break;
      const [job] = pending.splice(idx, 1);
      processJob(job);
    }
  }

  function startTimer(): void {
    if (timer) return;
    timer = setInterval(tick, 500);
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function process(fn: JobHandler<T>): void {
    handler = fn;
    startTimer();
    tick();
  }

  function add(data: T, opts?: AddOptions): Job<T> {
    if (opts?.key && knownKeys.has(opts.key)) {
      const existing = pending.find((j) => j.key === opts.key);
      if (existing) {
        const newPriority = opts.priority ?? 'normal';
        if (existing.priority !== newPriority || existing.data !== data) {
          existing.priority = newPriority;
          existing.data = data;
          sortPending();
        }
        return existing;
      }
    }

    const delay = opts?.delay ? parseDuration(opts.delay) : 0;
    const jobTimeout = opts?.timeout ? parseDuration(opts.timeout) : undefined;
    const job: Job<T> = {
      id: generateId(),
      data,
      status: delay > 0 ? 'delayed' : 'pending',
      attempts: 0,
      maxRetries: retries,
      priority: opts?.priority ?? 'normal',
      createdAt: Date.now(),
      processAt: Date.now() + delay,
      key: opts?.key,
      timeout: jobTimeout,
    };

    if (opts?.key) knownKeys.add(opts.key);
    pending.push(job);
    sortPending();
    tick();
    return job;
  }

  function drain(): Promise<void> {
    if (pending.length === 0 && activeJobs.size === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      drainResolvers.push(resolve);
    });
  }

  function pause(): void {
    paused = true;
  }

  function resume(): void {
    paused = false;
    tick();
  }

  function size(): number {
    return pending.length;
  }

  function active(): number {
    return activeJobs.size;
  }

  function pendingCount(): number {
    return pending.filter((j) => j.processAt <= Date.now()).length;
  }

  function destroy(): void {
    stopTimer();
    pending.length = 0;
    activeJobs.clear();
    knownKeys.clear();
    handler = null;
  }

  return { process, add, drain, pause, resume, size, active, pending: pendingCount, destroy };
}
