import { describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { YAMA_SPAWN_FIREBALL_COMMAND, YAMA_SPAWN_VOID_FLARE_COMMAND } from '../../../encounters/yamaP3/commands';
import { YamaEncounter } from '../../../encounters/yamaP3/YamaEncounter';
import type { SimulationState } from '../../../types/simulation';
import { log } from '../../../util/Logger';
import type { Projection2D } from '../../core/camera';
import type { RenderQueue } from '../../core/commands';
import type { FightStartCountdownPhase, SceneObjectFrameContext } from '../../graphics/sceneObjectTypes';
import type { SceneOptions } from '../types';
import { YamaSceneCompositor } from '../YamaSceneCompositor';

const projection: Projection2D = {
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

describe('YamaSceneCompositor practice spawns', () => {
  it('draws practice fireballs and void flares while both mechanic toggles are off', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 37] });
    engine.setMechanicsConfig({
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });
    engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);
    engine.queueEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    // Commands land on tick 1: the flare activates on 4, the first fireball set falls from 3.
    for (let tick = 1; tick <= 4; tick++) engine.advanceTick([31, 37]);
    const state = engine.getState();
    const yama = new YamaSceneCompositor();
    yama['effectTick'] = state.currentTick;
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };

    yama['renderEncounterEffectsLate'](queue, projection, 4, 4, state, state.mechanicsConfig, true, {
      renderMode: '2d',
    } as SceneOptions);

    const fireballGlyphs = queue.commands.filter((command) => command.kind === 'circle2d');
    // Flare tiles and charge bar share the void flare's z layers (35/36).
    const flareCommands = queue.commands.filter(
      (command) => command.kind === 'poly2d' && (command.zIndex === 35 || command.zIndex === 36),
    );
    expect(fireballGlyphs.length).toBeGreaterThan(0);
    expect(flareCommands).toHaveLength(5);
    yama.dispose();
  });
});

describe('SceneCompositor scene objects', () => {
  it("hands each frame's fight-start countdown to the scene-object controller", () => {
    const update = vi.fn((_context: SceneObjectFrameContext<SimulationState>) => []);
    const yama = new YamaSceneCompositor();
    yama.setEncounterRenderConfig({ createSceneObjectController: () => ({ consumeEvents: () => {}, update }) });
    yama['setSceneObjectLocModelLoader']({ loadAnimatedLocMeshFrames: () => undefined });
    const state = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 37] }).getState();
    const draw = (fightStartCountdown?: FightStartCountdownPhase) =>
      yama.build(
        {
          simulationState: state,
          events: [],
          interpolatedTick: 0,
          speedMultiplier: 1,
          options: {
            renderMode: '3d',
            showCoordinates: false,
            showNpcClickbox: false,
            showTileMarkers: false,
            showTileMarkerLabels: false,
            showLineMarkers: false,
            showLineMarkerLabels: false,
            smoothTerrain: false,
            brightness: 1,
            contrast: 1,
            saturation: 1,
            encounterDebugFlags: {},
          },
          interaction: { hoveredTile: null, targetTile: null },
          ...(fightStartCountdown ? { fightStartCountdown } : {}),
        },
        projection,
        { width: 800, height: 600, dpr: 1 },
      );

    draw('holding');
    draw('released');
    draw();

    expect(update.mock.calls.map(([context]) => context.fightStartCountdown)).toEqual([
      'holding',
      'released',
      undefined,
    ]);
    yama.dispose();
  });
});

describe('SceneCompositor terrain loading', () => {
  it('makes a repeated request during a load wait for that load instead of returning early', async () => {
    const yama = new YamaSceneCompositor();
    let finish: (meshes: never[]) => void = () => {};
    const build = vi
      .spyOn(yama, 'buildTerrainMeshes3D')
      .mockImplementation(() => new Promise((resolve) => (finish = resolve as (meshes: never[]) => void)));
    const mapLoader = {} as Parameters<YamaSceneCompositor['loadTerrain']>[0];
    let secondSettled = false;

    const first = yama.loadTerrain(mapLoader);
    const second = yama.loadTerrain(mapLoader).then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    finish([{} as never]);
    await Promise.all([first, second]);
    expect(build).toHaveBeenCalledOnce();
    expect(yama.isTerrainLoaded()).toBe(true);
    yama.dispose();
  });

  it('fails every joined request when the load fails, and starts afresh on the next request', async () => {
    const yama = new YamaSceneCompositor();
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const failure = new Error('map square unreadable');
    const build = vi
      .spyOn(yama, 'buildTerrainMeshes3D')
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce([{} as never]);
    const mapLoader = {} as Parameters<YamaSceneCompositor['loadTerrain']>[0];

    const results = await Promise.allSettled([yama.loadTerrain(mapLoader), yama.loadTerrain(mapLoader)]);
    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
    expect(yama.isTerrainLoaded()).toBe(false);

    await yama.loadTerrain(mapLoader);
    expect(build).toHaveBeenCalledTimes(2);
    expect(yama.isTerrainLoaded()).toBe(true);
    yama.dispose();
  });

  it('publishes no terrain from a load that finishes after dispose', async () => {
    const yama = new YamaSceneCompositor();
    let finish: (meshes: never[]) => void = () => {};
    vi.spyOn(yama, 'buildTerrainMeshes3D').mockImplementation(
      () => new Promise((resolve) => (finish = resolve as (meshes: never[]) => void)),
    );
    const load = yama.loadTerrain({} as Parameters<YamaSceneCompositor['loadTerrain']>[0]);

    yama.dispose();
    finish([{} as never]);
    await load;

    expect(yama.isTerrainLoaded()).toBe(false);
  });
});
