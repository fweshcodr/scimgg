import type { Breakpoint, Envelope, SoundPatch, Tone } from '../patch';
import { Shape } from '../patch';

/** A flat curve at `level` (0..65535). */
export function flat(level: number): Breakpoint[] {
  return [
    { position: 0, level },
    { position: 65535, level },
  ];
}

export function envelope(min: number, max: number, points: Breakpoint[], shape = 0): Envelope {
  return { shape, min, max, points };
}

/** A tone with a constant pitch (Hz), constant volume (percent) and one undetuned partial. */
export function tone(overrides: Partial<Tone> & { hz?: number; shape?: number } = {}): Tone {
  const { hz = 440, shape = Shape.Sine, ...rest } = overrides;
  return {
    pitch: envelope(hz, hz, flat(0), shape),
    volume: envelope(0, 100, flat(65535)),
    vibrato: null,
    tremolo: null,
    gate: null,
    partials: [{ volume: 100, detune: 0, delayMs: 0 }],
    echo: { delayMs: 0, volume: 100 },
    durationMs: 200,
    startMs: 0,
    filter: null,
    ...rest,
  };
}

export function patchOf(...tones: Tone[]): SoundPatch {
  const slots: (Tone | null)[] = Array.from({ length: 10 }, (_, i) => tones[i] ?? null);
  return { tones: slots, loopStartMs: 0, loopEndMs: 0 };
}
