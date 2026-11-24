import { decodeSoundPatch } from './patch';
import { type PcmBuffer, renderPatch } from './render';

export type { Envelope, Filter, FilterStage, Modulator, Partial, SoundPatch, Tone } from './patch';
export { decodeSoundPatch, PatchDecodeError, Shape } from './patch';
export type { PcmBuffer } from './render';
export { patchLength, renderPatch, SYNTH_SAMPLE_RATE } from './render';

/**
 * Renders the bytes of a cache sound effect (index 4, group = sound id, file 0) to mono PCM at
 * `SYNTH_SAMPLE_RATE`. Returns `null` for a patch with no sound (no tones or zero length).
 * Throws `PatchDecodeError` for bytes that are not a well-formed patch.
 */
export function renderSoundEffect(bytes: Uint8Array): PcmBuffer | null {
  const pcm = renderPatch(decodeSoundPatch(bytes));
  return pcm.samples.length === 0 ? null : pcm;
}
