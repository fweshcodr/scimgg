type Pause = {
  readonly startMs: number;
  readonly elapsedBeforeMs: number;
  endMs: number;
};

export class BackgroundClock {
  private pauses: Pause[] = [];

  now(timestampMs = performance.now()): number {
    for (let index = this.pauses.length - 1; index >= 0; index--) {
      const pause = this.pauses[index];
      if (timestampMs >= pause.startMs) {
        return timestampMs - pause.elapsedBeforeMs - (Math.min(timestampMs, pause.endMs) - pause.startMs);
      }
    }
    return timestampMs;
  }

  setSuspended(suspended: boolean): void {
    const previous = this.pauses.at(-1);
    if ((previous?.endMs === Infinity) === suspended) return;
    const nowMs = performance.now();
    if (suspended) {
      this.pauses.push({
        startMs: nowMs,
        endMs: Infinity,
        elapsedBeforeMs: previous ? previous.elapsedBeforeMs + previous.endMs - previous.startMs : 0,
      });
    } else if (previous) {
      previous.endMs = nowMs;
    }
  }

  reset(): void {
    this.pauses = [];
  }
}
