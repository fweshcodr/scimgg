import { type ComponentType, createElement, Profiler, type ProfilerOnRenderCallback } from 'react';

/**
 * Per-subtree React render profiler, for answering "which part of the tree is
 * expensive when the displayed replay tick changes?".
 *
 * Chrome's sampling profiler reliably crashes the tab on this app, and a single
 * wall-clock number for a commit doesn't say WHERE the time went. React's own
 * `<Profiler>` does.
 *
 * Usage (dev only, no flag and no reload needed):
 *   window.__renderProfile.start()
 *   ...drag the seek bar...
 *   window.__renderProfile.stop()
 *
 * The boundaries are always installed in dev so the tool is there when you need
 * it; only *recording* is gated, and `onRender` returns immediately when idle.
 * In a production build `withProfile` hands back the original component, so
 * nothing wraps at all.
 */

const DEV = import.meta.env.DEV && import.meta.env.MODE !== 'test';

interface ZoneStats {
  commits: number;
  totalMs: number;
  maxMs: number;
}

const stats = new Map<string, ZoneStats>();
let recording = false;

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  if (!recording) return;
  const entry = stats.get(id) ?? { commits: 0, totalMs: 0, maxMs: 0 };
  entry.commits++;
  entry.totalMs += actualDuration;
  entry.maxMs = Math.max(entry.maxMs, actualDuration);
  stats.set(id, entry);
};

function snapshot() {
  return [...stats.entries()]
    .map(([id, s]) => ({
      zone: id,
      commits: s.commits,
      totalMs: +s.totalMs.toFixed(1),
      avgMs: +(s.totalMs / s.commits).toFixed(2),
      maxMs: +s.maxMs.toFixed(1),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * Attribute a component's render cost to `id`. Applied at the import site so no
 * JSX surgery is needed; returns the component untouched outside dev.
 */
export function withProfile<P extends object>(id: string, Component: ComponentType<P>): ComponentType<P> {
  if (!DEV) return Component;
  const Wrapped = (props: P) =>
    createElement(Profiler, { id, onRender }, createElement(Component as ComponentType<object>, props));
  Wrapped.displayName = `Profiled(${id})`;
  return Wrapped as ComponentType<P>;
}

export function installRenderProfiler(): void {
  if (!DEV || typeof window === 'undefined') return;
  (window as unknown as { __renderProfile: unknown }).__renderProfile = {
    start: () => {
      stats.clear();
      recording = true;
      return 'recording — call window.__renderProfile.stop() when done';
    },
    stop: () => {
      recording = false;
      return snapshot();
    },
    reset: () => stats.clear(),
    data: snapshot,
  };
}
