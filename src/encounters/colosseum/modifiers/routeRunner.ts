import type { Coordinate } from '../../../types/simulation';

export interface CornerRouteTiming {
  readonly stepInterval: number;
  /** Last step into a corner to first step out; zero means normal step cadence. */
  readonly cornerPause: number;
}

/** A closed cardinal route, queried relative to its first step. No encounter clock or mutable cursor. */
export class ColosseumRouteRunner {
  readonly lapTicks: number;
  private readonly start: Coordinate;
  private readonly steps: { readonly offset: number; readonly position: Coordinate }[] = [];

  constructor(corners: readonly Readonly<Coordinate>[], timing: CornerRouteTiming) {
    const { stepInterval, cornerPause } = timing;
    if (
      corners.length < 2 ||
      !Number.isInteger(stepInterval) ||
      stepInterval < 1 ||
      !Number.isInteger(cornerPause) ||
      cornerPause < 0
    )
      throw new TypeError('Invalid corner route timing');
    this.start = [...corners[0]!];
    let offset = 0;
    for (let index = 0; index < corners.length; index++) {
      const [x, y] = corners[index]!;
      const [nextX, nextY] = corners[(index + 1) % corners.length]!;
      const dx = nextX - x;
      const dy = nextY - y;
      if (![x, y, nextX, nextY].every(Number.isInteger) || (dx === 0) === (dy === 0)) {
        throw new TypeError('Corner routes require nonempty cardinal sides on integer tiles');
      }
      const distance = Math.abs(dx) + Math.abs(dy);
      for (let step = 1; step <= distance; step++) {
        this.steps.push({ offset, position: [x + Math.sign(dx) * step, y + Math.sign(dy) * step] });
        offset += step === distance ? Math.max(stepInterval, cornerPause) : stepInterval;
      }
    }
    this.lapTicks = offset;
  }

  positionAt(ticksSinceFirstStep: number): Coordinate {
    if (ticksSinceFirstStep < 0) return [...this.start];
    const offset = ticksSinceFirstStep % this.lapTicks;
    for (let index = this.steps.length - 1; index >= 0; index--) {
      const step = this.steps[index]!;
      if (step.offset <= offset) return [...step.position];
    }
    return [...this.start];
  }
}
