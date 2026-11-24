import {
  PRAYER_FLICK_BARS,
  type PrayerFlickClick,
  type PrayerFlickInputKind,
  type PrayerFlickWindow,
  prunePrayerFlickClicks,
} from './prayerFlick';

/**
 * External store (React `useSyncExternalStore` shaped) carrying the Prayer Flick
 * plugin's timing data: the tick window the real-time loop is currently on, and
 * the prayer clicks recorded against it.
 *
 * A store rather than simulation state, deliberately. This is wall-clock
 * presentation data — when a button was pressed and when the press reached the
 * server — which the engine has no notion of and the replay format must never
 * carry. Keeping it here also means the tick loop can publish every tick without
 * re-rendering anything but the overlay, and only while the overlay is mounted.
 */
export interface PrayerFlickSnapshot {
  readonly window: PrayerFlickWindow | null;
  /** Chronological. Pruned to what the visible bars can still draw. */
  readonly clicks: readonly PrayerFlickClick[];
}

export const EMPTY_PRAYER_FLICK_SNAPSHOT: PrayerFlickSnapshot = { window: null, clicks: [] };

export class PrayerFlickTimelineStore {
  private snapshot: PrayerFlickSnapshot = EMPTY_PRAYER_FLICK_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  getSnapshot = (): PrayerFlickSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Publish the tick that just ran, at `startTime`. Called from the real-time tick loop, which
   * owns this clock. The previous ticks' real starts are kept for the bars behind it, as long as
   * the tick numbers run on; a jump (reset, engine swap) starts the history over.
   */
  recordTickWindow(tick: number, startTime: number, durationMs: number): void {
    const previous = this.snapshot.window;
    const previousStartTimes =
      previous && previous.tick === tick - 1
        ? [previous.startTime, ...(previous.previousStartTimes ?? [])].slice(0, PRAYER_FLICK_BARS)
        : [];
    const window: PrayerFlickWindow = {
      tick,
      startTime,
      durationMs,
      ...(previousStartTimes.length > 0 ? { previousStartTimes } : {}),
    };
    this.publish({ window, clicks: prunePrayerFlickClicks(this.snapshot.clicks, window) });
  }

  /**
   * `arrivalTime` is the wall-clock time the input reaches the engine, clamped
   * so a corrupted lag value can never draw an arrival ahead of the click that
   * produced it.
   */
  recordClick(kind: PrayerFlickInputKind, clickTime: number, arrivalTime: number): void {
    const click: PrayerFlickClick = {
      id: this.nextId++,
      kind,
      clickTime,
      arrivalTime: Math.max(clickTime, arrivalTime),
    };
    this.publish({
      window: this.snapshot.window,
      clicks: prunePrayerFlickClicks([...this.snapshot.clicks, click], this.snapshot.window),
    });
  }

  /** Drop everything (fight reset, engine swap, entering or leaving replay). */
  reset(): void {
    if (this.snapshot.window === null && this.snapshot.clicks.length === 0) return;
    this.publish(EMPTY_PRAYER_FLICK_SNAPSHOT);
  }

  private publish(next: PrayerFlickSnapshot): void {
    this.snapshot = next;
    // Snapshot the listeners: a subscriber may unsubscribe from inside its own
    // callback when React tears the overlay down mid-notification.
    for (const listener of Array.from(this.listeners)) {
      if (this.listeners.has(listener)) listener();
    }
  }
}

export const prayerFlickTimeline = new PrayerFlickTimelineStore();
