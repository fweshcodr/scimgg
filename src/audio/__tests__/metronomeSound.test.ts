import { describe, expect, it } from 'vitest';
import { synthesizeMetronomeBeat } from '../metronomeSound';

const SAMPLE_RATE = 48_000;

function peak(samples: Float32Array, from = 0, to = samples.length): number {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

function zeroCrossings(samples: Float32Array, to: number): number {
  let crossings = 0;
  for (let i = 1; i < to; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  return crossings;
}

describe('synthesizeMetronomeBeat', () => {
  it.each(['tick', 'tock'] as const)('renders a short, soft-edged %s', (beat) => {
    const samples = synthesizeMetronomeBeat(beat, SAMPLE_RATE);

    expect(samples.length / SAMPLE_RATE).toBeLessThanOrEqual(0.15);
    expect(samples[0]).toBe(0);
    // Full metronome volume stays well below full scale; see PEAK in metronomeSound.ts.
    expect(peak(samples)).toBeCloseTo(0.2, 5);
    expect(peak(samples, samples.length - 48)).toBeLessThan(0.01);
  });

  it('pitches the tock below the tick', () => {
    const window = SAMPLE_RATE / 20;
    const tick = zeroCrossings(synthesizeMetronomeBeat('tick', SAMPLE_RATE), window);
    const tock = zeroCrossings(synthesizeMetronomeBeat('tock', SAMPLE_RATE), window);

    expect(tock).toBeLessThan(tick);
  });
});
