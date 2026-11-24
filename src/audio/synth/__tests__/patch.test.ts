import { describe, expect, it } from 'vitest';
import { decodeSoundPatch, PatchDecodeError, Shape, type SoundPatch } from '../patch';
import { envelope, flat, patchOf, tone } from './fixtures';
import { encodeSoundPatch } from './patchBytes';

function roundTrip(patch: SoundPatch): SoundPatch {
  return decodeSoundPatch(encodeSoundPatch(patch));
}

describe('decodeSoundPatch', () => {
  it('reads an all-empty patch as ten null slots and the loop region', () => {
    const bytes = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x02, 0x03, 0x04]);
    expect(decodeSoundPatch(bytes)).toEqual({ tones: Array(10).fill(null), loopStartMs: 0x0102, loopEndMs: 0x0304 });
  });

  it('keeps tones in their slots and reads every tone field', () => {
    // A slot is present when its pitch shape byte is non-zero, so the pitch shape must be set.
    const full = tone({
      pitch: envelope(
        50,
        1500,
        [
          { position: 0, level: 100 },
          { position: 30000, level: 65535 },
          { position: 65535, level: 0 },
        ],
        Shape.Saw,
      ),
      vibrato: { rate: envelope(0, 20, flat(32768), Shape.Sine), depth: envelope(0, 100, flat(16384)) },
      tremolo: { rate: envelope(9, 6, flat(1000), Shape.Square), depth: envelope(0, 100, flat(65535)) },
      gate: { off: envelope(0, 155, flat(12583), Shape.Square), on: envelope(0, 100, flat(32768)) },
      partials: [
        { volume: 100, detune: 0, delayMs: 0 },
        { volume: 2500, detune: -64, delayMs: 1050 },
        { volume: 30, detune: 800, delayMs: 200 },
        { volume: 1, detune: 63, delayMs: 127 },
        { volume: 128, detune: -65, delayMs: 128 },
      ],
      echo: { delayMs: 310, volume: 1000 },
      durationMs: 10000,
      startMs: 9250,
      filter: {
        zeros: [{ frequency: [7656, 7656], magnitude: [3178, 3178] }],
        poles: [
          { frequency: [48164, 56479], magnitude: [15650, 30689] },
          { frequency: [100, 100], magnitude: [5, 5] },
        ],
        gain: [0, 27525],
        morph: [
          { position: 0, level: 65535 },
          { position: 65535, level: 0 },
        ],
      },
    });
    const patch = patchOf(tone(), full);
    const decoded = roundTrip({ ...patch, tones: [null, ...patch.tones.slice(0, 9)] });
    expect(decoded.tones[0]).toBeNull();
    expect(decoded.tones[1]).toEqual(tone());
    expect(decoded.tones[2]).toEqual(full);
  });

  it('reads a static filter without a morph curve', () => {
    const t = tone({
      filter: {
        zeros: [],
        poles: [{ frequency: [63642, 63642], magnitude: [17644, 17644] }],
        gain: [0, 0],
        morph: null,
      },
    });
    expect(roundTrip(patchOf(t)).tones[0]?.filter).toEqual(t.filter);
  });

  it('reads a negative curve minimum', () => {
    const t = tone({ pitch: envelope(-5, 2000, flat(0), Shape.Noise) });
    expect(roundTrip(patchOf(t)).tones[0]?.pitch.min).toBe(-5);
  });

  it('rejects truncated bytes', () => {
    const bytes = encodeSoundPatch(patchOf(tone()));
    for (const cut of [1, 5, 20, bytes.length - 1]) {
      expect(() => decodeSoundPatch(bytes.subarray(0, cut))).toThrow(PatchDecodeError);
    }
  });

  it('rejects trailing bytes', () => {
    const bytes = encodeSoundPatch(patchOf(tone()));
    expect(() => decodeSoundPatch(Uint8Array.from([...bytes, 0]))).toThrow(PatchDecodeError);
  });

  it('rejects a sixth partial and a filter with more than four stages', () => {
    const six = encodeSoundPatch(
      patchOf(tone({ partials: Array.from({ length: 5 }, () => ({ volume: 10, detune: 0, delayMs: 0 })) })),
    );
    // Replace the partial-list terminator with another partial's volume byte.
    const pitchAndVolume = 2 * (1 + 4 + 4 + 1 + 8);
    const terminator = pitchAndVolume + 3 + 5 * 3;
    expect(six[terminator]).toBe(0);
    const sixBytes = Uint8Array.from(six);
    sixBytes[terminator] = 10;
    expect(() => decodeSoundPatch(sixBytes)).toThrow(/more than 5 partials/);

    const filtered = encodeSoundPatch(patchOf(tone()));
    // The tone's last byte is its filter's stage counts (0: none), before 9 empty slots and the loop.
    const countAt = filtered.length - 4 - 9 - 1;
    expect(filtered[countAt]).toBe(0);
    const bad = Uint8Array.from(filtered);
    bad[countAt] = 0x05;
    expect(() => decodeSoundPatch(bad)).toThrow(/at most 4/);
  });
});
