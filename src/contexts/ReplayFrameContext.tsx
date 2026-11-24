import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { ReplayDisplayFrame, ReplayViewportState } from '../core/ReplayRecorder';
import type { ReplayFramePreview, ReplayFrameStore } from '../core/replayFrameStore';
import type { ReplayMenuState } from '../core/replayMenu';

const ReplayFrameStoreContext = createContext<ReplayFrameStore | null>(null);

export function ReplayFrameProvider({ store, children }: { store: ReplayFrameStore; children: ReactNode }) {
  return <ReplayFrameStoreContext.Provider value={store}>{children}</ReplayFrameStoreContext.Provider>;
}

export function useReplayFrameStore(): ReplayFrameStore | null {
  return useContext(ReplayFrameStoreContext);
}

const noopSubscribe = (): (() => void) => () => {};
const getClosedMenu = (): null => null;

export function useReplayMenuState(): ReplayMenuState | null {
  const store = useContext(ReplayFrameStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getMenuState : getClosedMenu,
    getClosedMenu,
  );
}

/**
 * Per-frame replay playhead (ms). Re-renders only the calling component when the
 * playhead advances. Returns `undefined` outside a provider (isolated tests),
 * letting the caller fall back to its own prop.
 */
export function useReplayPlayheadMs(): number | undefined {
  const store = useContext(ReplayFrameStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getSnapshot().playheadMs,
    () => undefined,
  );
}

/**
 * Per-frame interpolated replay orbit-camera state. Re-renders only the calling
 * component when the camera advances. Returns `undefined` outside a provider.
 */
export function useReplayViewportState(): ReplayViewportState | undefined {
  const store = useContext(ReplayFrameStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getSnapshot().viewportState,
    () => undefined,
  );
}

/**
 * Tick snapshot to draw while the user is dragging the seek bar, or `undefined`
 * when the committed React state is authoritative. Re-renders only the calling
 * component (the 3D viewport), so a drag never touches the Grid/chrome/panel tree.
 */
export function useReplayPreviewFrame(): ReplayFramePreview | undefined {
  const store = useContext(ReplayFrameStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getSnapshot().preview,
    () => undefined,
  );
}

/**
 * Every frame of the recording being replayed. Published on replay entry and load, released on
 * exit, reset and a successful takeover; a refused takeover leaves the replay on screen and the
 * history with it. The array is the recorder's own, published once per entry/load, so its
 * identity is stable across playback: a consumer keyed on it re-runs when the replay changes,
 * not per frame. A defined history is not proof that replay is on screen: the store and the
 * `replayMode` React state commit separately, so consumers gate on the replay flag as well.
 */
export function useReplayFrameHistory(): readonly ReplayDisplayFrame[] | undefined {
  const store = useContext(ReplayFrameStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getSnapshot().history,
    () => undefined,
  );
}
