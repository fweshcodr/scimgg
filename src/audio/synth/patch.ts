/**
 * Typed form of a cache sound-effect patch (index 4, one group per sound id) and its decoder.
 *
 * The meaning of each field is our own reading of the format; docs/architecture/audio-synth.md
 * describes it and how each reading was established.
 */

/** Oscillator and LFO waveforms, selected by an envelope's `shape` byte. */
export const Shape = { Off: 0, Square: 1, Sine: 2, Saw: 3, Noise: 4 } as const;

/** A point of a piecewise-linear curve; both fields are 16-bit fractions (0..65535). */
export interface Breakpoint {
  /** Position across the tone's duration. */
  readonly position: number;
  /** Fraction of the way from the envelope's `min` to its `max`. */
  readonly level: number;
}

/**
 * A parameter swept across the tone. On a pitch or LFO-rate envelope `shape` is the waveform;
 * elsewhere it only marks the envelope as present.
 */
export interface Envelope {
  readonly shape: number;
  readonly min: number;
  readonly max: number;
  readonly points: readonly Breakpoint[];
}

/** A low-frequency oscillator: `rate` in Hz (its shape is the LFO waveform), `depth` in percent. */
export interface Modulator {
  readonly rate: Envelope;
  readonly depth: Envelope;
}

/** One oscillator stacked on the tone's base pitch and volume (the wiki's "harmonics"). */
export interface Partial {
  /** Percent of the tone's volume. */
  readonly volume: number;
  /** Pitch offset in 1/120 octave (tenths of a semitone), applied to the swept part of the pitch. */
  readonly detune: number;
  /** Start delay in milliseconds. */
  readonly delayMs: number;
}

/** One second-order filter stage; each pair holds the value at the start and end of the morph. */
export interface FilterStage {
  /** Frequency code: 8192 codes per octave above 32.7 Hz. */
  readonly frequency: readonly [number, number];
  /** Radius code: larger is sharper. */
  readonly magnitude: readonly [number, number];
}

/** A pole-zero IIR filter that morphs between two settings across the tone. */
export interface Filter {
  /** Conjugate zero pairs (the feed-forward half). */
  readonly zeros: readonly FilterStage[];
  /** Conjugate pole pairs (the resonant, feedback half). */
  readonly poles: readonly FilterStage[];
  /** Attenuation code at the start and end of the morph. */
  readonly gain: readonly [number, number];
  /** Morph position across the tone; `null` when both ends are identical. */
  readonly morph: readonly Breakpoint[] | null;
}

export interface Tone {
  /** Base frequency in Hz; `shape` is the oscillator waveform. */
  readonly pitch: Envelope;
  /** Base volume in percent. */
  readonly volume: Envelope;
  readonly vibrato: Modulator | null;
  readonly tremolo: Modulator | null;
  /** The wiki's "gap off" / "gap on": alternating silent and sounding runs, in samples. */
  readonly gate: { readonly off: Envelope; readonly on: Envelope } | null;
  readonly partials: readonly Partial[];
  /** Feedback echo (the wiki's "reverb"): delay in ms, feedback in percent. */
  readonly echo: { readonly delayMs: number; readonly volume: number };
  readonly durationMs: number;
  readonly startMs: number;
  readonly filter: Filter | null;
}

export interface SoundPatch {
  /** Ten slots; an unused slot is `null`. */
  readonly tones: readonly (Tone | null)[];
  /** Loop region in milliseconds as stored; one-shot playback ignores it. */
  readonly loopStartMs: number;
  readonly loopEndMs: number;
}

export const TONE_SLOTS = 10;
const MAX_PARTIALS = 5;
const MAX_FILTER_STAGES = 4;

export class PatchDecodeError extends Error {
  override name = 'PatchDecodeError';
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  private need(n: number): void {
    if (this.offset + n > this.bytes.length) {
      throw new PatchDecodeError(`patch truncated at byte ${this.offset} of ${this.bytes.length}`);
    }
  }

  peek(): number {
    this.need(1);
    return this.bytes[this.offset];
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.offset++];
  }

  u16(): number {
    this.need(2);
    const b = this.bytes;
    const v = (b[this.offset] << 8) | b[this.offset + 1];
    this.offset += 2;
    return v;
  }

  i32(): number {
    this.need(4);
    const b = this.bytes;
    const o = this.offset;
    this.offset += 4;
    return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
  }

  /** 0..32767: one byte below 0x80, else two bytes minus 0x8000. */
  usmart(): number {
    return this.peek() < 0x80 ? this.u8() : this.u16() - 0x8000;
  }

  /** -64..16383: one byte minus 64 below 0x80, else two bytes minus 0xc000. */
  smart(): number {
    return this.peek() < 0x80 ? this.u8() - 64 : this.u16() - 0xc000;
  }
}

function readPoints(r: Reader): Breakpoint[] {
  const count = r.u8();
  const points: Breakpoint[] = [];
  for (let i = 0; i < count; i++) points.push({ position: r.u16(), level: r.u16() });
  return points;
}

function readEnvelope(r: Reader): Envelope {
  const shape = r.u8();
  const min = r.i32();
  const max = r.i32();
  return { shape, min, max, points: readPoints(r) };
}

/** An optional envelope pair: present when its first (shape) byte is non-zero, else one zero byte. */
function readOptionalPair(r: Reader): [Envelope, Envelope] | null {
  if (r.peek() === 0) {
    r.u8();
    return null;
  }
  return [readEnvelope(r), readEnvelope(r)];
}

function readFilter(r: Reader): Filter | null {
  const counts = r.u8();
  if (counts === 0) return null;
  // High nibble: zero pairs; low nibble: pole pairs.
  const stageCounts = [counts >> 4, counts & 15];
  if (stageCounts[0] > MAX_FILTER_STAGES || stageCounts[1] > MAX_FILTER_STAGES) {
    throw new PatchDecodeError(`filter has ${stageCounts[0]}+${stageCounts[1]} stages; at most 4 each`);
  }
  const gain: [number, number] = [r.u16(), r.u16()];
  const endMask = r.u8();
  const start = stageCounts.map((count) => {
    const stages: [number, number][] = [];
    for (let s = 0; s < count; s++) stages.push([r.u16(), r.u16()]);
    return stages;
  });
  // A set mask bit means that stage stores a separate end setting; otherwise it does not morph.
  const end = stageCounts.map((count, d) => {
    const stages: [number, number][] = [];
    for (let s = 0; s < count; s++) {
      stages.push(endMask & (1 << (d * 4 + s)) ? [r.u16(), r.u16()] : start[d][s]);
    }
    return stages;
  });
  const morph = endMask !== 0 || gain[0] !== gain[1] ? readPoints(r) : null;
  const stagesOf = (d: number): FilterStage[] =>
    start[d].map(([f0, m0], s) => ({ frequency: [f0, end[d][s][0]], magnitude: [m0, end[d][s][1]] }));
  return { zeros: stagesOf(0), poles: stagesOf(1), gain, morph };
}

function readTone(r: Reader): Tone {
  const pitch = readEnvelope(r);
  const volume = readEnvelope(r);
  const vibrato = readOptionalPair(r);
  const tremolo = readOptionalPair(r);
  const gate = readOptionalPair(r);
  const partials: Partial[] = [];
  // The list ends at a zero volume; it holds at most five entries.
  while (partials.length < MAX_PARTIALS) {
    const vol = r.usmart();
    if (vol === 0) break;
    partials.push({ volume: vol, detune: r.smart(), delayMs: r.usmart() });
  }
  if (partials.length === MAX_PARTIALS && r.peek() !== 0) {
    throw new PatchDecodeError(`tone has more than ${MAX_PARTIALS} partials`);
  }
  if (partials.length === MAX_PARTIALS) r.u8();
  const echoDelayMs = r.usmart();
  const echoVolume = r.usmart();
  const durationMs = r.u16();
  const startMs = r.u16();
  return {
    pitch,
    volume,
    vibrato: vibrato && { rate: vibrato[0], depth: vibrato[1] },
    tremolo: tremolo && { rate: tremolo[0], depth: tremolo[1] },
    gate: gate && { off: gate[0], on: gate[1] },
    partials,
    echo: { delayMs: echoDelayMs, volume: echoVolume },
    durationMs,
    startMs,
    filter: readFilter(r),
  };
}

/** Decodes a sound-effect patch. Throws `PatchDecodeError` on truncated or malformed bytes. */
export function decodeSoundPatch(bytes: Uint8Array): SoundPatch {
  const r = new Reader(bytes);
  const tones: (Tone | null)[] = [];
  for (let i = 0; i < TONE_SLOTS; i++) {
    if (r.peek() === 0) {
      r.u8();
      tones.push(null);
    } else {
      tones.push(readTone(r));
    }
  }
  const loopStartMs = r.u16();
  const loopEndMs = r.u16();
  if (r.offset !== bytes.length) {
    throw new PatchDecodeError(`patch has ${bytes.length - r.offset} trailing bytes`);
  }
  return { tones, loopStartMs, loopEndMs };
}
