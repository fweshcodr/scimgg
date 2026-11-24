/**
 * Tiny shared channel for the *actual rendered* frame rate.
 *
 * The viewport render loops ({@link RenderViewport3D} / {@link RenderViewport})
 * measure their real FPS once per second and publish it here. The on-screen
 * {@link FpsOverlay} subscribes to this value instead of running its own
 * requestAnimationFrame loop — so when an FPS cap throttles the render loop,
 * the overlay reflects the throttled rate rather than the browser's raw vsync
 * cadence (which keeps firing at the display refresh regardless of the cap).
 */
type FpsListener = (fps: number) => void;

class FpsReporter {
  private currentFps = 0;
  private readonly listeners = new Set<FpsListener>();

  /** Called by the active render loop ~once per second with its measured FPS. */
  report(fps: number): void {
    this.currentFps = fps;
    for (const listener of this.listeners) {
      listener(fps);
    }
  }

  /** Latest reported FPS (0 before the first report). */
  get(): number {
    return this.currentFps;
  }

  subscribe(listener: FpsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const fpsReporter = new FpsReporter();
