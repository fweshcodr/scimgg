import { describe, expect, it, vi } from 'vitest';
import { TickEvents } from '../../../core/events/TickEvents';
import { markNpcDead } from '../../../core/npcDeath';
import type { NpcDefinitionContext } from '../../../core/npcs';
import { WorldState } from '../../../core/WorldState';
import { createVoidFlareActor, VOID_FLARE_NPC_ID, type VoidFlareImpact, voidFlareDefinition } from '../voidFlare';

describe('Void Flare NPC definition', () => {
  it('owns its fuse, variant, and charging lifecycle', () => {
    const actor = createVoidFlareActor({
      id: 'vf-3',
      damageRollIndex: 3,
      position: [26, 25],
      spawnTick: 10,
      chargeTicks: 26,
      currentHp: 71,
      guaranteedPlayerMaximum: true,
    });

    expect(actor.npcTypeId).toBe(VOID_FLARE_NPC_ID);
    expect(voidFlareDefinition.getState(actor)).toEqual({
      damageRollIndex: 3,
      explodeTick: 36,
      variant: 'shadow',
      lifecycle: 'charging',
    });
  });

  it.each([
    'vf-3',
    'encounter:renamed-flare',
    'vf-99',
  ])('detonates into the same detached next-tick impact when roll index 3 has identity %s', (id) => {
    const impacts: VoidFlareImpact[] = [];
    const actor = createVoidFlareActor({
      id,
      damageRollIndex: 3,
      position: [26, 25],
      spawnTick: 10,
      chargeTicks: 26,
      currentHp: 71,
      guaranteedPlayerMaximum: true,
    });
    const registration = voidFlareDefinition.register({
      damageSeed: 0,
      explosionDamage: [10, 27],
      getBoss: () => null,
      scheduleImpact: (impact) => impacts.push(impact),
    });

    const damages = registration.resolveLocalEffects(actor, createContext(36));

    expect(damages).toEqual([]);
    expect(actor.alive).toBe(false);
    expect(actor.deathCause).toBe('detonated');
    expect(impacts).toEqual([{ impactTick: 37, damage: 25 }]);
  });

  it('reports destruction without scheduling an impact when killed while charging', () => {
    const scheduleImpact = vi.fn();
    const actor = createVoidFlareActor({
      id: 'vf-0',
      damageRollIndex: 0,
      position: [26, 25],
      spawnTick: 10,
      chargeTicks: 26,
      currentHp: 71,
      guaranteedPlayerMaximum: true,
    });
    actor.alive = false;
    const registration = voidFlareDefinition.register({
      damageSeed: 0,
      explosionDamage: [10, 27],
      getBoss: () => null,
      scheduleImpact,
    });
    const context = createContext(36);

    registration.resolveLocalEffects(actor, context);

    expect(scheduleImpact).not.toHaveBeenCalled();
    // A kill keeps the type's default death clip: no cause is recorded.
    expect(actor.deathCause).toBeUndefined();
    expect(context.tickEvents.flush()).toMatchObject([{ type: 'voidflare_destroyed', flareId: 'vf-0' }]);
  });

  it('records the actual defeat tick without changing the explosion schedule', () => {
    const actor = createVoidFlareActor({
      id: 'vf-0',
      damageRollIndex: 0,
      position: [26, 25],
      spawnTick: 10,
      chargeTicks: 26,
    });
    const registration = voidFlareDefinition.register({
      damageSeed: 0,
      explosionDamage: [10, 27],
      getBoss: () => null,
      scheduleImpact: vi.fn(),
    });
    markNpcDead(actor, 12);

    registration.notifyDefeated(actor, { npcId: actor.id, tick: 12 }, 'encounter-owned', createContext(13));

    expect(actor.despawnTick).toBe(12);
    expect(actor.state.explodeTick).toBe(36);
  });
});

function createContext(tick: number): NpcDefinitionContext {
  const tickEvents = new TickEvents();
  tickEvents.setTick(tick);
  return {
    tick,
    world: new WorldState(),
    tickEvents,
    random: () => 0,
    spawnNpc: () => undefined,
    despawnNpc: () => undefined,
    logEvent: () => undefined,
  };
}
