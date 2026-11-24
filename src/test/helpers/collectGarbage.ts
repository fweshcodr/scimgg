import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

/**
 * V8's full collector, exposed at runtime so reachability tests need no `--expose-gc` flag; undefined
 * where V8 refuses. WeakRef targets stay alive until the current job ends, so call
 * {@link collectGarbageUntilCleared} (or {@link collectGarbageAfterJob} to check that something is
 * still held), not this, right after dropping a reference.
 */
export const collectGarbage: (() => void) | undefined = (() => {
  try {
    setFlagsFromString('--expose-gc');
    return runInNewContext('gc') as () => void;
  } catch {
    return undefined;
  }
})();

/** One collection once the current job has ended. Enough to show a target is still held, not that it was released. */
export async function collectGarbageAfterJob(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  collectGarbage?.();
}

/**
 * Collects, each time after the current job has ended, until every target of `refs` is gone or
 * `budgetMs` has passed; the caller then asserts on `refs`, so a real leak still fails. An
 * unreachable target can outlive one collection with nothing in the code under test holding it:
 * a pending background optimization job holds the closure it compiles, and so that closure's
 * context, until the main thread installs the code, and on a busy machine the job is still pending
 * at the next macrotask.
 */
export async function collectGarbageUntilCleared(refs: readonly WeakRef<object>[], budgetMs = 2000): Promise<void> {
  const deadline = performance.now() + budgetMs;
  for (let delayMs = 0; ; delayMs = Math.min(Math.max(1, delayMs * 2), 100)) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    collectGarbage?.();
    // A live target `deref` returns is kept only until this job ends, so the next pass can still collect it.
    if (refs.every((ref) => ref.deref() === undefined) || performance.now() >= deadline) return;
  }
}
