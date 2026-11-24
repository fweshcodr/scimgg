import type { SimulationEngine } from '../../core/SimulationEngine';
import type { RestoredPresentation } from '../../types/restoredPresentation';
import { OSRS_TICK_MS } from '../../types/simulation';

/** Holds only an adopted boundary, then yields to the ordinary live clock after one release frame. */
export class RestoredPresentationClock {
  private readonly samples = new WeakMap<RestoredPresentation, { released: boolean; sampled: boolean }>();

  sample(
    restoration: RestoredPresentation | undefined,
    engine: SimulationEngine | undefined,
    currentTick: number,
    elapsedMs: number,
    speedMultiplier: number,
  ) {
    if (!restoration || restoration.engine !== engine) return undefined;
    let sample = this.samples.get(restoration);
    if (!sample) {
      sample = { released: false, sampled: false };
      this.samples.set(restoration, sample);
    }
    if (sample.released || currentTick < restoration.tick) return undefined;
    const firstFrame = !sample.sampled;
    sample.sampled = true;
    const held = currentTick === restoration.tick;
    if (!held) sample.released = true;
    const tickProgress = held ? 1 : Math.max(0, Math.min(1, (elapsedMs * speedMultiplier) / OSRS_TICK_MS));
    const timeMs = held ? restoration.timeMs : (currentTick + tickProgress) * OSRS_TICK_MS;
    return {
      held,
      firstFrame,
      tickProgress,
      interpolatedTick: currentTick + tickProgress,
      timeMs,
      deltaMs: held || firstFrame ? 0 : Math.max(0, timeMs - restoration.timeMs) / speedMultiplier,
    };
  }
}
