// @vitest-environment happy-dom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisplayTimelineProvider } from '../../contexts/DisplayTimelineContext';
import { ReplayFrameProvider } from '../../contexts/ReplayFrameContext';
import { TickProgressProvider } from '../../contexts/TickProgressContext';
import type { DisplayTimelineSnapshot } from '../../core/displayTimeline';
import type { CoreGameEvent, GameEvent } from '../../core/events/types';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { TickProgressStore } from '../../core/tickProgressStore';
import { encounterRegistry } from '../../encounters/registry';
import { CHAT_LOG_LIMIT, type ChatLogEntry, ChatLogProjection, useChatLog } from '../chatLog';

type MessageEvent = Extract<CoreGameEvent, { type: 'game_message' }>;
const initialState = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();

function message(tick: number, eventId: number, text = `line ${eventId}`): MessageEvent {
  return { type: 'game_message', tick, eventId, kind: 'game', segments: [{ text }] };
}

function frame(tick: number, events: GameEvent[] = []): ReplayDisplayFrame {
  return { state: { ...initialState, currentTick: tick }, events };
}

function snapshot(history: readonly ReplayDisplayFrame[], frameIndex = history.length - 1): DisplayTimelineSnapshot {
  const state = history[frameIndex]?.state ?? initialState;
  return { history, frameIndex, state, tick: state.currentTick };
}

const texts = (entries: ReturnType<ChatLogProjection['sample']>) => entries.map((entry) => entry.segments[0].text);

describe('ChatLogProjection', () => {
  it('keeps the newest lines up to the limit and ignores other events', () => {
    const history = Array.from({ length: CHAT_LOG_LIMIT + 20 }, (_, tick) =>
      frame(tick, [message(tick, tick * 2), { type: 'intro_completed', tick, eventId: tick * 2 + 1 }]),
    );
    const log = new ChatLogProjection().sample(snapshot(history));
    expect(log).toHaveLength(CHAT_LOG_LIMIT);
    expect(log[0]).toEqual({ key: '40', tick: 20, kind: 'game', segments: [{ text: 'line 40' }] });
    expect(log.at(-1)?.tick).toBe(CHAT_LOG_LIMIT + 19);
  });

  it('carries the public speaker and returns the same array until the lines change', () => {
    const projection = new ChatLogProjection();
    const history = [
      frame(0),
      frame(1, [{ ...message(1, 1, 'Hi'), kind: 'public', speaker: 'Sol Heredit' }]),
      frame(2),
    ];
    const first = projection.sample(snapshot(history, 1));
    expect(first).toEqual([{ key: '1', tick: 1, kind: 'public', speaker: 'Sol Heredit', segments: [{ text: 'Hi' }] }]);
    expect(projection.sample(snapshot(history, 2))).toBe(first);
  });

  it('rebuilds the log as it stood at a seek, then follows the playhead forward again', () => {
    const projection = new ChatLogProjection();
    const history = Array.from({ length: 6 }, (_, tick) => frame(tick, tick % 2 === 1 ? [message(tick, tick)] : []));
    expect(texts(projection.sample(snapshot(history)))).toEqual(['line 1', 'line 3', 'line 5']);
    expect(texts(projection.sample(snapshot(history, 2)))).toEqual(['line 1']);
    expect(projection.sample(snapshot(history, 0))).toEqual([]);
    expect(texts(projection.sample(snapshot(history, 4)))).toEqual(['line 1', 'line 3']);
  });

  it('follows a live history that grows in place', () => {
    const projection = new ChatLogProjection();
    const history = [frame(0, [message(0, 1)])];
    expect(texts(projection.sample(snapshot(history)))).toEqual(['line 1']);
    history.push(frame(1, [message(1, 2)]));
    expect(texts(projection.sample(snapshot(history)))).toEqual(['line 1', 'line 2']);
  });

  it('starts empty for a new run, whether the history is replaced or cleared in place', () => {
    const projection = new ChatLogProjection();
    const first = [frame(0, [message(0, 1)]), frame(1, [message(1, 2)])];
    expect(projection.sample(snapshot(first))).toHaveLength(2);
    // Every run numbers its events from the same start, so keys repeat across runs.
    const next = [frame(0, [message(0, 1, 'new run')])];
    expect(texts(projection.sample(snapshot(next)))).toEqual(['new run']);
    next.length = 0;
    next.push(frame(0));
    expect(projection.sample(snapshot(next))).toEqual([]);
  });

  it('backs the hook, which re-renders only when the lines change', () => {
    const ticks = new TickProgressStore();
    const replayStore = new ReplayFrameStore();
    const renders: (readonly ChatLogEntry[])[] = [];
    function Consumer() {
      renders.push(useChatLog());
      return null;
    }
    const tree = (history: readonly ReplayDisplayFrame[]) => (
      <ReplayFrameProvider store={replayStore}>
        <TickProgressProvider store={ticks}>
          <DisplayTimelineProvider history={history} state={history.at(-1)!.state} replaying={false}>
            <Consumer />
          </DisplayTimelineProvider>
        </TickProgressProvider>
      </ReplayFrameProvider>
    );
    const view = render(tree([frame(0, [message(0, 1)]), frame(1)]));
    expect(texts(renders.at(-1)!)).toEqual(['line 1']);
    const count = renders.length;
    act(() => ticks.set(1.5));
    expect(renders).toHaveLength(count);
    view.rerender(tree([frame(0, [message(0, 1, 'next run')])]));
    expect(texts(renders.at(-1)!)).toEqual(['next run']);
  });
});
