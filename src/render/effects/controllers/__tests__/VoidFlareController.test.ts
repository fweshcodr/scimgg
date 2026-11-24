import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../../../core/events/types';
import type { NpcSnapshot } from '../../../../types/simulation';
import type { Projection2D } from '../../../core/camera';
import type { RenderQueue } from '../../../core/commands';
import { SpotAnimRenderer } from '../../SpotAnimRenderer';
import { VoidFlareController } from '../VoidFlareController';

function createProjection(): Projection2D {
  return {
    tileToScreen: ({ x, y }) => ({ x: x * 10, y: y * 10 }),
    tileDeltaToScreen: (delta) => ({ x: delta.x * 10, y: delta.y * 10 }),
    screenToTile: () => null,
    tilePolygonScreen: ({ x, y }) => [
      { x: x * 10, y: y * 10 },
      { x: x * 10 + 10, y: y * 10 },
      { x: x * 10 + 10, y: y * 10 + 10 },
      { x: x * 10, y: y * 10 + 10 },
    ],
  };
}

function createQueue(): RenderQueue {
  return { replayPresentationReady: true, commands: [] };
}

function createRendererMock() {
  return {
    upsert: vi.fn(),
    despawn: vi.fn(),
    isLoaded: vi.fn(() => true),
    getFrameLengths: vi.fn((): number[] | undefined => undefined),
  };
}

function spawnEvent(id: string, tick: number): GameEvent {
  return {
    eventId: tick,
    tick,
    type: 'voidflare_spawned',
    flareId: id,
    position: [30, 30],
    variant: 'shadow',
  };
}

function explodeEvent(id: string, tick: number): GameEvent {
  return {
    eventId: tick,
    tick,
    type: 'voidflare_exploded',
    flareId: id,
    position: [30, 30],
    variant: 'shadow',
  };
}

function flareNpc(id: string, overrides: Partial<NpcSnapshot> = {}): NpcSnapshot {
  return {
    id,
    npcTypeId: 1,
    archetypeId: 'voidflare',
    role: 'minion',
    alive: true,
    position: [30, 30],
    previousPosition: [30, 30],
    facingAngle: 0,
    size: 2,
    hp: 20,
    maxHp: 20,
    spawnTick: 0,
    despawnTick: 6,
    ...overrides,
  };
}

/** Width (px) of the charge-bar fill rect, which is pushed last by buildFlare2D. */
function chargeBarFillWidth(queue: RenderQueue): number {
  const last = queue.commands[queue.commands.length - 1];
  if (!last || last.kind !== 'poly2d') {
    throw new Error('expected a poly2d charge-bar fill command to be queued last');
  }
  return last.points[1].x - last.points[0].x;
}

describe('VoidFlareController', () => {
  it('draws a live flare the same after a seek as in continuous play', () => {
    const renderer = new SpotAnimRenderer();
    const continuous = new VoidFlareController();
    const sought = new VoidFlareController();
    const npc = flareNpc('f1', { spawnTick: 10, despawnTick: 16 });
    const expected = createQueue();
    continuous.update(renderer, 12, 12.5, expected, createProjection(), '2d', { npcs: [npc], showScheduled: true });
    const actual = createQueue();

    sought.reconstruct([], renderer);
    sought.update(renderer, 12, 12.5, actual, createProjection(), '2d', { npcs: [npc], showScheduled: true });

    expect(actual.commands).toEqual(expected.commands);
  });

  it.each([16, 17.5, 17.7, 19])('matches continuous explosion phase when reconstructed at tick %s', (tick) => {
    const renderer = new SpotAnimRenderer();
    const continuous = new VoidFlareController();
    const sought = new VoidFlareController();
    const event = explodeEvent('f1', 16);
    continuous.consumeEvents([event]);
    const expected = createQueue();
    continuous.update(renderer, Math.floor(tick), tick, expected, createProjection(), '2d', {
      npcs: [],
      showScheduled: true,
    });
    const actual = createQueue();

    sought.reconstruct([event], renderer);
    sought.update(renderer, Math.floor(tick), tick, actual, createProjection(), '2d', {
      npcs: [],
      showScheduled: true,
    });

    expect(actual.commands).toEqual(expected.commands);
    // Unloaded (as in 2D), the explosion lasts its sequence's 50 cycles.
    expect(actual.commands.length > 0).toBe(tick < 16 + 50 / 30);
  });

  it('omits destroyed explosions when reconstructing the destination', () => {
    const renderer = new SpotAnimRenderer();
    const controller = new VoidFlareController();
    const queue = createQueue();

    controller.reconstruct(
      [explodeEvent('f1', 16), { type: 'voidflare_destroyed', eventId: 17, tick: 17, flareId: 'f1' }],
      renderer,
    );
    controller.update(renderer, 17, 17.5, queue, createProjection(), '2d', { npcs: [], showScheduled: true });

    expect(queue.commands).toEqual([]);
  });
  it('draws a live flare from its snapshot without ever seeing its spawn event', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();
    const queue = createQueue();

    controller.update(renderer as unknown as SpotAnimRenderer, 4, 4.5, queue, createProjection(), '2d', {
      npcs: [flareNpc('f1')],
      showScheduled: true,
    });

    // Four flare tiles, the bar background and its fill.
    expect(queue.commands).toHaveLength(6);
    expect(renderer.upsert).not.toHaveBeenCalled();
  });

  it('draws nothing for a consumed spawn event once no live flare snapshot backs it', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock() as unknown as SpotAnimRenderer;
    controller.consumeEvents([spawnEvent('f1', 0)]);
    const drawn = (npcs: NpcSnapshot[]) => {
      const queue = createQueue();
      controller.update(renderer, 4, 4.5, queue, createProjection(), '2d', { npcs, showScheduled: true });
      return queue.commands;
    };

    expect(drawn([])).toEqual([]);
    expect(drawn([flareNpc('f1', { alive: false })])).toEqual([]);
    expect(drawn([flareNpc('f1', { archetypeId: 'yama' })])).toEqual([]);
  });

  it('does not self-clear explosions on a backward update() (reset is base-driven now)', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();
    const projection = createProjection();

    controller.consumeEvents([explodeEvent('f1', 10)]);
    controller.update(renderer as unknown as SpotAnimRenderer, 10, 10, createQueue(), projection, '2d', {
      npcs: [],
      showScheduled: true,
    });

    // A backward update() must NOT wipe explosions: the base SceneCompositor drives the
    // discontinuity reset via clearActive(), so the controller has no lastObservedTick guard.
    controller.update(renderer as unknown as SpotAnimRenderer, 5, 5, createQueue(), projection, '2d', {
      npcs: [],
      showScheduled: true,
    });

    expect((controller as unknown as { explodingFlares: unknown[] }).explodingFlares).toHaveLength(1);
  });

  it('can add and render new explosions after a clearActive reset', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();
    const projection = createProjection();

    controller.consumeEvents([explodeEvent('old', 20)]);
    // Base-driven discontinuity reset.
    controller.clearActive(renderer as unknown as SpotAnimRenderer);

    const queue = createQueue();
    controller.consumeEvents([explodeEvent('new', 21)]);
    controller.update(renderer as unknown as SpotAnimRenderer, 21, 21.2, queue, projection, '2d', {
      npcs: [],
      showScheduled: true,
    });

    expect(queue.commands.length).toBeGreaterThan(0);
    expect(
      (controller as unknown as { explodingFlares: { flareId: string }[] }).explodingFlares.map((f) => f.flareId),
    ).toEqual(['new']);
  });

  it('plays the explosion at its own sequence speed and length', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();
    renderer.getFrameLengths.mockReturnValue([17, ...Array<number>(11).fill(3)]);
    controller.consumeEvents([explodeEvent('f1', 10)]);

    controller.update(renderer as unknown as SpotAnimRenderer, 11, 11, createQueue(), createProjection(), '3d', {
      npcs: [],
      showScheduled: true,
    });
    expect(renderer.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        instanceId: 'voidflare-explode-f1',
        spotAnimId: 3238,
        lifecycle: { kind: 'oneShot', startTick: 10, durationTicks: 50 / 30 },
      }),
    );
    expect(renderer.upsert.mock.lastCall?.[0]).not.toHaveProperty('frameProgress');

    renderer.upsert.mockClear();
    controller.update(
      renderer as unknown as SpotAnimRenderer,
      11,
      10 + 50 / 30,
      createQueue(),
      createProjection(),
      '3d',
      { npcs: [], showScheduled: true },
    );
    expect(renderer.upsert).not.toHaveBeenCalled();
    expect(renderer.despawn).toHaveBeenCalledWith('voidflare-explode-f1');
    expect((controller as unknown as { explodingFlares: unknown[] }).explodingFlares).toHaveLength(0);
  });

  it('clearActive despawns exploding flares and clears internal state', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();

    controller.consumeEvents([explodeEvent('f1', 2)]);

    controller.clearActive(renderer as unknown as SpotAnimRenderer);

    expect(renderer.despawn).toHaveBeenCalledWith('voidflare-explode-f1');
    expect((controller as unknown as { explodingFlares: unknown[] }).explodingFlares).toHaveLength(0);
  });

  it('fills the charge bar as the flare charges (default direction)', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock();
    const queue = createQueue();

    controller.update(renderer as unknown as SpotAnimRenderer, 4, 4.5, queue, createProjection(), '2d', {
      npcs: [flareNpc('f1')],
      showScheduled: true,
    });

    // 16px bar (20px tile span * 0.8) at 0.75 charge -> 12px filled.
    expect(chargeBarFillWidth(queue)).toBeCloseTo(12);
  });

  it('drains the charge bar over time when direction is "drain"', () => {
    const controller = new VoidFlareController({ chargeBarDirection: 'drain' });
    const renderer = createRendererMock();
    const queue = createQueue();

    controller.update(renderer as unknown as SpotAnimRenderer, 4, 4.5, queue, createProjection(), '2d', {
      npcs: [flareNpc('f1')],
      showScheduled: true,
    });

    // Mirror of fill: at 0.75 charge the drain bar shows 16 * 0.25 = 4px.
    expect(chargeBarFillWidth(queue)).toBeCloseTo(4);
  });

  it('hides the charge bar until the flare activates, then fills to full and holds', () => {
    const controller = new VoidFlareController();
    const renderer = createRendererMock() as unknown as SpotAnimRenderer;
    // P3 timing: activates on +3, the bar completes 2 ticks before the +25 detonation.
    const npc = flareNpc('f1', { spawnTick: 0, despawnTick: 25, targetableFromTick: 3, despawnTimerLeadTicks: 2 });
    const commandsAt = (tick: number) => {
      const queue = createQueue();
      controller.update(renderer, Math.floor(tick), tick, queue, createProjection(), '2d', {
        npcs: [npc],
        showScheduled: true,
      });
      return queue;
    };

    // Before activation only the four flare tiles are drawn: no bar background or fill.
    expect(commandsAt(2.9).commands).toHaveLength(4);
    // Activation: the background is drawn, the fill is still empty.
    expect(commandsAt(3).commands).toHaveLength(5);
    expect(chargeBarFillWidth(commandsAt(13))).toBeCloseTo(8);
    expect(chargeBarFillWidth(commandsAt(23))).toBeCloseTo(16);
    expect(chargeBarFillWidth(commandsAt(24.5))).toBeCloseTo(16);
  });

  describe('with the Void Flares toggle off', () => {
    const scheduled = flareNpc('scheduled', { position: [20, 20] });
    const practice = flareNpc('practice', { position: [30, 30], spawnOrigin: 'practice' });
    const frame = { npcs: [scheduled, practice], showScheduled: false };

    it('still draws a practice-spawned flare and its charge bar, and hides the scheduled one', () => {
      const controller = new VoidFlareController();
      const renderer = createRendererMock() as unknown as SpotAnimRenderer;
      const hidden = createQueue();
      controller.update(renderer, 4, 4.5, hidden, createProjection(), '2d', {
        npcs: [scheduled],
        showScheduled: false,
      });
      const shown = createQueue();
      controller.update(renderer, 4, 4.5, shown, createProjection(), '2d', frame);

      expect(hidden.commands).toEqual([]);
      // Four flare tiles, the bar background and its fill.
      expect(shown.commands).toHaveLength(6);
      expect(chargeBarFillWidth(shown)).toBeCloseTo(12);
    });

    it("plays a practice flare's explosion and despawns a scheduled flare's", () => {
      const controller = new VoidFlareController();
      const renderer = createRendererMock();
      controller.consumeEvents([explodeEvent('scheduled', 10), explodeEvent('practice', 10)]);

      controller.update(
        renderer as unknown as SpotAnimRenderer,
        10,
        10.5,
        createQueue(),
        createProjection(),
        '3d',
        frame,
      );

      expect(renderer.upsert.mock.calls.map(([instance]) => instance.instanceId)).toEqual([
        'voidflare-explode-practice',
      ]);
      expect(renderer.despawn).toHaveBeenCalledWith('voidflare-explode-scheduled');
    });
  });
});
