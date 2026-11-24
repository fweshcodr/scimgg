import { beforeEach, describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import { ObjType } from '../../../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../../../rs/config/objtype/ObjTypeLoader';
import { ModelData } from '../../../rs/model/ModelData';
import type { ModelLoader } from '../../../rs/model/ModelLoader';
import type { GroundItem } from '../../../types/groundItems';
import type { RenderQueue } from '../../core/commands';
import { GroundItemRenderer } from '../GroundItemRenderer';

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

function makeTriangleModel(): ModelData {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.verticesX = new Int32Array([0, 64, -64]);
  model.verticesY = new Int32Array([0, -64, -64]);
  model.verticesZ = new Int32Array([0, 64, -64]);
  model.faceCount = 1;
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([100]);
  return model;
}

const ITEM_COSTS: Record<number, { cost: number; stackable: boolean }> = {
  1: { cost: 10, stackable: false },
  2: { cost: 5000, stackable: false },
  3: { cost: 100, stackable: false },
  4: { cost: 50, stackable: false },
};

function makeLoaders(): { objTypeLoader: ObjTypeLoader; modelLoader: ModelLoader } {
  return {
    objTypeLoader: {
      load(id: number): ObjType {
        const obj = new ObjType(id, MOCK_CACHE_INFO);
        obj.name = `Item ${id}`;
        obj.inventoryModel = id;
        obj.cost = ITEM_COSTS[id]?.cost ?? 1;
        obj.stackable = ITEM_COSTS[id]?.stackable ?? false;
        return obj;
      },
      getCount: () => 4,
      clearCache: () => {},
    },
    modelLoader: { getModel: () => makeTriangleModel() },
  };
}

function pile(id: string, itemId: number, position: [number, number], droppedTick = 0): GroundItem {
  return { id, itemId, quantity: 1, position, droppedTick };
}

function makeQueue(): RenderQueue {
  return { replayPresentationReady: true, commands: [] };
}

describe('GroundItemRenderer', () => {
  let renderer: GroundItemRenderer;

  beforeEach(() => {
    renderer = new GroundItemRenderer();
    const { objTypeLoader, modelLoader } = makeLoaders();
    renderer.setLoaders(objTypeLoader, modelLoader);
  });

  it('draws nothing until the cache loaders arrive', () => {
    const bare = new GroundItemRenderer();
    bare.sync([pile('a', 1, [5, 5])], null);

    expect(bare.getAllHitTestData()).toHaveLength(0);
  });

  it('draws at most three models for one tile, however many piles it holds', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 2, [5, 5]), pile('c', 3, [5, 5]), pile('d', 4, [5, 5])], null);

    expect(renderer.getAllHitTestData()).toHaveLength(3);
  });

  it('draws one model for several piles sharing an item id', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 1, [5, 5]), pile('c', 1, [5, 5])], null);

    expect(renderer.getAllHitTestData()).toHaveLength(1);
  });

  it('points every model on a tile at the most valuable pile there', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 2, [5, 5]), pile('c', 3, [5, 5])], null);

    const targets = new Set(renderer.getAllHitTestData().map((entry) => entry.groundItemId));
    expect([...targets]).toEqual(['b']);
  });

  it('keeps tiles independent', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 2, [9, 9])], null);

    const targets = renderer.getAllHitTestData().map((entry) => entry.groundItemId);
    expect(targets.sort()).toEqual(['a', 'b']);
  });

  it('drops a pile that has left the floor', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 2, [5, 5])], null);
    expect(renderer.getAllHitTestData()).toHaveLength(2);

    renderer.sync([pile('a', 1, [5, 5])], null);

    const remaining = renderer.getAllHitTestData();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.groundItemId).toBe('a');
  });

  it('clears everything when the floor empties', () => {
    renderer.sync([pile('a', 1, [5, 5])], null);
    renderer.sync([], null);

    expect(renderer.getAllHitTestData()).toHaveLength(0);
  });

  it('queues the top model last so it reads as being on top of the pile', () => {
    renderer.sync([pile('a', 1, [5, 5]), pile('b', 2, [5, 5]), pile('c', 3, [5, 5])], null);

    const queue = makeQueue();
    renderer.render(queue);

    expect(queue.commands.length).toBeGreaterThanOrEqual(3);
    const lastMeshId = (queue.commands.at(-1) as { meshId: string }).meshId;
    expect(lastMeshId).toContain('ground-item-model-2');
  });

  it('forgets its baked models when the loaders change', () => {
    renderer.sync([pile('a', 1, [5, 5])], null);
    expect(renderer.getAllHitTestData()).toHaveLength(1);

    const { objTypeLoader, modelLoader } = makeLoaders();
    renderer.setLoaders(objTypeLoader, modelLoader);

    expect(renderer.getAllHitTestData()).toHaveLength(0);
  });

  it('skips a pile whose model will not load, without dropping the rest', () => {
    const { objTypeLoader } = makeLoaders();
    const partial = new GroundItemRenderer();
    partial.setLoaders(objTypeLoader, { getModel: (id: number) => (id === 1 ? undefined : makeTriangleModel()) });

    partial.sync([pile('a', 1, [5, 5]), pile('b', 2, [5, 5])], null);

    const drawn = partial.getAllHitTestData();
    expect(drawn).toHaveLength(1);
  });
});
