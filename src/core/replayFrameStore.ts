import type { ReplayCapture, ReplayCaptureTrack } from '../replay/format/capture';
import type { SimulationState } from '../types/simulation';
import type { GameEvent } from './events/types';
import type { ReplayDisplayFrame, ReplayViewportState } from './ReplayRecorder';
import { isReplayTrackAvailable } from './replayCaptureCoverage';
import {
  buildReplayMenuTimeline,
  type ReplayMenuEvent,
  type ReplayMenuState,
  type ReplayMenuTimelineSample,
  replayMenuStateAt,
} from './replayMenu';

export interface ReplayFrameSnapshot {
  readonly playheadMs: number;
  readonly viewportState: ReplayViewportState | undefined;
  readonly history: readonly ReplayDisplayFrame[] | undefined;
  /**
   * Tick snapshot to draw INSTEAD of the committed one, published while the user
   * is dragging the seek bar or a takeover request previews its completed boundary.
   *
   * Committing a scrub through React state re-renders the whole simulator tree
   * (App -> GridProviders -> Grid -> chrome/panels), which costs tens of
   * milliseconds per tick. Doing that per pointer sample is what makes dragging
   * the seek bar lag. Publishing the previewed tick here instead keeps the drag
   * on the renderer's own path: only the viewport re-renders, at whatever rate
   * the pointer moves, and React catches up once on release.
   */
  readonly preview: ReplayFramePreview | undefined;
}

export interface ReplayFramePreview {
  readonly frameIndex: number;
  readonly state: SimulationState;
  readonly events: GameEvent[];
  /** Request-owned takeover preflight: show this completed snapshot without moving the transport. */
  readonly completedBoundary?: boolean;
}

export interface ReplayRenderFailure {
  readonly error: Error;
  readonly frameIndex: number;
  readonly playheadMs: number;
}

const NO_MENU_EVENTS: readonly ReplayMenuEvent[] = [];

const EMPTY_SNAPSHOT: ReplayFrameSnapshot = {
  playheadMs: 0,
  viewportState: undefined,
  preview: undefined,
  history: undefined,
};

/**
 * External store (React `useSyncExternalStore` shaped) for the replay playhead
 * and interpolated camera that advance on every animation frame during replay
 * playback.
 *
 * Pushing the playhead through React state in `useReplay` instead re-renders the
 * *entire* Grid/chrome/panel subtree at display refresh rate, tanking FPS during
 * replay. Writing to this store instead notifies only the two components that
 * actually consume per-frame replay values (the 3D viewport camera and the
 * replay cursor overlay); nothing above them re-renders. Frame-index changes
 * (which swap the displayed tick snapshot) still go through React state, but
 * those fire only per tick.
 */
export class ReplayFrameStore {
  private snapshot: ReplayFrameSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private menuEvents: readonly ReplayMenuEvent[] | undefined;
  private menuTimeline: readonly ReplayMenuTimelineSample[] = [];
  private capture: ReplayCapture | undefined;
  private renderConsumers = 0;
  private renderEpoch = 0;
  private renderedFrameIndex = -1;
  private renderedPlayheadMs = -1;
  private renderFailure: ReplayRenderFailure | undefined;

  getRenderFailure = (): ReplayRenderFailure | undefined => this.renderFailure;

  failRender(epoch: number, failure: ReplayRenderFailure): void {
    if (epoch !== this.renderEpoch || this.renderFailure) return;
    this.renderFailure = failure;
    this.emit();
  }

  registerRenderConsumer(): () => void {
    this.renderConsumers++;
    this.resetRenderProgress();
    return () => {
      this.renderConsumers--;
      this.resetRenderProgress();
    };
  }

  getRenderEpoch(): number {
    return this.renderEpoch;
  }

  resetRenderProgress(): void {
    this.renderEpoch++;
    this.renderedFrameIndex = -1;
    this.renderedPlayheadMs = -1;
  }

  acknowledgeRender(epoch: number, frameIndex: number, playheadMs: number): void {
    if (epoch !== this.renderEpoch || this.renderFailure) return;
    this.renderedFrameIndex = Math.max(this.renderedFrameIndex, frameIndex);
    this.renderedPlayheadMs = Math.max(this.renderedPlayheadMs, playheadMs);
  }

  isFrameRendered(frameIndex: number): boolean {
    return !this.renderFailure && (this.renderConsumers === 0 || this.renderedFrameIndex >= frameIndex);
  }

  isPlayheadRendered(playheadMs: number): boolean {
    return !this.renderFailure && (this.renderConsumers === 0 || this.renderedPlayheadMs >= playheadMs);
  }

  getSnapshot = (): ReplayFrameSnapshot => this.snapshot;

  getCapture = (): ReplayCapture | undefined => this.capture;

  isTrackAvailable(track: ReplayCaptureTrack, playheadMs = this.snapshot.playheadMs): boolean {
    return isReplayTrackAvailable(this.capture, track, playheadMs);
  }

  /** The replay's raw menu events, for consumers that need more than the state at the playhead. */
  getMenuEvents = (): readonly ReplayMenuEvent[] => this.menuEvents ?? NO_MENU_EVENTS;

  getMenuState = (): ReplayMenuState | null =>
    this.isTrackAvailable('menuEvents') && this.isTrackAvailable('presentationSamples')
      ? replayMenuStateAt(this.menuTimeline, this.snapshot.playheadMs)
      : null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Write a new frame. No-ops (skips notifying) when nothing changed. */
  set(playheadMs: number, viewportState: ReplayViewportState | undefined): void {
    const prev = this.snapshot;
    if (prev.playheadMs === playheadMs && prev.viewportState === viewportState) return;
    this.snapshot = { ...prev, playheadMs, viewportState };
    this.emit();
  }

  /** Publish (or clear, with `undefined`) a scrub or request-owned preflight preview. */
  setPreview(preview: ReplayFramePreview | undefined): void {
    const prev = this.snapshot;
    if (prev.preview === preview) return;
    if (
      prev.preview?.frameIndex === preview?.frameIndex &&
      prev.preview !== undefined &&
      preview !== undefined &&
      (prev.preview.completedBoundary === true) === (preview.completedBoundary === true)
    ) {
      return;
    }
    this.resetRenderProgress();
    this.snapshot = { ...prev, preview };
    this.emit();
  }

  setHistory(
    history: readonly ReplayDisplayFrame[] | undefined,
    menuEvents?: readonly ReplayMenuEvent[],
    capture?: ReplayCapture,
  ): void {
    const sameHistory = this.snapshot.history === history;
    const nextMenuEvents =
      history === undefined ? undefined : (menuEvents ?? (sameHistory ? this.menuEvents : undefined));
    const nextCapture = history === undefined ? undefined : (capture ?? (sameHistory ? this.capture : undefined));
    if (sameHistory && this.menuEvents === nextMenuEvents && this.capture === nextCapture) return;
    if (!sameHistory) this.renderFailure = undefined;
    this.capture = nextCapture;
    if (this.menuEvents !== nextMenuEvents) this.menuTimeline = buildReplayMenuTimeline(nextMenuEvents ?? []);
    this.menuEvents = nextMenuEvents;
    this.resetRenderProgress();
    this.snapshot = { ...this.snapshot, history, preview: undefined };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
