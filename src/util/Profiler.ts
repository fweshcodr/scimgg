import { LogLevel, log } from './Logger';

interface ProfileEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  parent?: string;
  children: string[];
}

class Profiler {
  private entries: Map<string, ProfileEntry> = new Map();
  private stack: string[] = [];
  private nameMapping: Map<string, string> = new Map();
  private enabled: boolean = true;
  private startupTime: number = performance.now();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  reset(): void {
    this.entries.clear();
    this.stack = [];
    this.nameMapping.clear();
    this.startupTime = performance.now();
  }

  /**
   * Start timing a named operation.
   * Operations can be nested - parent/child relationships are tracked.
   */
  start(name: string): void {
    if (!this.enabled) return;

    let uniqueName = name;
    let counter = 1;
    while (this.entries.has(uniqueName) && !this.entries.get(uniqueName)?.endTime) {
      uniqueName = `${name}#${counter++}`;
    }

    const parent = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;

    // Self-referential cycle guard.
    if (parent === uniqueName) {
      return;
    }

    const entry: ProfileEntry = {
      name: uniqueName,
      startTime: performance.now(),
      parent,
      children: [],
    };

    this.entries.set(uniqueName, entry);
    this.stack.push(uniqueName);
    this.nameMapping.set(name, uniqueName);

    if (parent) {
      const parentEntry = this.entries.get(parent);
      if (parentEntry && !parentEntry.children.includes(uniqueName)) {
        parentEntry.children.push(uniqueName);
      }
    }

    log.debug('Profiler', `START: ${name}`);
  }

  end(name: string): number {
    if (!this.enabled) return 0;

    const mappedName = this.nameMapping.get(name) || name;
    const entry = this.entries.get(mappedName);
    if (!entry) {
      log.warn('Profiler', `No start found for: ${name}`);
      return 0;
    }

    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;

    const stackIdx = this.stack.lastIndexOf(mappedName);
    if (stackIdx !== -1) {
      this.stack.splice(stackIdx, 1);
    }
    this.nameMapping.delete(name);

    const durationStr = entry.duration.toFixed(2);
    log.debug('Profiler', `END: ${name} - ${durationStr}ms`);

    return entry.duration;
  }

  /** Auto-ends the timing. Works with both sync and async functions. */
  scope<T>(name: string, fn: () => T): T {
    this.start(name);
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then((value) => {
            this.end(name);
            return value;
          })
          .catch((error) => {
            this.end(name);
            throw error;
          }) as T;
      }
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  getDuration(name: string): number | undefined {
    return this.entries.get(name)?.duration;
  }

  summary(): void {
    if (!this.enabled) return;
    if (!log.isEnabled(LogLevel.INFO, 'Perf')) return;

    const totalTime = performance.now() - this.startupTime;

    console.log('\n%c========== PROFILER SUMMARY ==========', 'color: #2196F3; font-weight: bold; font-size: 14px');
    console.log(`%cTotal startup time: ${totalTime.toFixed(2)}ms`, 'color: #2196F3; font-weight: bold');
    console.log('');

    const sortedEntries = Array.from(this.entries.values())
      .filter((e) => e.duration !== undefined)
      .sort((a, b) => a.startTime - b.startTime);

    const rootEntries = sortedEntries.filter((e) => !e.parent);

    const visited = new Set<string>();
    const printEntry = (entry: ProfileEntry, indent: number = 0): void => {
      if (visited.has(entry.name) || indent > 50) {
        return;
      }
      visited.add(entry.name);

      const prefix = '  '.repeat(indent);
      const duration = entry.duration!;
      const percent = ((duration / totalTime) * 100).toFixed(1);

      let color = '#4CAF50';
      if (duration > 500) color = '#F44336';
      else if (duration > 100) color = '#FF5722';
      else if (duration > 50) color = '#FFC107';

      const bar = this.createBar(duration, totalTime);
      console.log(`%c${prefix}${entry.name}: ${duration.toFixed(2)}ms (${percent}%) ${bar}`, `color: ${color}`);

      for (const childName of entry.children) {
        const childEntry = this.entries.get(childName);
        if (childEntry && childEntry.duration !== undefined) {
          printEntry(childEntry, indent + 1);
        }
      }
    };

    for (const entry of rootEntries) {
      printEntry(entry);
    }

    console.log('\n%c---------- SLOWEST OPERATIONS ----------', 'color: #FF5722; font-weight: bold');
    const slowest = sortedEntries
      .filter((e) => e.children.length === 0)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    for (const entry of slowest) {
      const duration = entry.duration!;
      const percent = ((duration / totalTime) * 100).toFixed(1);
      const color = duration > 100 ? '#FF5722' : '#FFC107';
      console.log(`%c  ${entry.name}: ${duration.toFixed(2)}ms (${percent}%)`, `color: ${color}`);
    }

    console.log('%c==========================================\n', 'color: #2196F3; font-weight: bold');
  }

  private createBar(duration: number, total: number): string {
    const maxBarLength = 30;
    if (total <= 0 || !Number.isFinite(duration) || !Number.isFinite(total)) {
      return `[${'░'.repeat(maxBarLength)}]`;
    }
    const percent = Math.max(0, Math.min(1, duration / total));
    const barLength = Math.floor(percent * maxBarLength);
    return `[${'█'.repeat(barLength)}${'░'.repeat(maxBarLength - barLength)}]`;
  }

  getData(): Map<string, ProfileEntry> {
    return new Map(this.entries);
  }
}

export const profiler = new Profiler();
