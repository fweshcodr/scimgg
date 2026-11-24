import {
  type Breakpoint,
  type Envelope,
  type Filter,
  type Modulator,
  Shape,
  type SoundPatch,
  type Tone,
} from './patch';

/**
 * Renders a decoded sound-effect patch to mono PCM. The model and the evidence behind each
 * constant are in docs/architecture/audio-synth.md.
 */

export interface PcmBuffer {
  readonly samples: Float32Array<ArrayBuffer>;
  readonly sampleRate: number;
}

export const SYNTH_SAMPLE_RATE = 22_050;

/** Breakpoint positions and levels are fractions of this. */
const UNIT = 65_536;
/** Phase increments are whole 1/32768ths of a cycle per sample, truncated toward zero. */
const PHASE_STEPS = 32_768;
/** Noise holds a random +-1 for this many holds per oscillator cycle. */
const NOISE_HOLDS_PER_CYCLE = 12.5;
const NOISE_TABLE_SIZE = 4096;
const STEPS_PER_HZ = PHASE_STEPS / SYNTH_SAMPLE_RATE;

const FILTER_BASE_HZ = 32.703;
const FILTER_CODES_PER_OCTAVE = 8192;
/** A stage's radius is 1 - 10^(-code / this). */
const FILTER_RADIUS_CODES_PER_DECADE = 13_107;
const FILTER_GAIN_DB_PER_CODE = 0.003;
/** Morphing filters refresh their coefficients this often (samples). */
const FILTER_BLOCK = 32;
const MAX_FILTER_ORDER = 8;
/** Echo feedback above 100% grows without bound; values are held here until the final clip. */
const MAX_INTERNAL_LEVEL = 1e4;

const SINE = (() => {
  const table = new Float64Array(PHASE_STEPS);
  for (let i = 0; i < PHASE_STEPS; i++) table[i] = Math.sin((2 * Math.PI * i) / PHASE_STEPS);
  return table;
})();

/** A fixed xorshift sequence, so every render of a patch is identical. */
const NOISE = (() => {
  const table = new Float32Array(NOISE_TABLE_SIZE);
  let s = 0x5eed1234;
  for (let i = 0; i < table.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    table[i] = s & 1 ? 1 : -1;
  }
  return table;
})();

/** Level fraction (0..1) per sample: linear between breakpoints, held beyond the ends. */
function sampleLevels(points: readonly Breakpoint[], n: number): Float64Array {
  const out = new Float64Array(n);
  if (points.length === 0) return out;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const pos = (i / n) * UNIT;
    while (k < points.length - 1 && points[k + 1].position <= pos) k++;
    const a = points[k];
    const b = points[k + 1];
    if (!b || pos <= a.position) {
      out[i] = a.level / UNIT;
    } else {
      out[i] = (a.level + ((b.level - a.level) * (pos - a.position)) / (b.position - a.position)) / UNIT;
    }
  }
  return out;
}

/** Per-sample `min + (max - min) * level`; with `includeMin` false, only the swept part. */
function sampleEnvelope(env: Envelope, n: number, includeMin = true): Float64Array {
  const out = sampleLevels(env.points, n);
  const span = env.max - env.min;
  const base = includeMin ? env.min : 0;
  for (let i = 0; i < n; i++) out[i] = base + span * out[i];
  return out;
}

/** Phase increment for `hz`, in 1/32768 cycles per sample. */
function phaseStep(hz: number): number {
  return Math.trunc(hz * STEPS_PER_HZ);
}

/** One sample of `shape` at an accumulated phase (1/32768 cycles, unwrapped). */
function wave(shape: number, phase: number): number {
  const p = phase & (PHASE_STEPS - 1);
  switch (shape) {
    case Shape.Square:
      return p < PHASE_STEPS / 2 ? 1 : -1;
    case Shape.Sine:
      return SINE[p];
    case Shape.Saw:
      return (2 * p) / PHASE_STEPS - 1;
    case Shape.Noise:
      return NOISE[Math.floor((phase * NOISE_HOLDS_PER_CYCLE) / PHASE_STEPS) & (NOISE_TABLE_SIZE - 1)];
    default:
      return 0;
  }
}

/** Per-sample LFO output: waveform times depth as a fraction (100% = 1). */
function sampleModulator(mod: Modulator, n: number): Float64Array {
  const rate = sampleEnvelope(mod.rate, n);
  const depth = sampleEnvelope(mod.depth, n);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    out[i] = (wave(mod.rate.shape, phase) * depth[i]) / 100;
    phase += phaseStep(rate[i]);
  }
  return out;
}

function msToSamples(ms: number): number {
  return Math.round((ms * SYNTH_SAMPLE_RATE) / 1000);
}

/** Sounding and silent runs alternate, starting sounding; both lengths use the off curve's range. */
function applyGate(out: Float64Array, gate: NonNullable<Tone['gate']>): void {
  const n = out.length;
  const off = sampleEnvelope(gate.off, n, false);
  const on = sampleEnvelope({ ...gate.on, min: gate.off.min, max: gate.off.max }, n, false);
  let sounding = true;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (count >= (sounding ? on[i] : off[i])) {
      sounding = !sounding;
      count = 0;
    }
    if (!sounding) out[i] = 0;
    count++;
  }
}

function applyEcho(out: Float64Array, delayMs: number, volume: number): void {
  const d = msToSamples(delayMs);
  if (d <= 0 || volume <= 0) return;
  const g = volume / 100;
  for (let i = d; i < out.length; i++) {
    const v = out[i] + out[i - d] * g;
    out[i] = v > MAX_INTERNAL_LEVEL ? MAX_INTERNAL_LEVEL : v < -MAX_INTERNAL_LEVEL ? -MAX_INTERNAL_LEVEL : v;
  }
}

/** Multiplies `poly` (powers of z^-1) of the given order by one conjugate pair; returns the new order. */
function mulStage(poly: Float64Array, order: number, frequencyCode: number, magnitudeCode: number): number {
  const hz = FILTER_BASE_HZ * 2 ** (frequencyCode / FILTER_CODES_PER_OCTAVE);
  const r = 1 - 10 ** (-magnitudeCode / FILTER_RADIUS_CODES_PER_DECADE);
  const c1 = -2 * r * Math.cos((2 * Math.PI * hz) / SYNTH_SAMPLE_RATE);
  const c2 = r * r;
  for (let k = order + 2; k >= 2; k--) poly[k] += c1 * poly[k - 1] + c2 * poly[k - 2];
  poly[1] += c1 * poly[0];
  return order + 2;
}

function stagePolynomial(poly: Float64Array, stages: Filter['zeros'], u: number): number {
  poly.fill(0);
  poly[0] = 1;
  let order = 0;
  for (const s of stages) {
    const f = s.frequency[0] + (s.frequency[1] - s.frequency[0]) * u;
    const m = s.magnitude[0] + (s.magnitude[1] - s.magnitude[0]) * u;
    order = mulStage(poly, order, f, m);
  }
  return order;
}

/** Direct-form pole-zero filter whose stages and gain morph across the tone. */
function applyFilter(out: Float64Array, filter: Filter): void {
  const n = out.length;
  const morph = filter.morph ? sampleLevels(filter.morph, n) : null;
  const b = new Float64Array(MAX_FILTER_ORDER + 1);
  const a = new Float64Array(MAX_FILTER_ORDER + 1);
  // Past inputs (xs[0] = current) and outputs (ys[0] = previous), newest first.
  const xs = new Float64Array(MAX_FILTER_ORDER + 1);
  const ys = new Float64Array(MAX_FILTER_ORDER + 1);
  for (let start = 0; start < n; start += FILTER_BLOCK) {
    const end = Math.min(n, start + FILTER_BLOCK);
    const u = morph ? morph[(start + end) >> 1] : 0;
    const nb = stagePolynomial(b, filter.zeros, u);
    const na = stagePolynomial(a, filter.poles, u);
    const gainCode = filter.gain[0] + (filter.gain[1] - filter.gain[0]) * u;
    const gain = 10 ** ((-gainCode * FILTER_GAIN_DB_PER_CODE) / 20);
    for (let i = start; i < end; i++) {
      for (let k = MAX_FILTER_ORDER; k > 0; k--) xs[k] = xs[k - 1];
      xs[0] = out[i];
      let acc = 0;
      for (let k = 0; k <= nb; k++) acc += b[k] * xs[k];
      acc *= gain;
      for (let k = 1; k <= na; k++) acc -= a[k] * ys[k - 1];
      for (let k = MAX_FILTER_ORDER; k > 0; k--) ys[k] = ys[k - 1];
      ys[0] = acc;
      out[i] = acc;
    }
  }
}

/** Renders one tone, unpositioned: oscillators, then gate, echo and filter. */
function renderTone(tone: Tone): Float64Array {
  const n = msToSamples(tone.durationMs);
  const out = new Float64Array(n);
  if (n === 0 || tone.pitch.shape === Shape.Off || tone.partials.length === 0) return out;
  const sweep = sampleEnvelope(tone.pitch, n, false);
  const volume = sampleEnvelope(tone.volume, n);
  const vibrato = tone.vibrato && sampleModulator(tone.vibrato, n);
  const tremolo = tone.tremolo && sampleModulator(tone.tremolo, n);
  const base = tone.pitch.min;
  // Vibrato at 100% depth swings the frequency by half the pitch envelope's range.
  const vibratoSpan = (tone.pitch.max - tone.pitch.min) / 2;
  for (const partial of tone.partials) {
    const ratio = 2 ** (partial.detune / 120);
    const amp = partial.volume / 100;
    const delay = msToSamples(partial.delayMs);
    let phase = 0;
    for (let i = 0; i + delay < n; i++) {
      const swept = vibrato ? sweep[i] + vibrato[i] * vibratoSpan : sweep[i];
      const level = tremolo ? volume[i] * (1 + tremolo[i]) : volume[i];
      out[i + delay] += ((level * amp) / 100) * wave(tone.pitch.shape, phase);
      phase += phaseStep(base + swept * ratio);
    }
  }
  if (tone.gate) applyGate(out, tone.gate);
  applyEcho(out, tone.echo.delayMs, tone.echo.volume);
  if (tone.filter) applyFilter(out, tone.filter);
  return out;
}

/** Samples in the rendered sound: the latest tone end. */
export function patchLength(patch: SoundPatch): number {
  let length = 0;
  for (const tone of patch.tones) {
    if (tone) length = Math.max(length, msToSamples(tone.startMs + tone.durationMs));
  }
  return length;
}

/** Mixes every tone at its start offset and hard-clips to [-1, 1]. */
export function renderPatch(patch: SoundPatch): PcmBuffer {
  const length = patchLength(patch);
  const mix = new Float64Array(length);
  for (const tone of patch.tones) {
    if (!tone) continue;
    const pcm = renderTone(tone);
    const offset = msToSamples(tone.startMs);
    const end = Math.min(pcm.length, length - offset);
    for (let i = 0; i < end; i++) mix[offset + i] += pcm[i];
  }
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = mix[i];
    // A NaN is silenced rather than handed to the audio graph.
    samples[i] = v >= 1 ? 1 : v <= -1 ? -1 : Number.isNaN(v) ? 0 : v;
  }
  return { samples, sampleRate: SYNTH_SAMPLE_RATE };
}
