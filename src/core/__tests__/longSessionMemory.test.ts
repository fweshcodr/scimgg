import { describe, expect, it } from 'vitest';
import { VOID_FLARE_NPC_ID } from '../../encounters/yamaP3/constants';
import { DIVINE_SEVERANCE_CONFIG } from '../../encounters/yamaP3/contractConfig';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import type { Coordinate, SimulationState } from '../../types/simulation';
import type { NpcActor } from '../actors/NpcActor';
import { ACTOR_HISTORY_WINDOW_TICKS, DEAD_ACTOR_PRUNE_GRACE_TICKS } from '../constants';
import { ReplayRecorder } from '../ReplayRecorder';
import { SimulationEngine } from '../SimulationEngine';

/**
 * These tests lock the bounds that keep long-session replay memory linear: replay
 * frames must embed no cumulatively-growing data (per-actor position-history maps,
 * the session eventLog), and dead void-flare actors must be pruned. Embedding either
 * makes total replay memory O(N^2), which OOMs the browser tab in ~15-20 minutes.
 */

const START: Coordinate = [34, 32];

function makeEngine(continuousFlares = false): SimulationEngine {
  // Fixed seed for determinism. DIVINE_SEVERANCE_CONFIG spawns void flares
  // continuously, which exercises the dead-actor accumulation path hard.
  const encounter = continuousFlares
    ? new YamaEncounter(DIVINE_SEVERANCE_CONFIG, 0x1234)
    : new YamaEncounter(undefined, 0x1234);
  const engine = new SimulationEngine({ encounter, startPos: START });
  engine.setMechanicsConfig({ infiniteHealth: true });
  return engine;
}

function cumulativeEntries(state: SimulationState): number {
  let n = state.playerHistory.size + state.primaryNpcHistory.size + state.eventLog.length;
  for (const npc of state.npcs) n += npc.history.size;
  return n;
}

describe('long-session memory bounds', () => {
  it('bounds live per-actor history maps to the rolling window', () => {
    const engine = makeEngine();
    for (let i = 0; i < ACTOR_HISTORY_WINDOW_TICKS * 5; i++) engine.advanceTick(START);

    const state = engine.getState();
    expect(state.playerHistory.size).toBeLessThanOrEqual(ACTOR_HISTORY_WINDOW_TICKS);
    expect(state.primaryNpcHistory.size).toBeLessThanOrEqual(ACTOR_HISTORY_WINDOW_TICKS);
    // The recent window is still recorded (not emptied) — current tick present.
    expect(state.playerHistory.size).toBeGreaterThan(0);
    expect(state.playerHistory.get(state.currentTick)).toEqual(state.playerPosition);
    // The live eventLog is intentionally NOT bounded (getEventLog consumers rely
    // on the full session log); only the replay FRAME copies drop it.
    expect(engine.getEventLog().length).toBeGreaterThan(0);
  });

  it('keeps recorded replay frames O(1): cumulative data is never embedded, regardless of age', () => {
    const engine = makeEngine();
    const recorder = new ReplayRecorder();
    recorder.startRun(engine.getRunConfig());

    const TICKS = 600;
    for (let i = 0; i < TICKS; i++) {
      engine.advanceTick(START);
      const s = engine.getState();
      recorder.recordFrame(s.currentTick, START, s, engine.getLastTickEvents());
    }

    // An early frame and far-later frames must BOTH embed zero cumulative
    // history/eventLog. With O(N^2) embedding, late frames would grow.
    for (const idx of [5, 100, 300, recorder.getFrameCount() - 1]) {
      const frame = recorder.getFrame(idx);
      expect(frame).toBeDefined();
      if (!frame) continue;
      expect(frame.state.playerHistory.size).toBe(0);
      expect(frame.state.primaryNpcHistory.size).toBe(0);
      expect(frame.state.eventLog.length).toBe(0);
      for (const npc of frame.state.npcs) expect(npc.history.size).toBe(0);
      expect(cumulativeEntries(frame.state)).toBe(0);
    }
  });

  it('snapshot keeps damageHistory + npc snapshots (needed for replay rendering) while dropping history/eventLog', () => {
    const engine = makeEngine();
    for (let i = 0; i < 30; i++) engine.advanceTick(START);

    const recorder = new ReplayRecorder();
    recorder.startRun(engine.getRunConfig());

    const live = engine.getState();
    // Live state carries the cumulative data...
    expect(live.playerHistory.size).toBeGreaterThan(0);
    expect(live.eventLog.length).toBeGreaterThan(0);
    expect(live.npcs.length).toBeGreaterThan(0);
    // ...including a damage entry present at record time (replay draws hitsplats
    // from frame.state.damageHistory, so it must survive the snapshot).
    live.damageHistory.push({
      tick: live.currentTick,
      source: 'VoidFlare',
      targetId: 'player',
      baseDamage: 12,
      attackType: 'typeless',
      activePrayer: null,
      prayedCorrectly: null,
      effectiveDamage: 12,
      hpBefore: 99,
      hpAfter: 87,
    });

    recorder.recordFrame(live.currentTick, START, live, engine.getLastTickEvents());
    const frame = recorder.getFrame(0);
    expect(frame).toBeDefined();
    if (!frame) return;

    // Dropped (unused by any replay consumer):
    expect(frame.state.playerHistory.size).toBe(0);
    expect(frame.state.primaryNpcHistory.size).toBe(0);
    expect(frame.state.eventLog.length).toBe(0);

    // Kept (replay rendering reads these): the full damageHistory survives the
    // snapshot — including the entry pushed at record time as the last element.
    // (Void-flare explosions during the 30-tick warmup add earlier entries, which
    // is itself proof damageHistory is preserved, not emptied.)
    expect(frame.state.damageHistory.length).toBe(live.damageHistory.length);
    expect(frame.state.damageHistory.length).toBeGreaterThanOrEqual(1);
    expect(frame.state.damageHistory.at(-1)?.effectiveDamage).toBe(12);
    expect(frame.state.npcs.length).toBeGreaterThan(0);
    expect(frame.state.playerPosition).toEqual(live.playerPosition);
    expect(frame.state.playerHP).toBe(live.playerHP);
  });

  it('prunes dead void-flare actors so the npc list stays bounded over a long fight', () => {
    const engine = makeEngine(true); // continuous void flares

    const TICKS = 1000;
    let maxNpcs = 0;
    let sawFlare = false;
    for (let i = 0; i < TICKS; i++) {
      engine.advanceTick(START);
      const npcs = engine.getState().npcs;
      maxNpcs = Math.max(maxNpcs, npcs.length);
      if (npcs.some((n) => n.npcTypeId === VOID_FLARE_NPC_ID)) sawFlare = true;
    }

    // Sanity: flares actually spawned, so this test is meaningful.
    expect(sawFlare).toBe(true);
    // With pruning it stays a small constant (boss + a few active flares + a brief
    // death-grace window).
    expect(maxNpcs).toBeLessThan(30);
  });

  it('prunes a transient NPC after combat kills it without a planned despawn tick', () => {
    const engine = makeEngine();
    const world = engine['worldState'];
    const boss = world.getNpc('yama');
    const player = world.getPlayer();
    if (!boss || !player) throw new Error('Expected Yama combat fixtures');
    const transient: NpcActor = {
      ...boss,
      id: 'transient-npc',
      role: 'npc',
      vitals: { hp: 1, maxHp: 1 },
      combat: { ...boss.combat },
      history: new Map(),
    };
    world.actors.set(transient.id, transient);

    engine['combatSystem'].processAttackRequest(
      world,
      {
        attacker: player,
        target: transient,
        attack: {
          style: 'melee',
          attackKind: 'melee_slash',
          rolledDamage: 1,
          accuracySucceeded: true,
          impactDelayTicks: 0,
        },
      },
      engine['buildCombatBridge'](),
    );
    for (let i = 0; i < DEAD_ACTOR_PRUNE_GRACE_TICKS; i++) engine.advanceTick(START);

    expect(world.getNpc(transient.id)).toBeNull();
    expect(engine.getState().npcs.some((npc) => npc.id === transient.id)).toBe(false);
  });

  it('replay frames stay small even as the live session ages (no cumulative growth between frames)', () => {
    const engine = makeEngine();
    const recorder = new ReplayRecorder();
    recorder.startRun(engine.getRunConfig());

    for (let i = 0; i < 400; i++) {
      engine.advanceTick(START);
      const s = engine.getState();
      recorder.recordFrame(s.currentTick, START, s, engine.getLastTickEvents());
    }

    const early = cumulativeEntries(recorder.getFrame(20)!.state);
    const late = cumulativeEntries(recorder.getFrame(399)!.state);
    expect(early).toBe(0);
    expect(late).toBe(0);
  });

  it("reconstructs each frame's damageHistory as of that frame's tick (shared append-only log)", () => {
    const engine = makeEngine(true); // continuous lethal flares -> damage accrues
    const recorder = new ReplayRecorder();
    recorder.startRun(engine.getRunConfig());

    for (let i = 0; i < 300; i++) {
      engine.advanceTick(START);
      const s = engine.getState();
      recorder.recordFrame(s.currentTick, START, s, engine.getLastTickEvents());
    }

    const earlyFrame = recorder.getFrame(50)!;
    const lateFrame = recorder.getFrame(299)!;
    const earlyLen = earlyFrame.state.damageHistory.length;
    const lateLen = lateFrame.state.damageHistory.length;

    // Damage accrued over the fight, so a later frame must see at least as much
    // history as an earlier one — and strictly more given continuous flares.
    expect(lateLen).toBeGreaterThan(earlyLen);
    expect(earlyLen).toBeGreaterThan(0);

    // Each frame's log is the correct PREFIX of the cumulative log (a frame must
    // never show damage from the future). Re-fetch to prove reconstruction is
    // stable + the early prefix matches the late log entry-for-entry.
    const earlyAgain = recorder.getFrame(50)!.state.damageHistory;
    expect(earlyAgain.length).toBe(earlyLen);
    for (let i = 0; i < earlyLen; i++) {
      expect(earlyAgain[i]?.tick).toBe(lateFrame.state.damageHistory[i]?.tick);
      expect(earlyAgain[i]?.effectiveDamage).toBe(lateFrame.state.damageHistory[i]?.effectiveDamage);
    }
    for (const entry of earlyAgain) {
      expect(entry.tick).toBeLessThanOrEqual(earlyFrame.tick);
    }
  });
});
