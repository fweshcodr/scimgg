import type { ReplayFramePreview, ReplayFrameSnapshot } from '../../core/replayFrameStore';
import { frameIndexAtMs, frameStartMs } from '../../core/replayTimeline';
import { OSRS_TICK_MS } from '../../types/simulation';
import { calculateVisualPlayerPosition, type PlayerVisualState } from './interpolation';

export function getReplayPresentation(snapshot: ReplayFrameSnapshot | undefined, fallback: ReplayFramePreview) {
  const completedSnapshot = snapshot?.preview?.completedBoundary === true;
  const history = snapshot?.history;
  const playheadMs = snapshot?.playheadMs ?? frameStartMs(history ?? [], fallback.frameIndex);
  const frameIndex =
    snapshot?.preview?.frameIndex ?? (history?.length ? frameIndexAtMs(history, playheadMs) : fallback.frameIndex);
  const recordedFrame = history?.[frameIndex];
  // Recorder history omits damageHistory; the committed copy restores it for overlays.
  const committedFrame = frameIndex === fallback.frameIndex && recordedFrame?.events === fallback.events;
  const frame = snapshot?.preview ?? (committedFrame ? fallback : recordedFrame) ?? fallback;
  const elapsedMs = snapshot?.preview ? 0 : Math.max(0, playheadMs - frameStartMs(history ?? [], frameIndex));
  // A tick that ran late plays for as long as it took, but like the live view its motion
  // completes in one tick and then holds: the render clock must not run past where the next
  // tick starts it again. Past the last frame it runs on, through the recording's tail.
  const lastFrame = history === undefined || frameIndex >= history.length - 1;
  // A takeover preflight shows the completed snapshot, not the beginning of its motion interval.
  // Keep its original frame index/event cutoff even though its canonical pose time reaches T+1.
  const renderElapsedMs = completedSnapshot ? OSRS_TICK_MS : lastFrame ? elapsedMs : Math.min(elapsedMs, OSRS_TICK_MS);
  const tickProgress = completedSnapshot ? 1 : Math.min(elapsedMs / OSRS_TICK_MS, 1);
  const state = frame.state;
  const visual = calculateVisualPlayerPosition(
    state.playerPreviousPosition,
    state.playerMovementPath,
    state.playerPosition,
    tickProgress,
    state.playerFacingAngle,
  );
  const facingAngle = state.attackTarget ? state.playerFacingAngle : visual.facingAngle;
  const playerVisual: PlayerVisualState = {
    ...visual,
    facingAngle,
    targetAngle: facingAngle,
    simIsMoving: visual.isVisuallyMoving,
    isRunning: visual.isVisuallyMoving && state.playerIsRunning,
    isTurning: false,
    locomotionState: null,
  };
  return {
    state,
    events: frame.events,
    frameIndex,
    tickProgress,
    timeMs: state.currentTick * OSRS_TICK_MS + renderElapsedMs,
    interpolatedTick: state.currentTick + tickProgress,
    playerVisual,
    previewing: snapshot?.preview !== undefined,
    replayHistory: history ? { frames: history, throughFrameIndex: frameIndex } : undefined,
  };
}
