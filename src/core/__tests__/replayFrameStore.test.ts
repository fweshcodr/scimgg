import { describe, expect, it, vi } from 'vitest';
import { encounterRegistry } from '../../encounters/registry';
import { freshReplayCapture } from '../../replay/format/capture';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../constants';
import type { ReplayDisplayFrame, ReplayViewportState } from '../ReplayRecorder';
import { ReplayFrameStore } from '../replayFrameStore';
import type { ReplayMenuState } from '../replayMenu';
import { ReplaySafetyError } from '../replaySafety';
import { SimulationEngine } from '../SimulationEngine';

function vp(yawDeg: number): ReplayViewportState {
  return { kind: 'orbit3d', pitchDeg: 45, yawDeg, fovScale: 1, target: { x: 0, y: 0, z: 0 } };
}

describe('ReplayFrameStore', () => {
  it('distinguishes ordinary and completed previews at the same index without moving playhead or viewport', () => {
    const arena = getArenaConfig();
    const fallback = getArenaAllowUnboundedFallback();
    try {
      const state = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
      const store = new ReplayFrameStore();
      const viewport = vp(90);
      store.set(150, viewport);
      const listener = vi.fn();
      store.subscribe(listener);
      const ordinary = { frameIndex: 0, state, events: [] };
      store.setPreview(ordinary);
      const epoch = store.getRenderEpoch();
      store.setPreview({ ...ordinary });
      expect(store.getRenderEpoch()).toBe(epoch);
      const completed = { ...ordinary, completedBoundary: true };
      store.setPreview(completed);
      expect(store.getSnapshot().preview).toBe(completed);
      expect(store.getRenderEpoch()).toBe(epoch + 1);
      store.setPreview({ ...completed });
      expect(store.getRenderEpoch()).toBe(epoch + 1);
      store.setPreview(ordinary);
      expect(store.getSnapshot().preview).toBe(ordinary);
      expect(store.getRenderEpoch()).toBe(epoch + 2);
      expect(store.getSnapshot().playheadMs).toBe(150);
      expect(store.getSnapshot().viewportState).toBe(viewport);
      expect(listener).toHaveBeenCalledTimes(3);
    } finally {
      setArenaConfig(arena, fallback);
    }
  });

  it('publishes the first render failure once and never acknowledges a failed history', () => {
    const store = new ReplayFrameStore();
    store.setHistory([]);
    const detach = store.registerRenderConsumer();
    const epoch = store.getRenderEpoch();
    store.acknowledgeRender(epoch, 1, 600);
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    const failure = { error: new ReplaySafetyError('projectile-work-limit'), frameIndex: 2, playheadMs: 1200 };

    store.failRender(epoch, failure);
    store.failRender(epoch, { error: new Error('later failure'), frameIndex: 3, playheadMs: 1800 });
    store.acknowledgeRender(epoch, 4, 2400);

    expect(store.getRenderFailure()).toBe(failure);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.isFrameRendered(0)).toBe(false);
    expect(store.isPlayheadRendered(0)).toBe(false);
    detach();
    expect(store.isFrameRendered(0)).toBe(false);
    expect(store.isPlayheadRendered(0)).toBe(false);
  });

  it('keeps the failure across seeks, progress resets and same-history metadata changes', () => {
    const store = new ReplayFrameStore();
    const history: ReplayDisplayFrame[] = [];
    store.setHistory(history);
    const failure = { error: new ReplaySafetyError('invalid-clock'), frameIndex: 0, playheadMs: 0 };
    store.failRender(store.getRenderEpoch(), failure);
    const engine = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') });

    store.set(1200, undefined);
    store.setPreview({ frameIndex: 2, state: engine.getState(), events: [] });
    store.resetRenderProgress();
    store.setHistory(history, []);
    store.failRender(store.getRenderEpoch(), { ...failure, frameIndex: 2 });

    expect(store.getRenderFailure()).toBe(failure);
    expect(store.isFrameRendered(2)).toBe(false);
  });

  it.each([
    false,
    true,
  ])('clears failure only for a new history or exit (exit: %s) and ignores stale epochs', (exit) => {
    const store = new ReplayFrameStore();
    store.setHistory([]);
    const detach = store.registerRenderConsumer();
    const epoch = store.getRenderEpoch();
    const failure = { error: new ReplaySafetyError('invalid-clock'), frameIndex: 0, playheadMs: 0 };
    store.failRender(epoch, failure);

    store.setHistory(exit ? undefined : []);
    const listener = vi.fn();
    store.subscribe(listener);
    store.failRender(epoch, failure);
    store.acknowledgeRender(epoch, 5, 3000);

    expect(store.getRenderFailure()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    expect(store.isFrameRendered(0)).toBe(false);
    store.acknowledgeRender(store.getRenderEpoch(), 0, 0);
    expect(store.isFrameRendered(0)).toBe(true);
    detach();
  });

  it.each(['menuEvents', 'presentationSamples'] as const)('does not hold a menu beyond %s coverage', (track) => {
    const store = new ReplayFrameStore();
    const menu: ReplayMenuState = {
      entries: [{ action: 'Cancel' }],
      x: 10,
      y: 20,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    store.setHistory([], [{ kind: 'open', tMs: 0, state: menu }], {
      ...freshReplayCapture(),
      [track]: { provenance: 'bounded-v1', stoppedAtMs: 100, reason: 'entry-limit' },
    });
    store.set(99, undefined);
    expect(store.getMenuState()).toBe(menu);

    store.set(100, undefined);

    expect(store.getMenuState()).toBeNull();
    expect(store.isTrackAvailable(track)).toBe(false);
  });
  it('retains normalized menu references until a menu boundary or history replacement', () => {
    const store = new ReplayFrameStore();
    const history: readonly ReplayDisplayFrame[] = [];
    const menu: ReplayMenuState = {
      entries: [{ action: 'Cancel' }],
      x: 10,
      y: 20,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    const { entries: _entries, ...view } = menu;
    store.setHistory(history, [
      { kind: 'open', tMs: 10, state: menu },
      { kind: 'update', tMs: 50, view: { ...view, hoveredIndex: 0 } },
      { kind: 'close', tMs: 100 },
    ]);
    store.set(50, undefined);
    const hovered = store.getMenuState();

    store.setHistory(history);
    store.set(80, undefined);

    expect(store.getMenuState()).toBe(hovered);
    expect(hovered?.entries).toBe(menu.entries);
    store.set(10, undefined);
    expect(store.getMenuState()).toBe(menu);
    store.set(100, undefined);
    expect(store.getMenuState()).toBeNull();
    store.set(50, undefined);
    expect(store.getMenuState()).toBe(hovered);
    store.setHistory(undefined);
    expect(store.getMenuState()).toBeNull();
  });

  it('replaces menu events for the same history and drops them for a new untracked history', () => {
    const store = new ReplayFrameStore();
    const history: readonly ReplayDisplayFrame[] = [];
    const menu: ReplayMenuState = {
      entries: [{ action: 'Cancel' }],
      x: 10,
      y: 20,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    store.setHistory(history);

    store.setHistory(history, [{ kind: 'open', tMs: 0, state: menu }]);

    expect(store.getMenuState()).toBe(menu);
    store.setHistory([]);
    expect(store.getMenuState()).toBeNull();
  });
  it('gates attached consumers without publishing render progress', () => {
    const store = new ReplayFrameStore();
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    const unregister = store.registerRenderConsumer();
    expect(store.isFrameRendered(0)).toBe(false);

    store.acknowledgeRender(store.getRenderEpoch(), 0, 670);

    expect(store.isFrameRendered(0)).toBe(true);
    expect(store.isFrameRendered(1)).toBe(false);
    expect(store.isPlayheadRendered(670)).toBe(true);
    expect(store.isPlayheadRendered(671)).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    unregister();
  });

  it('bypasses the gate only after every consumer detaches', () => {
    const store = new ReplayFrameStore();
    const detachFirst = store.registerRenderConsumer();
    const detachSecond = store.registerRenderConsumer();
    detachFirst();
    expect(store.isFrameRendered(0)).toBe(false);
    expect(store.isPlayheadRendered(0)).toBe(false);

    detachSecond();

    expect(store.isFrameRendered(0)).toBe(true);
    expect(store.isPlayheadRendered(670)).toBe(true);
  });

  it.each(['reset', 'history', 'preview'] as const)('rejects stale acknowledgments after %s', (operation) => {
    const store = new ReplayFrameStore();
    const detach = store.registerRenderConsumer();
    const epoch = store.getRenderEpoch();
    store.acknowledgeRender(epoch, 2, 1500);
    switch (operation) {
      case 'reset':
        store.resetRenderProgress();
        break;
      case 'history':
        store.setHistory([]);
        break;
      case 'preview': {
        const engine = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') });
        store.setPreview({ frameIndex: 0, state: engine.getState(), events: [] });
        break;
      }
    }

    store.acknowledgeRender(epoch, 2, 1500);

    expect(store.getRenderEpoch()).not.toBe(epoch);
    expect(store.isFrameRendered(0)).toBe(false);
    expect(store.isPlayheadRendered(0)).toBe(false);
    detach();
  });

  it.each([false, true])('clears preview atomically when history is removed: %s', (removeHistory) => {
    const store = new ReplayFrameStore();
    const engine = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') });
    const frame: ReplayDisplayFrame = { state: engine.getState(), events: [] };
    store.setHistory([frame]);
    store.setPreview({ frameIndex: 0, ...frame });
    const listener = vi.fn(() => store.getSnapshot().preview);
    store.subscribe(listener);
    const nextHistory = removeHistory ? undefined : [frame];

    store.setHistory(nextHistory);

    expect(store.getSnapshot().history).toBe(nextHistory);
    expect(store.getSnapshot().preview).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveReturnedWith(undefined);
  });

  it('retains history through frame and preview updates without notifying for the same history', () => {
    const store = new ReplayFrameStore();
    const history: readonly ReplayDisplayFrame[] = [];
    store.setHistory(history);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setHistory(history);
    store.set(100, vp(90));
    store.setPreview(undefined);

    expect(store.getSnapshot().history).toBe(history);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('notifies when history is replaced or cleared', () => {
    const store = new ReplayFrameStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setHistory([]);
    store.setHistory(undefined);

    expect(store.getSnapshot().history).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers on a changed set and exposes the new snapshot', () => {
    const store = new ReplayFrameStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const viewport = vp(90);

    store.set(100, viewport);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ playheadMs: 100, viewportState: viewport });
  });

  it('does NOT notify when both playhead and viewport reference are unchanged (dedup)', () => {
    const store = new ReplayFrameStore();
    const viewport = vp(90);
    store.set(100, viewport);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(100, viewport);

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies when only the viewport reference changes (drives the replay camera every frame)', () => {
    const store = new ReplayFrameStore();
    store.set(100, vp(90));
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(100, vp(91));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns a stable snapshot reference between sets (useSyncExternalStore-safe)', () => {
    const store = new ReplayFrameStore();
    store.set(50, undefined);
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);

    store.set(60, undefined);
    expect(store.getSnapshot()).not.toBe(first);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new ReplayFrameStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.set(1, undefined);

    expect(listener).not.toHaveBeenCalled();
  });
});
