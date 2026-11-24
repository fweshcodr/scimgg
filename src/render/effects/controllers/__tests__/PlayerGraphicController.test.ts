import { describe, expect, it, vi } from 'vitest';
import { getSpellVisuals } from '../../../../data/spellVisuals';
import { SpotAnimID } from '../../../../rs/config/spotanimtype/SpotAnimID';
import type { RenderQueue } from '../../../core/commands';
import type { PlayerGraphicDescriptor } from '../../playerEffectDescriptors';
import { SpotAnimRenderer } from '../../SpotAnimRenderer';
import { PlayerGraphicController } from '../PlayerGraphicController';

function fixture() {
  const controller = new PlayerGraphicController();
  const renderer = new SpotAnimRenderer();
  for (const spotAnimId of [100, 101]) {
    renderer['meshCache'].set(spotAnimId, {
      static: [],
      frames: [0, 1, 2].map((frame) => [
        {
          kind: 'mesh3d',
          meshId: `${spotAnimId}-${frame}`,
          materialId: 'osrs-npc',
          positions: new Float32Array(9),
          normals: new Float32Array(9),
          modelMatrix: new Float32Array(16),
          depth: 'readwrite',
        },
      ]),
      frameLengths: [30, 30, 30],
      frameStep: -1,
      heightOffset: 128,
    });
  }
  renderer.setTerrainHeights(Array.from({ length: 65 }, () => new Int32Array(65).fill(-128)));
  const update = (tick: number, position: readonly [number, number] = [30, 30]) => {
    controller.update(renderer, {
      currentTick: Math.floor(tick),
      interpolatedTick: tick,
      playerVisualPosition: position,
      facingAngle: 512,
      playerModelLift: 0.25,
      spotAnimModelLoader: null,
    });
    renderer.tick(Math.floor(tick), tick);
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);
    return queue.commands.flatMap((command) =>
      command.kind === 'mesh3d' ? [{ id: command.meshId, matrix: Array.from(command.modelMatrix) }] : [],
    );
  };
  return { controller, renderer, update };
}

describe('PlayerGraphicController', () => {
  it('matches continuous attachment and phase when consuming an earlier graphic descriptor', () => {
    const continuous = fixture();
    const sought = fixture();
    const descriptor: PlayerGraphicDescriptor = {
      kind: 'graphic',
      key: 'graphic',
      spotAnimId: 100,
      tick: 10,
      height: 96,
    };
    continuous.controller.consumeDescriptor(descriptor);
    continuous.update(10);
    const expected = continuous.update(11.5, [32, 34]);

    sought.controller.consumeDescriptor(descriptor);
    const actual = sought.update(11.5, [32, 34]);

    expect(actual).toEqual(expected);
    expect(actual[0]?.id).toBe('100-1');
  });
  it('replaces the stable instance while a new graphic waits for its start', () => {
    const { controller, renderer, update } = fixture();
    controller.triggerGraphic(100, 10);
    update(10);
    controller.triggerGraphic(101, 12);
    const pending = update(11);

    const replacement = update(12);

    expect(pending).toEqual([]);
    expect(replacement.map((mesh) => mesh.id)).toEqual(['101-0']);
    expect([...renderer['activeInstances'].keys()]).toEqual(['player-graphic-active']);
  });

  it('clears metadata on a game-tick rewind rather than replaying it later', () => {
    const { controller, update } = fixture();
    controller.triggerGraphic(100, 10);
    update(11);

    const rewound = update(10);

    expect(rewound).toEqual([]);
    expect(update(11)).toEqual([]);
  });

  it.each([11, 14])('retains an unloaded graphic with its original clock until cache readiness at tick %s', (tick) => {
    const { controller, renderer, update } = fixture();
    const cache = renderer['meshCache'].get(100);
    if (!cache) expect.fail('Expected graphic cache');
    renderer['meshCache'].delete(100);
    controller.triggerGraphic(100, 10);
    const unloaded = update(tick);
    renderer['meshCache'].set(100, cache);

    const loaded = update(tick);

    expect(unloaded).toEqual([]);
    expect(loaded.map((mesh) => mesh.id)).toEqual(tick === 11 ? ['100-1'] : []);
    expect(controller['activeGraphic'] === null).toBe(tick === 14);
  });

  it('follows the player with terrain, model lift and actor height but no sequence offset', () => {
    const { controller, update } = fixture();
    controller.triggerGraphic(100, 10, 96);
    update(10);

    const mesh = update(11, [32, 34])[0];

    expect(mesh?.matrix.slice(12, 15)).toEqual([32.5, 34.5, 2]);
    expect(mesh?.matrix[1]).toBeCloseTo(-1 / 128);
    expect(mesh?.id).toBe('100-1');
  });

  it.each([
    { spotAnimId: SpotAnimID.VFX_PLAYER_MARK_OF_DARKNESS, depthBias: 0.0005 },
    { spotAnimId: SpotAnimID.VFX_PLAYER_SATURATED_HEART_INVIGORATE, depthBias: undefined },
  ])('inherits back-culling without a graphic-specific override for $spotAnimId', ({ spotAnimId, depthBias }) => {
    const { controller, renderer, update } = fixture();
    const cache = renderer['meshCache'].get(100);
    if (!cache) expect.fail('Expected graphic cache');
    renderer['meshCache'].set(spotAnimId, cache);
    const upsert = vi.spyOn(renderer, 'upsert');

    controller.triggerGraphic(spotAnimId, 10);
    update(10.5);

    expect(upsert.mock.lastCall?.[0].style).toEqual({ zIndex: 72, ...(depthBias === undefined ? {} : { depthBias }) });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);
    expect(queue.commands).toHaveLength(1);
    expect(queue.commands[0]).toMatchObject({ cullFace: 'back' });
    expect('depthBias' in queue.commands[0] ? queue.commands[0].depthBias : undefined).toBe(depthBias);
  });

  it('applies depth bias to Demonbane cast spotanims', () => {
    const controller = new PlayerGraphicController();
    const renderer = new SpotAnimRenderer();
    vi.spyOn(renderer, 'isLoaded').mockReturnValue(true);
    vi.spyOn(renderer, 'getFrameLengths').mockReturnValue([30, 30]);
    const upsert = vi.spyOn(renderer, 'upsert');
    const darkDemonbane = getSpellVisuals('Dark Demonbane');
    if (!darkDemonbane) {
      throw new Error('Expected Dark Demonbane spell visuals');
    }

    controller.triggerGraphic(darkDemonbane.castSpotanimId, 10);
    controller.update(renderer, {
      currentTick: 10,
      interpolatedTick: 10.5,
      playerVisualPosition: [30, 30],
      facingAngle: 0,
      playerModelLift: 0,
      spotAnimModelLoader: null,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        spotAnimId: darkDemonbane.castSpotanimId,
        style: expect.objectContaining({
          depthBias: 0.0005,
        }),
      }),
    );
  });

  it.each([
    { height: undefined, expected: 0.25 },
    { height: 96, expected: 1 },
  ])('anchors actor graphics at height $height without adding the standalone sequence offset', ({
    height,
    expected,
  }) => {
    const controller = new PlayerGraphicController();
    const renderer = new SpotAnimRenderer();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    renderer['meshCache'].set(2804, {
      static: [
        {
          meshId: 'elder-maul-graphic',
          materialId: 'osrs-npc',
          positions,
          perVertexHslColors: new Float32Array(3),
          perVertexAlphas: new Float32Array(3).fill(1),
          depth: 'readwrite',
        },
      ],
      frames: [],
      frameLengths: [30],
      frameStep: -1,
      heightOffset: 32,
    });
    controller.triggerGraphic(2804, 10, height);
    controller.update(renderer, {
      currentTick: 10,
      interpolatedTick: 10.5,
      playerVisualPosition: [30, 30],
      facingAngle: 0,
      playerModelLift: 0.25,
      spotAnimModelLoader: null,
    });
    renderer.tick(10, 10.5);
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };

    renderer.render(queue);

    const command = queue.commands[0];
    if (!command || command.kind !== 'mesh3d') throw new Error('Expected player graphic mesh');
    expect(command.modelMatrix[14]).toBeCloseTo(expected);
  });
});
