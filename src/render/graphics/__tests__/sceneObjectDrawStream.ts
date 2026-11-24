/**
 * Real-cache scene-object scenarios and a recorder for what reaches the GPU, shared by the
 * scene-object real-cache tests and `generateLocDrawGoldens.ts`.
 */
import { SimulationEngine } from '../../../core/SimulationEngine';
import { SolHereditEncounter } from '../../../encounters/solHeredit/SolHereditEncounter';
import { SolHereditSceneObjectController } from '../../../encounters/solHeredit/SolHereditSceneObjectController';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import { openTestCache } from '../../../test/helpers/cacheFixtures';
import { type DrawDigestOptions, type DrawRecord, MeshDrawRecorder } from '../../../test/helpers/meshDrawStream';
import type { SimulationState } from '../../../types/simulation';
import { createQueue, type RenderQueue } from '../../core/commands';
import type { SceneObjectLocData, SceneObjectLocModelLoader } from '../SceneObjectRenderer';
import type { SceneObjectSpec } from '../sceneObjectTypes';

type Spec = SceneObjectSpec<SceneObjectLocData>;

/** The public surface of a scene-object renderer, so another revision can replay the same steps. */
export interface SceneObjectRendererLike {
  setTerrainHeights(heights: Int32Array[] | null): void;
  sync(specs: readonly Spec[], currentTick: number): void;
  render(queue: RenderQueue, currentTick: number, interpolatedTick: number): void;
  clear(): void;
  resetTimeline(): void;
}

export type ScenarioStep =
  | {
      readonly kind: 'frame';
      readonly tick: number;
      readonly interpolatedTick: number;
      readonly specs: readonly Spec[];
    }
  | { readonly kind: 'terrain'; readonly heights: Int32Array[] | null }
  | { readonly kind: 'resetTimeline' }
  /** A scene restart or timeline swap: the compositor clears its scene objects. */
  | { readonly kind: 'clear' }
  /** WebGL context loss and restore (or VAO eviction): every GPU mesh is rebuilt from the next command. */
  | { readonly kind: 'contextRestore' };

export interface Scenario {
  readonly name: string;
  readonly steps: readonly ScenarioStep[];
}

export interface RealCacheFixture {
  readonly loader: SceneObjectLocModelLoader;
  readonly scenarios: readonly Scenario[];
}

const IDENTITY = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export async function loadRealCacheFixture(cachePath: string): Promise<RealCacheFixture> {
  const { loader, maps } = await openTestCache(cachePath);
  const terrain = await maps.loadMapSquare(28, 48);
  // Public map archive key: archive.openrs2.org/caches/2437/keys.json, mapsquare 7216.
  const placed = await maps.loadLocations(28, 48, [-614154723, 1856813096, 1740380664, -1655073354]);
  const heights = terrain?.tileHeights[0];
  if (!heights || !placed) throw new Error('Expected cached Colosseum map square');

  const colosseumSpecs: Spec[] = [];
  // Repeated cache scenery from the arena map: un-contoured trees, plants and floor decorations, and
  // terrain-contoured floor decorations that must stay per placement.
  for (const locId of [51762, 42400, 50847, 51805, 10845]) {
    const placements = placed.locations.filter((location) => location.id === locId && location.level === 0);
    for (const location of placements.slice(0, 16)) {
      colosseumSpecs.push(
        locSpec(`map-${locId}-${location.localX}-${location.localY}-${location.type}`, {
          locId,
          modelType: location.type as LocModelType,
          rotation: location.rotation,
          seqId: -1,
          localX: location.localX,
          localY: location.localY,
        }),
      );
    }
  }

  // Animated cache LOCs placed many times with every rotation, model type and phase: a balloon
  // (types 10 and 2), a lamp, a wall decoration and a wall, and a contoured copy forced through
  // the spec override so animated terrain-following geometry is covered too.
  const animatedSpecs: Spec[] = [];
  const animated: readonly [number, LocModelType][] = [
    [115, LocModelType.NORMAL],
    [115, LocModelType.WALL_CORNER],
    [201, LocModelType.NORMAL],
    [196, LocModelType.WALL_DECORATION_INSIDE],
    [715, LocModelType.WALL],
  ];
  for (const [index, [locId, modelType]] of animated.entries()) {
    for (let copy = 0; copy < 8; copy++) {
      animatedSpecs.push(
        locSpec(
          `anim-${locId}-${modelType}-${copy}`,
          {
            locId,
            modelType,
            rotation: copy % 4,
            seqId: -1,
            localX: 26 + copy,
            localY: 28 + index * 2,
            ...(copy % 3 === 0 ? { animationStartTick: copy } : {}),
            ...(copy === 7 ? { contouredGround: 0 } : {}),
          },
          copy === 5 ? { kind: 'oneShot', startTick: 1, durationTicks: 3 } : { kind: 'sync' },
        ),
      );
    }
  }

  return {
    loader,
    scenarios: [
      solScenario(heights),
      specListScenario('Colosseum map scenery', heights, colosseumSpecs),
      specListScenario('animated cache LOCs', heights, animatedSpecs),
    ],
  };
}

function locSpec(
  id: string,
  data: Omit<SceneObjectLocData, 'kind'>,
  lifecycle: Spec['lifecycle'] = { kind: 'sync' },
): Spec {
  return {
    id,
    meshId: id,
    materialId: 'osrs-npc',
    modelMatrix: IDENTITY(),
    lifecycle,
    classification: data.modelType === LocModelType.FLOOR_DECORATION ? 'groundDecal' : 'sceneMesh',
    data: { kind: 'loc', ...data },
  };
}

/** Sol through its own controller: 48 boundary warriors, pools spawning on different ticks, despawn. */
function solScenario(heights: Int32Array[]): Scenario {
  const initial = new SimulationEngine({ encounter: new SolHereditEncounter(7), combatSeed: 1 }).getState();
  const snapshot = initial.encounter;
  if (snapshot.kind !== 'sol_heredit') throw new Error('Expected a Sol snapshot');
  const tiles: [number, number][] = [];
  for (let x = 28; x <= 37; x++) for (const y of [31, 34, 37]) tiles.push([x, y]);
  const withSand = (sandTiles: readonly [number, number][], despawnTick?: number): SimulationState => ({
    ...initial,
    encounter: {
      ...snapshot,
      state: { ...snapshot.state, sandTiles, sandDespawning: despawnTick !== undefined },
    },
    encounterOutcome:
      despawnTick === undefined
        ? { phase: 'active' }
        : {
            phase: 'resolving',
            decisiveTick: despawnTick,
            completionTick: despawnTick + 9,
            primaryActorId: 'sol',
            completionActorIds: [],
          },
  });
  const controller = new SolHereditSceneObjectController();
  const specs = (state: SimulationState, tick: number) =>
    controller.update({ currentTick: tick, interpolatedTick: tick, state, terrainHeights: heights });
  const half = tiles.slice(0, 15);
  const fewer = tiles.filter((_, index) => index % 3 !== 0);
  const steps: ScenarioStep[] = [{ kind: 'terrain', heights }];
  const frame = (tick: number, state: SimulationState, fractions = [0, 0.37, 0.81]) => {
    for (const fraction of fractions) {
      steps.push({ kind: 'frame', tick, interpolatedTick: tick + fraction, specs: specs(state, tick) });
    }
  };
  frame(0, withSand([]));
  frame(1, withSand(half));
  frame(2, withSand(tiles));
  frame(3, withSand(fewer));
  frame(4, withSand(tiles));
  steps.push({ kind: 'contextRestore' });
  frame(5, withSand(tiles));
  frame(6, withSand(tiles, 6));
  steps.push({ kind: 'resetTimeline' });
  frame(7, withSand(tiles, 6));
  steps.push({ kind: 'clear' });
  frame(0, withSand([]));
  frame(1, withSand(half));
  frame(2, withSand([]), [0]);
  // Leaving the encounter: the controller publishes nothing for another snapshot.
  steps.push({ kind: 'frame', tick: 3, interpolatedTick: 3, specs: [] });
  return { name: 'Sol Heredit', steps };
}

/** Spawn, phase sampling, despawn and respawn, seek, context restore, terrain change and restart. */
function specListScenario(name: string, heights: Int32Array[], specs: readonly Spec[]): Scenario {
  const despawned = specs.filter((_, index) => index % 3 !== 1);
  const steps: ScenarioStep[] = [{ kind: 'terrain', heights }];
  const frame = (tick: number, live: readonly Spec[], fractions = [0, 0.29, 0.63, 0.94]) => {
    for (const fraction of fractions)
      steps.push({ kind: 'frame', tick, interpolatedTick: tick + fraction, specs: live });
  };
  for (let tick = 0; tick < 4; tick++) frame(tick, specs);
  frame(4, despawned);
  frame(5, specs);
  steps.push({ kind: 'resetTimeline' });
  frame(2, specs);
  steps.push({ kind: 'contextRestore' });
  frame(3, specs);
  const raised = heights.map((column, x) => column.map((height, y) => height - ((x * 7 + y * 3) % 5) * 16));
  steps.push({ kind: 'terrain', heights: raised });
  frame(4, specs);
  steps.push({ kind: 'clear' });
  frame(0, specs);
  frame(1, [], [0]);
  return { name, steps };
}

export type { DrawRecord } from '../../../test/helpers/meshDrawStream';

/** Normals are not uploaded for scene-base meshes, so the goldens do not compare them. */
export const SCENE_OBJECT_GOLDEN_DIGEST: DrawDigestOptions = { omitNormals: true };

/** Plays a scenario and returns one record per draw, in draw order; see {@link MeshDrawRecorder}. */
export function recordDrawStream(
  renderer: SceneObjectRendererLike,
  scenario: Scenario,
  vertices: 'gpu' | 'own',
  digest: DrawDigestOptions = {},
): DrawRecord[] {
  const recorder = new MeshDrawRecorder(vertices, digest);
  for (const step of scenario.steps) {
    switch (step.kind) {
      case 'terrain':
        renderer.setTerrainHeights(step.heights);
        break;
      case 'resetTimeline':
        renderer.resetTimeline();
        break;
      case 'clear':
        renderer.clear();
        break;
      case 'contextRestore':
        recorder.contextRestore();
        break;
      case 'frame': {
        const queue = createQueue();
        renderer.sync(step.specs, step.tick);
        renderer.render(queue, step.tick, step.interpolatedTick);
        recorder.frame(queue.commands);
        break;
      }
    }
  }
  return recorder.records;
}
