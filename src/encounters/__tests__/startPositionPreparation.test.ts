import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearResolvedArenaConfigs,
  getArenaAllowUnboundedFallback,
  getArenaConfig,
  setArenaConfig,
  setResolvedArenaConfig,
} from '../../core/constants';
import type { EngineRunConfig } from '../../core/engineRunConfig';
import type { PendingInputOp } from '../../core/inputOps';
import { ReplayRecorder } from '../../core/ReplayRecorder';
import type { EngineAction, SimulationEngine, StartPositionStep } from '../../core/SimulationEngine';
import type { WorldState } from '../../core/WorldState';
import { ReplayPresentationStateSchema } from '../../replay/format/presentationFormat';
import { diffResumableState } from '../../replay/resumableState';
import { validPresentationSample } from '../../test/helpers/replayFixtures';
import { skipWithoutSetup } from '../../test/helpers/setupAssets';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { createEmptyInventory } from '../../types/inventory';
import { createDefaultStats } from '../../types/playerState';
import { type Coordinate, type MechanicsConfig, PrayerType, type SimulationState } from '../../types/simulation';
import { loadInfernoArena } from '../inferno/__tests__/infernoArenaFixture';
import { INFERNO_DESTROYED_PILLAR_KEYS, INFERNO_START_WAVE_KEY } from '../inferno/controls';
import { INFERNO_PILLARS, pillarFootprint } from '../inferno/pillars';
import {
  createSimulationEngineForNewRun,
  createSimulationEngineFromRunConfig,
  reconstructReplayPrefix,
} from '../simulationEngineFactory';

/**
 * Countdown start positioning against the real encounters: walking to P during the countdown and
 * committing it must leave exactly the run a fresh build at P (same seeds and setup) would have,
 * at the opening and on every later tick. See docs/architecture/movement-and-facing.md.
 */

let arenaConfig = getArenaConfig();
let allowUnboundedFallback = false;
beforeEach(() => {
  arenaConfig = getArenaConfig();
  allowUnboundedFallback = getArenaAllowUnboundedFallback();
});
afterEach(() => {
  clearResolvedArenaConfigs();
  setArenaConfig(arenaConfig, allowUnboundedFallback);
});

interface EncounterCase {
  readonly kind: string;
  /** Names the case where one kind has two (the Inferno, and the Inferno started on wave 69). */
  readonly label: string;
  readonly enableIntro: boolean;
  readonly mechanics: Partial<MechanicsConfig>;
  readonly startPosition?: Coordinate;
  /** Where the countdown walk heads. */
  readonly target: Coordinate;
  readonly arena?: () => void;
}

/** Zuk's floor, open, as its encounter tests give it without the cache. */
function openZukArena(): void {
  const walkableTiles = new Set<string>();
  for (let x = 17; x <= 45; x++) for (let y = 17; y <= 46; y++) walkableTiles.add(`${x},${y}`);
  setResolvedArenaConfig('inferno', {
    bounds: { minX: 17, maxX: 45, minY: 17, maxY: 46, width: 29, height: 30 },
    walkableTiles,
    collisionMap: null,
  });
}

const ENCOUNTERS: readonly EncounterCase[] = [
  {
    kind: 'inferno',
    label: 'inferno',
    enableIntro: false,
    // Wave 1 (named: the default start is wave 69, which opens facing Zuk with no countdown walk).
    mechanics: { infiniteHealth: true, infernoStartWave: '1' },
    // Around the north-east pillar's west face, through a run turn.
    target: [33, 42],
    arena: () => setResolvedArenaConfig('inferno', loadInfernoArena()),
  },
  // TzKal-Zuk: the Inferno started on wave 69.
  {
    kind: 'inferno',
    label: 'zuk',
    enableIntro: false,
    mechanics: { infiniteHealth: true, infernoStartWave: '69' },
    target: [26, 40],
    arena: openZukArena,
  },
  // Yama lands with an intro; the walk starts once it has finished.
  {
    kind: 'yama_p3',
    label: 'yama_p3',
    enableIntro: true,
    mechanics: { infiniteHealth: true },
    startPosition: [31, 37],
    target: [26, 41],
  },
  // Straight through Sol's footprint (31..35, 36..40): players walk through NPCs.
  {
    kind: 'sol_heredit',
    label: 'sol_heredit',
    enableIntro: false,
    mechanics: { infiniteHealth: true },
    target: [33, 41],
  },
];

function newRun({ kind, enableIntro, mechanics, startPosition }: EncounterCase): SimulationEngine {
  const engine = createSimulationEngineForNewRun({
    encounterConfig: { kind, mechanics },
    enableIntro,
    stats: createDefaultStats(),
    inventory: createEmptyInventory(),
    equipment: {},
    combatSupplies: createEmptyCombatSupplies(),
    attackStylePerCategory: {},
    combatSeed: 0x5eed1234,
    ...(startPosition ? { startPosition } : {}),
  });
  engine.applyPrepotEffects();
  return engine;
}

/** A fresh build of `runConfig`'s run at `position`, as a reconstruction or normal start would make it. */
function buildAt(runConfig: EngineRunConfig, position: Coordinate): SimulationEngine {
  const bootstrap = runConfig.bootstrap;
  if (!bootstrap) throw new Error('expected a bootstrap');
  const engine = createSimulationEngineFromRunConfig(
    { ...runConfig, bootstrap: { ...bootstrap, startPosition: position } },
    null,
  );
  if (!engine) throw new Error('expected a rebuilt engine');
  if (engine.getIntroActive()) engine.completeIntro();
  return engine;
}

function pendingOps(engine: SimulationEngine): readonly PendingInputOp[] {
  return (Reflect.get(engine, 'worldState') as WorldState).getPlayer()?.pendingInputOps ?? [];
}

function walk(engine: SimulationEngine, target: Coordinate, limit = 20): Coordinate[] {
  const tiles: Coordinate[] = [];
  for (let step = 0; step < limit; step++) {
    if (!engine.prepareStartPosition(target)) return tiles;
    tiles.push(engine.getState().playerPosition);
  }
  throw new Error('the walk did not arrive');
}

const MOVEMENT_FIELDS = new Set([
  'playerPosition',
  'playerPreviousPosition',
  'playerMovementPath',
  'playerFacingAngle',
  'playerIsMoving',
  'playerIsRunning',
]);

/** The inputs a player makes during the countdown: queued for tick 1, in click order. */
const COUNTDOWN_ACTIONS: readonly EngineAction[] = [
  { type: 'protectionPrayer', prayer: PrayerType.ProtectMagic },
  { type: 'ctrlClick', ctrlKey: false },
  { type: 'attackTarget', targetId: null },
  { type: 'quickPrayerToggle', selections: [PrayerType.Piety] },
];

/** The Inferno case bakes the arena from the fixture `npm run setup` writes. */
const NO_INFERNO_ARENA = skipWithoutSetup('infernoArena');
const RUNNABLE_ENCOUNTERS = ENCOUNTERS.filter((encounter) => !(encounter.label === 'inferno' && NO_INFERNO_ARENA));

describe.each(RUNNABLE_ENCOUNTERS)('countdown start positioning in $label', (encounter) => {
  function prepare() {
    encounter.arena?.();
    const prepared = newRun(encounter);
    if (prepared.getIntroActive()) prepared.completeIntro();
    const opening = structuredClone(prepared.getRunConfig());
    for (const action of COUNTDOWN_ACTIONS) prepared.applyAction(action);
    const before = structuredClone(prepared.getState());
    const queued = structuredClone(pendingOps(prepared));
    const eventsBefore = prepared.getLastTickEvents();
    const route = walk(prepared, encounter.target);
    return { prepared, opening, before, queued, eventsBefore, route };
  }

  it('walks without advancing anything else, and keeps the queued inputs in order', () => {
    const { prepared, opening, before, queued, eventsBefore, route } = prepare();
    expect(route.length).toBeGreaterThan(1);
    const during = prepared.getState();
    expect(during.currentTick).toBe(0);
    const changed = new Set(diffResumableState(before, during).map((diff) => /^[^.:]*/.exec(diff)?.[0]));
    expect([...changed].filter((field) => !MOVEMENT_FIELDS.has(field ?? ''))).toEqual([]);
    expect(during.runEnergy).toEqual(before.runEnergy);
    expect(during.isRunEnabled).toBe(before.isRunEnabled);
    expect(during.npcs).toEqual(before.npcs);
    expect(during.encounter).toEqual(before.encounter);
    expect(pendingOps(prepared)).toEqual(queued);
    expect(prepared.getRunConfig()).toEqual(opening);
    // No events: a step is not a tick (the last ones are still the opening's).
    expect(prepared.getLastTickEvents()).toBe(eventsBefore);
  });

  it('commits the tile as the run start, identical to a fresh build there, at the opening and every later tick', () => {
    const { prepared, opening, route } = prepare();
    prepared.finalizeStartPosition();
    const start = route.at(-1) as Coordinate;
    expect(prepared.getRunConfig()).toEqual({ ...opening, bootstrap: { ...opening.bootstrap, startPosition: start } });

    const control = buildAt(opening, start);
    for (const action of COUNTDOWN_ACTIONS) control.applyAction(action);
    expect(pendingOps(prepared)).toEqual(pendingOps(control));
    expect(diffResumableState(control.getState(), prepared.getState())).toEqual([]);
    expect(prepared.getState()).toMatchObject({
      playerPosition: start,
      playerPreviousPosition: start,
      playerMovementPath: [],
      playerIsMoving: false,
      playerIsRunning: false,
      introActive: false,
    });

    let attacked = false;
    for (let tick = 1; tick <= 40; tick++) {
      const moveTarget: Coordinate = tick >= 12 && tick < 18 ? encounter.target : start;
      if (!attacked && tick >= 4) {
        const npc = prepared.getState().npcs.find((candidate) => candidate.alive && candidate.role === 'boss');
        if (npc) {
          for (const engine of [prepared, control]) engine.applyAction({ type: 'attackTarget', targetId: npc.id });
          attacked = true;
        }
      }
      prepared.advanceTick(moveTarget);
      control.advanceTick(moveTarget);
      expect(diffResumableState(control.getState(), prepared.getState()), `tick ${tick}`).toEqual([]);
      expect(prepared.getLastTickEvents(), `tick ${tick}`).toEqual(control.getLastTickEvents());
      // The first tick starts where the countdown left the player; nothing re-walks the route.
      if (tick === 1) expect(prepared.getState().playerPosition).toEqual(start);
    }
  });

  it('keeps the encounter opening on its own schedule from the committed tile', () => {
    const { prepared } = prepare();
    prepared.finalizeStartPosition();
    const npcCountAt = new Map<number, number>();
    for (let tick = 1; tick <= 12; tick++) {
      prepared.advanceTick(prepared.getState().playerPosition);
      npcCountAt.set(tick, prepared.getState().npcs.filter((npc) => npc.alive).length);
    }
    if (encounter.label === 'inferno') {
      // The first wave lands 11 ticks after the start, as it does from the landing tile.
      expect(npcCountAt.get(11)).toBeGreaterThan(npcCountAt.get(10) ?? 0);
    }
    expect(prepared.currentTick).toBe(12);
  });

  it('refuses to position or commit once the run has advanced', () => {
    const { prepared } = prepare();
    prepared.advanceTick(prepared.getState().playerPosition);
    expect(() => prepared.prepareStartPosition(encounter.target)).toThrow();
    expect(() => prepared.finalizeStartPosition()).toThrow();
  });
});

/** Every flagged entity-collision tile in a box, as NPC steps see them. */
function flaggedTiles(engine: SimulationEngine): string[] {
  const { occupancy } = Reflect.get(engine, 'worldState') as WorldState;
  const tiles: string[] = [];
  for (let x = 10; x <= 50; x++) for (let y = 10; y <= 60; y++) if (occupancy.isBlocked(x, y)) tiles.push(`${x},${y}`);
  return tiles;
}

describe('countdown start positioning and NPC footprints', () => {
  const sol = ENCOUNTERS.find((candidate) => candidate.kind === 'sol_heredit') as EncounterCase;

  it('walks through an NPC like ordinary play, and the commit restores the flags a fresh build there sets', () => {
    const prepared = newRun(sol);
    const opening = structuredClone(prepared.getRunConfig());
    const route = walk(prepared, sol.target);
    // The walk crossed Sol's footprint, and each step left its tiles as the player does.
    expect(route.some(([x, y]) => x >= 31 && x <= 35 && y >= 36 && y <= 40)).toBe(true);
    expect(flaggedTiles(prepared)).not.toContain('33,38');
    prepared.finalizeStartPosition();
    const control = buildAt(opening, route.at(-1) as Coordinate);
    expect(flaggedTiles(prepared)).toEqual(flaggedTiles(control));
    expect(flaggedTiles(prepared)).toContain('33,38');
  });
});

describe.skipIf(NO_INFERNO_ARENA)('countdown start positioning walks by the ordinary ground-walk rules', () => {
  const inferno = ENCOUNTERS[0] as EncounterCase;

  /** The tiles an ordinary run walks for the same clicks, tick by tick. */
  function ordinaryRoute(target: Coordinate, steps: number, setUp?: (engine: SimulationEngine) => void): Coordinate[] {
    inferno.arena?.();
    const engine = newRun(inferno);
    setUp?.(engine);
    const tiles: Coordinate[] = [];
    for (let tick = 0; tick < steps; tick++) {
      engine.advanceTick(target);
      tiles.push(engine.getState().playerPosition);
    }
    return tiles;
  }

  function preparedRoute(target: Coordinate, setUp?: (engine: SimulationEngine) => void) {
    inferno.arena?.();
    const engine = newRun(inferno);
    setUp?.(engine);
    const steps: StartPositionStep[] = [];
    for (let step = 0; step < 30; step++) {
      const taken = engine.prepareStartPosition(target);
      if (!taken) break;
      steps.push(taken);
    }
    return { engine, steps, route: steps.map((step) => step.to) };
  }

  it('runs two tiles a step, turning around a pillar, exactly as ordinary ticks do', () => {
    const target: Coordinate = [35, 43];
    const { steps, route } = preparedRoute(target);
    expect(route).toEqual(ordinaryRoute(target, route.length));
    expect(steps.slice(0, -1).every((step) => step.stepTiles.length === 2 && step.isRunning)).toBe(true);
    // One run step changes direction between its two tiles.
    const turned = steps.some(({ from, stepTiles: [first, second] }) => {
      if (!first || !second) return false;
      return first[0] - from[0] !== second[0] - first[0] || first[1] - from[1] !== second[1] - first[1];
    });
    expect(turned).toBe(true);
  });

  it('never enters a standing pillar, even when clicked inside one', () => {
    const pillar = INFERNO_PILLARS.find((candidate) => candidate.key === 'northEast');
    if (!pillar) throw new Error('missing pillar');
    const footprint = new Set(pillarFootprint(pillar).map(([x, y]) => `${x},${y}`));
    const target: Coordinate = [pillar.position[0] + 1, pillar.position[1] + 1];
    const { steps, route } = preparedRoute(target);
    expect(route).toEqual(ordinaryRoute(target, route.length));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) for (const [x, y] of step.stepTiles) expect(footprint.has(`${x},${y}`)).toBe(false);
  });

  it('walks one tile a step with a Ctrl-click override, as ordinary ticks do', () => {
    const target: Coordinate = [30, 40];
    const ctrl = (engine: SimulationEngine) => engine.setCtrlClickOverride(true);
    const { steps, route } = preparedRoute(target, ctrl);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.every((step) => step.stepTiles.length === 1 && !step.isRunning)).toBe(true);
    expect(route).toEqual(ordinaryRoute(target, route.length, ctrl));
  });

  it('walks under a queued run-orb click, which also drops a Ctrl-click override, as tick 1 will', () => {
    const target: Coordinate = [30, 40];
    const toggled = (engine: SimulationEngine) => {
      engine.setCtrlClickOverride(true);
      engine.queueRunToggle();
    };
    const { engine, steps, route } = preparedRoute(target, toggled);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.every((step) => step.stepTiles.length === 1)).toBe(true);
    expect(route).toEqual(ordinaryRoute(target, route.length, toggled));
    // Still only queued: the orb lands on tick 1 like any other input.
    expect(Reflect.get(engine, 'worldState').getPlayer().isRunEnabled).toBe(true);
    expect(pendingOps(engine)).toEqual([{ type: 'run_toggle' }]);
  });

  it('stays put when the target is the current tile', () => {
    const { steps } = preparedRoute([30, 32]);
    expect(steps).toEqual([]);
  });
});

describe.each(RUNNABLE_ENCOUNTERS)('a recording of a countdown-positioned $label run', (encounter) => {
  const VIEWER_SETUP: Partial<MechanicsConfig> = {
    [INFERNO_START_WAVE_KEY]: '50',
    [INFERNO_DESTROYED_PILLAR_KEYS.northEast]: true,
    zukShieldStart: 'left',
  } as Partial<MechanicsConfig>;

  /** Live recording as the wiring drives it: frame 0 at run start, the countdown, GO, ticks. */
  function record(ticks = 12) {
    encounter.arena?.();
    const engine = newRun(encounter);
    const recorder = new ReplayRecorder();
    const opening = structuredClone(engine.getRunConfig());
    recorder.startRun(engine.getRunConfig());
    recorder.recordFrame(0, engine.getState().playerPosition, engine.getState(), [], 0);
    const baseline = structuredClone(recorder.getFrame(0)?.state);
    if (engine.getIntroActive()) engine.completeIntro();
    for (const action of COUNTDOWN_ACTIONS) {
      recorder.recordAction(action);
      engine.applyAction(action);
    }
    const route = walk(engine, encounter.target);
    engine.finalizeStartPosition();
    const opened = engine.getState();
    expect(
      recorder.finalizeUnadvancedStart({ position: opened.playerPosition, facingAngle: opened.playerFacingAngle }, 0),
    ).toBe(true);
    // useReplay lays the live layout baseline down again for the rebased capture.
    recorder.recordPresentationState(1, 0, ReplayPresentationStateSchema.parse(validPresentationSample().state));
    const start = route.at(-1) as Coordinate;
    for (let tick = 1; tick <= ticks; tick++) {
      const moveTarget: Coordinate = tick >= 6 && tick < 9 ? encounter.target : start;
      engine.advanceTick(moveTarget);
      recorder.recordFrame(tick, moveTarget, engine.getState(), engine.getLastTickEvents(), tick * 600);
    }
    return { engine, recorder, opening, baseline, start };
  }

  function reconstruct(recorder: ReplayRecorder, frameIndex: number): SimulationEngine {
    const runConfig = recorder.getRunConfig();
    if (!runConfig) throw new Error('missing run config');
    const engine = reconstructReplayPrefix(runConfig, recorder.getReconstructionFrames(), frameIndex, null);
    if (!engine) throw new Error('reconstruction refused');
    return engine;
  }

  it('starts at the committed tile with one canonical frame 0 and the countdown inputs on frame 1', () => {
    const { recorder, opening, baseline, start } = record();
    expect(recorder.getRunConfig()).toEqual({ ...opening, bootstrap: { ...opening.bootstrap, startPosition: start } });
    const [first, second] = [recorder.getFrame(0), recorder.getFrame(1)];
    expect(first?.input).toEqual(start);
    expect(first?.actions).toEqual([]);
    expect(first?.events).toEqual([]);
    expect(second?.actions).toEqual(COUNTDOWN_ACTIONS);
    // Frame 0 is the recorded opening, moved: only start-position, intro and locomotion fields differ.
    const changed = new Set(
      diffResumableState(baseline as SimulationState, first?.state as SimulationState).map(
        (diff) => /^[^.:]*/.exec(diff)?.[0],
      ),
    );
    for (const field of changed) expect(MOVEMENT_FIELDS.has(field ?? '') || field === 'introActive', field).toBe(true);
    expect(first?.state).toMatchObject({ playerPosition: start, playerMovementPath: [], introActive: false });
    // Nothing of the walk itself reaches the recording.
    expect(recorder.getFrameCount()).toBe(13);
    expect(recorder.getDisplayFrames().map((frame) => frame.state.currentTick)).toEqual([...Array(13).keys()]);
  });

  it('reconstructs frame 0 and later frames exactly, from a loaded recording too', () => {
    const { recorder } = record();
    for (const frameIndex of [0, 1, 7, 12]) {
      const frame = recorder.getFrame(frameIndex);
      expect(diffResumableState(frame?.state as SimulationState, reconstruct(recorder, frameIndex).getState())).toEqual(
        [],
      );
    }
    const loaded = new ReplayRecorder();
    loaded.load(recorder.exportData());
    expect(loaded.getRunConfig()?.bootstrap?.startPosition).toEqual(recorder.getRunConfig()?.bootstrap?.startPosition);
    for (const frameIndex of [0, 12]) {
      expect(
        diffResumableState(
          loaded.getFrame(frameIndex)?.state as SimulationState,
          reconstruct(loaded, frameIndex).getState(),
        ),
      ).toEqual([]);
    }
    // A loaded recording is never a fresh opening.
    expect(loaded.finalizeUnadvancedStart({ position: [0, 0], facingAngle: 0 })).toBe(false);
  });

  it('takes over at tick 1 from the canonical tick 0, keeps the recorded setup, and takes over again after a fork', () => {
    const { recorder, start } = record();
    // Tick 1 takeover restores frame 0 (its predecessor); the viewer's setup cannot reconfigure it.
    const resumed = reconstruct(recorder, 0);
    const frame0 = recorder.getFrame(0)?.state as SimulationState;
    expect(diffResumableState(frame0, resumed.getState())).toEqual([]);
    resumed.setMechanicsConfig({ ...frame0.mechanicsConfig, ...VIEWER_SETUP });
    // Only the viewer's settings themselves change: wave, pillars, shield and NPCs stay recorded.
    expect(diffResumableState(frame0, { ...resumed.getState(), mechanicsConfig: frame0.mechanicsConfig })).toEqual([]);
    expect(resumed.getState().playerPosition).toEqual(start);
    recorder.forkAt(0, 0);
    expect(recorder.finalizeUnadvancedStart({ position: [0, 0], facingAngle: 0 })).toBe(false);
    for (let tick = 1; tick <= 6; tick++) {
      resumed.advanceTick(start);
      recorder.recordFrame(tick, start, resumed.getState(), resumed.getLastTickEvents(), tick * 600);
    }
    for (const frameIndex of [0, 3, 6]) {
      expect(
        diffResumableState(
          recorder.getFrame(frameIndex)?.state as SimulationState,
          reconstruct(recorder, frameIndex).getState(),
        ),
      ).toEqual([]);
    }
  });
});
