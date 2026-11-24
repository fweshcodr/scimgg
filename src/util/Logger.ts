export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

const LEVEL_NAMES: Record<string, LogLevel> = {
  none: LogLevel.NONE,
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
  trace: LogLevel.TRACE,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.NONE]: '',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE',
};

export type LogCategory =
  | 'App'
  | 'Cache'
  | 'CacheStorage'
  | 'Renderer'
  | 'SceneBuilder'
  | 'AnimationSystem'
  | 'ModelLoader'
  | 'SpotAnimLoader'
  | 'PlayerModel'
  | 'LocLoader'
  | 'MapLoader'
  | 'Config'
  | 'Perf'
  | 'Profiler'
  | 'Simulation'
  | 'Storage'
  | 'Compression'
  | 'UI'
  | (string & {});

declare global {
  interface Window {
    __log: {
      level: string;
      setLevel: (level: string) => void;
      enable: (category: string) => void;
      disable: (category: string) => void;
      enableAll: () => void;
      categories: () => { enabled: string[]; disabled: string[] };
      help: () => void;
    };
  }
}

class Logger {
  private level: LogLevel = LogLevel.WARN;
  private disabledCategories = new Set<string>();
  private enabledCategories: Set<string> | null = null; // null = all enabled

  constructor() {
    this.readUrlParams();
  }

  init(): void {
    window.__log = {
      level: this.getLevelName(),
      setLevel: (l: string) => {
        this.setLevel(l);
        window.__log.level = this.getLevelName();
      },
      enable: (cat: string) => {
        this.disabledCategories.delete(cat);
        if (this.enabledCategories) this.enabledCategories.add(cat);
      },
      disable: (cat: string) => {
        this.disabledCategories.add(cat);
        if (this.enabledCategories) this.enabledCategories.delete(cat);
      },
      enableAll: () => {
        this.enabledCategories = null;
        this.disabledCategories.clear();
      },
      categories: () => ({
        enabled: this.enabledCategories ? Array.from(this.enabledCategories) : ['*'],
        disabled: Array.from(this.disabledCategories),
      }),
      help: () => {
        // eslint-disable-next-line no-console
        console.log(
          [
            'Logger commands:',
            '  __log.setLevel("debug")     — set global log level (none/error/warn/info/debug/trace)',
            '  __log.enable("Cache")       — enable a category',
            '  __log.disable("Perf")       — disable a category',
            '  __log.enableAll()           — remove all category filters',
            '  __log.categories()          — show current category filters',
            '',
            'URL params: ?logLevel=debug&logCategories=Cache,Renderer',
          ].join('\n'),
        );
      },
    };
  }

  setLevel(level: string | LogLevel): void {
    if (typeof level === 'string') {
      const parsed = LEVEL_NAMES[level.toLowerCase()];
      if (parsed !== undefined) {
        this.level = parsed;
      }
    } else {
      this.level = level;
    }
  }

  getLevel(): LogLevel {
    return this.level;
  }

  error(category: LogCategory, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR, category)) {
      // eslint-disable-next-line no-console
      console.error(`[${category}]`, ...args);
    }
  }

  warn(category: LogCategory, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN, category)) {
      // eslint-disable-next-line no-console
      console.warn(`[${category}]`, ...args);
    }
  }

  info(category: LogCategory, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO, category)) {
      // eslint-disable-next-line no-console
      console.log(`[${category}]`, ...args);
    }
  }

  debug(category: LogCategory, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG, category)) {
      // eslint-disable-next-line no-console
      console.log(`[${LEVEL_LABELS[LogLevel.DEBUG]}][${category}]`, ...args);
    }
  }

  trace(category: LogCategory, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.TRACE, category)) {
      // eslint-disable-next-line no-console
      console.log(`[${LEVEL_LABELS[LogLevel.TRACE]}][${category}]`, ...args);
    }
  }

  isEnabled(level: LogLevel, category?: LogCategory): boolean {
    return this.shouldLog(level, category);
  }

  private shouldLog(level: LogLevel, category?: LogCategory): boolean {
    if (level > this.level) return false;
    if (category) {
      if (this.disabledCategories.has(category)) return false;
      if (this.enabledCategories && !this.enabledCategories.has(category)) return false;
    }
    return true;
  }

  private getLevelName(): string {
    for (const [name, val] of Object.entries(LEVEL_NAMES)) {
      if (val === this.level) return name;
    }
    return 'unknown';
  }

  private readUrlParams(): void {
    try {
      const params = new URLSearchParams(window.location.search);

      const level = params.get('logLevel');
      if (level) {
        this.setLevel(level);
      }

      const categories = params.get('logCategories');
      if (categories) {
        this.enabledCategories = new Set(
          categories
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
    } catch {
      // SSR or test environment — ignore
    }
  }
}

export const log = new Logger();
