export interface PooledJob<T> {
  readonly promise: Promise<T>;
  /**
   * Run this job now, ahead of everything queued. A no-op once it has started.
   *
   * Promotion ignores the concurrency cap so on-screen jobs do not queue behind speculative work.
   */
  promote(): void;
}

export interface ConcurrencyPool {
  add<T>(fn: () => Promise<T>): Promise<T>;
  addPromotable<T>(fn: () => Promise<T>): PooledJob<T>;
}

export function createPool(concurrency: number): ConcurrencyPool {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`createPool: concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    while (queue.length > 0 && active < concurrency) {
      active++;
      const run = queue.shift()!;
      run();
    }
  }

  function schedule<T>(fn: () => Promise<T>): PooledJob<T> {
    let started = false;
    let launch: () => void = () => {};

    const promise = new Promise<T>((resolve, reject) => {
      const run = () => {
        started = true;
        // Promise.resolve guards against synchronous throws leaking a slot
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      launch = run;

      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });

    return {
      promise,
      promote(): void {
        if (started) return;
        const index = queue.indexOf(launch);
        if (index === -1) return;
        queue.splice(index, 1);
        active++;
        launch();
      },
    };
  }

  return {
    add<T>(fn: () => Promise<T>): Promise<T> {
      return schedule(fn).promise;
    },
    addPromotable<T>(fn: () => Promise<T>): PooledJob<T> {
      return schedule(fn);
    },
  };
}

export const networkPool: ConcurrencyPool = createPool(32);
