import { log } from './Logger';

type PerfFlagListener = () => void;
const listeners = new Set<PerfFlagListener>();

/**
 * All flags default to their optimized state (true = optimization active).
 *
 * UI components must use `perfFlags.subscribe()` to react to changes, never poll with setInterval.
 */
export const perfFlags = {
  subscribe(fn: PerfFlagListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /** Skip permuteTransparentTriangles allocation, use GPU back-face culling instead */
  _skipTransparentSort: true,
  get skipTransparentSort() {
    return this._skipTransparentSort;
  },
  set skipTransparentSort(v: boolean) {
    if (v !== this._skipTransparentSort) {
      this._skipTransparentSort = v;
      log.info('PerfFlags', `skipTransparentSort = ${v}`);
      listeners.forEach((fn) => {
        fn();
      });
    }
  },
};

/** Hand-listed public keys: excludes the underscore-prefixed backing fields and the methods. */
export type PerfFlagKey = 'skipTransparentSort';

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__PERF_FLAGS__ = perfFlags;
}
