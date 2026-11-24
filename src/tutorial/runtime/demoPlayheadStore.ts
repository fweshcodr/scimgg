/**
 * External store (React `useSyncExternalStore` shaped) for the tutorial demo
 * "watch" review playhead, which advances on every animation frame during
 * autoplay.
 *
 * Same rationale as {@link ReplayFrameStore}: the demo play-loop must not push
 * `TutorialDirector.setState` every frame, because the React bridge in
 * `useTutorialDirector` re-renders App and its whole subtree at display refresh
 * rate. This store instead notifies only the demo cursor overlay; the
 * demonstrated tick snapshot and transport stay in director React state and
 * update once per tick.
 */
export class DemoPlayheadStore {
  private playheadMs = 0;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): number => this.playheadMs;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(playheadMs: number): void {
    if (this.playheadMs === playheadMs) return;
    this.playheadMs = playheadMs;
    for (const listener of this.listeners) listener();
  }
}
