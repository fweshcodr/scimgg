import { frameProfiler } from './FrameProfiler';
import { log } from './Logger';
import { memoryProfiler } from './MemoryProfiler';
import { renderStats } from './RenderStats';

export interface PerfData {
  frames: ReturnType<typeof frameProfiler.getStats>;
  render: ReturnType<typeof renderStats.getSnapshot>;
  memory: ReturnType<typeof memoryProfiler.getReport>;
  enabled: boolean;
}

declare global {
  interface Window {
    __perf: {
      enabled: boolean;
      toggle: () => void;
      report: () => void;
      data: () => PerfData;
      frames: typeof frameProfiler;
      render: typeof renderStats;
      memory: typeof memoryProfiler;
    };
  }
}

class PerfManager {
  private enabled = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  init(): void {
    window.__perf = {
      enabled: this.enabled,
      toggle: () => this.toggle(),
      report: () => this.report(),
      data: () => this.getData(),
      frames: frameProfiler,
      render: renderStats,
      memory: memoryProfiler,
    };

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    log.info('Perf', 'Initialized. Press F2 to toggle profiling, or use window.__perf in console.');
  }

  toggle(): void {
    this.enabled = !this.enabled;
    frameProfiler.setEnabled(this.enabled);
    renderStats.setEnabled(this.enabled);
    memoryProfiler.setEnabled(this.enabled);
    window.__perf.enabled = this.enabled;

    if (this.enabled) {
      log.info('Perf', 'Profiling ENABLED. Reports every 5s. Use window.__perf.data() for instant snapshot.');
    } else {
      this.report();
      log.info('Perf', 'Profiling DISABLED. Final report above.');
    }
  }

  report(): void {
    frameProfiler.report();
    renderStats.report();
    memoryProfiler.report();
  }

  getData(): PerfData {
    return {
      frames: frameProfiler.getStats(),
      render: renderStats.getSnapshot(),
      memory: memoryProfiler.getReport(),
      enabled: this.enabled,
    };
  }

  dispose(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}

export const perfManager = new PerfManager();
