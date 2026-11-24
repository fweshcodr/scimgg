// @vitest-environment happy-dom
import { act, render } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { DisplayTimelineReader, DisplayTimelineSnapshot } from '../../core/displayTimeline';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { TickProgressStore } from '../../core/tickProgressStore';
import { encounterRegistry } from '../../encounters/registry';
import { OSRS_TICK_MS } from '../../types/simulation';
import { DisplayTimelineProvider, useDisplayTimeline } from '../DisplayTimelineContext';
import { ReplayFrameProvider } from '../ReplayFrameContext';
import { TickProgressProvider } from '../TickProgressContext';

const INITIAL_STATE = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
const frame = (currentTick: number): ReplayDisplayFrame => ({
  state: { ...INITIAL_STATE, currentTick },
  events: [],
});

/**
 * A consumer as the overlays use the reader: the identity it was handed each
 * render, the snapshot its own layout effect saw, and every notification since.
 */
function Consumer({ readers, seen }: { readers: (DisplayTimelineReader | null)[]; seen: DisplayTimelineSnapshot[] }) {
  const reader = useDisplayTimeline();
  readers.push(reader);
  useLayoutEffect(() => {
    if (!reader) return;
    const record = () => {
      const snapshot = reader.getSnapshot();
      if (snapshot) seen.push(snapshot);
    };
    record();
    return reader.subscribe(record);
  }, [reader, seen]);
  return null;
}

interface MountOptions {
  readonly replaying?: boolean;
  readonly strict?: boolean;
}

function mount({ replaying = false, strict = false }: MountOptions = {}) {
  const ticks = new TickProgressStore();
  const replayStore = new ReplayFrameStore();
  const readers: (DisplayTimelineReader | null)[] = [];
  const seen: DisplayTimelineSnapshot[] = [];
  const tree = (history: readonly ReplayDisplayFrame[], state = history[0].state) => {
    const providers = (
      <ReplayFrameProvider store={replayStore}>
        <TickProgressProvider store={ticks}>
          <DisplayTimelineProvider history={history} state={state} replaying={replaying}>
            <Consumer readers={readers} seen={seen} />
          </DisplayTimelineProvider>
        </TickProgressProvider>
      </ReplayFrameProvider>
    );
    return strict ? <StrictMode>{providers}</StrictMode> : providers;
  };
  const history = [frame(80), frame(81)];
  const view = render(tree(history));
  return {
    ticks,
    replayStore,
    history,
    readers,
    seen,
    reader: () => readers.at(-1) ?? null,
    rerender: (nextHistory: readonly ReplayDisplayFrame[], state?: ReplayDisplayFrame['state']) =>
      view.rerender(tree(nextHistory, state)),
    unmount: view.unmount,
  };
}

describe('DisplayTimelineProvider', () => {
  it('hands consumers one reader for the life of the provider', () => {
    const { readers, history, rerender } = mount();

    rerender(history, { ...history[0].state, playerHP: 50 });
    rerender([...history, frame(82)]);

    expect(readers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(readers).size).toBe(1);
    expect(readers[0]).not.toBeNull();
  });

  it('publishes the source in the mounting commit, after the consumer first drew', () => {
    // The consumer's layout effect runs before the provider's, so its first
    // read is the empty facade; the provider's setSource then notifies it in
    // the same commit, before anything paints.
    const { seen, history, reader } = mount();

    expect(reader()?.getSnapshot()).toMatchObject({ history, frameIndex: 0, tick: 80 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(reader()?.getSnapshot());
  });

  it('resets the source when history, state or replay mode change', () => {
    const { history, rerender, reader, seen } = mount();
    const state = { ...history[1].state };

    rerender(history, state);
    expect(reader()?.getSnapshot()).toMatchObject({ frameIndex: 1, tick: 81 });
    expect(reader()?.getSnapshot()?.state).toBe(state);

    const replaced = [frame(0)];
    rerender(replaced, replaced[0].state);
    expect(reader()?.getSnapshot()).toMatchObject({ history: replaced, frameIndex: 0, tick: 0 });
    expect(seen).toHaveLength(3);
  });

  it('notifies the consumer on clock writes and on replay playhead moves, not on re-renders', () => {
    const { ticks, history, rerender, seen } = mount();
    expect(seen).toHaveLength(1);

    act(() => ticks.set(80.5));
    expect(seen.at(-1)?.tick).toBe(80.5);

    rerender(history);
    expect(seen).toHaveLength(2);
  });

  it('follows the replay frame store while replaying', () => {
    const { replayStore, history, reader, seen } = mount({ replaying: true });
    expect(reader()?.getSnapshot()).toBeNull();

    act(() => replayStore.setHistory(history));
    act(() => replayStore.set(OSRS_TICK_MS * 1.25, undefined));

    expect(seen.at(-1)).toMatchObject({ history, frameIndex: 1, tick: 81.25 });
  });

  it('holds one store subscription under StrictMode and releases it on unmount', () => {
    const { ticks, seen, unmount } = mount({ strict: true });
    const before = seen.length;

    act(() => ticks.set(80.5));
    expect(seen.length - before).toBe(1);

    unmount();
    act(() => ticks.set(80.75));
    expect(seen.length - before).toBe(1);
  });

  it('provides no reader without the stores it derives from', () => {
    const readers: (DisplayTimelineReader | null)[] = [];
    const history = [frame(0)];
    render(
      <DisplayTimelineProvider history={history} state={history[0].state} replaying={false}>
        <Consumer readers={readers} seen={[]} />
      </DisplayTimelineProvider>,
    );

    expect(readers).toEqual([null]);
  });

  it('reads null outside a provider', () => {
    const readers: (DisplayTimelineReader | null)[] = [];
    render(<Consumer readers={readers} seen={[]} />);

    expect(readers).toEqual([null]);
  });
});
