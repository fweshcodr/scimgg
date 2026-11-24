import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool, networkPool } from '../networkPool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('networkPool', () => {
  it('validates concurrency input', () => {
    expect(() => createPool(0)).toThrow('concurrency must be a positive integer');
    expect(() => createPool(-1)).toThrow('concurrency must be a positive integer');
    expect(() => createPool(1.5)).toThrow('concurrency must be a positive integer');
  });

  it('limits concurrent execution to configured concurrency', async () => {
    const pool = createPool(2);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];

    let running = 0;
    let maxRunning = 0;

    const tasks = gates.map((gate, idx) =>
      pool.add(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await gate.promise;
        running--;
        return idx;
      }),
    );

    await Promise.resolve();
    expect(maxRunning).toBe(2);

    gates[0].resolve();
    gates[1].resolve();
    gates[2].resolve();
    gates[3].resolve();

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3]);
    expect(maxRunning).toBe(2);
  });

  it('runs queued tasks in FIFO order as slots free up', async () => {
    const pool = createPool(2);
    const first = deferred<void>();
    const second = deferred<void>();
    const third = deferred<void>();
    const fourth = deferred<void>();
    const startOrder: string[] = [];

    const p1 = pool.add(async () => {
      startOrder.push('first');
      await first.promise;
      return 'first';
    });
    const p2 = pool.add(async () => {
      startOrder.push('second');
      await second.promise;
      return 'second';
    });
    const p3 = pool.add(async () => {
      startOrder.push('third');
      await third.promise;
      return 'third';
    });
    const p4 = pool.add(async () => {
      startOrder.push('fourth');
      await fourth.promise;
      return 'fourth';
    });

    await Promise.resolve();
    expect(startOrder).toEqual(['first', 'second']);

    first.resolve();
    await vi.waitFor(() => {
      expect(startOrder).toEqual(['first', 'second', 'third']);
    });

    second.resolve();
    await vi.waitFor(() => {
      expect(startOrder).toEqual(['first', 'second', 'third', 'fourth']);
    });

    third.resolve();
    fourth.resolve();

    await expect(Promise.all([p1, p2, p3, p4])).resolves.toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('releases slot when fn throws synchronously so next task runs', async () => {
    const pool = createPool(1);
    const secondTask = vi.fn(async () => 'ok');

    const first = pool.add(() => {
      throw new Error('boom');
    });
    const second = pool.add(secondTask);

    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
    expect(secondTask).toHaveBeenCalledTimes(1);
  });

  it('preserves individual resolve and reject outcomes', async () => {
    const pool = createPool(3);
    const err = new Error('nope');

    const a = pool.add(async () => 'A');
    const b = pool.add(async () => {
      throw err;
    });
    const c = pool.add(async () => 42);

    const settled = await Promise.allSettled([a, b, c]);
    expect(settled).toEqual([
      { status: 'fulfilled', value: 'A' },
      { status: 'rejected', reason: err },
      { status: 'fulfilled', value: 42 },
    ]);
  });
});

describe('shared preload pool', () => {
  const releases: Array<() => void> = [];
  const pending: Promise<void>[] = [];

  afterEach(async () => {
    for (const release of releases) release();
    await Promise.all(pending);
    releases.length = 0;
    pending.length = 0;
  });

  it('starts 32 asset requests and queues the remainder until a slot is available', async () => {
    const gate = deferred<void>();
    releases.push(() => gate.resolve());
    let started = 0;

    for (let index = 0; index < 33; index++) {
      pending.push(
        networkPool.add(async () => {
          started++;
          await gate.promise;
        }),
      );
    }
    await Promise.resolve();

    expect(started).toBe(32);
    gate.resolve();
    await Promise.all(pending);
    expect(started).toBe(33);
  });
});
