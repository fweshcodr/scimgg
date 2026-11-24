export const REPLAY_CAPTURE_TRACKS = [
  'cursorSamples',
  'viewportSamples',
  'cursorClicks',
  'menuEvents',
  'presentationSamples',
  'modifierSamples',
  'overlays',
] as const;

export type ReplayCaptureTrack = (typeof REPLAY_CAPTURE_TRACKS)[number];
export type TrackCapture =
  | {
      readonly provenance: 'bounded-v1' | 'not-recorded';
      readonly stoppedAtMs: null;
      readonly reason: null;
    }
  | {
      readonly provenance: 'bounded-v1';
      readonly stoppedAtMs: number;
      readonly reason: 'entry-limit' | 'byte-limit';
    };
export type ReplayCapture = Readonly<Record<ReplayCaptureTrack, TrackCapture>>;

export const REPLAY_CAPTURE_LIMITS = {
  cursorSamples: 1_000_000,
  viewportSamples: 200_000,
  cursorClicks: 50_000,
  menuEvents: 30_000,
  presentationSamples: 30_000,
  modifierSamples: 100_000,
  overlays: 1,
  ancillaryBytes: 64 * 1024 * 1024,
} as const;
export type ReplayCaptureLimits = Readonly<Record<keyof typeof REPLAY_CAPTURE_LIMITS, number>>;

export type ReplayAncillaryData = {
  readonly [Track in Exclude<ReplayCaptureTrack, 'overlays'>]?: readonly unknown[];
} & { readonly overlays?: object | null };

export function freshReplayCapture(): ReplayCapture {
  const active = Object.freeze({ provenance: 'bounded-v1', stoppedAtMs: null, reason: null } as const);
  return Object.freeze({
    cursorSamples: active,
    viewportSamples: active,
    cursorClicks: active,
    menuEvents: active,
    presentationSamples: active,
    modifierSamples: active,
    overlays: Object.freeze({ provenance: 'not-recorded', stoppedAtMs: null, reason: null } as const),
  });
}
