export type MetronomeBeat = 'tick' | 'tock';

/** A5 and the E5 a fifth below: distinct enough to count by, consonant enough to hear every tick. */
const PITCH_HZ: Record<MetronomeBeat, number> = { tick: 880, tock: 660 };

const DURATION_S = 0.12;
const ATTACK_S = 0.0015;
const BODY_DECAY_S = 0.018;
/** A marimba bar's first overtone sits near 4x the fundamental and dies fast: it gives a soft mallet edge. */
const OVERTONE_RATIO = 3.93;
const OVERTONE_LEVEL = 0.18;
const OVERTONE_DECAY_S = 0.004;
/**
 * Sets how loud 100% metronome volume is. A beat plays every tick, so full volume
 * stays a background cue: about -34 LUFS momentary, slightly above the Protect
 * prayer sounds at the default 10% sound-effect volume.
 */
const PEAK = 0.2;

/**
 * Renders one short, mellow mallet strike. A tone this brief with no sharp onset
 * stays unobtrusive when repeated every 600 ms; the linear attack avoids a click.
 */
export function synthesizeMetronomeBeat(beat: MetronomeBeat, sampleRate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.ceil(DURATION_S * sampleRate));
  const frequency = PITCH_HZ[beat];
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / ATTACK_S);
    const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / BODY_DECAY_S);
    const overtone =
      OVERTONE_LEVEL * Math.sin(2 * Math.PI * frequency * OVERTONE_RATIO * t) * Math.exp(-t / OVERTONE_DECAY_S);
    const sample = attack * (body + overtone);
    samples[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const scale = peak > 0 ? PEAK / peak : 0;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}
