import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOLTEN_SAND_DESPAWN_SEQ_ID } from '../../../encounters/solHeredit/SolHereditSceneObjectController';
import { MOLTEN_SAND_LOC_ID } from '../../../npcs/colosseum/constants';
import { sha256File } from '../../../test/helpers/cacheFixtures';
import { compareWithGolden, type DrawGoldenFile, firstDrawDifference } from '../../../test/helpers/meshDrawStream';
import {
  findProjectCacheZip,
  REAL_CACHE_TEST_TIMEOUT_MS,
  skipWithoutRealCache,
} from '../../../test/helpers/real-cache';
import type { NpcMesh3DCommand, RenderQueue } from '../../core/commands';
import { type SceneObjectLocData, type SceneObjectLocModelLoader, SceneObjectRenderer } from '../SceneObjectRenderer';
import type { SceneObjectSpec } from '../sceneObjectTypes';
import {
  type DrawRecord,
  loadRealCacheFixture,
  type RealCacheFixture,
  recordDrawStream,
  SCENE_OBJECT_GOLDEN_DIGEST,
  type SceneObjectRendererLike,
} from './sceneObjectDrawStream';

type Spec = SceneObjectSpec<SceneObjectLocData>;

/**
 * Isolated renderers: the current renderer once per spec, so no two placements can share a bake,
 * drawn in the order the renderer's object map keeps (a spawn appends, a re-bake keeps its slot,
 * a despawn frees it), under per-spec mesh ids `${spec.meshId}-frame-N-part`. It runs the code
 * under test, so comparing against it proves that sharing changes nothing, not that baking or
 * frame selection are right; the pinned goldens below check those against HEAD.
 */
class PerPlacementRenderers implements SceneObjectRendererLike {
  private readonly renderers = new Map<string, SceneObjectRenderer>();
  private order: string[] = [];
  private heights: Int32Array[] | null = null;

  constructor(private readonly loader: SceneObjectLocModelLoader) {}

  setTerrainHeights(heights: Int32Array[] | null): void {
    this.heights = heights;
    for (const renderer of this.renderers.values()) renderer.setTerrainHeights(heights);
  }

  sync(specs: readonly Spec[], currentTick: number): void {
    const live = new Map(specs.map((spec) => [spec.id, spec]));
    for (const spec of specs) {
      if (this.renderers.has(spec.id)) continue;
      const renderer = new SceneObjectRenderer(this.loader);
      renderer.setTerrainHeights(this.heights);
      this.renderers.set(spec.id, renderer);
    }
    for (const [id, renderer] of this.renderers) {
      const spec = live.get(id);
      renderer.sync(spec ? [spec] : [], currentTick);
    }
    this.order = this.order.filter((id) => this.isLive(id));
    for (const spec of specs) {
      if (this.isLive(spec.id) && !this.order.includes(spec.id)) this.order.push(spec.id);
    }
  }

  render(queue: RenderQueue, currentTick: number, interpolatedTick: number): void {
    for (const id of this.order) {
      const renderer = this.renderers.get(id);
      const spec = renderer?.['objects'].get(id)?.spec;
      const from = queue.commands.length;
      renderer?.render(queue, currentTick, interpolatedTick);
      for (let index = from; index < queue.commands.length; index++) {
        const command = queue.commands[index];
        if (spec && command?.kind === 'mesh3d') {
          command.meshId = command.meshId.replace(/^scene-object-loc:.*?(-frame-\d+-)/, `${spec.meshId}$1`);
        }
      }
    }
    this.order = this.order.filter((id) => this.isLive(id));
  }

  clear(): void {
    for (const renderer of this.renderers.values()) renderer.clear();
    this.order = [];
  }

  resetTimeline(): void {
    for (const renderer of this.renderers.values()) renderer.resetTimeline();
  }

  private isLive(id: string): boolean {
    return (this.renderers.get(id)?.['objects'].size ?? 0) > 0;
  }
}

/** Counts loader bakes, so the test can show the shared renderer skipped repeated work. */
function countingLoader(loader: SceneObjectLocModelLoader): SceneObjectLocModelLoader & { loads: number } {
  const counted = {
    loads: 0,
    loadLocType: loader.loadLocType?.bind(loader),
    loadSeqType: loader.loadSeqType?.bind(loader),
    loadLocMesh: (...args: Parameters<NonNullable<SceneObjectLocModelLoader['loadLocMesh']>>) => {
      counted.loads++;
      return loader.loadLocMesh?.(...args);
    },
    loadAnimatedLocMeshFrames: (...args: Parameters<SceneObjectLocModelLoader['loadAnimatedLocMeshFrames']>) => {
      counted.loads++;
      return loader.loadAnimatedLocMeshFrames(...args);
    },
  };
  return counted;
}

const SHARED_PREFIX = 'scene-object-loc:';

function expectSameDraws(actual: readonly DrawRecord[], expected: readonly DrawRecord[]): void {
  expect(firstDrawDifference(actual, expected)).toBeNull();
}

const cachePath = findProjectCacheZip();
let fixture: Promise<RealCacheFixture> | undefined;
const loadFixture = () => {
  if (!cachePath) throw new Error('Expected the project cache');
  fixture ??= loadRealCacheFixture(cachePath);
  return fixture;
};

describe.skipIf(skipWithoutRealCache())(
  'SceneObjectRenderer sharing isolation on the real cache (vs isolated renderers)',
  () => {
    it.each([
      'Sol Heredit',
      'Colosseum map scenery',
      'animated cache LOCs',
    ])('%s: sharing leaves every draw, its order and frame as isolated renderers draw them, through spawn, despawn, seek, restore and restart', async (name) => {
      const { loader, scenarios } = await loadFixture();
      const scenario = scenarios.find((candidate) => candidate.name === name);
      if (!scenario) throw new Error(`Missing scenario ${name}`);
      const play = (vertices: 'gpu' | 'own', perPlacement: boolean) => {
        const counted = countingLoader(loader);
        const renderer = perPlacement ? new PerPlacementRenderers(counted) : new SceneObjectRenderer(counted);
        return { draws: recordDrawStream(renderer, scenario, vertices), loads: counted.loads, renderer };
      };
      const baseline = play('own', true);
      const shared = play('own', false);
      const sharedOnGpu = play('gpu', false).draws;
      const baselineOnGpu = play('gpu', true).draws;

      // 1. What each placement bakes and draws (order, frame, matrix, render state, vertices and
      // colors) is exactly the per-placement bake.
      expect(shared.draws.length).toBeGreaterThan(0);
      expectSameDraws(shared.draws, baseline.draws);
      expect(shared.loads).toBeLessThan(baseline.loads);
      // 2. What the GPU draws from a mesh-id keyed cache: shared geometry always serves its own
      // bake, through context restores, re-bakes and restarts. Contoured geometry keeps the
      // per-placement ids, so it behaves on the GPU exactly as before.
      expectSameDraws(
        sharedOnGpu.filter((draw) => draw.meshId.startsWith(SHARED_PREFIX)),
        shared.draws.filter((draw) => draw.meshId.startsWith(SHARED_PREFIX)),
      );
      expectSameDraws(
        sharedOnGpu.filter((draw) => !draw.meshId.startsWith(SHARED_PREFIX)),
        baselineOnGpu.filter((_, index) => !shared.draws[index]?.meshId.startsWith(SHARED_PREFIX)),
      );
      if (name !== 'Sol Heredit') {
        expect(shared.draws.some((draw) => !draw.meshId.startsWith(SHARED_PREFIX))).toBe(true);
      }
      // The scenario ends with nothing live, so nothing is left cached.
      const renderer = shared.renderer as SceneObjectRenderer;
      expect(renderer['objects'].size).toBe(0);
      expect(renderer['sharedGeometry'].size).toBe(0);
    }, 120_000);

    it('Sol: per-spec mesh ids would reuse idle-sequence GPU meshes after the despawn switch, which is why shared ids include the sequence', async () => {
      // A pool keeps its spec meshId when its sequence changes, so per-spec ids reuse the GPU meshes
      // uploaded for the idle sequence's frames. The pinned goldens record the baseline renderer
      // doing exactly that.
      const { loader, scenarios } = await loadFixture();
      const sol = scenarios.find((scenario) => scenario.name === 'Sol Heredit');
      if (!sol) throw new Error('Missing Sol scenario');
      const baked = recordDrawStream(new PerPlacementRenderers(loader), sol, 'own');
      const onGpu = recordDrawStream(new PerPlacementRenderers(loader), sol, 'gpu');
      const stale = onGpu.filter((draw, index) => draw.line !== baked[index]?.line);
      expect(stale.length).toBeGreaterThan(0);
      expect(stale.every((draw) => draw.meshId.startsWith('sol-sand-'))).toBe(true);
    }, 120_000);

    it('mesh-id coherence: each shared id has one set of arrays per frame and one content across re-bakes', async () => {
      const { loader, scenarios } = await loadFixture();
      const renderer = new SceneObjectRenderer(loader);
      // Content per shared id across the whole run, re-bakes after a restart included.
      type Content = readonly (Buffer | undefined)[];
      const contentById = new Map<string, Content>();
      // The bytes, compared natively: stringifying every vertex of every frame dominated this test.
      const content = (command: NpcMesh3DCommand): Content =>
        [command.positions, command.normals, command.perVertexHslColors, command.perVertexAlphas, command.uvs].map(
          (array) => (array ? Buffer.from(array.buffer, array.byteOffset, array.byteLength) : undefined),
        );
      const sameContent = (a: Content, b: Content) =>
        a.every((bytes, index) => (bytes && b[index] ? bytes.equals(b[index]) : bytes === b[index]));
      for (const scenario of scenarios) {
        renderer.clear();
        for (const step of scenario.steps) {
          if (step.kind === 'terrain') renderer.setTerrainHeights(step.heights);
          if (step.kind === 'clear') renderer.clear();
          if (step.kind !== 'frame') continue;
          renderer.sync(step.specs, step.tick);
          // Within one frame, placements sharing an id share the very same arrays.
          const live = new Map<string, NpcMesh3DCommand>();
          for (const object of renderer['objects'].values()) {
            for (const command of object.frameCommands.flat()) {
              const first = live.get(command.meshId) ?? command;
              live.set(command.meshId, first);
              expect(command.positions).toBe(first.positions);
              expect(command.perVertexHslColors).toBe(first.perVertexHslColors);
              if (!command.meshId.startsWith('scene-object-loc:') || first !== command) continue;
              // A copy: the arrays could be rewritten in place by a later bake.
              const known =
                contentById.get(command.meshId) ?? content(command).map((bytes) => bytes && Buffer.from(bytes));
              contentById.set(command.meshId, known);
              expect(sameContent(content(command), known)).toBe(true);
            }
          }
        }
      }
      expect(contentById.size).toBeGreaterThan(0);
    }, 120_000);

    it("sharing effect: bakes Sol's 48 boundary warriors once per variant and rotation", async () => {
      const { loader, scenarios } = await loadFixture();
      const sol = scenarios.find((scenario) => scenario.name === 'Sol Heredit');
      const first = sol?.steps.find((step) => step.kind === 'frame');
      if (first?.kind !== 'frame') throw new Error('Expected a Sol frame');
      const warriors = first.specs.filter((spec) => spec.id.startsWith('sol-boundary-'));
      const counted = countingLoader(loader);
      const renderer = new SceneObjectRenderer(counted);
      renderer.sync(warriors, 0);

      const objects = [...renderer['objects'].values()];
      const commands = objects.flatMap((object) => object.frameCommands.flat());
      const variants = new Set(warriors.map(({ data }) => `${data?.locId}:${data?.rotation}`)).size;
      const arrayBytes = (unique: boolean) => {
        const seen = new Set<Float32Array>();
        let total = 0;
        for (const command of commands) {
          for (const array of [
            command.positions,
            command.normals,
            command.perVertexHslColors,
            command.perVertexAlphas,
            command.perVertexFaceBias,
            command.uvs,
            command.perVertexTextureIds,
          ]) {
            if (!array || (unique && seen.has(array))) continue;
            seen.add(array);
            total += array.byteLength;
          }
        }
        return total;
      };
      const meshIds = new Set(commands.map((command) => command.meshId));

      // K's arrangement uses 18 of the 24 variant/rotation pairs, each one 16-frame sequence.
      expect(warriors).toHaveLength(48);
      expect(variants).toBe(18);
      expect(new Set(objects.map((object) => object.frameCommands.length))).toEqual(new Set([16]));
      expect(counted.loads).toBe(variants);
      expect(renderer['sharedGeometry'].size).toBe(variants);
      // Each frame is one or two alpha parts; unshared it would be 48 x 16 frames of them.
      expect(meshIds.size).toBeLessThanOrEqual(variants * 16 * 2);
      expect(commands.length / meshIds.size).toBeCloseTo(48 / variants, 0);
      expect(arrayBytes(true)).toBeLessThan(arrayBytes(false) / 2);
    }, 120_000);
  },
);

const goldensPath = resolve(__dirname, 'sceneObjectDrawGoldens.json');
const goldens = existsSync(goldensPath) ? (JSON.parse(readFileSync(goldensPath, 'utf-8')) as DrawGoldenFile) : null;

/**
 * The one expected difference from the pinned digests. A sand pool keeps its spec meshId when it
 * switches from its idle sequence to the despawn sequence; the baseline renderer keyed GPU meshes by
 * that id, so its digests draw the idle frames' GPU meshes for the despawn frames with the same
 * index. Shared ids include the sequence, so the current renderer draws each despawn frame's own
 * bake (which, through the own-vertex frame digests, matches the baseline's own bake of that
 * sequence).
 */
function isExpectedSandPoolDifference(scenario: string, goldenMeshId: string, current: DrawRecord): boolean {
  return (
    scenario === 'Sol Heredit' &&
    goldenMeshId.startsWith('sol-sand-') &&
    current.meshId.startsWith(`scene-object-loc:${MOLTEN_SAND_LOC_ID}:`) &&
    current.meshId.includes(`:${MOLTEN_SAND_DESPAWN_SEQ_ID}-frame-`)
  );
}
const EXPECTED_SAND_POOL_DIFFERENCES = 30;

describe.skipIf(skipWithoutRealCache())('SceneObjectRenderer matches the pinned draws', () => {
  it(
    'compares against the cache the goldens were recorded on',
    () => {
      expect(goldens).not.toBeNull();
      expect(cachePath && sha256File(cachePath)).toBe(goldens?.cache.sha256);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );

  it.each(Object.keys(goldens?.scenarios ?? {}))('%s: own and GPU draws match the pinned digests', async (name) => {
    const { loader, scenarios } = await loadFixture();
    const scenario = scenarios.find((candidate) => candidate.name === name);
    const golden = goldens?.scenarios[name];
    if (!scenario || !golden) throw new Error(`Missing scenario ${name}`);
    const play = (vertices: 'own' | 'gpu') =>
      recordDrawStream(new SceneObjectRenderer(loader), scenario, vertices, SCENE_OBJECT_GOLDEN_DIGEST);

    const result = compareWithGolden(golden, play('own'), play('gpu'), (meshId, current) =>
      isExpectedSandPoolDifference(name, meshId, current),
    );

    expect(result.ownMismatches).toEqual([]);
    expect(result.gpuMismatches).toEqual([]);
    // Exactly the documented sand-pool draws differ, and every stale sand draw in the baseline is one.
    const goldenSandStale = golden.gpuStale.filter(([, , meshId]) => meshId.startsWith('sol-sand-'));
    expect(result.fixed).toHaveLength(name === 'Sol Heredit' ? EXPECTED_SAND_POOL_DIFFERENCES : 0);
    expect(result.fixed.map(([frame, draw]) => `${frame}:${draw}`)).toEqual(
      goldenSandStale.map(([frame, draw]) => `${frame}:${draw}`),
    );
  }, 120_000);
});
