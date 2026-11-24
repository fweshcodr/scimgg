import { describe, expect, it, vi } from 'vitest';
import type { Projection2D } from '../../core/camera';
import type { RenderQueue } from '../../core/commands';
import { makeSnapshot } from '../../npc/__tests__/npcFacingTestHarness';
import { SceneCompositor } from '../SceneCompositor';

describe('SceneCompositor.buildNpcClickboxOverlay3D', () => {
  function createQueue(): RenderQueue {
    return { replayPresentationReady: true, commands: [] };
  }

  describe.each(['plugin', 'debug'] as const)('%s highlights', (surface) => {
    it.each([
      0, 0.0005, 0.001,
    ])('draws in front of an NPC with depth bias %s without lifting its geometry', (depthBias) => {
      const compositor = new SceneCompositor();
      compositor['terrainHeights'] = [new Int32Array(1)];
      const modelMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 10, 2, 1]);
      vi.spyOn(compositor['npcInstanceManager'], 'getAllHitTestData').mockReturnValue([
        {
          actorId: 'healer',
          hitTestData: {
            verticesX: new Int32Array([0, 128, 0]),
            verticesY: new Int32Array([0, 0, -128]),
            verticesZ: new Int32Array([0, 0, 0]),
            verticesCount: 3,
            indices1: new Int32Array([0]),
            indices2: new Int32Array([1]),
            indices3: new Int32Array([2]),
            faceCount: 1,
            faceColors3: null,
            modelMatrix,
            depthBias,
          },
        },
      ]);
      const queue = createQueue();
      const projection: Projection2D = {
        tileToScreen: () => null,
        tileDeltaToScreen: () => null,
        screenToTile: () => null,
        tilePolygonScreen: () => [],
      };

      if (surface === 'plugin') {
        compositor['buildNpcHighlights'](
          queue,
          projection,
          [{ npcTypeId: 7708, npcName: 'Jal-MejJak', mode: 'clickbox', color: '#00ffff' }],
          [makeSnapshot({ id: 'healer', npcTypeId: 7708, size: 1, position: [10, 10] })],
          false,
        );
      } else {
        compositor.buildNpcClickboxOverlay3D(queue);
      }

      expect(queue.commands).toHaveLength(1);
      const command = queue.commands[0];
      if (command?.kind !== 'mesh3d') throw new Error('Expected a highlight mesh');
      if (!('positions' in command)) throw new Error('Expected embedded highlight geometry');
      expect(command.depthBias).toBeCloseTo(depthBias + 0.0005, 8);
      expect(command.modelMatrix).toBe(modelMatrix);
      expect(command.positions).toEqual(new Float32Array([0, 0, 0, 128, 0, 0, 0, -128, 0]));
    });
  });

  it('builds one animated mesh3d command with triangle geometry', () => {
    const compositor = new SceneCompositor();
    const modelMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1]);

    vi.spyOn((compositor as any).npcInstanceManager, 'getAllHitTestData').mockReturnValue([
      {
        actorId: 'npc-1',
        hitTestData: {
          verticesX: new Int32Array([0, 128, 0]),
          verticesY: new Int32Array([0, 0, 128]),
          verticesZ: new Int32Array([0, 0, 0]),
          verticesCount: 3,
          indices1: new Int32Array([0]),
          indices2: new Int32Array([1]),
          indices3: new Int32Array([2]),
          faceCount: 1,
          faceColors3: new Int32Array([123]),
          modelMatrix,
        },
      },
    ]);

    const queue = createQueue();
    (compositor as any).buildNpcClickboxOverlay3D(queue);

    expect(queue.commands).toHaveLength(1);
    const cmd = queue.commands[0] as any;
    expect(cmd.meshId).toBe('npc-clickbox-overlay-npc-1');
    expect(cmd.kind).toBe('mesh3d');
    expect(cmd.animated).toBe(true);
    expect(cmd.cullFace).toBe('back');
    expect(cmd.positions).toBeInstanceOf(Float32Array);
    expect(cmd.positions.length).toBe(9);
    expect(cmd.normals).toBeInstanceOf(Float32Array);
    expect(cmd.normals.length).toBe(9);
    // The overlay geometry is coincident with the opaque model surface,
    // so it needs a positive forward depth bias to avoid reversed-Z z-fighting (mottling).
    expect(cmd.depthBias).toBeGreaterThan(0);
    // 'readwrite' -> only the nearest front face draws per pixel, so the
    // overlay is one uniform layer (no cumulative stacking where model faces overlap).
    expect(cmd.depth).toBe('readwrite');
  });

  it('skips faces flagged as invisible (-2) and emits no command', () => {
    const compositor = new SceneCompositor();

    vi.spyOn((compositor as any).npcInstanceManager, 'getAllHitTestData').mockReturnValue([
      {
        actorId: 'npc-hidden',
        hitTestData: {
          verticesX: new Int32Array([0, 128, 0]),
          verticesY: new Int32Array([0, 0, 128]),
          verticesZ: new Int32Array([0, 0, 0]),
          verticesCount: 3,
          indices1: new Int32Array([0]),
          indices2: new Int32Array([1]),
          indices3: new Int32Array([2]),
          faceCount: 1,
          faceColors3: new Int32Array([-2]),
          modelMatrix: new Float32Array(16),
        },
      },
    ]);

    const queue = createQueue();
    (compositor as any).buildNpcClickboxOverlay3D(queue);

    expect(queue.commands).toHaveLength(0);
  });
});
