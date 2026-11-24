/**
 * Input-latency and frame-pacing recorder, for answering "does the game feel
 * laggy, and what is blocking it?" with numbers instead of feel.
 *
 * Complements `renderProfiler.tsx` (which React subtree costs what): this one
 * measures what the player experiences, from the browser's own timing APIs.
 *
 * Usage (dev only, no flag and no reload needed):
 *   window.__inputLatency.start()
 *   ...play the same stretch of a fight...
 *   window.__inputLatency.stop()
 *
 * `stop()` returns and logs:
 * - `inputs`: slow input events (the Event Timing API only reports events of
 *   16ms or more), split into input delay (waiting for the main thread),
 *   processing (our handlers) and presentation (until the next paint).
 * - `frames`: animation-frame intervals from requestAnimationFrame, as
 *   percentiles, plus how many exceeded 1.5x the median (a dropped frame).
 * - `longFrames`: Long Animation Frames (Chromium only) of 50ms or more, with
 *   blocking time and the scripts that took longest in them.
 *
 * Compare branches by running the same fight for the same length on each, a few
 * times alternately, in the same browser session.
 */

const DEV = import.meta.env.DEV && import.meta.env.MODE !== 'test';

interface InputSample {
  name: string;
  delayMs: number;
  processingMs: number;
  presentationMs: number;
  durationMs: number;
}

interface LongFrameSample {
  durationMs: number;
  blockingMs: number;
  scripts: { invoker: string; source: string; durationMs: number }[];
}

// Structural types for the entries: not every TypeScript DOM lib ships the
// Long Animation Frame types yet.
interface EventTimingEntry extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
}
interface LongFrameEntry extends PerformanceEntry {
  blockingDuration: number;
  scripts: { invoker: string; sourceURL: string; sourceFunctionName: string; duration: number }[];
}

let inputs: InputSample[] = [];
let longFrames: LongFrameSample[] = [];
let frameIntervals: number[] = [];
let observers: PerformanceObserver[] = [];
let frameHandle: number | null = null;
let startedAt = 0;

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted.at(-1) ?? 0),
  };
}

function observe(type: string, onEntry: (entry: PerformanceEntry) => void, options: object = {}): void {
  if (!PerformanceObserver.supportedEntryTypes.includes(type)) {
    console.warn(`[inputLatency] ${type} timing is not supported in this browser; skipping it.`);
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) onEntry(entry);
  });
  observer.observe({ type, buffered: false, ...options });
  observers.push(observer);
}

function sampleFrames(): void {
  let last: number | null = null;
  const tick = (timestamp: number) => {
    if (last !== null) frameIntervals.push(timestamp - last);
    last = timestamp;
    frameHandle = requestAnimationFrame(tick);
  };
  frameHandle = requestAnimationFrame(tick);
}

function report() {
  const frames = summarize(frameIntervals);
  const dropThreshold = frames.p50 * 1.5;
  const scriptTotals = new Map<string, number>();
  for (const frame of longFrames) {
    for (const script of frame.scripts) {
      const key = `${script.invoker} @ ${script.source}`;
      scriptTotals.set(key, (scriptTotals.get(key) ?? 0) + script.durationMs);
    }
  }
  return {
    seconds: round((performance.now() - startedAt) / 1000),
    inputs: {
      slowEvents: inputs.length,
      delayMs: summarize(inputs.map((sample) => sample.delayMs)),
      processingMs: summarize(inputs.map((sample) => sample.processingMs)),
      presentationMs: summarize(inputs.map((sample) => sample.presentationMs)),
      worst: [...inputs].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5),
    },
    frames: {
      intervalMs: frames,
      dropped: frameIntervals.filter((interval) => interval > dropThreshold).length,
    },
    longFrames: {
      count: longFrames.length,
      blockingMs: round(longFrames.reduce((sum, frame) => sum + frame.blockingMs, 0)),
      durationMs: summarize(longFrames.map((frame) => frame.durationMs)),
      topScripts: [...scriptTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([script, totalMs]) => ({ script, totalMs: round(totalMs) })),
    },
  };
}

function stopRecording(): void {
  for (const observer of observers) observer.disconnect();
  observers = [];
  if (frameHandle !== null) cancelAnimationFrame(frameHandle);
  frameHandle = null;
}

export function installInputLatencyProfiler(): void {
  if (!DEV || typeof window === 'undefined') return;
  (window as unknown as { __inputLatency: unknown }).__inputLatency = {
    start: () => {
      stopRecording();
      inputs = [];
      longFrames = [];
      frameIntervals = [];
      startedAt = performance.now();
      observe(
        'event',
        (entry) => {
          const event = entry as EventTimingEntry;
          inputs.push({
            name: event.name,
            delayMs: round(event.processingStart - event.startTime),
            processingMs: round(event.processingEnd - event.processingStart),
            // `duration` is rounded to 8ms by the browser, so this can dip below zero.
            presentationMs: round(Math.max(0, event.startTime + event.duration - event.processingEnd)),
            durationMs: event.duration,
          });
        },
        { durationThreshold: 16 },
      );
      observe('long-animation-frame', (entry) => {
        const frame = entry as LongFrameEntry;
        longFrames.push({
          durationMs: frame.duration,
          blockingMs: frame.blockingDuration,
          scripts: frame.scripts.map((script) => ({
            invoker: script.invoker,
            source: script.sourceFunctionName || script.sourceURL.split('/').pop() || '?',
            durationMs: script.duration,
          })),
        });
      });
      sampleFrames();
      return 'recording — call window.__inputLatency.stop() when done';
    },
    stop: () => {
      stopRecording();
      const result = report();
      console.log('[inputLatency]', result);
      return result;
    },
  };
}
