import type { ReplayCapture, ReplayCaptureTrack } from '../replay/format/capture';

export function isReplayTrackAvailable(
  capture: ReplayCapture | undefined,
  track: ReplayCaptureTrack,
  playheadMs: number,
): boolean {
  if (!capture) return true;
  const status = capture[track];
  return status.provenance !== 'not-recorded' && (status.stoppedAtMs === null || playheadMs < status.stoppedAtMs);
}
