import { afterEach, describe, expect, it, vi } from 'vitest';
import { encounterRegistry } from '../../encounters/registry';
import { OSRS_TICK_MS } from '../../types/simulation';
import { DisplayTimeline } from '../displayTimeline';
import type { ReplayDisplayFrame } from '../ReplayRecorder';
import { ReplayFrameStore } from '../replayFrameStore';
import { SimulationEngine } from '../SimulationEngine';
import { TickProgressStore } from '../tickProgressStore';

const initialState = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
const frame = (currentTick: number): ReplayDisplayFrame => ({
  state: { ...initialState, currentTick },
  events: [],
});

function setup() {
  const ticks = new TickProgressStore();
  const replay = new ReplayFrameStore();
  return { ticks, replay, timeline: new DisplayTimeline(ticks, replay) };
}

afterEach(() => vi.restoreAllMocks());

describe('DisplayTimeline', () => {
  it('returns null before a source is supplied', () => {
    const { timeline } = setup();

    expect(timeline.getSnapshot()).toBeNull();
  });

  it('maps live history by simulation ticks rather than frame indices', () => {
    const { timeline, ticks } = setup();
    const history = [frame(80), frame(81), frame(84), frame(85)];
    const state = { ...initialState, currentTick: 84 };
    ticks.set(84.5);

    timeline.setSource({ history, state, replaying: false });

    expect(timeline.getSnapshot()).toEqual({ history, state, frameIndex: 2, tick: 84.5 });
    expect(timeline.getSnapshot()?.state).toBe(state);
    expect(timeline.getSnapshot()?.history).toBe(history);
  });

  it('holds the preceding frame when the committed tick lies between recorded ticks', () => {
    const { timeline } = setup();
    const history = [frame(80), frame(84)];

    timeline.setSource({ history, state: { ...initialState, currentTick: 82 }, replaying: false });

    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 0, tick: 82 });
  });

  it.each([{ history: [] }, { history: [frame(90)] }])('excludes future frames with no eligible live history', ({
    history,
  }) => {
    const { timeline } = setup();

    timeline.setSource({ history, state: { ...initialState, currentTick: 80 }, replaying: false });

    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: -1, tick: 80 });
  });

  it('uses the committed tick when no renderer has supplied a clock', () => {
    const { timeline } = setup();
    const current = frame(80);

    timeline.setSource({ history: [current], state: current.state, replaying: false });

    expect(timeline.getSnapshot()?.tick).toBe(80);
  });

  it('bounds a stale future clock after a source reset and accepts the new clock', () => {
    const { timeline, ticks } = setup();
    ticks.set(800.5);
    timeline.setSource({ history: [frame(800)], state: frame(800).state, replaying: false });

    timeline.setSource({ history: [frame(0)], state: frame(0).state, replaying: false });

    expect(timeline.getSnapshot()?.tick).toBe(1);
    ticks.set(0.25);
    expect(timeline.getSnapshot()?.tick).toBe(0.25);
  });

  it('maps replay playhead indices to nonzero simulation ticks without reading the live clock', () => {
    const { timeline, replay, ticks } = setup();
    const history = [frame(80), frame(84), frame(85)];
    replay.setHistory(history);
    replay.set(OSRS_TICK_MS * 1.5, undefined);
    ticks.set(999);

    timeline.setSource({ history, state: frame(80).state, replaying: true });

    expect(timeline.getSnapshot()).toEqual({ history, state: history[1].state, frameIndex: 1, tick: 84.5 });
  });

  it('retains the committed state separately from lean history only for the matching replay tick', () => {
    const { timeline, replay } = setup();
    const history = [frame(80), frame(81)];
    const state = { ...history[0].state, damageHistory: [...initialState.damageHistory] };
    replay.setHistory(history);

    timeline.setSource({ history, state, replaying: true });

    expect(timeline.getSnapshot()?.state).toBe(state);
    replay.set(OSRS_TICK_MS, undefined);
    expect(timeline.getSnapshot()?.state).toBe(history[1].state);
  });

  it('uses preview state at fraction zero and restores the paused playhead on preview release', () => {
    const { timeline, replay } = setup();
    const history = [frame(80), frame(81), frame(82)];
    replay.setHistory(history);
    replay.set(OSRS_TICK_MS * 1.75, undefined);
    timeline.setSource({ history, state: history[1].state, replaying: true });
    const state = { ...history[0].state, damageHistory: [...initialState.damageHistory] };

    replay.setPreview({ frameIndex: 0, state, events: history[0].events });

    expect(timeline.getSnapshot()).toEqual({ history, state, frameIndex: 0, tick: 80 });
    replay.setPreview(undefined);
    expect(timeline.getSnapshot()?.tick).toBe(81.75);
    replay.set(0, undefined);
    expect(timeline.getSnapshot()?.tick).toBe(80);
  });

  it('maps a playhead through real tick starts, holding the tick fraction at 1 through a late tick', () => {
    const { timeline, replay } = setup();
    const history = [
      { ...frame(80), startMs: 0 },
      { ...frame(81), startMs: 900 },
    ];
    replay.setHistory(history);
    timeline.setSource({ history, state: history[0].state, replaying: true });

    replay.set(300, undefined);
    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 0, tick: 80.5 });
    replay.set(800, undefined);
    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 0, tick: 81 });
    replay.set(900, undefined);
    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 1, tick: 81 });
  });

  it('clamps replay playheads at the first and last frame', () => {
    const { timeline, replay } = setup();
    const history = [frame(80), frame(81)];
    replay.setHistory(history);
    timeline.setSource({ history, state: history[0].state, replaying: true });

    replay.set(-100, undefined);

    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 0, tick: 80 });
    replay.set(10000, undefined);
    expect(timeline.getSnapshot()).toMatchObject({ frameIndex: 1, tick: 82 });
  });

  it('does not borrow live history while replay history is pending or cleared', () => {
    const { timeline, replay } = setup();
    const history = [frame(80)];

    timeline.setSource({ history, state: history[0].state, replaying: true });

    expect(timeline.getSnapshot()).toBeNull();
    replay.setHistory(history);
    expect(timeline.getSnapshot()?.history).toBe(history);
    replay.setHistory(undefined);
    expect(timeline.getSnapshot()).toBeNull();
  });

  it('invalidates same-index history replacement without retaining the previous committed state', () => {
    const { timeline, replay } = setup();
    const history = [frame(80)];
    replay.setHistory(history);
    timeline.setSource({ history, state: history[0].state, replaying: true });
    const previous = timeline.getSnapshot();
    const replacement = [frame(80)];

    replay.setHistory(replacement);

    expect(timeline.getSnapshot()).not.toBe(previous);
    expect(timeline.getSnapshot()?.history).toBe(replacement);
    expect(timeline.getSnapshot()?.state).toBe(replacement[0].state);
  });

  it('subscribes lazily and detaches both stores after the last consumer leaves', () => {
    const { timeline, ticks, replay } = setup();
    const tickSubscribe = vi.spyOn(ticks, 'subscribe');
    const replaySubscribe = vi.spyOn(replay, 'subscribe');
    const history = [frame(80)];
    timeline.setSource({ history, state: history[0].state, replaying: false });
    expect(tickSubscribe).not.toHaveBeenCalled();
    expect(replaySubscribe).not.toHaveBeenCalled();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const detachFirst = timeline.subscribe(firstListener);
    const detachSecond = timeline.subscribe(secondListener);
    expect(tickSubscribe).toHaveBeenCalledOnce();
    expect(replaySubscribe).toHaveBeenCalledOnce();
    detachFirst();

    ticks.set(80.5);

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledOnce();
    detachSecond();
    expect(ticks['listeners'].size).toBe(0);
    expect(replay['listeners'].size).toBe(0);
    ticks.set(80.75);
    expect(timeline.getSnapshot()?.tick).toBe(80.75);
    const detachAgain = timeline.subscribe(firstListener);
    expect(tickSubscribe).toHaveBeenCalledTimes(2);
    detachAgain();
  });

  it('publishes meaningful source changes but retains snapshots for unchanged values and irrelevant clocks', () => {
    const { timeline, ticks, replay } = setup();
    const history = [frame(80)];
    const source = { history, state: history[0].state, replaying: false };
    timeline.setSource(source);
    const previous = timeline.getSnapshot();
    const listener = vi.fn();
    const detach = timeline.subscribe(listener);

    timeline.setSource({ ...source });
    replay.set(900, undefined);
    ticks.set(20);

    expect(timeline.getSnapshot()).toBe(previous);
    expect(listener).not.toHaveBeenCalled();
    timeline.setSource({ ...source, state: { ...source.state, playerHP: 10 } });
    expect(listener).toHaveBeenCalledOnce();
    detach();
  });

  it('publishes an in-place history append even when state and clocks stay unchanged', () => {
    const { timeline } = setup();
    const history: ReplayDisplayFrame[] = [];
    const state = frame(80).state;
    timeline.setSource({ history, state, replaying: false });
    const previous = timeline.getSnapshot();
    const listener = vi.fn();
    const detach = timeline.subscribe(listener);

    history.push({ state, events: [] });
    timeline.setSource({ history, state, replaying: false });

    expect(timeline.getSnapshot()).not.toBe(previous);
    expect(timeline.getSnapshot()?.frameIndex).toBe(0);
    expect(listener).toHaveBeenCalledOnce();
    detach();
  });
});
