import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LocModelLoader } from '../../../rs/config/loctype/LocModelLoader';
import { openTestCache, sha256File } from '../../../test/helpers/cacheFixtures';
import { compareWithGolden, type DrawGoldenFile, firstDrawDifference } from '../../../test/helpers/meshDrawStream';
import {
  findProjectCacheZip,
  REAL_CACHE_TEST_TIMEOUT_MS,
  skipWithoutRealCache,
} from '../../../test/helpers/real-cache';
import { withEmbeddedResidentMeshes } from '../../../test/helpers/residentMeshDraws';
import { createQueue, isResidentMesh3DCommand, type ResidentMesh3DCommand } from '../../core/commands';
import type { MeshUploadData } from '../../core/meshSource';
import { LocRenderer } from '../LocRenderer';
import {
  type EncounterScenery,
  LOC_GOLDEN_DIGEST,
  loadEncounterSceneries,
  recordLocDrawStream,
  withUniqueLocIds,
} from './animatedLocDrawStream';

const cachePath = findProjectCacheZip();

let opened: Promise<{ loader: LocModelLoader; sceneries: readonly EncounterScenery[] }> | undefined;
async function encounterScenery(kind: string): Promise<{ loader: LocModelLoader; scenery: EncounterScenery }> {
  if (!cachePath) throw new Error('Expected the project cache');
  opened ??= openTestCache(cachePath).then(async ({ loader, maps }) => ({
    loader,
    sceneries: await loadEncounterSceneries(loader, maps),
  }));
  const { loader, sceneries } = await opened;
  const scenery = sceneries.find((candidate) => candidate.name === kind);
  if (!scenery) throw new Error(`No scenery for ${kind}`);
  return { loader, scenery };
}

function countingLoader(loader: LocModelLoader): { loader: LocModelLoader; loads: () => number } {
  let loads = 0;
  const counted: LocModelLoader = Object.create(loader);
  counted.loadAnimatedLocMeshFrames = (...args) => {
    loads++;
    return loader.loadAnimatedLocMeshFrames(...args);
  };
  return { loader: counted, loads: () => loads };
}

const isShared = (meshId: string) => meshId.startsWith('loc-anim:');

describe.skipIf(skipWithoutRealCache())(
  'LocRenderer animated-frame sharing isolation on the real cache (vs unique loc ids)',
  () => {
    // The baseline is the current LocRenderer with every loc given its own id, so no two placements
    // can share a bake. It proves that sharing changes nothing; the pinned goldens below check the
    // baking, placement and frame selection themselves against HEAD.
    it.each([
      'yama_p3',
      'inferno',
    ])('%s: sharing leaves every draw, its order and frame as unshared placements draw them, through a context restore and a restart', async (kind) => {
      const { loader, scenery } = await encounterScenery(kind);
      const unique = withUniqueLocIds(loader, scenery);
      const shared = countingLoader(loader);
      const perPlacement = countingLoader(unique.loader);

      const baseline = await recordLocDrawStream(new LocRenderer(), perPlacement.loader, unique.scenery, 'own');
      const sharedOwn = await recordLocDrawStream(new LocRenderer(), shared.loader, scenery, 'own');
      const sharedLoads = shared.loads();
      const sharedOnGpu = await recordLocDrawStream(new LocRenderer(), loader, scenery, 'gpu');

      expect(baseline.length).toBeGreaterThan(0);
      expect(firstDrawDifference(sharedOwn, baseline)).toBeNull();
      expect(sharedOwn.some((draw) => isShared(draw.meshId))).toBe(true);
      expect(sharedLoads).toBeLessThanOrEqual(perPlacement.loads());
      // Mesh-id coherence: on a mesh-id keyed GPU cache, through the context restore and the
      // restart's re-bake, shared ids always serve their own bake.
      expect(firstDrawDifference(sharedOnGpu, sharedOwn)).toBeNull();
    }, 120_000);

    it('yama_p3 sharing effect: one bake per animated loc, model type, rotation and sequence', async () => {
      const { loader, scenery } = await encounterScenery('yama_p3');
      const shared = countingLoader(loader);
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(scenery.terrainHeights);
      await renderer.load(shared.loader, [...scenery.locs], scenery.options);

      const placements = [...renderer['animatedLocFrameMeshes'].values()];
      const commands = placements.flatMap((frames) => frames.flat());
      const meshIds = new Set(commands.map((command) => command.meshId));
      const sharedIds = [...meshIds].filter(isShared);

      // On cache 2437: 172 animated placement parts from 37 bakes, 982 frame meshes instead of 3,650.
      expect(placements.length).toBeGreaterThan(100);
      expect(shared.loads()).toBeLessThan(placements.length / 4);
      expect(meshIds.size).toBeLessThan(commands.length / 3);
      // Every frame part of one key is one mesh id with one set of arrays, whoever draws it.
      for (const meshId of sharedIds) {
        const arrays = new Set(
          commands.filter((command) => command.meshId === meshId).map((command) => command.positions),
        );
        expect(arrays.size).toBe(1);
      }
      renderer.dispose();
      expect(renderer['animatedLocFrameMeshes'].size).toBe(0);
    }, 120_000);
  },
);

const goldensPath = resolve(__dirname, 'animatedLocDrawGoldens.json');
const goldens = existsSync(goldensPath) ? (JSON.parse(readFileSync(goldensPath, 'utf-8')) as DrawGoldenFile) : null;

describe.skipIf(skipWithoutRealCache())('LocRenderer matches the pinned draws', () => {
  it(
    'compares against the cache the goldens were recorded on',
    () => {
      expect(goldens).not.toBeNull();
      expect(cachePath && sha256File(cachePath)).toBe(goldens?.cache.sha256);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );

  it.each(
    Object.keys(goldens?.scenarios ?? {}),
  )('%s: own and GPU draws, with static scenery read back from its source, match the pinned digests', async (kind) => {
    const golden = goldens?.scenarios[kind];
    if (!golden) throw new Error(`Missing golden ${kind}`);
    const { loader, scenery } = await encounterScenery(kind);
    const play = (vertices: 'own' | 'gpu') =>
      recordLocDrawStream(withEmbeddedResidentMeshes(new LocRenderer()), loader, scenery, vertices, LOC_GOLDEN_DIGEST);

    const own = await play('own');
    const result = compareWithGolden(golden, own, await play('gpu'), () => false);

    expect(golden.frames.length).toBeGreaterThan(0);
    // The merged static scenery is drawn from its resident source, read back as the GPU would.
    expect(own.some((draw) => draw.meshId.startsWith('merged-static-locs'))).toBe(true);
    expect(result.ownMismatches).toEqual([]);
    expect(result.gpuMismatches).toEqual([]);
    expect(result.fixed).toEqual([]);
  }, 120_000);
});

const ATTRIBUTES = [
  'positions',
  'indices',
  'uvs',
  'perVertexTextureIds',
  'perVertexHslColors',
  'perVertexAlphas',
  'perVertexFaceBias',
  'tileCoords',
] as const satisfies readonly (keyof MeshUploadData)[];

/** Attribute and first differing byte of two builds, or null when every attribute is byte-identical. */
function firstUploadDifference(actual: readonly MeshUploadData[], expected: readonly MeshUploadData[]): string | null {
  if (actual.length !== expected.length) return `part count ${actual.length} != ${expected.length}`;
  for (const [index, part] of expected.entries()) {
    for (const attribute of ATTRIBUTES) {
      const a = actual[index]?.[attribute];
      const b = part[attribute];
      if ((a === undefined) !== (b === undefined)) return `part ${index} ${attribute} presence differs`;
      if (!a || !b) continue;
      const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (left.length !== right.length) return `part ${index} ${attribute} length ${left.length} != ${right.length}`;
      if (Buffer.compare(left, right) === 0) continue;
      for (let byte = 0; byte < left.length; byte++) {
        if (left[byte] !== right[byte]) return `part ${index} ${attribute} differs at byte ${byte}`;
      }
    }
  }
  return null;
}

describe.skipIf(skipWithoutRealCache())('LocRenderer resident static scenery on the real cache', () => {
  it.each([
    'yama_p3',
    'inferno',
  ])('%s: a rebuild uploads exactly the bytes of the first build, without reloading animated frames', async (kind) => {
    const { loader, scenery } = await encounterScenery(kind);
    const renderer = new LocRenderer();
    renderer.setTerrainHeights(scenery.terrainHeights);
    await renderer.load(loader, [...scenery.locs], scenery.options);
    const queue = createQueue();
    renderer.renderLocs(queue);
    const resident = queue.commands.filter(
      (command): command is ResidentMesh3DCommand => command.kind === 'mesh3d' && isResidentMesh3DCommand(command),
    );
    const source = resident[0]?.meshSource;
    if (!source) throw new Error('Expected resident static scenery');
    expect(new Set(resident.map((command) => command.meshSource))).toEqual(new Set([source]));

    const animatedLoads = vi.spyOn(loader, 'loadAnimatedLocMeshFrames');
    try {
      const first = source.materialize();
      const rebuilt = source.materialize();
      // Identity only: `not.toBe` deep-compares distinct values for its failure hint, seconds on real scenery.
      expect(rebuilt === first).toBe(false);
      expect(firstUploadDifference(rebuilt, first)).toBeNull();
      expect(rebuilt.map((part) => part.positions.length / 3)).toEqual(source.parts.map((part) => part.vertexCount));
      expect(animatedLoads).not.toHaveBeenCalled();
    } finally {
      animatedLoads.mockRestore();
    }
    renderer.dispose();
  }, 120_000);
});
