import { type ReplayMenuState, replayMenuViewsEqual } from '../core/replayMenu';

let liveState: ReplayMenuState | null = null;
const listeners = new Set<(state: ReplayMenuState | null) => void>();

export function getLiveReplayMenuState(): ReplayMenuState | null {
  return liveState;
}

export function publishLiveReplayMenuState(state: ReplayMenuState | null): void {
  if (liveState === state) return;
  if (
    liveState !== null &&
    state !== null &&
    liveState.entries === state.entries &&
    replayMenuViewsEqual(liveState, state)
  )
    return;
  liveState = state;
  for (const listener of listeners) listener(state);
}

export function subscribeLiveReplayMenuState(listener: (state: ReplayMenuState | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
