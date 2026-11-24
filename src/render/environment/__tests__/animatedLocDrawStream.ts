/**
 * Real-cache encounter scenery and a recorder for what `LocRenderer` draws, shared by the
 * animated-loc real-cache tests and `generateLocDrawGoldens.ts`.
 */
import type { LocWithType } from '../../../cache/CacheManager';
import { encounterRegistry } from '../../../encounters/registry';
import type { LocModelLoader } from '../../../rs/config/loctype/LocModelLoader';
import type { LocModelType } from '../../../rs/config/loctype/LocModelType';
import type { MapLoader, MapSquareData } from '../../../rs/map/MapLoader';
import {
  createTerrainContext,
  getMapSquareBlock,
  getTerrainContextLoadOffsets,
  type MapSquareOffsets,
} from '../../../rs/map/mapSquareBlock';
import { type DrawDigestOptions, type DrawRecord, MeshDrawRecorder } from '../../../test/helpers/meshDrawStream';
import { createQueue, type RenderQueue } from '../../core/commands';
import { resolveEncounterLocRenderOptions } from '../../scene/encounterLocRenderOptions';
import { getEncounterRenderConfig } from '../../scene/encounterRenderConfig';
import { resolveLocRenderFilter, resolveRenderLoc } from '../locRenderFilter';
import type { LocRenderOptions } from '../locRenderOptions';

export interface EncounterScenery {
  readonly name: string;
  readonly locs: readonly LocWithType[];
  readonly options: LocRenderOptions | undefined;
  readonly terrainHeights: Int32Array[] | null;
}

/** The public surface of a loc renderer, so another revision can replay the same scene. */
export interface LocRendererLike {
  setTerrainHeights(heights: Int32Array[] | null): void;
  load(loader: LocModelLoader, locs: LocWithType[], options?: LocRenderOptions): Promise<void>;
  renderLocs(queue: RenderQueue): void;
  dispose(): void;
}

/**
 * Public map archive keys for the project test cache: archive.openrs2.org/caches/2437/keys.json.
 * The Inferno's neighboring squares (l35_84, l36_83, l35_82, l34_83) have no published key there, so only
 * its core square's locs load.
 */
const TEST_CACHE_MAP_KEYS: Readonly<Record<string, readonly number[]>> = {
  '23,157': [-1808710597, 1603394469, 488134396, -1772243966],
  '35,83': [1790859086, -129964091, 1829839961, -469727662],
};

/** Yama's and the Inferno's map scenery with their encounters' own loc-render options. */
export async function loadEncounterSceneries(
  loader: LocModelLoader,
  maps: MapLoader,
): Promise<readonly EncounterScenery[]> {
  const sceneries: EncounterScenery[] = [];
  for (const kind of ['yama_p3', 'inferno']) {
    const descriptor = encounterRegistry.getDescriptorForKind(kind);
    if (!descriptor) throw new Error(`No descriptor for ${kind}`);
    sceneries.push(
      await loadEncounterScenery(
        loader,
        maps,
        kind,
        descriptor.mapSquare,
        descriptor.mapSquareOffsets as MapSquareOffsets | undefined,
        resolveEncounterLocRenderOptions(getEncounterRenderConfig(kind)),
      ),
    );
  }
  return sceneries;
}

/**
 * Normals are not uploaded for scene-base meshes and static merged LOC meshes carry no alphas, so
 * the goldens compare neither. Static merged meshes are the draws without a frame in their id.
 */
export const LOC_GOLDEN_DIGEST: DrawDigestOptions = {
  omitNormals: true,
  omitAlphas: (meshId) => !meshId.includes('-frame-'),
};

/** An encounter's map locs as `CacheManager.loadMapLocs` assembles them. */
export async function loadEncounterScenery(
  loader: LocModelLoader,
  maps: MapLoader,
  name: string,
  mapSquare: { readonly x: number; readonly y: number },
  offsets: MapSquareOffsets = [{ dx: 0, dy: 0 }],
  options?: LocRenderOptions,
): Promise<EncounterScenery> {
  const terrain = new Map<string, MapSquareData>();
  for (const { dx, dy } of getTerrainContextLoadOffsets(offsets)) {
    const square = await maps.loadMapSquare(mapSquare.x + dx, mapSquare.y + dy);
    if (square) terrain.set(`${mapSquare.x + dx},${mapSquare.y + dy}`, square);
  }
  const locs: LocWithType[] = [];
  for (const { dx, dy, tileOffsetX, tileOffsetY } of getMapSquareBlock(offsets)) {
    const squareX = mapSquare.x + dx;
    const squareY = mapSquare.y + dy;
    const square = terrain.get(`${squareX},${squareY}`);
    const key = TEST_CACHE_MAP_KEYS[`${squareX},${squareY}`];
    const placed = square ? await maps.loadLocations(squareX, squareY, key ? [...key] : undefined) : undefined;
    if (!square || !placed) continue;
    const context = createTerrainContext(square, (x, y) => terrain.get(`${x},${y}`));
    for (const location of placed.locations) {
      const locType = loader.loadLocType(location.id);
      if (!locType) continue;
      locs.push({
        location: { ...location, localX: location.localX + tileOffsetX, localY: location.localY + tileOffsetY },
        locType,
        modelType: location.type as LocModelType,
        mapSquareOffset: { x: tileOffsetX, y: tileOffsetY },
        terrainHeightPlanes: context.tileHeights,
        terrainContextOrigin: { x: context.coreOriginX, y: context.coreOriginY },
      });
    }
  }
  const core = terrain.get(`${mapSquare.x},${mapSquare.y}`);
  return { name, locs, options, terrainHeights: core?.tileHeights[0] ?? null };
}

/**
 * The same scene with sharing impossible: every loc is given its own id, which the loader maps
 * back to the real one, so no two placements have the same loader inputs. Filtering and
 * replacements are resolved first because they match cache ids.
 */
export function withUniqueLocIds(
  loader: LocModelLoader,
  scenery: EncounterScenery,
): {
  loader: LocModelLoader;
  scenery: EncounterScenery;
} {
  const filter = resolveLocRenderFilter(scenery.options);
  const realIds = new Map<number, number>();
  const locs: LocWithType[] = [];
  for (const entry of scenery.locs) {
    const resolved = resolveRenderLoc(entry, filter, loader);
    if (!resolved) continue;
    const id = 10_000_000 + locs.length;
    realIds.set(id, resolved.location.id);
    locs.push({ ...entry, location: { ...resolved.location, id }, locType: resolved.locType });
  }
  const real = (id: number) => realIds.get(id) ?? id;
  const unique: LocModelLoader = Object.create(loader);
  unique.loadLocType = (id) => loader.loadLocType(real(id));
  unique.loadAnimatedLocMeshFrames = (id, ...rest) => loader.loadAnimatedLocMeshFrames(real(id), ...rest);
  unique.loadLocMesh = (id, ...rest) => loader.loadLocMesh(real(id), ...rest);
  const everything = { minX: -1_000_000, maxX: 1_000_000, minY: -1_000_000, maxY: 1_000_000 };
  return {
    loader: unique,
    scenery: { ...scenery, locs, options: { bounds: everything, marginTiles: 0, levels: [0, 1, 2, 3] } },
  };
}

/**
 * Loads the scene and draws it over virtual time: phase sampling across many animation frames,
 * a context restore, then a restart (`dispose` and a fresh load) drawn again. Animation start
 * phases come from `Math.random`, seeded identically for every run.
 */
export async function recordLocDrawStream(
  renderer: LocRendererLike,
  loader: LocModelLoader,
  scenery: EncounterScenery,
  vertices: 'gpu' | 'own',
  digest: DrawDigestOptions = {},
): Promise<DrawRecord[]> {
  const recorder = new MeshDrawRecorder(vertices, digest);
  const realNow = performance.now;
  const realRandom = Math.random;
  let now = 1_000;
  const setNow = (value: () => number) =>
    Object.defineProperty(performance, 'now', { configurable: true, writable: true, value });
  setNow(() => now);
  try {
    const load = async () => {
      Math.random = mulberry32(7);
      renderer.setTerrainHeights(scenery.terrainHeights);
      await renderer.load(loader, [...scenery.locs], scenery.options);
      Math.random = realRandom;
    };
    const draw = (frames: number) => {
      for (let frame = 0; frame < frames; frame++) {
        now += 97;
        const queue = createQueue();
        renderer.renderLocs(queue);
        recorder.frame(queue.commands);
      }
    };
    await load();
    draw(24);
    recorder.contextRestore();
    draw(12);
    renderer.dispose();
    await load();
    draw(12);
    renderer.dispose();
  } finally {
    setNow(realNow);
    Math.random = realRandom;
  }
  return recorder.records;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
