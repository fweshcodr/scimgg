import { REPLAY_CAPTURE_TRACKS, type ReplayCapture, type ReplayCaptureTrack } from './format/capture';

const CAPTURE_LABELS: Readonly<Record<ReplayCaptureTrack, string>> = {
  cursorSamples: 'Mouse path',
  viewportSamples: 'Camera detail',
  cursorClicks: 'Clicks',
  menuEvents: 'Menus',
  presentationSamples: 'Layout',
  modifierSamples: 'Held keys/buttons',
  overlays: 'Tile/line markers',
};

export function replayCaptureNotice(capture: ReplayCapture | undefined): string | null {
  if (!capture) return null;
  const stopped: string[] = [];
  for (const track of REPLAY_CAPTURE_TRACKS) {
    const at = capture[track].stoppedAtMs;
    if (at === null) continue;
    const seconds = Math.floor(at / 1000);
    stopped.push(`${CAPTURE_LABELS[track]} at ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  }
  return stopped.length > 0 ? `Capture limit reached: ${stopped.join('; ')}. Combat replay continues.` : null;
}
