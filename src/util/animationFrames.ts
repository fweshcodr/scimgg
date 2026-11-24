import { BackgroundClock } from './BackgroundClock';

type PendingFrame = {
  readonly callback: FrameRequestCallback;
  nativeId: number | null;
  generation: number;
};

class AnimationFrames {
  readonly clock = new BackgroundClock();
  private suspended = false;
  private nextId = 0;
  private readonly pending = new Map<number, PendingFrame>();
  private readonly resumeListeners = new Set<() => void>();

  request(callback: FrameRequestCallback): number {
    const id = ++this.nextId;
    const frame: PendingFrame = { callback, nativeId: null, generation: 0 };
    this.pending.set(id, frame);
    if (!this.suspended) this.schedule(id, frame);
    return id;
  }

  cancel(id: number): void {
    const frame = this.pending.get(id);
    if (!frame) return;
    this.pending.delete(id);
    if (frame.nativeId !== null) cancelAnimationFrame(frame.nativeId);
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.clock.setSuspended(suspended);
    if (suspended) {
      for (const frame of this.pending.values()) {
        if (frame.nativeId !== null) cancelAnimationFrame(frame.nativeId);
        frame.nativeId = null;
      }
    } else {
      for (const [id, frame] of this.pending) this.schedule(id, frame);
      for (const listener of this.resumeListeners) listener();
    }
  }

  subscribeResume(listener: () => void): () => void {
    this.resumeListeners.add(listener);
    return () => {
      this.resumeListeners.delete(listener);
    };
  }

  private schedule(id: number, frame: PendingFrame): void {
    const generation = ++frame.generation;
    frame.nativeId = requestAnimationFrame((timestamp) => {
      if (this.suspended || this.pending.get(id) !== frame || frame.generation !== generation) return;
      this.pending.delete(id);
      frame.callback.call(globalThis, timestamp);
    });
  }
}

export const animationFrames = new AnimationFrames();
