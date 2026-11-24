import { describe, expect, it } from 'vitest';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { deriveNpcRenderFacingIntent } from '../../render/npc/npcFacingIntent';
import type { Coordinate } from '../../types/simulation';
import type { NpcActor } from '../actors/NpcActor';
import { SimulationEngine } from '../SimulationEngine';
import type { WorldState } from '../WorldState';

/**
 * Pins the facing contract end to end: {@link toSimulationState} publishes the
 * simulation FACTS (`lockedFacing`, `actionFacing`, `combatTargetId`), and the render layer's
 * {@link deriveNpcRenderFacingIntent} turns them into aiming behavior. Asserting
 * through both halves keeps the derivation priority (locked -> action -> live target ->
 * facing fallback) locked without putting render policy back into the snapshot.
 *
 * Fixtures come from a real {@link YamaEncounter} world: the live player is the
 * default target, and each NPC variant is a clone of the real typed Yama NPC so
 * no field is cast or faked.
 */

const YAMA_ID = 'yama';

function makeEngine(): { engine: SimulationEngine; world: WorldState; base: NpcActor } {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 25] });
  const world = Reflect.get(engine, 'worldState') as WorldState;
  const base = world.getNpc(YAMA_ID);
  if (!base) {
    throw new Error('expected the Yama NPC in the encounter world');
  }
  return { engine, world, base };
}

interface NpcOverrides {
  targetId?: string | null;
  lockedFacing?: number;
  actionFacing?: number;
  isMoving?: boolean;
  facing?: number;
  alive?: boolean;
}

function addNpc(world: WorldState, base: NpcActor, id: string, position: Coordinate, overrides: NpcOverrides): void {
  const npc: NpcActor = {
    ...base,
    id,
    role: 'npc',
    position,
    previousPosition: position,
    size: 1,
    facing: overrides.facing ?? 0,
    alive: overrides.alive ?? true,
    isMoving: overrides.isMoving ?? false,
    lockedFacing: overrides.lockedFacing,
    actionFacing: overrides.actionFacing,
    history: new Map(),
    combat: { ...base.combat, targetId: overrides.targetId ?? null },
  };
  world.actors.set(id, npc);
}

function intentFor(engine: SimulationEngine, id: string) {
  const npc = engine.getState().npcs.find((candidate) => candidate.id === id);
  return npc ? deriveNpcRenderFacingIntent(npc) : undefined;
}

describe('toSimulationState render-facing intent derivation', () => {
  it('derives fixed intent from lockedFacing, even with a live target', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'shield', [30, 30], { lockedFacing: 0, actionFacing: 768, targetId: 'player' });

    expect(intentFor(engine, 'shield')).toEqual({ kind: 'fixed', angle: 0 });
  });

  it('publishes actionFacing and derives turn-to-angle before live target tracking', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'caster', [30, 30], { actionFacing: 768, targetId: 'player' });

    const snapshot = engine.getState().npcs.find((candidate) => candidate.id === 'caster');

    expect(snapshot?.actionFacing).toBe(768);
    expect(snapshot ? deriveNpcRenderFacingIntent(snapshot) : undefined).toEqual({ kind: 'turn-to-angle', angle: 768 });
  });

  it('keeps tracking a live target while the NPC is moving', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'mover', [30, 30], { isMoving: true, facing: 1536, targetId: 'player' });

    // An in-combat NPC faces its target, not its footsteps. Capture t886: a chasing
    // Yt-HurKot walks EAST while still facing north at the player.
    expect(intentFor(engine, 'mover')).toEqual({ kind: 'track-actor', targetId: 'player' });
  });

  it('derives turn-to-angle from the movement facing for a moving NPC with no target', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'wanderer', [30, 30], { isMoving: true, facing: 1536, targetId: null });

    expect(intentFor(engine, 'wanderer')).toEqual({ kind: 'turn-to-angle', angle: 1536 });
  });

  it('derives track-actor for a stationary NPC with a live combat target', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'shield', [30, 30], { lockedFacing: 0 });
    addNpc(world, base, 'mager', [40, 40], { targetId: 'shield' });

    // The mager tracks its actual target, not a hard-coded player facing.
    expect(intentFor(engine, 'mager')).toEqual({ kind: 'track-actor', targetId: 'shield' });
  });

  it('falls back to turn-to-angle(facing) when the combat target is dead', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'corpse', [30, 30], { alive: false });
    addNpc(world, base, 'npc', [40, 40], { targetId: 'corpse', facing: 768 });

    expect(intentFor(engine, 'npc')).toEqual({ kind: 'turn-to-angle', angle: 768 });
  });

  it('falls back to turn-to-angle(facing) when a stationary NPC has no target', () => {
    const { engine, world, base } = makeEngine();
    addNpc(world, base, 'idle', [40, 40], { targetId: null, facing: 512 });

    expect(intentFor(engine, 'idle')).toEqual({ kind: 'turn-to-angle', angle: 512 });
  });
});
