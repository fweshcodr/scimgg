import { resolveRunBootstrap } from '../../core/engineRunConfig';
import { ReplayRecorder } from '../../core/ReplayRecorder';
import { type EngineRunConfig, SimulationEngine } from '../../core/SimulationEngine';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import type { SimulationState } from '../../types/simulation';
import type { HarnessOutcome } from '../devHarnessTypes';

export const TERMINAL_PRACTICE_TICK = 10;
/** Playing tick 10 restores the recorded tick before it; 10 itself runs in the authored ending. */
export const TERMINAL_RESTORED_TICK = TERMINAL_PRACTICE_TICK - 1;
export const TERMINAL_FIXTURE_TICK = 12;

/** Development-only, lazily imported by App's guarded harness bridge. No terminal mechanic is simulated. */
export function terminalFixturePrefix(source: EngineRunConfig) {
  const opening = resolveRunBootstrap(source);
  if (!opening || source.encounter.kind !== 'yama_p3') throw new Error('Terminal UI fixtures require base Yama');
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(undefined, 0x5eed),
    enableIntro: false,
    combatSeed: 0x1234abcd,
    stats: opening.baseStats,
    startPos: [31, 37],
  });
  engine.setAttackStylePerCategory(opening.attackStylePerCategory);
  engine.setMechanicsConfig(opening.mechanicsConfig);
  engine.setInventory(opening.inventory);
  engine.setEquipment(opening.equipment);
  engine.setCombatSupplies(opening.combatSupplies);
  if (opening.prepotApplied) engine.applyPrepotEffects();
  const recorder = new ReplayRecorder();
  recorder.startRun(engine.getRunConfig());
  let state = engine.getState();
  recorder.recordFrame(0, state.playerPosition, state, []);
  for (let tick = 1; tick <= TERMINAL_PRACTICE_TICK; tick++) {
    const input = state.playerPosition;
    engine.advanceTick(input);
    state = engine.getState();
    if (state.currentTick !== tick || !state.isAlive)
      throw new Error('Terminal UI fixture prefix did not remain playable');
    recorder.recordFrame(tick, input, state, engine.getLastTickEvents());
  }
  return recorder.exportData();
}

/** The last frame is an explicit UI fixture, not a prediction of how Yama kills or dies. */
function terminalState(state: SimulationState, outcome: HarnessOutcome): SimulationState {
  if (outcome === 'death')
    return {
      ...state,
      isAlive: false,
      playerHP: 0,
      failedCondition: 'Death',
      damageHistory: [
        ...state.damageHistory,
        {
          tick: state.currentTick,
          source: 'Death',
          targetId: 'player',
          attackType: 'typeless',
          activePrayer: state.activePrayer,
          prayedCorrectly: null,
          baseDamage: state.playerHP,
          effectiveDamage: state.playerHP,
          hpBefore: state.playerHP,
          hpAfter: 0,
        },
      ],
    };
  const bossHp = state.npcs.find((npc) => npc.id === 'yama')?.hp ?? 0;
  return {
    ...state,
    encounterOutcome: {
      phase: 'victory',
      decisiveTick: state.currentTick,
      completionTick: state.currentTick,
      primaryActorId: 'yama',
      completionActorIds: ['yama'],
    },
    npcs: state.npcs.map((npc) => (npc.id === 'yama' ? { ...npc, alive: false, hp: 0 } : npc)),
    damageHistory: [
      ...state.damageHistory,
      {
        tick: state.currentTick,
        source: 'PlayerAttack',
        targetId: 'yama',
        attackType: 'typeless',
        activePrayer: null,
        prayedCorrectly: null,
        baseDamage: bossHp,
        effectiveDamage: bossHp,
        hpBefore: bossHp,
        hpAfter: 0,
      },
    ],
  };
}

export function terminalFixtureEnding(engine: SimulationEngine, outcome: HarnessOutcome) {
  if (engine.currentTick !== TERMINAL_RESTORED_TICK || engine.getEncounterKind() !== 'yama_p3') {
    throw new Error('Terminal UI fixture must start from its validated prefix');
  }
  const frames = [];
  for (let tick = TERMINAL_RESTORED_TICK + 1; tick <= TERMINAL_FIXTURE_TICK; tick++) {
    const input = engine.getState().playerPosition;
    engine.advanceTick(input);
    const live = engine.getState();
    if (live.currentTick !== tick || !live.isAlive)
      throw new Error('Terminal UI fixture ending did not remain playable');
    frames.push({
      input,
      state: tick === TERMINAL_FIXTURE_TICK ? terminalState(live, outcome) : live,
      events: engine.getLastTickEvents(),
    });
  }
  return frames;
}
