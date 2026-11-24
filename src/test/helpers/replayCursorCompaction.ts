import type { ReplayCursorSample, ReplayCursorTrack } from '../../core/ReplayRecorder';
import { replayCursorTailUpdate } from '../../core/replayCursorSampling';

/**
 * Compacts a whole raw cursor track in one pass, with the tail rules the recorder applies live, so
 * tests can check live recording against it.
 */
export function compactReplayCursorSamples(track: ReplayCursorTrack): readonly ReplayCursorSample[] {
  const samples: ReplayCursorSample[] = [];
  let presentationIndex = 0;
  let clickIndex = 0;
  let previousInput: ReplayCursorSample | undefined;
  for (const input of track.samples) {
    let boundary = false;
    let clickBoundary = false;
    while (presentationIndex < (track.presentationSamples?.length ?? 0)) {
      const presentation = track.presentationSamples?.[presentationIndex];
      if (!presentation || presentation.tMs > input.tMs) break;
      if (previousInput && presentation.tMs > previousInput.tMs) boundary = true;
      presentationIndex++;
    }
    while (track.clicks[clickIndex] && (track.clicks[clickIndex]?.tMs ?? Infinity) < input.tMs) {
      const click = track.clicks[clickIndex];
      if (previousInput && click && click.tMs >= previousInput.tMs) clickBoundary = true;
      clickIndex++;
    }
    const sample: ReplayCursorSample = {
      ...input,
      ...(boundary ? { breakBefore: true } : {}),
      ...(clickBoundary || track.clicks[clickIndex]?.tMs === input.tMs ? { pinned: true } : {}),
    };
    const update = replayCursorTailUpdate(samples, sample);
    if (update.count > 0) samples.splice(samples.length - update.fromEnd, update.count);
    samples.push(sample);
    previousInput = input;
  }
  return samples;
}
