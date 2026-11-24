import { beforeAll, describe, expect, it } from 'vitest';
import { createQueue, type NpcMesh3DCommand } from '../../../render/core/commands';
import { SceneObjectRenderer } from '../../../render/graphics/SceneObjectRenderer';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import { CacheSystem } from '../../../rs/cache/CacheSystem';
import { Bzip2 } from '../../../rs/compression/Bzip2';
import { LocModelLoader } from '../../../rs/config/loctype/LocModelLoader';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import { readCacheZipFiles } from '../../../test/helpers/cacheZipFiles';
import { findProjectCacheZip, skipWithoutRealCache } from '../../../test/helpers/real-cache';
import type { SimulationState } from '../../../types/simulation';
import { ZUK_ALCOVE_STATIC_LOCS, zukAlcoveLocs } from '../../zuk/alcoveScenery';
import { INFERNO_PILLARS, PILLAR_MAX_HP, type PillarKey } from '../pillars';
import { INFERNO_RENDER_CONFIG } from '../renderConfig';
import { InfernoSceneObjectController } from '../sceneObjects';

const cachePath = findProjectCacheZip('pinned') ?? '';
const info: CacheInfo = {
  name: 'osrs-test',
  game: 'oldschool',
  environment: 'live',
  revision: 232,
  timestamp: '',
  size: 0,
};

/** A waves snapshot with the given pillars standing at the given HP; the rest collapsed. */
function stateWith(
  hp: Partial<Record<PillarKey, number>>,
  zukControlTick: number | null = null,
  currentTick = 0,
): SimulationState {
  const pillars = INFERNO_PILLARS.map(({ key, locId, position }) => ({
    key,
    locId,
    position,
    intact: hp[key] !== undefined,
    hp: hp[key] ?? 0,
  }));
  return {
    currentTick,
    encounter: {
      kind: 'inferno',
      state: { pillars },
      visuals: {
        pillarLocs: pillars
          .filter(({ intact }) => intact)
          .map(({ key, locId, position }) => ({ key, locId, position })),
        zukControlTick,
      },
    },
  } as unknown as SimulationState;
}

describe.skipIf(skipWithoutRealCache('pinned'))('Inferno pillar LOCs on the real cache', () => {
  let loader: LocModelLoader;
  beforeAll(async () => {
    await Bzip2.initWasm();
    const files = await readCacheZipFiles(cachePath);
    const cache = CacheSystem.fromMap('dat2', files, [0, 1, 2, 7]);
    const config = cache.getIndex(2);
    loader = new LocModelLoader(
      info,
      config.getArchive(6),
      cache.getIndex(7),
      config.getArchive(12),
      cache.getIndex(0),
      cache.getIndex(1),
    );
  }, 60_000);

  /**
   * Which pillar a command draws: the one whose 3x3 footprint holds its placement origin. Pillars
   * showing the same LOC share one mesh id, so the id cannot tell them apart. Alcove LOCs keep their
   * own mesh ids; anything else is reported under its mesh id so a stray draw fails the key checks.
   */
  function drawnObjectKey(command: NpcMesh3DCommand): string {
    if (command.meshId.startsWith('inferno-alcove-')) return command.meshId.replace(/-frame-.*$/, '');
    const [originX, originY] = [command.modelMatrix[12]!, command.modelMatrix[13]!];
    const pillar = INFERNO_PILLARS.find(
      ({ position: [x, y] }) => originX >= x && originX < x + 3 && originY >= y && originY < y + 3,
    );
    return pillar?.key ?? `unattributed:${command.meshId}`;
  }

  /** World-space bounding box of each pillar's drawn geometry, with its vertex count and mesh ids. */
  function draw(renderer: SceneObjectRenderer, state: SimulationState) {
    renderer.sync(new InfernoSceneObjectController().update({ state, currentTick: state.currentTick } as never), 0);
    const queue = createQueue();
    renderer.render(queue, 0, 0);
    const drawn = new Map<
      string,
      { vertices: number; meshIds: Set<string>; minX: number; maxX: number; minY: number; maxY: number }
    >();
    for (const command of queue.commands) {
      if (command.kind !== 'mesh3d' || !('positions' in command)) continue;
      const { positions } = command as NpcMesh3DCommand;
      const key = drawnObjectKey(command as NpcMesh3DCommand);
      const box = drawn.get(key) ?? {
        vertices: 0,
        meshIds: new Set<string>(),
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      box.meshIds.add(command.meshId);
      const m = command.modelMatrix;
      for (let index = 0; index < positions.length; index += 3) {
        const [x, y, z] = [positions[index]!, positions[index + 1]!, positions[index + 2]!];
        const worldX = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
        const worldY = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
        box.minX = Math.min(box.minX, worldX);
        box.maxX = Math.max(box.maxX, worldX);
        box.minY = Math.min(box.minY, worldY);
        box.maxY = Math.max(box.maxY, worldY);
      }
      box.vertices += positions.length / 3;
      drawn.set(key, box);
    }
    return drawn;
  }

  const modelVertices = (locId: number) =>
    (loader.loadLocMesh(locId, LocModelType.NORMAL, 0, 0, 0, 0)?.mesh.positions.length ?? 0) / 3;

  // The damage varbit counts up from 0; the transform lists switch model every 64 points.
  it.each([
    { damage: 0, shown: 30284 },
    { damage: 63, shown: 30284 },
    { damage: 64, shown: 30285 },
    { damage: 127, shown: 30285 },
    { damage: 128, shown: 30286 },
    { damage: 191, shown: 30286 },
    { damage: 192, shown: 30287 },
    { damage: PILLAR_MAX_HP - 1, shown: 30287 },
  ])('draws every pillar as $shown at $damage damage, centered on its 3x3 footprint', ({ damage, shown }) => {
    const hp = PILLAR_MAX_HP - damage;
    const drawn = draw(new SceneObjectRenderer(loader), stateWith({ west: hp, south: hp, northEast: hp }));

    expect(modelVertices(shown)).toBeGreaterThan(0);
    for (const { key, position } of INFERNO_PILLARS) {
      const box = drawn.get(key);
      if (!box) expect.fail(`Pillar ${key} drew nothing`);
      expect(box.vertices).toBe(modelVertices(shown));
      // Shared geometry is keyed by the drawn LOC, so this is the shown LOC, not the transform LOC.
      for (const meshId of box.meshIds) expect(meshId).toMatch(new RegExp(`^scene-object-loc:${shown}:`));
      // The shown LOCs are 1x1 in the cache but their models span the 3x3 support.
      expect((box.minX + box.maxX) / 2).toBeCloseTo(position[0] + 1.5, 1);
      expect((box.minY + box.maxY) / 2).toBeCloseTo(position[1] + 1.5, 1);
      expect(box.maxX - box.minX).toBeGreaterThan(2);
    }
  });

  const pillarKeys = (drawn: ReadonlyMap<string, unknown>) =>
    [...drawn.keys()].filter((key) => !key.startsWith('inferno-alcove-')).sort();
  const alcove = (drawn: ReadonlyMap<string, unknown>) =>
    [...drawn.keys()].filter((key) => key.startsWith('inferno-alcove-')).sort();

  it('removes a collapsed pillar and redraws the right stage after a retry or seek', () => {
    const renderer = new SceneObjectRenderer(loader);
    const cracked = draw(renderer, stateWith({ west: 10, south: PILLAR_MAX_HP }));
    expect(pillarKeys(cracked)).toEqual(['south', 'west']);
    expect(cracked.get('west')?.vertices).toBe(modelVertices(30287));

    // Back to the wave start: the same renderer rebuilds the intact pillar, and the collapsed one returns.
    const restored = draw(renderer, stateWith({ west: PILLAR_MAX_HP, south: PILLAR_MAX_HP, northEast: PILLAR_MAX_HP }));
    expect(pillarKeys(restored)).toEqual(['northEast', 'south', 'west']);
    expect(restored.get('west')?.vertices).toBe(modelVertices(30284));

    expect(pillarKeys(draw(renderer, stateWith({ south: PILLAR_MAX_HP })))).toEqual(['south']);
  });

  it('draws the alcove sealed through the waves, opening at C-8 and open from C, across seeks', () => {
    const renderer = new SceneObjectRenderer(loader);
    const sealed = alcove(draw(renderer, stateWith({})));
    expect(sealed).toEqual(
      [
        'wall-left-collapsing-30337',
        'wall-left-floor-30333',
        'wall-left-join-30324',
        'wall-right-collapsing-30336',
        'wall-right-floor-30332',
        'wall-right-join-30334',
        'static-glyph-30338',
      ]
        .map((slot) => `inferno-alcove-${slot}`)
        .sort(),
    );
    const control = 100;
    // Headed for wave 69 but before C-8: still sealed.
    expect(alcove(draw(renderer, stateWith({}, control, control - 9)))).toEqual(sealed);
    const opening = alcove(draw(renderer, stateWith({}, control, control - 8)));
    expect(opening).toEqual(
      [
        'wall-left-collapsing-30344',
        'wall-left-floor-30340',
        'wall-left-join-30342',
        'wall-right-collapsing-30343',
        'wall-right-floor-30339',
        'wall-right-join-30341',
      ]
        .map((slot) => `inferno-alcove-${slot}`)
        .sort(),
    );
    const open = alcove(draw(renderer, stateWith({}, control, control + 40)));
    expect(open).toContain('inferno-alcove-wall-left-collapsing-30346');
    expect(open).toContain('inferno-alcove-wall-right-collapsing-30345');
    expect(open).not.toContain('inferno-alcove-static-glyph-30338');
    // A seek back before C-8 seals it again.
    expect(alcove(draw(renderer, stateWith({}, control, control - 11)))).toEqual(sealed);
    // A run started on wave 69 opens at C = 0.
    expect(alcove(draw(renderer, stateWith({}, 0, 0)))).toEqual(open);
    for (const key of [...sealed, ...opening, ...open]) expect(key).toMatch(/^inferno-alcove-/);
  });
});

describe('Inferno alcove scenery around wave 69', () => {
  const byLoc = (control: number | null, tick: number) =>
    Object.fromEntries(zukAlcoveLocs(control, tick).map((loc) => [`${loc.localX},${loc.localY}`, loc]));

  it('follows the captured intro: state 2 and loc_del at C-8, the collapse animations from C-7, state 3 at C', () => {
    const control = 50;
    expect(Object.keys(byLoc(control, control - 9))).toHaveLength(7);
    const opening = byLoc(control, control - 8);
    expect(opening['30,51']).toBeUndefined();
    expect(opening['27,52']).toMatchObject({ locId: 30340, rotation: 1 });
    expect(opening['28,52']).toMatchObject({ locId: 30344, rotation: 3 });
    expect(opening['28,52']?.animation).toBeUndefined();
    const animating = byLoc(control, control - 7);
    expect(animating['28,52']?.animation).toEqual({ seqId: 7560, startTick: control - 7 });
    expect(animating['33,52']?.animation).toEqual({ seqId: 7559, startTick: control - 7 });
    expect(animating['27,52']?.animation).toBeUndefined();
    const open = byLoc(control, control);
    expect(open['28,52']).toMatchObject({ locId: 30346, rotation: 3 });
    expect(open['33,52']).toMatchObject({ locId: 30345, rotation: 3 });
    expect(open['28,52']?.animation).toBeUndefined();
  });

  it('leaves exactly these cache LOCs to the controller', () => {
    expect(ZUK_ALCOVE_STATIC_LOCS).toEqual(
      expect.arrayContaining([
        { localX: 30, localY: 51, locId: 30338 },
        { localX: 27, localY: 54, locId: 30324 },
      ]),
    );
    expect(INFERNO_RENDER_CONFIG.locRender?.excludedLocs).toBe(ZUK_ALCOVE_STATIC_LOCS);
  });

  it('shows a recording from when Zuk was its own encounter with the alcove open', () => {
    const specs = new InfernoSceneObjectController().update({
      currentTick: 3,
      state: { encounter: { kind: 'zuk', state: {}, visuals: {} } },
    } as never);
    expect(specs.map((spec) => spec.data?.locId).sort()).toEqual([30339, 30340, 30341, 30342, 30345, 30346]);
  });
});
