import {
  freshReplayCapture,
  REPLAY_CAPTURE_LIMITS,
  REPLAY_CAPTURE_TRACKS,
  type ReplayAncillaryData,
  type ReplayCapture,
  type ReplayCaptureLimits,
  type ReplayCaptureTrack,
  type TrackCapture,
} from '../replay/format/capture';

const encoder = new TextEncoder();
export function replayJsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

const emptyAncillary = {
  cursorSamples: [],
  viewportSamples: [],
  cursorClicks: [],
  menuEvents: [],
  presentationSamples: [],
  modifierSamples: [],
  overlays: null,
};

export class ReplayCaptureBudget {
  private capture = freshReplayCapture();
  private readonly listeners = new Set<() => void>();
  private counts: Record<ReplayCaptureTrack, number> = {
    cursorSamples: 0,
    viewportSamples: 0,
    cursorClicks: 0,
    menuEvents: 0,
    presentationSamples: 0,
    modifierSamples: 0,
    overlays: 0,
  };
  private bytes = replayJsonBytes(emptyAncillary);
  readonly limits: ReplayCaptureLimits;

  constructor(overrides: Partial<ReplayCaptureLimits> = {}) {
    this.limits = { ...REPLAY_CAPTURE_LIMITS, ...overrides };
  }

  getCapture = (): ReplayCapture => this.capture;
  subscribeCapture = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStats(): { readonly counts: Readonly<Record<ReplayCaptureTrack, number>>; readonly ancillaryBytes: number } {
    return { counts: { ...this.counts }, ancillaryBytes: this.bytes };
  }

  isStopped(track: ReplayCaptureTrack): boolean {
    return this.capture[track].stoppedAtMs !== null;
  }

  accept(
    track: ReplayCaptureTrack,
    candidate: { readonly tMs: number; readonly value: unknown; readonly previous?: unknown },
  ): boolean {
    if (this.isStopped(track)) return false;
    const replacing = candidate.previous !== undefined;
    const count = this.counts[track];
    const nextCount = count + (replacing ? 0 : 1);
    if (nextCount > this.limits[track]) {
      this.stop(track, candidate.tMs, 'entry-limit');
      return false;
    }
    const delta =
      replayJsonBytes(candidate.value) -
      (replacing ? replayJsonBytes(candidate.previous) : 0) +
      (track === 'overlays' ? -4 : replacing || count === 0 ? 0 : 1);
    if (this.bytes + delta > this.limits.ancillaryBytes) {
      this.stop(track, candidate.tMs, 'byte-limit');
      return false;
    }
    this.bytes += delta;
    this.counts[track] = nextCount;
    return true;
  }

  remove(track: Exclude<ReplayCaptureTrack, 'overlays'>, value: unknown): void {
    this.bytes -= replayJsonBytes(value) + (this.counts[track] > 1 ? 1 : 0);
    this.counts[track] -= 1;
  }

  reset(data: ReplayAncillaryData = {}, capture = freshReplayCapture()): void {
    this.bytes = replayJsonBytes(emptyAncillary);
    for (const track of REPLAY_CAPTURE_TRACKS) {
      if (track === 'overlays') {
        this.counts.overlays = data.overlays == null ? 0 : 1;
        if (data.overlays != null) this.bytes += replayJsonBytes(data.overlays) - 4;
      } else {
        const entries = data[track] ?? [];
        this.counts[track] = entries.length;
        for (const value of entries) this.bytes += replayJsonBytes(value);
        this.bytes += Math.max(0, entries.length - 1);
      }
    }
    this.setCapture(capture);
  }

  fork(data: ReplayAncillaryData, boundaryMs: number): void {
    let capture = this.capture;
    for (const track of REPLAY_CAPTURE_TRACKS) {
      const status = capture[track];
      if (status.stoppedAtMs !== null && boundaryMs < status.stoppedAtMs) {
        capture = { ...capture, [track]: { provenance: status.provenance, stoppedAtMs: null, reason: null } };
      }
    }
    this.reset(data, capture);
  }

  private stop(track: ReplayCaptureTrack, tMs: number, reason: 'entry-limit' | 'byte-limit'): void {
    this.setCapture({ ...this.capture, [track]: { provenance: 'bounded-v1', stoppedAtMs: tMs, reason } });
  }

  private setCapture(capture: ReplayCapture): void {
    if (
      REPLAY_CAPTURE_TRACKS.every((track) => {
        const previous = this.capture[track];
        const next = capture[track];
        return (
          previous.provenance === next.provenance &&
          previous.stoppedAtMs === next.stoppedAtMs &&
          previous.reason === next.reason
        );
      })
    )
      return;
    const frozen: Record<ReplayCaptureTrack, TrackCapture> = { ...capture };
    for (const track of REPLAY_CAPTURE_TRACKS) frozen[track] = Object.freeze({ ...capture[track] });
    this.capture = Object.freeze(frozen);
    for (const listener of this.listeners) listener();
  }
}
