import { useCallback, useState, useSyncExternalStore } from 'react';
import { useDisplayTimeline } from '../contexts/DisplayTimelineContext';
import type { DisplayTimelineSnapshot } from '../core/displayTimeline';
import { type GameMessageKind, isCoreEvent, type OverheadTextSegment } from '../core/events/types';
import type { ReplayDisplayFrame } from '../core/ReplayRecorder';

/** How many lines the chat box keeps, oldest dropped first. */
export const CHAT_LOG_LIMIT = 100;

export interface ChatLogEntry {
  /** Unique within one recording; a new run or loaded replay starts a new log. */
  readonly key: string;
  readonly tick: number;
  readonly kind: GameMessageKind;
  readonly speaker?: string;
  readonly segments: readonly OverheadTextSegment[];
}

const EMPTY: readonly ChatLogEntry[] = [];

interface IndexedMessage {
  readonly entry: ChatLogEntry;
  readonly frameIndex: number;
}

/**
 * The chat log is a projection of the displayed history, like the XP drops: every `game_message`
 * up to the displayed frame, so live play and replay show the same lines, a seek rebuilds the log
 * as it stood at that tick, and a new run (a new history) starts empty. A clipped replay's opening
 * effect context supplies the lines from before its first frame.
 *
 * `sample` returns the same array until the visible lines change, so it can back
 * `useSyncExternalStore` directly.
 */
export class ChatLogProjection {
  private history: readonly ReplayDisplayFrame[] | undefined;
  private indexedFrames = 0;
  private indexedTail: ReplayDisplayFrame | undefined;
  private readonly eventIds = new Set<number>();
  /** In frame order; the opening context's lines carry negative frame indexes. */
  private readonly messages: IndexedMessage[] = [];
  private visible: readonly ChatLogEntry[] = EMPTY;
  private visibleEnd = 0;

  sample(snapshot: DisplayTimelineSnapshot): readonly ChatLogEntry[] {
    if (
      this.history !== snapshot.history ||
      snapshot.history.length < this.indexedFrames ||
      (this.indexedFrames > 0 && snapshot.history[this.indexedFrames - 1] !== this.indexedTail)
    ) {
      this.history = snapshot.history;
      this.indexedFrames = 0;
      this.indexedTail = undefined;
      this.eventIds.clear();
      this.messages.length = 0;
      this.visible = EMPTY;
      this.visibleEnd = 0;
    }
    this.indexThrough(snapshot);
    const end = this.endAt(snapshot.frameIndex);
    if (end !== this.visibleEnd) {
      this.visibleEnd = end;
      this.visible = this.messages.slice(Math.max(0, end - CHAT_LOG_LIMIT), end).map((message) => message.entry);
    }
    return this.visible;
  }

  private indexThrough(snapshot: DisplayTimelineSnapshot): void {
    const end = Math.min(snapshot.frameIndex + 1, snapshot.history.length);
    for (let frameIndex = this.indexedFrames; frameIndex < end; frameIndex++) {
      const frame = snapshot.history[frameIndex];
      for (const event of frame.events) {
        if (!isCoreEvent(event, 'game_message') || this.eventIds.has(event.eventId)) continue;
        this.eventIds.add(event.eventId);
        this.messages.push({
          frameIndex,
          entry: {
            key: String(event.eventId),
            tick: event.tick,
            kind: event.kind,
            ...(event.speaker === undefined ? {} : { speaker: event.speaker }),
            segments: event.segments,
          },
        });
      }
      this.indexedFrames = frameIndex + 1;
      this.indexedTail = frame;
    }
  }

  /** The number of indexed lines at or before `frameIndex`. */
  private endAt(frameIndex: number): number {
    let lower = 0;
    let upper = this.messages.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (this.messages[middle].frameIndex <= frameIndex) lower = middle + 1;
      else upper = middle;
    }
    return lower;
  }
}

const noSubscription = () => () => {};

/** The chat log at the displayed tick; re-renders only when its lines change. */
export function useChatLog(): readonly ChatLogEntry[] {
  const timeline = useDisplayTimeline();
  const [projection] = useState(() => new ChatLogProjection());
  const getSnapshot = useCallback((): readonly ChatLogEntry[] => {
    const snapshot = timeline?.getSnapshot();
    return snapshot ? projection.sample(snapshot) : EMPTY;
  }, [timeline, projection]);
  return useSyncExternalStore(timeline?.subscribe ?? noSubscription, getSnapshot);
}
