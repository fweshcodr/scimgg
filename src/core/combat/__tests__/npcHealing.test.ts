import { describe, expect, it } from 'vitest';
import { createInfernoActor } from '../../../npcs/inferno/actors';
import { createVoidFlareActor, voidFlareDefinition } from '../../../npcs/yama/voidFlare';
import { TickEvents } from '../../events/TickEvents';
import { WorldState } from '../../WorldState';
import { applyNpcHealing } from '../npcHealing';

describe('applyNpcHealing', () => {
  it('caps a supplied amount and emits only the effective heal when the target is injured', () => {
    const target = createInfernoActor('jad', 'arbitrary-parent', [4, 4]);
    target.vitals.hp = target.vitals.maxHp - 7;
    const events = new TickEvents();

    const applied = applyNpcHealing(target, 19, events);

    expect(applied).toBe(7);
    expect(target.vitals.hp).toBe(target.vitals.maxHp);
    expect(events.flush()).toMatchObject([
      { type: 'hitsplat_spawned', targetId: target.id, amount: 7, hitsplatType: 'heal' },
    ]);
  });

  it.each([
    'missing',
    'dead',
    'full',
    'zero',
    'negative',
  ] as const)('does nothing when the target or amount is %s', (condition) => {
    const target = createInfernoActor('jad', 'parent', [4, 4]);
    if (condition !== 'full') target.vitals.hp -= 20;
    if (condition === 'dead') target.alive = false;
    const events = new TickEvents();
    const before = target.vitals.hp;

    const applied = applyNpcHealing(
      condition === 'missing' ? null : target,
      condition === 'zero' ? 0 : condition === 'negative' ? -5 : 19,
      events,
    );

    expect(applied).toBe(0);
    expect(target.vitals.hp).toBe(before);
    expect(events.flush()).toEqual([]);
  });

  it('preserves Yama heal-before-explosion event ordering when a flare detonates', () => {
    const target = createInfernoActor('jad', 'boss', [4, 4]);
    target.vitals.hp -= 100;
    const flare = createVoidFlareActor({
      id: 'vf-0',
      damageRollIndex: 0,
      position: [1, 1],
      spawnTick: 0,
      chargeTicks: 1,
    });
    const events = new TickEvents();
    const registration = voidFlareDefinition.register({
      damageSeed: 0,
      explosionDamage: [9, 9],
      getBoss: () => target,
      scheduleImpact: () => undefined,
    });

    registration.resolveLocalEffects(flare, {
      tick: 1,
      world: new WorldState(),
      tickEvents: events,
      random: () => 0,
      spawnNpc: () => undefined,
      despawnNpc: () => undefined,
      logEvent: () => undefined,
    });

    expect(events.flush()).toMatchObject([
      { type: 'hitsplat_spawned', amount: 24 },
      { type: 'voidflare_exploded', damage: 9, heal: 24 },
    ]);
  });
});
