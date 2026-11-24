export interface TickTimingStats {
  sampleCount: number;
  expectedMs: number;
  lastMs: number;
  /** lastMs - expectedMs */
  lastDeviationMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  stddevMs: number;
  /** max(|delta - expected|) across window */
  maxJitterMs: number;
  recentDeltas: readonly number[];
}

const EMPTY_STATS: TickTimingStats = {
  sampleCount: 0,
  expectedMs: 600,
  lastMs: 0,
  lastDeviationMs: 0,
  avgMs: 0,
  minMs: 0,
  maxMs: 0,
  stddevMs: 0,
  maxJitterMs: 0,
  recentDeltas: [],
};

export class TickTimingMonitor {
  private static readonly WINDOW_SIZE = 50;

  private deltas: number[] = [];
  private lastTickTime: number = 0;
  private _expectedMs: number = 600;

  setExpectedMs(ms: number): void {
    this._expectedMs = ms;
  }

  recordTick(): void {
    const now = performance.now();
    if (this.lastTickTime > 0) {
      const delta = now - this.lastTickTime;
      this.deltas.push(delta);
      if (this.deltas.length > TickTimingMonitor.WINDOW_SIZE) {
        this.deltas.shift();
      }
    }
    this.lastTickTime = now;
  }

  reset(): void {
    this.deltas = [];
    this.lastTickTime = 0;
  }

  getStats(): TickTimingStats {
    const n = this.deltas.length;
    if (n === 0) return { ...EMPTY_STATS, expectedMs: this._expectedMs };

    const last = this.deltas[n - 1];
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let maxJitter = 0;

    for (let i = 0; i < n; i++) {
      const d = this.deltas[i];
      sum += d;
      if (d < min) min = d;
      if (d > max) max = d;
      const jitter = Math.abs(d - this._expectedMs);
      if (jitter > maxJitter) maxJitter = jitter;
    }

    const avg = sum / n;

    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = this.deltas[i] - avg;
      varianceSum += diff * diff;
    }
    const stddev = Math.sqrt(varianceSum / n);

    return {
      sampleCount: n,
      expectedMs: this._expectedMs,
      lastMs: last,
      lastDeviationMs: last - this._expectedMs,
      avgMs: avg,
      minMs: min,
      maxMs: max,
      stddevMs: stddev,
      maxJitterMs: maxJitter,
      recentDeltas: this.deltas,
    };
  }
}
