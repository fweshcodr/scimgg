import { getReplayClickDurationMs } from '../input/replayClickFeedback';
import type { ReplayCapture } from '../replay/format/capture';
import type { ReplayCursorTrack, ReplayModifierSample, ReplayViewportTrack } from './ReplayRecorder';
import type { ReplayMenuEvent } from './replayMenu';
import type { ReplayPresentationSample } from './replayPresentation';
import { frameStartMs, type ReplayTimelineFrame } from './replayTimeline';

export function getReplayDurationMs(
  frames: readonly ReplayTimelineFrame[],
  cursorTrack: ReplayCursorTrack,
  viewportTrack: ReplayViewportTrack,
  modifierSamples: readonly ReplayModifierSample[] = [],
  menuEvents: readonly ReplayMenuEvent[] = [],
  presentationSamples: readonly Pick<ReplayPresentationSample, 'tMs'>[] = [],
  capture?: ReplayCapture,
): number {
  const lastFrameBoundaryMs = frameStartMs(frames, frames.length - 1);
  const finalCursorSampleMs = cursorTrack.samples.at(-1)?.tMs ?? 0;
  const finalViewportSampleMs = viewportTrack.samples.at(-1)?.tMs ?? 0;
  // A modifier released after the last frame boundary is otherwise unreachable, and
  // playback parks with the overlay still reporting it held.
  const finalModifierSampleMs = modifierSamples.at(-1)?.tMs ?? 0;
  const finalMenuEventMs = menuEvents.at(-1)?.tMs ?? 0;
  const finalPresentationSampleMs = presentationSamples.at(-1)?.tMs ?? 0;
  let durationMs = Math.max(
    lastFrameBoundaryMs,
    finalCursorSampleMs,
    finalViewportSampleMs,
    finalModifierSampleMs,
    finalMenuEventMs,
    finalPresentationSampleMs,
  );
  for (const click of cursorTrack.clicks) {
    durationMs = Math.max(durationMs, click.tMs + getReplayClickDurationMs(click.type));
  }
  if (capture) {
    for (const status of Object.values(capture)) {
      durationMs = Math.max(durationMs, status.stoppedAtMs ?? 0);
    }
  }
  return durationMs;
}
