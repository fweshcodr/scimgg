// @vitest-environment happy-dom

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setArenaConfig, setDefaultArenaConfig } from '../../core/constants';
import type { ReplayDisplayFrame, ReplayViewportState } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { LobbyEncounter } from '../../encounters/lobby/LobbyEncounter';
import {
  ReplayFrameProvider,
  useReplayFrameHistory,
  useReplayFrameStore,
  useReplayMenuState,
  useReplayPlayheadMs,
  useReplayViewportState,
} from '../ReplayFrameContext';

function vp(yawDeg: number): ReplayViewportState {
  return { kind: 'orbit3d', pitchDeg: 45, yawDeg, fovScale: 1, target: { x: 0, y: 0, z: 0 } };
}

describe('ReplayFrameContext subscription (production path)', () => {
  it('renders a menu consumer only when its held menu state changes', () => {
    const store = new ReplayFrameStore();
    store.setHistory(
      [],
      [
        {
          kind: 'open',
          tMs: 100,
          state: {
            entries: [{ action: 'Cancel' }],
            x: 10,
            y: 20,
            scale: 1,
            hoveredIndex: -1,
            submenuParentIndex: -1,
            hoveredSubmenuIndex: -1,
            submenuPosition: null,
          },
        },
        { kind: 'close', tMs: 200 },
      ],
    );
    let renders = 0;
    let parentRenders = 0;
    function Consumer() {
      renders++;
      const menu = useReplayMenuState();
      return <span>{menu?.entries[0]?.action ?? 'closed'}</span>;
    }
    function Parent() {
      parentRenders++;
      return (
        <ReplayFrameProvider store={store}>
          <Consumer />
        </ReplayFrameProvider>
      );
    }
    const view = render(<Parent />);
    const baseline = renders;

    act(() => store.set(50, vp(20)));
    expect(renders).toBe(baseline);
    act(() => store.set(100, vp(30)));
    expect(view.container.textContent).toBe('Cancel');
    const opened = renders;
    act(() => store.set(150, vp(40)));
    expect(renders).toBe(opened);
    act(() => store.set(200, undefined));
    expect(view.container.textContent).toBe('closed');
    expect(parentRenders).toBe(1);
  });
  it('exposes the current snapshot without rendering when camera and playhead samples change', () => {
    const store = new ReplayFrameStore();
    let renders = 0;
    let readSnapshot: (() => ReturnType<ReplayFrameStore['getSnapshot']> | undefined) | undefined;
    function Consumer() {
      const currentStore = useReplayFrameStore();
      renders++;
      readSnapshot = () => currentStore?.getSnapshot();
      return null;
    }
    render(
      <ReplayFrameProvider store={store}>
        <Consumer />
      </ReplayFrameProvider>,
    );
    const baseline = renders;

    act(() => store.set(350, vp(90)));

    expect(renders).toBe(baseline);
    expect(readSnapshot?.()).toMatchObject({ playheadMs: 350, viewportState: { yawDeg: 90 } });
  });

  it('delivers per-frame store updates to consumers via useSyncExternalStore', () => {
    const store = new ReplayFrameStore();
    store.set(0, vp(0));
    const seen: (number | undefined)[] = [];
    function Consumer() {
      seen.push(useReplayPlayheadMs());
      return null;
    }

    render(
      <ReplayFrameProvider store={store}>
        <Consumer />
      </ReplayFrameProvider>,
    );
    expect(seen.at(-1)).toBe(0);

    act(() => store.set(300, vp(10)));
    expect(seen.at(-1)).toBe(300);
  });

  it('returns undefined outside a provider so consumers fall back to their props', () => {
    let playhead: number | undefined = 1;
    let viewport: ReplayViewportState | undefined = vp(0);
    function Consumer() {
      playhead = useReplayPlayheadMs();
      viewport = useReplayViewportState();
      return null;
    }

    render(<Consumer />);

    expect(playhead).toBeUndefined();
    expect(viewport).toBeUndefined();
  });

  it('does not re-render a camera subscriber when only the playhead changes', () => {
    const store = new ReplayFrameStore();
    const staticViewport = vp(45);
    store.set(0, staticViewport);
    let renders = 0;
    function ViewportConsumer() {
      renders += 1;
      useReplayViewportState();
      return null;
    }

    render(
      <ReplayFrameProvider store={store}>
        <ViewportConsumer />
      </ReplayFrameProvider>,
    );
    const baseline = renders;

    act(() => store.set(300, staticViewport));
    expect(renders).toBe(baseline);

    act(() => store.set(600, vp(46)));
    expect(renders).toBeGreaterThan(baseline);
  });
});

describe('useReplayFrameHistory', () => {
  // Constructing the engine installs the lobby arena into the module-global config, so the frame
  // is built inside each test and the arena restored after it, never once at collection time.
  function lobbyFrame(): ReplayDisplayFrame {
    return { state: new SimulationEngine({ encounter: new LobbyEncounter() }).getState(), events: [] };
  }

  afterEach(() => {
    setDefaultArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null });
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  });

  it('delivers the published frame history and reflects a replacement', () => {
    const store = new ReplayFrameStore();
    const frame = lobbyFrame();
    const first = [frame];
    const second = [frame, frame];
    let seen: readonly ReplayDisplayFrame[] | undefined;
    function Consumer() {
      seen = useReplayFrameHistory();
      return null;
    }

    render(
      <ReplayFrameProvider store={store}>
        <Consumer />
      </ReplayFrameProvider>,
    );
    expect(seen).toBeUndefined();

    act(() => store.setHistory(first));
    expect(seen).toBe(first);

    act(() => store.setHistory(second));
    expect(seen).toBe(second);
  });

  it('does NOT re-render a history consumer when only the playhead advances', () => {
    const store = new ReplayFrameStore();
    store.setHistory([lobbyFrame()]);
    let renders = 0;
    function HistoryConsumer() {
      renders += 1;
      useReplayFrameHistory();
      return null;
    }

    render(
      <ReplayFrameProvider store={store}>
        <HistoryConsumer />
      </ReplayFrameProvider>,
    );
    const baseline = renders;

    act(() => store.set(300, vp(10)));
    expect(renders).toBe(baseline);
  });

  it('returns undefined outside a provider', () => {
    let history: readonly ReplayDisplayFrame[] | undefined = [];
    function Consumer() {
      history = useReplayFrameHistory();
      return null;
    }

    render(<Consumer />);

    expect(history).toBeUndefined();
  });
});
