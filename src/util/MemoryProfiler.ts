import { LogLevel, log } from './Logger';

export interface MemorySnapshot {
  timestamp: number;
  jsHeapUsedMB: number | null;
  jsHeapTotalMB: number | null;
  jsHeapLimitMB: number | null;
}

export interface MemoryReport {
  current: MemorySnapshot;
  trend: {
    heapGrowthMBPerMinute: number | null;
    samplesCollected: number;
    durationSeconds: number;
  };
  resources: Record<string, number>;
}

const SAMPLE_INTERVAL_MS = 10000;
const MAX_SAMPLES = 60;

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

class MemoryProfiler {
  private enabled = false;
  private samples: MemorySnapshot[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private resourceTrackers = new Map<string, () => number>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.start();
      log.info('Perf', 'Enabled - sampling every %ds', SAMPLE_INTERVAL_MS / 1000);
    } else {
      this.stop();
      log.info('Perf', 'Disabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  registerResource(name: string, getter: () => number): void {
    this.resourceTrackers.set(name, getter);
  }

  unregisterResource(name: string): void {
    this.resourceTrackers.delete(name);
  }

  private start(): void {
    this.stop();
    this.sample();
    this.intervalId = setInterval(() => {
      this.sample();
      this.report();
    }, SAMPLE_INTERVAL_MS);
  }

  private stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  sample(): MemorySnapshot {
    const mem = getPerformanceMemory();
    const snapshot: MemorySnapshot = {
      timestamp: performance.now(),
      jsHeapUsedMB: mem ? mem.usedJSHeapSize / (1024 * 1024) : null,
      jsHeapTotalMB: mem ? mem.totalJSHeapSize / (1024 * 1024) : null,
      jsHeapLimitMB: mem ? mem.jsHeapSizeLimit / (1024 * 1024) : null,
    };

    this.samples.push(snapshot);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    return snapshot;
  }

  getReport(): MemoryReport {
    const current =
      this.samples.length > 0
        ? this.samples[this.samples.length - 1]
        : { timestamp: 0, jsHeapUsedMB: null, jsHeapTotalMB: null, jsHeapLimitMB: null };

    let heapGrowthMBPerMinute: number | null = null;
    let durationSeconds = 0;

    if (this.samples.length >= 2) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      durationSeconds = (last.timestamp - first.timestamp) / 1000;

      if (first.jsHeapUsedMB !== null && last.jsHeapUsedMB !== null && durationSeconds > 0) {
        const growthMB = last.jsHeapUsedMB - first.jsHeapUsedMB;
        heapGrowthMBPerMinute = (growthMB / durationSeconds) * 60;
      }
    }

    const resources: Record<string, number> = {};
    for (const [name, getter] of this.resourceTrackers) {
      try {
        resources[name] = getter();
      } catch {
        resources[name] = -1;
      }
    }

    return {
      current,
      trend: {
        heapGrowthMBPerMinute,
        samplesCollected: this.samples.length,
        durationSeconds,
      },
      resources,
    };
  }

  report(): void {
    if (!this.enabled) return;
    if (!log.isEnabled(LogLevel.INFO, 'Perf')) return;
    const r = this.getReport();

    const lines = [`===== MEMORY REPORT =====`];

    if (r.current.jsHeapUsedMB !== null) {
      lines.push(
        `  JS Heap: ${r.current.jsHeapUsedMB.toFixed(1)}MB used / ${r.current.jsHeapTotalMB?.toFixed(1)}MB total (limit: ${r.current.jsHeapLimitMB?.toFixed(0)}MB)`,
      );
    } else {
      lines.push(`  JS Heap: not available (performance.memory not supported)`);
    }

    if (r.trend.heapGrowthMBPerMinute !== null) {
      const trend = r.trend.heapGrowthMBPerMinute;
      const indicator = trend > 0.5 ? '⚠ GROWING' : trend < -0.5 ? '↓ shrinking' : '→ stable';
      lines.push(
        `  Trend: ${trend >= 0 ? '+' : ''}${trend.toFixed(2)}MB/min (${indicator}) over ${r.trend.durationSeconds.toFixed(0)}s`,
      );
    }

    const resourceNames = Object.keys(r.resources);
    if (resourceNames.length > 0) {
      lines.push(`  Resources:`);
      for (const name of resourceNames) {
        lines.push(`    ${name}: ${r.resources[name]}`);
      }
    }

    lines.push(`  ================================`);
    console.log(lines.join('\n'));
  }

  dispose(): void {
    this.stop();
    this.samples = [];
    this.resourceTrackers.clear();
  }
}

function getPerformanceMemory(): PerformanceMemory | null {
  const perf = performance as unknown as { memory?: PerformanceMemory };
  return perf.memory ?? null;
}

export const memoryProfiler = new MemoryProfiler();
