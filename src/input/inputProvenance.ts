/**
 * Input provenance guard — a neutral, feature-agnostic marker for input the app
 * dispatches PROGRAMMATICALLY rather than from a real user gesture.
 *
 * The tutorial demo cursor's synthetic clicks (see tutorial/cursorTargets.ts
 * `dispatchSyntheticClick`) run real handlers, so a demo shows the REAL effect
 * (a prayer actually toggles in the engine). But side effects that should only
 * follow a REAL user action — chiefly replay recording (see hooks/useReplay) —
 * check `isSyntheticInput()` and skip while a synthetic dispatch is in flight.
 *
 * This lives outside any feature module so a generic consumer (the replay hook)
 * never has to depend on tutorial-specific code; both the tutorial and replay
 * import the guard from here.
 *
 * Synchronous + nestable: the synthetic dispatch runs its handlers inline, so
 * the depth counter is set for exactly the duration of the dispatched handlers.
 */
let depth = 0;

export function runSyntheticInput<T>(fn: () => T): T {
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
  }
}

export function isSyntheticInput(): boolean {
  return depth > 0;
}
