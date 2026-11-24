// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../../core/events/types';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { INFERNO_WAVE_NPC_IDS } from '../../../npcs/inferno/constants';
import { DEFAULT_ENTITY_HIDER_OPTIONS, type EntityHiderOptions } from '../../../types/entityHider';
import { type NpcState, PrayerType, type SimulationState } from '../../../types/simulation';
import {
  DEFAULT_TZHAAR_HP_TRACKER_OPTIONS,
  TZHAAR_ALIVE_COLOR,
  TZHAAR_DEAD_COLOR,
  type TzhaarHpTrackerOptions,
} from '../../../types/tzhaarHpTracker';
import type { Projection2D } from '../../core/camera';
import type { RenderQueue } from '../../core/commands';
import { seed } from '../../npc/__tests__/npcFacingTestHarness';
import { PRIMARY_NPC_ACTOR_ID } from '../../npc/NpcInstanceManager';
import { LobbySceneCompositor } from '../lobby/LobbySceneCompositor';
import { lobbyNpcRenderId } from '../lobby/lobbyAnimations';
import { SceneCompositor } from '../SceneCompositor';
import type { NpcHitTestData, RenderContext } from '../types';

const MAGER = INFERNO_WAVE_NPC_IDS.mager;

function npc(id: string, overrides: Partial<NpcState> = {}): NpcState {
  return {
    id,
    npcTypeId: MAGER,
    archetypeId: 'mager',
    role: 'minion',
    alive: true,
    position: [10, 10],
    previousPosition: [10, 10],
    facingAngle: 0,
    combatTargetId: null,
    size: 4,
    hp: 220,
    maxHp: 220,
    history: new Map(),
    ...overrides,
  };
}

const projection: Projection2D = {
  tileToScreen: (tile) => ({ x: tile.x, y: tile.y }),
  tileDeltaToScreen: (delta) => delta,
  screenToTile: () => null,
  tilePolygonScreen: () => [],
};

const hitTestData = { modelMatrix: new Float32Array(16) } as NpcHitTestData;

interface HidingPluginOptions {
  entityHider?: Partial<EntityHiderOptions>;
  tzhaarHpTracker?: Partial<TzhaarHpTrackerOptions>;
}

function lobbyState(): SimulationState {
  return new SimulationEngine({ encounter: new LobbyEncounter(), combatSeed: 1 }).getState();
}

function buildFrame(
  scene: SceneCompositor,
  baseState: SimulationState,
  npcs: NpcState[],
  plugins: HidingPluginOptions,
  events: GameEvent[] = [],
): RenderQueue {
  const context: RenderContext = {
    simulationState: { ...baseState, currentTick: 5, npcs, activePrayer: PrayerType.ProtectMagic },
    events,
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
      entityHider: plugins.entityHider ? { ...DEFAULT_ENTITY_HIDER_OPTIONS, ...plugins.entityHider } : null,
      tzhaarHpTracker: plugins.tzhaarHpTracker
        ? { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, ...plugins.tzhaarHpTracker }
        : null,
    },
    interaction: { hoveredTile: null, targetTile: null },
    interpolatedTick: 5,
    speedMultiplier: 1,
  };
  return scene.build(context, projection, { width: 800, height: 600, dpr: 1 });
}

describe('SceneCompositor NPC hiding plugins', () => {
  let scene: SceneCompositor;
  let baseState: SimulationState;

  beforeEach(() => {
    scene = new SceneCompositor();
    scene['terrainHeights'] = Array.from({ length: 65 }, () => new Int32Array(65));
    baseState = lobbyState();
  });

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
  });

  function build(npcs: NpcState[], plugins: HidingPluginOptions, events: GameEvent[] = []): RenderQueue {
    return buildFrame(scene, baseState, npcs, plugins, events);
  }

  const hitsplatOn = (targetId: string, eventId: number): GameEvent => ({
    type: 'hitsplat_spawned',
    eventId,
    tick: 5,
    targetId,
    amount: 12,
    hitsplatType: 'damage',
  });

  it("leaves Hide NPCs' models undrawn and unclickable, but the NPCs fighting you drawn", () => {
    const renderAll = vi.spyOn(scene['npcInstanceManager'], 'renderAll');
    vi.spyOn(scene['npcInstanceManager'], 'getAllHitTestData').mockReturnValue([
      { actorId: 'bystander', hitTestData },
      { actorId: 'attacker', hitTestData },
    ]);

    build([npc('bystander'), npc('attacker', { combatTargetId: 'player' })], { entityHider: { hideNpcs: true } });
    const isHidden = renderAll.mock.calls[0]?.[1];

    expect(isHidden?.('bystander', MAGER, false)).toBe(true);
    expect(isHidden?.('attacker', MAGER, false)).toBe(false);
    expect(scene.getAllNpcHitTestData().map(({ actorId }) => actorId)).toEqual(['attacker']);

    build([npc('bystander')], {});
    expect(renderAll.mock.calls[1]?.[1]).toBeUndefined();
    expect(scene.getAllNpcHitTestData()).toHaveLength(2);
  });

  it("drops a 2D-hidden NPC's hitsplats and your own 2D, keeping the rest", () => {
    const queue = build(
      [npc('hidden'), npc('shown', { combatTargetId: 'player', position: [20, 20] })],
      {
        entityHider: { hideNpcs2D: true, hideLocalPlayer2D: true },
      },
      [hitsplatOn('hidden', 1), hitsplatOn('shown', 2), hitsplatOn('player', 3)],
    );

    expect(queue.hitsplats?.map((splat) => splat.key)).toEqual(['hitsplat-shown-slot-0']);
    expect(queue.overheadIcons ?? []).toEqual([]);
    expect(queue.healthBars?.map((bar) => bar.key)).toEqual(['npc-healthbar-shown']);
  });

  it('stops drawing your own character under Hide local player', () => {
    const playerDraws = (queue: RenderQueue) =>
      queue.commands.filter((command) => command.kind === 'mesh3d' && command.meshId.startsWith('debug-player-sphere'));

    expect(playerDraws(build([], {}))).toHaveLength(1);
    expect(playerDraws(build([], { entityHider: { hideLocalPlayer: true } }))).toHaveLength(0);
  });

  it('writes TzHaar HP over tracked NPCs and colors its highlight alive or dead', () => {
    const compositor = scene as unknown as {
      createOutlineMesh3D: (x1: number, y1: number, x2: number, y2: number, packedHsl: number) => unknown;
      hexToPackedHsl: (hex: string) => number;
    };
    const alive = compositor.hexToPackedHsl(TZHAAR_ALIVE_COLOR);
    const dead = compositor.hexToPackedHsl(TZHAAR_DEAD_COLOR);
    const outline = vi.spyOn(compositor, 'createOutlineMesh3D');
    const tzhaarOutlines = () =>
      outline.mock.calls
        .filter(([, , , , packedHsl]) => packedHsl === alive || packedHsl === dead)
        .map(([x, y, , , packedHsl]) => [x, y, packedHsl]);
    const npcs = [
      npc('alive'),
      npc('dead', { alive: false, hp: 0, position: [20, 20] }),
      npc('pillar', { npcTypeId: 7709, position: [30, 30] }),
    ];

    build(npcs, { tzhaarHpTracker: { highlightStyle: 'none' } });
    expect(tzhaarOutlines()).toEqual([]);

    const queue = build(npcs, { tzhaarHpTracker: { highlightStyle: 'trueTile' } });
    expect(queue.overheadTexts?.map((text) => [text.text, text.textColor])).toEqual([['220', TZHAAR_ALIVE_COLOR]]);
    // One true-tile outline each for the live and the dead mager; the untracked pillar gets none.
    expect(tzhaarOutlines()).toEqual([
      [10, 10, alive],
      [20, 20, dead],
    ]);
  });

  it("hides TzHaar's dead NPC model and client 2D, sparing the bosses' healers", () => {
    const renderAll = vi.spyOn(scene['npcInstanceManager'], 'renderAll');

    build(
      [
        npc('dead', { alive: false, hp: 0 }),
        npc('healer', { npcTypeId: INFERNO_WAVE_NPC_IDS.jad_healer, alive: false, hp: 0 }),
      ],
      { tzhaarHpTracker: { hideDead: true } },
    );
    const isHidden = renderAll.mock.calls[0]?.[1];

    expect(isHidden?.('dead', MAGER, true)).toBe(true);
    expect(isHidden?.('healer', INFERNO_WAVE_NPC_IDS.jad_healer, true)).toBe(false);
    // A corpse outliving its snapshot entry is judged as dead by type.
    expect(isHidden?.('gone', MAGER, true)).toBe(true);
  });
});

describe('LobbySceneCompositor NPC hiding plugins', () => {
  let scene: LobbySceneCompositor;
  let baseState: SimulationState;

  beforeEach(() => {
    scene = new LobbySceneCompositor(0, 0, 0);
    scene['terrainHeights'] = Array.from({ length: 65 }, () => new Int32Array(65));
    baseState = lobbyState();
  });

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
  });

  it("leaves Hide NPCs' lobby bosses undrawn and unclickable, Yama's primary instance included", () => {
    const manager = scene['npcInstanceManager'];
    // The bosses' loaded instances, under the render ids the lobby syncs them to: Yama as the primary NPC.
    const renderIds = LOBBY_BOSS_NPCS.map((boss) => lobbyNpcRenderId({ id: boss.actorId, npcTypeId: boss.npcTypeId }));
    expect(renderIds).toContain(PRIMARY_NPC_ACTOR_ID);
    LOBBY_BOSS_NPCS.forEach((boss, index) => {
      seed(manager, {
        actorId: renderIds[index] as string,
        npcTypeId: boss.npcTypeId,
        position: boss.position,
        size: 3,
        facing: boss.facingAngle,
        rotationSpeed: 32,
      });
    });
    vi.spyOn(manager, 'syncInstances').mockImplementation(() => {});
    vi.spyOn(manager, 'getAllHitTestData').mockReturnValue(renderIds.map((actorId) => ({ actorId, hitTestData })));
    const npcModels = (queue: RenderQueue) =>
      queue.commands.filter((command) => command.kind === 'mesh3d' && command.meshId.startsWith('npc-'));

    expect(npcModels(buildFrame(scene, baseState, [], {}))).toHaveLength(LOBBY_BOSS_NPCS.length);
    expect(scene.getAllNpcHitTestData().map(({ actorId }) => actorId)).toEqual(
      LOBBY_BOSS_NPCS.map((boss) => boss.actorId),
    );

    expect(npcModels(buildFrame(scene, baseState, [], { entityHider: { hideNpcs: true } }))).toEqual([]);
    expect(scene.getAllNpcHitTestData()).toEqual([]);
  });
});
