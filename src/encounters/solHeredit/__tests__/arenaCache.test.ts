import { afterEach, expect, it } from 'vitest';
import { toCollisionLocInput } from '../../../core/arena/collisionSpec';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../core/constants';
import { findNpcTileRoute } from '../../../core/npcRouteFinding';
import { CacheSystem } from '../../../rs/cache/CacheSystem';
import { analyzeWalkability, findContiguousRegion } from '../../../rs/collision/WalkabilityAnalyzer';
import { Bzip2 } from '../../../rs/compression/Bzip2';
import { ArchiveLocTypeLoader } from '../../../rs/config/loctype/LocTypeLoader';
import { MapLoader } from '../../../rs/map/MapLoader';
import { readCacheZipFiles } from '../../../test/helpers/cacheZipFiles';
import { findProjectCacheZip, skipWithoutRealCache } from '../../../test/helpers/real-cache';
import type { Coordinate } from '../../../types/simulation';
import {
  BEES_CAPTURE_A,
  BEES_CAPTURE_B,
  beeWindows,
  readBeeFrames,
} from '../../colosseum/modifiers/__tests__/beesCapture';
import { canBeeOccupy } from '../../colosseum/modifiers/bees';
import { SOL_BOUNDARY_WARRIORS } from '../arenaBoundary';

const cachePath = findProjectCacheZip() ?? '';
const originalArena = getArenaConfig();
const originalUnbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(originalArena, originalUnbounded));

it.skipIf(skipWithoutRealCache())(
  'closes the Sol arena and routes recorded bee windows around the real cached pillars',
  async () => {
    await Bzip2.initWasm();
    const files = await readCacheZipFiles(cachePath);
    const cache = CacheSystem.fromMap('dat2', files, [2, 5]);
    const locs = new ArchiveLocTypeLoader(
      { name: 'osrs-test', game: 'oldschool', environment: 'live', revision: 232, timestamp: '2024-01-01', size: 0 },
      cache.getIndex(2).getArchive(6),
    );
    const loader = new MapLoader(cache.getIndex(5));
    const terrain = await loader.loadMapSquare(28, 48);
    // Public map archive key: archive.openrs2.org/caches/2437/keys.json, mapsquare 7216.
    const locations = await loader.loadLocations(28, 48, [-614154723, 1856813096, 1740380664, -1655073354]);
    if (!terrain || !locations) throw new Error('Expected cached Colosseum map square');

    const analysis = analyzeWalkability(
      terrain,
      locations,
      (id) => locs.load(id),
      0,
      SOL_BOUNDARY_WARRIORS.map(toCollisionLocInput),
    );
    const region = findContiguousRegion(analysis.walkableTiles, 33, 31, analysis.collisionMap);

    const expected = new Set<string>();
    for (let x = 26; x <= 39; x++) {
      for (let y = 28; y <= 41; y++) {
        if ((x === 26 || x === 39) && (y === 28 || y === 41)) continue;
        expected.add(`${x},${y}`);
      }
    }
    expect(region).toEqual(expected);

    // Wave captures use the same baked map without Sol's dynamic warrior perimeter.
    setArenaConfig(analyzeWalkability(terrain, locations, (id) => locs.load(id), 0));
    const windows = [BEES_CAPTURE_A, BEES_CAPTURE_B].flatMap((file) => beeWindows(readBeeFrames(file)));
    const observed = windows.filter((window) => window.steps.length > 0);
    const reached = observed.filter((window) => window.complete && window.steps.length < 6);
    const missed: { tick: number; id: number; reached: boolean }[] = [];
    const missedGeometry: number[] = [];
    let detours = 0;
    for (const window of observed) {
      const destination = window.steps.at(-1)!.position;
      let naive: Coordinate = [...window.start];
      const straight = window.steps.every((step) => {
        naive = [naive[0] + Math.sign(destination[0] - naive[0]), naive[1] + Math.sign(destination[1] - naive[1])];
        return naive[0] === step.position[0] && naive[1] === step.position[1];
      });
      if (!straight) detours++;
      let position: Coordinate = [...window.start];
      const actual: { tick: number; position: Coordinate }[] = [];
      for (let offset = 0; offset < 12; offset += 2) {
        const route = findNpcTileRoute({
          source: position,
          destination,
          size: 2,
          canOccupy: canBeeOccupy,
          moveNear: false,
        });
        const step = route.kind === 'exact' ? route.steps[0] : undefined;
        if (step) {
          actual.push({ tick: window.tick + offset, position: step });
          position = step;
        }
      }
      if (JSON.stringify(actual) !== JSON.stringify(window.steps)) {
        missed.push({ tick: window.tick, id: window.id, reached: window.complete && window.steps.length < 6 });
      }
      if (
        JSON.stringify(actual.map((step) => step.position)) !==
        JSON.stringify(window.steps.map((step) => step.position))
      ) {
        missedGeometry.push(window.tick);
      }
    }
    expect(reached).toHaveLength(30);
    expect(observed).toHaveLength(80);
    expect(detours).toBe(10);
    expect(missedGeometry).toEqual([2415, 2648]);
    expect(missed.filter((window) => window.reached)).toEqual([]);
    // These endpoints belong to cutoff/death-interrupted windows, not established destinations.
    // Keep their conditional mismatches visible rather than fitting extra routing rules to them.
    expect(missed).toEqual([
      { tick: 2415, id: 63828, reached: false },
      { tick: 2648, id: 34219, reached: false },
      { tick: 2733, id: 34219, reached: false }, // Extra hold before the killing-tick crawl at B:2741.
    ]);
  },
  30_000,
);
