export type Priority = 'high' | 'normal' | 'low';
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'delayed';

export interface QueueOptions {
  concurrency?: number;
  retries?: number;
  backoffMultiplier?: number;
  initialBackoff?: number;
  timeout?: string | number;
}

export interface AddOptions {
  priority?: Priority;
  delay?: string | number;
  key?: string;
  timeout?: string | number;
}

export interface Job<T> {
  id: string;
  data: T;
  status: JobStatus;
  attempts: number;
  maxRetries: number;
  priority: Priority;
  createdAt: number;
  processAt: number;
  key?: string;
  error?: Error;
  timeout?: number;
}

export type JobHandler<T> = (job: Job<T>) => Promise<void>;

export interface QueueEvents<T> {
  onComplete?: (job: Job<T>) => void;
  onFailed?: (job: Job<T>, error: Error) => void;
  onRetry?: (job: Job<T>, error: Error, attempt: number) => void;
  onDrained?: () => void;
}
