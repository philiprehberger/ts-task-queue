# @philiprehberger/task-queue

[![CI](https://github.com/philiprehberger/task-queue/actions/workflows/publish.yml/badge.svg)](https://github.com/philiprehberger/task-queue/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/@philiprehberger/task-queue.svg)](https://www.npmjs.com/package/@philiprehberger/task-queue)
[![License](https://img.shields.io/github/license/philiprehberger/task-queue)](LICENSE)

In-process async job queue with concurrency control, priorities, and retries.

> **Note:** This is an in-process queue using in-memory storage. For distributed job processing across multiple servers, use a Redis-backed solution like BullMQ.

## Installation

```bash
npm install @philiprehberger/task-queue
```

## Usage

### Basic

```ts
import { createQueue } from '@philiprehberger/task-queue';

const queue = createQueue<{ to: string; subject: string }>({
  concurrency: 3,
  retries: 2,
});

queue.process(async (job) => {
  await sendEmail(job.data.to, job.data.subject);
});

queue.add({ to: 'user@example.com', subject: 'Welcome!' });
```

### Priority

```ts
queue.add(data, { priority: 'high' });   // processed first
queue.add(data, { priority: 'normal' }); // default
queue.add(data, { priority: 'low' });    // processed last
```

### Delayed Jobs

```ts
queue.add(data, { delay: '5m' });     // process after 5 minutes
queue.add(data, { delay: 30000 });    // process after 30 seconds
```

### Job Timeout

```ts
// Queue-level default timeout
const queue = createQueue<MyData>({ concurrency: 3, timeout: 30000 });

// Per-job timeout override
queue.add(data, { timeout: 5000 });
```

### Max Queue Size

```ts
const queue = createQueue<MyData>({ maxSize: 1000 });

queue.add(data); // throws Error if queue already has 1000 pending jobs
```

### Deduplication

```ts
queue.add(data, { key: 'user:123:welcome' });
queue.add(data, { key: 'user:123:welcome' }); // updates priority/data if changed
```

### Events

```ts
const queue = createQueue<MyData>(
  { concurrency: 5, retries: 3 },
  {
    onComplete: (job) => console.log(`Job ${job.id} done`),
    onFailed: (job, error) => console.error(`Job ${job.id} failed:`, error),
    onRetry: (job, error, attempt) => console.log(`Retrying ${job.id} (${attempt})`),
    onDrained: () => console.log('All jobs done'),
  },
);
```

### Pause / Resume

```ts
queue.pause();
queue.resume();
```

### Graceful Shutdown

```ts
process.on('SIGTERM', async () => {
  await queue.drain(); // wait for active jobs to finish
  process.exit(0);
});
```

### Clear Pending Jobs

```ts
const removed = queue.clear(); // removes all pending jobs, returns count removed
```

### Queue Stats

```ts
queue.size();     // total pending jobs
queue.active();   // currently processing
queue.pending();  // ready to process (not delayed)
```


## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
