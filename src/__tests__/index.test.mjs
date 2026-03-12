import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../dist/index.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('task-queue', () => {
  describe('basic add/process lifecycle', () => {
    it('should process a job and complete it', async () => {
      const q = createQueue();
      const results = [];

      q.process(async (job) => {
        results.push(job.data);
      });

      q.add('hello');
      await q.drain();

      assert.deepStrictEqual(results, ['hello']);
      q.destroy();
    });

    it('should process multiple jobs in order', async () => {
      const q = createQueue();
      const results = [];

      q.process(async (job) => {
        results.push(job.data);
      });

      q.add(1);
      q.add(2);
      q.add(3);
      await q.drain();

      assert.deepStrictEqual(results, [1, 2, 3]);
      q.destroy();
    });

    it('should set job status to completed after processing', async () => {
      const q = createQueue();
      let captured;

      q.process(async (job) => {
        // no-op
      });

      const job = q.add('test');
      await q.drain();

      assert.strictEqual(job.status, 'completed');
      q.destroy();
    });
  });

  describe('priority ordering', () => {
    it('should process high priority before normal before low', async () => {
      const q = createQueue();
      const results = [];

      // Add jobs before registering handler so they queue up
      q.add('low', { priority: 'low' });
      q.add('normal', { priority: 'normal' });
      q.add('high', { priority: 'high' });

      q.process(async (job) => {
        results.push(job.data);
      });

      await q.drain();

      assert.deepStrictEqual(results, ['high', 'normal', 'low']);
      q.destroy();
    });

    it('should process same-priority jobs in FIFO order', async () => {
      const q = createQueue();
      const results = [];

      q.add('a', { priority: 'normal' });
      q.add('b', { priority: 'normal' });
      q.add('c', { priority: 'normal' });

      q.process(async (job) => {
        results.push(job.data);
      });

      await q.drain();

      assert.deepStrictEqual(results, ['a', 'b', 'c']);
      q.destroy();
    });
  });

  describe('concurrency limits', () => {
    it('should respect concurrency of 1', async () => {
      const q = createQueue({ concurrency: 1 });
      let maxConcurrent = 0;
      let current = 0;

      q.process(async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await wait(10);
        current--;
      });

      q.add('a');
      q.add('b');
      q.add('c');
      await q.drain();

      assert.strictEqual(maxConcurrent, 1);
      q.destroy();
    });

    it('should allow up to N concurrent jobs', async () => {
      const q = createQueue({ concurrency: 3 });
      let maxConcurrent = 0;
      let current = 0;

      q.process(async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await wait(20);
        current--;
      });

      for (let i = 0; i < 6; i++) q.add(i);
      await q.drain();

      assert.strictEqual(maxConcurrent, 3);
      q.destroy();
    });
  });

  describe('retry with backoff', () => {
    it('should retry a failing job up to retries count', async () => {
      let attempts = 0;
      const q = createQueue({ retries: 2, initialBackoff: 10, backoffMultiplier: 1 });

      q.process(async () => {
        attempts++;
        throw new Error('fail');
      });

      q.add('test');
      await q.drain();

      // 1 initial + 2 retries = 3 total
      assert.strictEqual(attempts, 3);
      q.destroy();
    });

    it('should call onRetry and onFailed events', async () => {
      const retries = [];
      let failedJob = null;

      const q = createQueue(
        { retries: 1, initialBackoff: 10, backoffMultiplier: 1 },
        {
          onRetry: (job, err, attempt) => retries.push(attempt),
          onFailed: (job) => { failedJob = job; },
        }
      );

      q.process(async () => {
        throw new Error('oops');
      });

      q.add('test');
      await q.drain();

      assert.deepStrictEqual(retries, [1]);
      assert.notStrictEqual(failedJob, null);
      assert.strictEqual(failedJob.status, 'failed');
      q.destroy();
    });
  });

  describe('pause/resume', () => {
    it('should not process jobs while paused', async () => {
      const q = createQueue();
      const results = [];

      q.process(async (job) => {
        results.push(job.data);
      });

      q.pause();
      q.add('should-not-run');

      await wait(50);
      assert.strictEqual(results.length, 0);

      q.resume();
      await q.drain();

      assert.deepStrictEqual(results, ['should-not-run']);
      q.destroy();
    });
  });

  describe('deduplication by key', () => {
    it('should return existing job when adding duplicate key', async () => {
      const q = createQueue();
      const results = [];

      const job1 = q.add('first', { key: 'unique' });
      const job2 = q.add('second', { key: 'unique' });

      assert.strictEqual(job1.id, job2.id);

      q.process(async (job) => {
        results.push(job.data);
      });

      await q.drain();

      // Should only process once, but with updated data
      assert.strictEqual(results.length, 1);
      q.destroy();
    });

    it('should update priority and data when re-adding with same key', async () => {
      const q = createQueue();

      const job1 = q.add('old-data', { key: 'k1', priority: 'low' });
      const job2 = q.add('new-data', { key: 'k1', priority: 'high' });

      assert.strictEqual(job1.id, job2.id);
      assert.strictEqual(job1.data, 'new-data');
      assert.strictEqual(job1.priority, 'high');

      q.destroy();
    });

    it('should allow same key after job completes', async () => {
      const q = createQueue();
      const results = [];

      q.process(async (job) => {
        results.push(job.data);
      });

      q.add('first', { key: 'reusable' });
      await q.drain();

      q.add('second', { key: 'reusable' });
      await q.drain();

      assert.deepStrictEqual(results, ['first', 'second']);
      q.destroy();
    });
  });

  describe('delayed jobs', () => {
    it('should delay processing of a job', async () => {
      const q = createQueue();
      const results = [];

      q.process(async (job) => {
        results.push(job.data);
      });

      q.add('delayed', { delay: 100 });

      assert.strictEqual(results.length, 0);
      await wait(200);
      // The timer ticks every 500ms; wait enough
      await wait(500);
      await q.drain();

      assert.deepStrictEqual(results, ['delayed']);
      q.destroy();
    });

    it('should process immediate jobs before delayed ones', async () => {
      const q = createQueue();
      const results = [];

      q.add('delayed', { delay: 200 });
      q.add('immediate');

      q.process(async (job) => {
        results.push(job.data);
      });

      await wait(800);
      await q.drain();

      assert.strictEqual(results[0], 'immediate');
      assert.ok(results.includes('delayed'));
      q.destroy();
    });
  });

  describe('drain promise', () => {
    it('should resolve immediately when queue is empty', async () => {
      const q = createQueue();
      q.process(async () => {});
      await q.drain(); // should not hang
      q.destroy();
    });

    it('should resolve once all jobs complete', async () => {
      const q = createQueue();
      let completed = 0;

      q.process(async () => {
        await wait(10);
        completed++;
      });

      q.add(1);
      q.add(2);
      q.add(3);

      await q.drain();
      assert.strictEqual(completed, 3);
      q.destroy();
    });
  });

  describe('destroy cleanup', () => {
    it('should clear pending jobs and stop processing', async () => {
      const q = createQueue();
      const results = [];

      q.add('a');
      q.add('b');

      q.destroy();

      assert.strictEqual(q.size(), 0);
      assert.strictEqual(q.active(), 0);
    });
  });

  describe('ID uniqueness across multiple queues', () => {
    it('should have independent ID counters per queue', () => {
      const q1 = createQueue();
      const q2 = createQueue();

      const job1a = q1.add('a');
      const job2a = q2.add('a');
      const job1b = q1.add('b');
      const job2b = q2.add('b');

      // Both queues should start their counters independently
      // So the counter part of the IDs will overlap, proving independence
      // Extract counter from ID: job_<timestamp>_<counter>
      const counter1a = job1a.id.split('_').pop();
      const counter2a = job2a.id.split('_').pop();
      const counter1b = job1b.id.split('_').pop();
      const counter2b = job2b.id.split('_').pop();

      assert.strictEqual(counter1a, '1');
      assert.strictEqual(counter2a, '1');
      assert.strictEqual(counter1b, '2');
      assert.strictEqual(counter2b, '2');

      q1.destroy();
      q2.destroy();
    });
  });

  describe('job timeout', () => {
    it('should fail a job that exceeds queue-level timeout', async () => {
      let failedErr = null;
      const q = createQueue(
        { timeout: 50 },
        { onFailed: (_job, err) => { failedErr = err; } }
      );

      q.process(async () => {
        await wait(200);
      });

      q.add('slow');
      await q.drain();

      assert.notStrictEqual(failedErr, null);
      assert.ok(failedErr.message.includes('timed out'));
      q.destroy();
    });

    it('should allow per-job timeout override', async () => {
      let failedErr = null;
      const q = createQueue(
        { timeout: 5000 },
        { onFailed: (_job, err) => { failedErr = err; } }
      );

      q.process(async () => {
        await wait(200);
      });

      q.add('slow', { timeout: 50 });
      await q.drain();

      assert.notStrictEqual(failedErr, null);
      assert.ok(failedErr.message.includes('timed out'));
      q.destroy();
    });

    it('should retry timed-out jobs if retries configured', async () => {
      let attempts = 0;
      const q = createQueue({ timeout: 30, retries: 1, initialBackoff: 10, backoffMultiplier: 1 });

      q.process(async () => {
        attempts++;
        await wait(200);
      });

      q.add('slow');
      await q.drain();

      assert.strictEqual(attempts, 2);
      q.destroy();
    });
  });

  describe('events', () => {
    it('should fire onComplete for successful jobs', async () => {
      const completed = [];
      const q = createQueue({}, { onComplete: (job) => completed.push(job.data) });

      q.process(async () => {});
      q.add('x');
      await q.drain();

      assert.deepStrictEqual(completed, ['x']);
      q.destroy();
    });

    it('should fire onDrained when queue empties', async () => {
      let drained = 0;
      const q = createQueue({}, { onDrained: () => drained++ });

      q.process(async () => {});
      q.add('x');
      await q.drain();

      assert.ok(drained >= 1);
      q.destroy();
    });
  });
});
