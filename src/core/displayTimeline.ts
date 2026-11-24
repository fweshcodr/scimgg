import { OSRS_TICK_MS, type SimulationState } from '../types/simulation';
import type { ReplayDisplayFrame } from './ReplayRecorder';
import type { ReplayFrameStore } from './replayFrameStore';
import { frameIndexAtMs, frameStartMs } from './replayTimeline';
import type { TickProgressStore } from './tickProgressStore';

export interface DisplayTimelineSource {
  readonly history: readonly ReplayDisplayFrame[];
  readonly state: SimulationState;
  readonly replaying: boolean;
}

export interface DisplayTimelineSnapshot {
  readonly history: readonly ReplayDisplayFrame[];
  readonly frameIndex: number;
  readonly state: SimulationState;
  readonly tick: number;
}

export interface DisplayTimelineReader {
  readonly getSnapshot: () => DisplayTimelineSnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
}

function frameIndexAt(history: readonly ReplayDisplayFrame[], tick: number): number {
  let lower = 0;
  let upper = history.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (history[middle].state.currentTick <= tick) lower = middle + 1;
    else upper = middle;
  }
  return lower - 1;
}

export class DisplayTimeline implements DisplayTimelineReader {
  private source: DisplayTimelineSource | null = null;
  private snapshot: DisplayTimelineSnapshot | null = null;
  private historyLength = 0;
  private readonly listeners = new Set<() => void>();
  private detachStores: (() => void) | undefined;

  constructor(
    private readonly ticks: TickProgressStore,
    private readonly replay: ReplayFrameStore,
  ) {}

  setSource(source: DisplayTimelineSource): void {
    this.source = source;
    this.publish();
  }

  getSnapshot = (): DisplayTimelineSnapshot | null => {
    const source = this.source;
    if (!source) return null;
    let history = source.history;
    let state = source.state;
    let frameIndex: number;
    let tick: number;
    if (source.replaying) {
      const replay = this.replay.getSnapshot();
      if (!replay.history?.length) {
        this.snapshot = null;
        return null;
      }
      history = replay.history;
      frameIndex = replay.preview?.frameIndex ?? frameIndexAtMs(history, replay.playheadMs);
      const recorded = history[frameIndex];
      const committed = source.history === history && recorded.state.currentTick === source.state.currentTick;
      state = replay.preview?.state ?? (committed ? source.state : recorded.state);
      const fraction = replay.preview
        ? 0
        : Math.min(1, Math.max(0, (replay.playheadMs - frameStartMs(history, frameIndex)) / OSRS_TICK_MS));
      tick = state.currentTick + fraction;
    } else {
      frameIndex = frameIndexAt(history, state.currentTick);
      tick = state.currentTick + Math.min(1, Math.max(0, this.ticks.getSnapshot() - state.currentTick));
    }
    const previous = this.snapshot;
    if (
      previous?.history === history &&
      previous.frameIndex === frameIndex &&
      previous.state === state &&
      previous.tick === tick &&
      this.historyLength === history.length
    ) {
      return previous;
    }
    this.historyLength = history.length;
    this.snapshot = { history, frameIndex, state, tick };
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.getSnapshot();
    this.listeners.add(listener);
    if (!this.detachStores) {
      const detachTicks = this.ticks.subscribe(this.publish);
      const detachReplay = this.replay.subscribe(this.publish);
      this.detachStores = () => {
        detachTicks();
        detachReplay();
      };
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detachStores?.();
        this.detachStores = undefined;
      }
    };
  };

  private publish = (): void => {
    const previous = this.snapshot;
    if (this.getSnapshot() === previous) return;
    for (const listener of this.listeners) listener();
  };
}
