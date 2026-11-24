import { describe, expect, it } from 'vitest';
import { renderSoundEffect } from '..';
import { Shape } from '../patch';
import { patchLength, renderPatch, SYNTH_SAMPLE_RATE } from '../render';
import { envelope, flat, patchOf, tone } from './fixtures';
import { encodeSoundPatch } from './patchBytes';

const SR = SYNTH_SAMPLE_RATE;
const ms = (t: number) => Math.round((t * SR) / 1000);

function render(...tones: Parameters<typeof patchOf>) {
  return renderPatch(patchOf(...tones)).samples;
}

function peak(x: Float32Array, from = 0, to = x.length): number {
  let m = 0;
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Upward zero crossings per second over a span. */
function frequency(x: Float32Array, from = 0, to = x.length): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return (crossings * SR) / (to - from);
}

/** Lengths of runs of exact zeros and of non-zero samples, in order. */
function zeroRuns(x: Float32Array, from: number, to: number): { zero: boolean; length: number }[] {
  const runs: { zero: boolean; length: number }[] = [];
  for (let i = from; i < to; i++) {
    const zero = x[i] === 0;
    const last = runs.at(-1);
    if (last && last.zero === zero) last.length++;
    else runs.push({ zero, length: 1 });
  }
  return runs;
}

/** Full-scale level of a 100% (65535) volume curve. */
const FULL = 65535 / 65536;

function expectNear(actual: number, expected: number, relative = 0.03): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

function finite(x: Float32Array): boolean {
  return x.every(Number.isFinite);
}

describe('renderPatch', () => {
  it('is as long as the latest tone end and renders at 22,050 Hz', () => {
    const patch = patchOf(tone({ durationMs: 300 }), tone({ startMs: 250, durationMs: 400 }));
    const pcm = renderPatch(patch);
    expect(pcm.sampleRate).toBe(22_050);
    expect(pcm.samples.length).toBe(ms(650));
    expect(patchLength(patch)).toBe(ms(650));
  });

  it('places a tone at its start offset', () => {
    const x = render(tone({ startMs: 100, durationMs: 100 }));
    expect(peak(x, 0, ms(100))).toBe(0);
    expect(peak(x, ms(100))).toBeGreaterThan(0.9);
  });

  it('is deterministic, noise included', () => {
    const patch = patchOf(tone({ shape: Shape.Noise, hz: 3000 }), tone({ shape: Shape.Saw, hz: 220 }));
    expect(renderPatch(patch).samples).toEqual(renderPatch(patch).samples);
  });

  describe('waveforms', () => {
    it('sine: starts at zero going up, at the pitch, at full scale for 100% volume', () => {
      const x = render(tone({ hz: 441, durationMs: 1000 }));
      expect(x[0]).toBe(0);
      expect(x[1]).toBeGreaterThan(0);
      expect(frequency(x)).toBeCloseTo(441, -1);
      expect(peak(x)).toBeGreaterThan(0.999);
      expect(rms(x)).toBeCloseTo(Math.SQRT1_2, 2);
    });

    it('square: +1 for the first half cycle, then -1', () => {
      const x = render(tone({ shape: Shape.Square, hz: 100, durationMs: 100 }));
      const half = SR / 100 / 2;
      expect(x.subarray(0, half - 1).every((v) => v === Math.fround(FULL))).toBe(true);
      expect(x.subarray(half + 1, 2 * half - 1).every((v) => v === -Math.fround(FULL))).toBe(true);
    });

    it('saw: rises from -1 and drops once per cycle', () => {
      const x = render(tone({ shape: Shape.Saw, hz: 100, durationMs: 100 }));
      expect(x[0]).toBeCloseTo(-1, 4);
      for (let i = 1; i < 200; i++) expect(x[i]).toBeGreaterThan(x[i - 1]);
      let drops = 0;
      for (let i = 1; i < x.length; i++) if (x[i] < x[i - 1] - 1) drops++;
      expect(drops).toBe(9);
    });

    it('noise: +-amplitude, held for 1/12.5 of a pitch cycle', () => {
      const x = render(
        tone({ shape: Shape.Noise, hz: 100, durationMs: 1000, partials: [{ volume: 50, detune: 0, delayMs: 0 }] }),
      );
      expect(x.every((v) => Math.abs(v) === Math.fround(0.5 * FULL))).toBe(true);
      // Holds last 22050 / (100 * 12.5) = 17.6 samples; runs of equal sign are multiples of that.
      let changes = 0;
      for (let i = 1; i < x.length; i++) if (x[i] !== x[i - 1]) changes++;
      const holds = 100 * 12.5;
      expect(changes).toBeGreaterThan(holds * 0.4);
      expect(changes).toBeLessThan(holds * 0.6);
    });

    it('silent shape renders silence', () => {
      expect(peak(render(tone({ shape: Shape.Noise, hz: 0 }), tone({ startMs: 0 })))).toBeGreaterThan(0);
      const t = tone();
      expect(peak(renderPatch(patchOf({ ...t, pitch: { ...t.pitch, shape: 5 } })).samples)).toBe(0);
    });
  });

  describe('envelopes', () => {
    it('interpolates volume linearly between breakpoints and holds the last level', () => {
      const x = render(
        tone({
          shape: Shape.Square,
          hz: 500,
          durationMs: 1000,
          volume: envelope(0, 100, [
            { position: 0, level: 0 },
            { position: 32768, level: 65535 },
          ]),
        }),
      );
      const at = (t: number) => peak(x, ms(t) - 10, ms(t) + 10);
      expect(at(125)).toBeCloseTo(0.25, 2);
      expect(at(250)).toBeCloseTo(0.5, 2);
      expect(at(375)).toBeCloseTo(0.75, 2);
      expect(at(750)).toBeCloseTo(1, 3);
    });

    it('sweeps pitch between min and max', () => {
      const x = render(
        tone({
          durationMs: 2000,
          pitch: envelope(
            200,
            1000,
            [
              { position: 0, level: 0 },
              { position: 65535, level: 65535 },
            ],
            Shape.Sine,
          ),
        }),
      );
      expectNear(frequency(x, 0, ms(200)), 240, 0.05);
      expectNear(frequency(x, ms(900), ms(1100)), 600);
      expectNear(frequency(x, ms(1800), ms(2000)), 960);
    });
  });

  describe('partials', () => {
    it('detunes in 1/120 octave over the swept part of the pitch only', () => {
      // min 100 Hz, swept part 200 Hz: an octave up gives 100 + 400, not 2 x 300.
      const pitch = envelope(100, 300, flat(65535), Shape.Sine);
      const x = render(tone({ pitch, durationMs: 1000, partials: [{ volume: 100, detune: 120, delayMs: 0 }] }));
      expect(frequency(x)).toBeCloseTo(100 + 2 * 200 * (65535 / 65536), -1);
    });

    it('scales by partial volume and sums partials', () => {
      const one = render(tone({ partials: [{ volume: 30, detune: 0, delayMs: 0 }] }));
      expect(peak(one)).toBeCloseTo(0.3, 2);
      const two = render(
        tone({
          partials: [
            { volume: 30, detune: 0, delayMs: 0 },
            { volume: 30, detune: 0, delayMs: 0 },
          ],
        }),
      );
      expect(peak(two)).toBeCloseTo(0.6, 2);
    });

    it('delays a partial without moving the tone', () => {
      const x = render(tone({ durationMs: 300, partials: [{ volume: 100, detune: 0, delayMs: 100 }] }));
      expect(x.length).toBe(ms(300));
      expect(peak(x, 0, ms(100))).toBe(0);
      expect(peak(x, ms(100))).toBeGreaterThan(0.99);
    });

    it('clips the mix to full scale', () => {
      const x = render(tone({ partials: [{ volume: 2500, detune: 0, delayMs: 0 }] }));
      expect(peak(x)).toBe(1);
    });
  });

  describe('modulation', () => {
    it('vibrato swings frequency by depth x half the pitch range', () => {
      // Range 800 Hz, depth 50%: +-200 Hz around 600 Hz. A 2.5 Hz LFO quantizes to 3/32768 cycles
      // per sample, 2.02 Hz: high for the first 248 ms, then low.
      const pitch = envelope(200, 1000, flat(32768), Shape.Sine);
      const vibrato = { rate: envelope(0, 5, flat(32768), Shape.Square), depth: envelope(0, 100, flat(32768)) };
      const x = render(tone({ pitch, vibrato, durationMs: 1000 }));
      expectNear(frequency(x, ms(20), ms(230)), 800);
      expectNear(frequency(x, ms(270), ms(480)), 400);
    });

    it('tremolo scales amplitude by 1 +- depth', () => {
      const tremolo = { rate: envelope(0, 5, flat(32768), Shape.Square), depth: envelope(0, 100, flat(32768)) };
      const x = render(
        tone({ shape: Shape.Square, hz: 500, tremolo, volume: envelope(0, 100, flat(32768)), durationMs: 1000 }),
      );
      expect(peak(x, ms(20), ms(230))).toBeCloseTo(0.75, 2);
      expect(peak(x, ms(270), ms(480))).toBeCloseTo(0.25, 2);
    });

    it('gate alternates sounding and silent runs of the curve values in samples', () => {
      // Off = 0 + 40 x 0.25 = 10 samples; on = 40 x 0.75 = 30 samples, starting sounding.
      const gate = { off: envelope(0, 40, flat(16384), Shape.Square), on: envelope(0, 100, flat(49152)) };
      const x = render(tone({ shape: Shape.Square, hz: 0, gate, durationMs: 100 }));
      const runs = zeroRuns(x, 0, 400);
      expect(runs[0]).toEqual({ zero: false, length: 30 });
      expect(runs.slice(1, 7)).toEqual([
        { zero: true, length: 10 },
        { zero: false, length: 30 },
        { zero: true, length: 10 },
        { zero: false, length: 30 },
        { zero: true, length: 10 },
        { zero: false, length: 30 },
      ]);
    });

    it('echo feeds the tone back after the delay', () => {
      // A 20 ms burst; echo 50 ms at 50% repeats it at half, then quarter, level.
      const burst = envelope(0, 100, [
        { position: 0, level: 65535 },
        { position: 6553, level: 65535 },
        { position: 6554, level: 0 },
      ]);
      const x = render(
        tone({ shape: Shape.Square, hz: 500, volume: burst, durationMs: 200, echo: { delayMs: 50, volume: 50 } }),
      );
      expect(peak(x, 0, ms(19))).toBeCloseTo(1, 3);
      expect(peak(x, ms(25), ms(48))).toBe(0);
      expect(peak(x, ms(51), ms(69))).toBeCloseTo(0.5, 3);
      expect(peak(x, ms(101), ms(119))).toBeCloseTo(0.25, 3);
    });

    it('runaway echo feedback stays finite and clipped', () => {
      const x = render(tone({ durationMs: 10000, echo: { delayMs: 1, volume: 1000 } }));
      expect(finite(x)).toBe(true);
      expect(peak(x)).toBe(1);
    });
  });

  describe('filter', () => {
    const noise = {
      shape: Shape.Noise,
      hz: 20000,
      durationMs: 1000,
      partials: [{ volume: 10, detune: 0, delayMs: 0 }],
    };

    function band(x: Float32Array, lo: number, hi: number): number {
      // Energy of a Goertzel sweep across [lo, hi) in 50 Hz steps.
      let e = 0;
      for (let f = lo; f < hi; f += 50) {
        const w = (2 * Math.PI * f) / SR;
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < x.length; i++) {
          const s = x[i] + 2 * Math.cos(w) * s1 - s2;
          s2 = s1;
          s1 = s;
        }
        e += s1 * s1 + s2 * s2 - 2 * Math.cos(w) * s1 * s2;
      }
      return e;
    }

    it('a pole pair resonates at 32.7 Hz x 2^(code / 8192)', () => {
      // Code 8192 x log2(2000 / 32.703) puts the resonance at 2 kHz.
      const code = Math.round(8192 * Math.log2(2000 / 32.703));
      const x = render(
        tone({
          ...noise,
          filter: {
            zeros: [],
            poles: [{ frequency: [code, code], magnitude: [26000, 26000] }],
            gain: [0, 0],
            morph: null,
          },
        }),
      );
      expect(finite(x)).toBe(true);
      expect(band(x, 1900, 2100)).toBeGreaterThan(10 * band(x, 4000, 4200));
      expect(band(x, 1900, 2100)).toBeGreaterThan(10 * band(x, 800, 1000));
    });

    it('a zero pair at code 0 removes DC', () => {
      const x = render(
        tone({
          shape: Shape.Square,
          hz: 0,
          filter: { zeros: [{ frequency: [0, 0], magnitude: [60000, 60000] }], poles: [], gain: [0, 0], morph: null },
        }),
      );
      expect(peak(x, ms(100))).toBeLessThan(1e-3);
    });

    it('gain code attenuates by 0.003 dB per code', () => {
      const plain = render(tone({ shape: Shape.Square, hz: 500 }));
      const quiet = render(
        tone({ shape: Shape.Square, hz: 500, filter: { zeros: [], poles: [], gain: [2000, 2000], morph: null } }),
      );
      // 2000 codes = 6 dB.
      expect(peak(quiet) / peak(plain)).toBeCloseTo(10 ** (-6 / 20), 3);
    });

    it('stays finite and bounded at maximum resonance while morphing', () => {
      const sharp = { frequency: [0, 65535] as [number, number], magnitude: [65535, 65535] as [number, number] };
      const x = render(
        tone({
          ...noise,
          partials: [{ volume: 100, detune: 0, delayMs: 0 }],
          filter: {
            zeros: [],
            poles: [sharp, sharp, sharp, sharp],
            gain: [0, 0],
            morph: [
              { position: 0, level: 0 },
              { position: 65535, level: 65535 },
            ],
          },
        }),
      );
      expect(finite(x)).toBe(true);
      expect(peak(x)).toBeLessThanOrEqual(1);
    });

    it('decays to silence after the input stops', () => {
      const code = Math.round(8192 * Math.log2(1000 / 32.703));
      const burst = envelope(0, 100, [
        { position: 0, level: 65535 },
        { position: 3276, level: 65535 },
        { position: 3277, level: 0 },
      ]);
      const x = render(
        tone({
          ...noise,
          volume: burst,
          filter: {
            zeros: [],
            poles: [{ frequency: [code, code], magnitude: [40000, 40000] }],
            gain: [0, 0],
            morph: null,
          },
        }),
      );
      expect(peak(x, ms(900))).toBeLessThan(peak(x, 0, ms(60)) * 1e-3);
    });
  });
});

describe('renderSoundEffect', () => {
  it('decodes and renders bytes', () => {
    const pcm = renderSoundEffect(encodeSoundPatch(patchOf(tone({ durationMs: 100 }))));
    expect(pcm?.samples.length).toBe(ms(100));
  });

  it('returns null for a patch with no sound', () => {
    expect(renderSoundEffect(encodeSoundPatch(patchOf()))).toBeNull();
    expect(renderSoundEffect(encodeSoundPatch(patchOf(tone({ durationMs: 0 }))))).toBeNull();
  });
});
