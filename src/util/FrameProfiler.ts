import { LogLevel, log } from './Logger';

/**
 * FrameProfiler - Runtime frame timing profiler for machine-readable performance analysis.
 *
 * Tracks per-frame timing breakdowns (scene build, render, total), maintains rolling
 * statistics (avg/P99/max), and emits periodic console reports.
 *
 * All data exposed on `window.__perf` for programmatic access.
 *
 * Usage:
 *   import { frameProfiler } from './util/FrameProfiler';
 *
 *   // In render loop:
 *   frameProfiler.beginFrame();
 *   frameProfiler.beginPhase('sceneBuild');
 *   // ... build scene ...
 *   frameProfiler.endPhase('sceneBuild');
 *   frameProfiler.beginPhase('render');
 *   // ... render ...
 *   frameProfiler.endPhase('render');
 *   frameProfiler.endFrame();
 */

export interface FrameTimings {
  total: number;
  phases: Record<string, number>;
}

export interface FrameStats {
  frameCount: number;
  fps: number;
  frameTimes: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    min: number;
    last: number;
  };
  phaseBreakdown: Record<
    string,
    {
      avg: number;
      p99: number;
      max: number;
      percentOfFrame: number;
    }
  >;
  budgetOverruns: number;
  budgetOverrunPercent: number;
}

const HISTORY_SIZE = 300;
const FRAME_BUDGET_MS = 16.67;
const REPORT_INTERVAL_MS = 5000;

class FrameProfiler {
  private enabled = false;
  private frameStart = 0;
  private phaseStarts = new Map<string, number>();
  private currentFrame: FrameTimings = { total: 0, phases: {} };

  private history: FrameTimings[] = [];
  private historyIndex = 0;
  private historyFull = false;

  private totalFrames = 0;
  private budgetOverruns = 0;
  private lastReportTime = 0;
  private reportIntervalMs = REPORT_INTERVAL_MS;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.lastReportTime = performance.now();
      log.info('Perf', 'Enabled - reporting every %ds', this.reportIntervalMs / 1000);
    } else {
      log.info('Perf', 'Disabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setReportInterval(ms: number): void {
    this.reportIntervalMs = ms;
  }

  reset(): void {
    this.history = [];
    this.historyIndex = 0;
    this.historyFull = false;
    this.totalFrames = 0;
    this.budgetOverruns = 0;
    this.frameStart = 0;
    this.phaseStarts.clear();
    this.currentFrame = { total: 0, phases: {} };
    this.lastReportTime = performance.now();
  }

  beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.currentFrame = { total: 0, phases: {} };
    this.phaseStarts.clear();
  }

  beginPhase(name: string): void {
    if (!this.enabled) return;
    this.phaseStarts.set(name, performance.now());
  }

  endPhase(name: string): void {
    if (!this.enabled) return;
    const start = this.phaseStarts.get(name);
    if (start !== undefined) {
      this.currentFrame.phases[name] = performance.now() - start;
      this.phaseStarts.delete(name);
    }
  }

  endFrame(): void {
    if (!this.enabled) return;

    const now = performance.now();
    this.currentFrame.total = now - this.frameStart;
    this.totalFrames++;

    if (this.currentFrame.total > FRAME_BUDGET_MS) {
      this.budgetOverruns++;
    }

    if (this.history.length < HISTORY_SIZE) {
      this.history.push({ ...this.currentFrame, phases: { ...this.currentFrame.phases } });
    } else {
      this.history[this.historyIndex] = { ...this.currentFrame, phases: { ...this.currentFrame.phases } };
      this.historyFull = true;
    }
    this.historyIndex = (this.historyIndex + 1) % HISTORY_SIZE;

    if (now - this.lastReportTime >= this.reportIntervalMs) {
      this.report();
      this.lastReportTime = now;
    }
  }

  getStats(): FrameStats {
    const entries = this.historyFull ? this.history : this.history.slice(0, this.history.length);
    const count = entries.length;

    if (count === 0) {
      return {
        frameCount: 0,
        fps: 0,
        frameTimes: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, min: 0, last: 0 },
        phaseBreakdown: {},
        budgetOverruns: 0,
        budgetOverrunPercent: 0,
      };
    }

    const totals = entries.map((e) => e.total).sort((a, b) => a - b);
    const avg = totals.reduce((s, v) => s + v, 0) / count;

    const phaseNames = new Set<string>();
    for (const entry of entries) {
      for (const name of Object.keys(entry.phases)) {
        phaseNames.add(name);
      }
    }

    const phaseBreakdown: FrameStats['phaseBreakdown'] = {};
    for (const name of phaseNames) {
      const phaseTimes = entries.map((e) => e.phases[name] ?? 0).sort((a, b) => a - b);
      const phaseAvg = phaseTimes.reduce((s, v) => s + v, 0) / count;
      phaseBreakdown[name] = {
        avg: phaseAvg,
        p99: percentile(phaseTimes, 0.99),
        max: phaseTimes[phaseTimes.length - 1],
        percentOfFrame: avg > 0 ? (phaseAvg / avg) * 100 : 0,
      };
    }

    return {
      frameCount: this.totalFrames,
      fps: avg > 0 ? 1000 / avg : 0,
      frameTimes: {
        avg,
        p50: percentile(totals, 0.5),
        p95: percentile(totals, 0.95),
        p99: percentile(totals, 0.99),
        max: totals[totals.length - 1],
        min: totals[0],
        last:
          entries.length > 0
            ? entries[this.historyFull ? (this.historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE : entries.length - 1]
                .total
            : 0,
      },
      phaseBreakdown,
      budgetOverruns: this.budgetOverruns,
      budgetOverrunPercent: this.totalFrames > 0 ? (this.budgetOverruns / this.totalFrames) * 100 : 0,
    };
  }

  report(): void {
    const stats = this.getStats();
    if (stats.frameCount === 0) return;
    if (!log.isEnabled(LogLevel.INFO, 'Perf')) return;

    const ft = stats.frameTimes;
    const lines = [
      `===== FRAME TIMING REPORT =====`,
      `  Frames: ${stats.frameCount} | FPS: ${stats.fps.toFixed(1)}`,
      `  Frame time (ms): avg=${ft.avg.toFixed(2)} p50=${ft.p50.toFixed(2)} p95=${ft.p95.toFixed(2)} p99=${ft.p99.toFixed(2)} max=${ft.max.toFixed(2)} min=${ft.min.toFixed(2)}`,
      `  Budget overruns (>${FRAME_BUDGET_MS.toFixed(1)}ms): ${stats.budgetOverruns} (${stats.budgetOverrunPercent.toFixed(1)}%)`,
    ];

    const phaseNames = Object.keys(stats.phaseBreakdown);
    if (phaseNames.length > 0) {
      lines.push(`  Phase breakdown:`);
      for (const name of phaseNames) {
        const p = stats.phaseBreakdown[name];
        lines.push(
          `    ${name}: avg=${p.avg.toFixed(2)}ms p99=${p.p99.toFixed(2)}ms max=${p.max.toFixed(2)}ms (${p.percentOfFrame.toFixed(1)}% of frame)`,
        );
      }
    }

    lines.push(`  ===================================`);
    console.log(lines.join('\n'));
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export const frameProfiler = new FrameProfiler();
