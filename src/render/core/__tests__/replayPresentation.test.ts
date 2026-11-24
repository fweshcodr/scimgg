import { afterEach, describe, expect, it, vi } from 'vitest';
import { setArenaConfig, setDefaultArenaConfig } from '../../../core/constants';
import { ReplayFrameStore } from '../../../core/replayFrameStore';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import { yamaSnapshot } from '../../../test/helpers/encounterSnapshot';
import type { RestoredPresentation } from '../../../types/restoredPresentation';
import type { SimulationState } from '../../../types/simulation';
import { FireballController } from '../../effects/controllers/FireballController';
import { SpotAnimRenderer } from '../../effects/SpotAnimRenderer';
import { createQueue } from '../commands';
import { getReplayPresentation } from '../replayPresentation';
import { RestoredPresentationClock } from '../restoredPresentation';

afterEach(() => {
  vi.restoreAllMocks();
  setDefaultArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null });
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
});

describe('replay presentation', () => {
  function recording() {
    const state: SimulationState = {
      ...new SimulationEngine({ encounter: new LobbyEncounter() }).getState(),
      currentTick: 50,
      playerPreviousPosition: [10, 10],
      playerPosition: [11, 11],
      playerMovementPath: [
        [11, 10],
        [11, 11],
      ],
      playerFacingAngle: 1024,
      playerIsRunning: true,
    };
    const frames = [
      { state, events: [] },
      { state: { ...state, currentTick: 87 }, events: [] },
    ];
    const store = new ReplayFrameStore();
    store.setHistory(frames);
    return { store, frames, fallback: { ...frames[0], frameIndex: 0 } };
  }

  it.each([
    [150, 0, 50.25, [10.5, 10], 1536],
    [450, 0, 50.75, [11, 10.5], 1024],
    [750, 1, 87.25, [10.5, 10], 1536],
    [1200, 1, 88, [11, 11], 1024],
    [1950, 1, 88, [11, 11], 1024],
  ])('samples playhead %s independently of simulation tick offsets and clamps the tail', (ms, index, tick, position, facing) => {
    const { store, fallback } = recording();
    store.set(ms, undefined);

    const sample = getReplayPresentation(store.getSnapshot(), fallback);

    expect(sample.frameIndex).toBe(index);
    expect(sample.interpolatedTick).toBe(tick);
    expect(sample.playerVisual.position).toEqual(position);
    expect(sample.playerVisual.facingAngle).toBe(facing);
  });

  it('holds motion at the end of a tick that ran late, so the render clock never runs back', () => {
    const { frames } = recording();
    const timed = [
      { ...frames[0], startMs: 0 },
      { ...frames[1], startMs: 900 },
    ];
    const store = new ReplayFrameStore();
    store.setHistory(timed);
    const fallback = { ...timed[0], frameIndex: 0 };
    const at = (ms: number) => {
      store.set(ms, undefined);
      return getReplayPresentation(store.getSnapshot(), fallback);
    };

    expect(at(300)).toMatchObject({ frameIndex: 0, tickProgress: 0.5, timeMs: 50 * 600 + 300 });
    expect(at(800)).toMatchObject({ frameIndex: 0, tickProgress: 1, timeMs: 51 * 600 });
    expect(at(900)).toMatchObject({ frameIndex: 1, tickProgress: 0, timeMs: 87 * 600 });
    // Past the last frame the tail runs on, as before.
    expect(at(1700)).toMatchObject({ frameIndex: 1, tickProgress: 1, timeMs: 87 * 600 + 800 });
  });

  it('selects the preview boundary rather than a stale playhead frame', () => {
    const { store, frames, fallback } = recording();
    store.set(450, undefined);
    store.setPreview({ ...frames[1], frameIndex: 1 });

    const sample = getReplayPresentation(store.getSnapshot(), fallback);

    expect(sample.state).toBe(frames[1].state);
    expect(sample.interpolatedTick).toBe(87);
    expect(sample.playerVisual.position).toEqual([10, 10]);
    expect(sample.previewing).toBe(true);
  });

  it('samples only a request-owned completed preview at the endpoint without moving the paused transport', () => {
    const { store, frames, fallback } = recording();
    store.set(0, undefined);
    for (const preview of [false, true]) {
      const ordinary = preview ? { ...frames[0], frameIndex: 0 } : undefined;
      store.setPreview(ordinary);
      store.setPreview({ ...frames[0], frameIndex: 0, completedBoundary: true });
      const candidate = getReplayPresentation(store.getSnapshot(), fallback);
      expect(candidate).toMatchObject({
        frameIndex: 0,
        tickProgress: 1,
        interpolatedTick: 51,
        timeMs: 51 * 600,
        previewing: true,
      });
      expect(candidate.state).toBe(frames[0].state);
      expect(candidate.events).toBe(frames[0].events);
      expect(candidate.playerVisual.position).toEqual([11, 11]);
      expect(candidate.replayHistory?.frames).toBe(frames);
      expect(candidate.replayHistory?.throughFrameIndex).toBe(0);
      expect(store.getSnapshot().playheadMs).toBe(0);
      store.setPreview(ordinary);
      expect(getReplayPresentation(store.getSnapshot(), fallback)).toMatchObject({
        tickProgress: 0,
        interpolatedTick: 50,
        timeMs: 50 * 600,
      });
    }
  });

  it('preserves the committed damage history rather than replacing it with the lean history snapshot', () => {
    const { store, fallback } = recording();
    const state: SimulationState = {
      ...fallback.state,
      damageHistory: [
        {
          tick: 50,
          source: 'yama_melee',
          targetId: 'player',
          baseDamage: 3,
          attackType: 'melee',
          activePrayer: null,
          prayedCorrectly: false,
          effectiveDamage: 3,
          hpBefore: 99,
          hpAfter: 96,
        },
      ],
    };
    store.set(300, undefined);

    const sample = getReplayPresentation(store.getSnapshot(), { ...fallback, state });

    expect(sample.state.damageHistory).toEqual(state.damageHistory);
  });

  it('keeps replay time advancing beyond the final pose for delayed audio tails', () => {
    const { store, fallback } = recording();
    store.set(1950, undefined);

    const sample = getReplayPresentation(store.getSnapshot(), fallback);

    expect(sample.interpolatedTick).toBe(88);
    expect(sample.timeMs).toBe(87 * 600 + 1350);
  });

  it.each([
    0.5, 1, 2,
  ])('holds a restored endpoint independently of prior wall phase at speed %s and releases only on a new tick', (speed) => {
    const { frames } = recording();
    const engine = new SimulationEngine({ encounter: new LobbyEncounter() });
    const restoration: RestoredPresentation = {
      engine,
      tick: 50,
      timeMs: 51 * 600,
      history: { frames, throughFrameIndex: 0 },
    };
    const clock = new RestoredPresentationClock();
    for (const elapsed of [100, 700, 5000, 20_000]) {
      expect(clock.sample(restoration, engine, 50, elapsed, speed)).toMatchObject({
        held: true,
        tickProgress: 1,
        interpolatedTick: 51,
        timeMs: 51 * 600,
        deltaMs: 0,
      });
    }
    expect(clock.sample(restoration, engine, 51, 0, speed)).toMatchObject({
      held: false,
      tickProgress: 0,
      interpolatedTick: 51,
      timeMs: 51 * 600,
      deltaMs: 0,
    });
    // After the single release frame the ordinary live clock owns progression again.
    expect(clock.sample(restoration, engine, 51, 100, speed)).toBeUndefined();
    const replacement = { ...restoration };
    expect(clock.sample(replacement, engine, 50, 599, speed)).toMatchObject({
      held: true,
      firstFrame: true,
      tickProgress: 1,
    });
    expect(clock.sample(replacement, engine, 51, 150 / speed, speed)).toMatchObject({
      tickProgress: 0.25,
      timeMs: 51 * 600 + 150,
      deltaMs: 150 / speed,
    });
  });

  it('initializes a first frame after GO at its actual phase and never affects another engine or ordinary replay seek', () => {
    const { frames, fallback, store } = recording();
    const engine = new SimulationEngine({ encounter: new LobbyEncounter() });
    const other = new SimulationEngine({ encounter: new LobbyEncounter() });
    const restoration: RestoredPresentation = {
      engine,
      tick: 50,
      timeMs: 51 * 600,
      history: { frames, throughFrameIndex: 0 },
    };
    const clock = new RestoredPresentationClock();
    expect(clock.sample(restoration, other, 50, 1000, 1)).toBeUndefined();
    expect(clock.sample(undefined, engine, 50, 1000, 1)).toBeUndefined();
    expect(clock.sample(restoration, engine, 51, 300, 1)).toMatchObject({
      held: false,
      firstFrame: true,
      tickProgress: 0.5,
      interpolatedTick: 51.5,
      timeMs: 51.5 * 600,
      deltaMs: 0,
    });
    store.set(0, undefined);
    expect(getReplayPresentation(store.getSnapshot(), fallback)).toMatchObject({
      tickProgress: 0,
      interpolatedTick: 50,
    });
  });

  // Practicing tick 32 restores recorded tick 31: preflight, hold and GO all sample 31 completed at
  // 32×600, and the selected tick 32 then starts from that same phase.
  it('holds a falling fireball at 2/4, enters the selected tick at 2/4, then advances and retires through existing policy', () => {
    const engine = new SimulationEngine({ encounter: new LobbyEncounter() });
    const stateAt = (tick: number): SimulationState => ({
      ...engine.getState(),
      currentTick: tick,
      encounter: yamaSnapshot({
        visuals: {
          fireballStates: [
            { active: true, centerPosition: [30, 30], angle: 'horizontal', phaseIndex: 7, ticksIntoPhase: tick - 30 },
          ],
        },
      }),
    });
    const frames = [
      { state: stateAt(31), events: [] },
      { state: stateAt(32), events: [] },
    ];
    const store = new ReplayFrameStore();
    store.setHistory(frames);
    store.set(0, undefined);
    const restoration: RestoredPresentation = {
      engine,
      tick: 31,
      timeMs: 32 * 600,
      history: { frames, throughFrameIndex: 0 },
    };
    const clock = new RestoredPresentationClock();
    const renderer = new SpotAnimRenderer();
    const upsert = vi.spyOn(renderer, 'upsert').mockImplementation(({ instanceId }) => instanceId ?? 'test');
    const despawn = vi.spyOn(renderer, 'despawn');
    const controller = new FireballController();
    const projection = {
      tileToScreen: () => null,
      tileDeltaToScreen: () => null,
      screenToTile: () => null,
      tilePolygonScreen: () => [],
    };
    const draw = (tick: number, elapsed: number, preflight = false) => {
      if (preflight) store.setPreview({ ...frames[0], frameIndex: 0, completedBoundary: true });
      const sample = preflight
        ? getReplayPresentation(store.getSnapshot(), { ...frames[0], frameIndex: 0 })
        : clock.sample(restoration, engine, tick, elapsed, 1);
      const interpolated = sample?.interpolatedTick ?? tick + Math.min(elapsed / 600, 1);
      upsert.mockClear();
      controller.update(renderer, tick, interpolated, createQueue(), projection, stateAt(tick), '3d');
      return upsert.mock.calls
        .filter(([instance]) => {
          const id = instance.instanceId;
          if (!id) expect.fail('Fireball rendering must supply a stable effect instance id');
          return id.startsWith('fireball-falling');
        })
        .map(([instance]) => instance.frameProgress);
    };
    expect(draw(31, 0, true)).toEqual([0.5, 0.5, 0.5]);
    expect(draw(31, 0)).toEqual([0.5, 0.5, 0.5]);
    expect(draw(31, 5000)).toEqual([0.5, 0.5, 0.5]);
    expect(draw(31, 10_000)).toEqual([0.5, 0.5, 0.5]);
    // GO and its first input interval still display the restored T−1; only executing T changes it.
    expect(draw(31, 10_500)).toEqual([0.5, 0.5, 0.5]);
    expect(draw(32, 0)).toEqual([0.5, 0.5, 0.5]);
    expect(draw(32, 150)).toEqual([0.5625, 0.5625, 0.5625]);
    expect(draw(34, 0)).toEqual([]);
    for (let index = 0; index < 3; index++) expect(despawn).toHaveBeenCalledWith(`fireball-falling-7-${index}`);
    renderer.dispose();
  });
});
