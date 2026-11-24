import { describe, expect, it } from 'vitest';
import type { NpcDefinitionContext } from '../../../core/npcs';
import { DEFAULT_YAMA_ATTACK_PATTERN } from '../timing';
import {
  createYamaActor,
  getYamaState,
  resetYamaAttackState,
  YAMA_NPC_ID,
  type YamaAttackMechanics,
  yamaDefinition,
} from '../yama';

describe('Yama NPC definition', () => {
  it('owns its opening style and attack lifecycle state', () => {
    const actor = createYamaActor({
      position: [29, 28],
      hp: 833,
      maxHp: 2500,
      openingStyle: 'range',
    });

    expect(actor.npcTypeId).toBe(YAMA_NPC_ID);
    expect(getYamaState(actor)).toMatchObject({
      openingStyle: 'range',
      queuedAttack: null,
      windup: null,
      latestAttackKind: null,
      latestAttackTick: null,
      alternatingAttackCount: 0,
    });
  });

  it('clears transient attack state without replacing actor-owned identity', () => {
    const actor = createYamaActor({
      position: [29, 28],
      hp: 833,
      maxHp: 2500,
      openingStyle: 'magic',
    });
    const state = getYamaState(actor);
    if (!state) throw new TypeError('Expected Yama actor state');
    state.queuedAttack = { style: 'melee', attackKind: 'melee_crush' };
    state.windup = { style: 'magic', attackKind: 'magic_fire', releaseTick: 15 };
    state.latestAttackKind = 'melee_crush';
    state.latestAttackTick = 12;
    state.alternatingAttackCount = 4;

    resetYamaAttackState(actor);

    expect(getYamaState(actor)).toMatchObject({
      openingStyle: 'magic',
      queuedAttack: null,
      windup: null,
      latestAttackKind: null,
      latestAttackTick: null,
      alternatingAttackCount: 0,
    });
  });
});

describe('Yama attack timer projection', () => {
  function fixture(mechanics: YamaAttackMechanics = { meleeEnabled: true, rangedMagicEnabled: true }) {
    const actor = createYamaActor({
      position: [29, 28],
      hp: 833,
      maxHp: 2500,
      openingStyle: 'magic',
    });
    const registration = yamaDefinition.register({
      attackPattern: DEFAULT_YAMA_ATTACK_PATTERN,
      meleeDamage: 0,
      rangedMagicDamage: 0,
      meleePrayerReduction: { type: 'reduce', value: 1 },
      rangedMagicPrayerReduction: { type: 'reduce', value: 1 },
      wretchedStrength: false,
      accuracyRandom: () => 0.5,
      getMechanics: () => mechanics,
    });
    return { actor, registration };
  }

  function timerAt(tick: number, mechanics?: YamaAttackMechanics) {
    const { actor, registration } = fixture(mechanics);
    return registration.attackTimer(actor, { tick } as NpcDefinitionContext);
  }

  it.each([
    { tick: 0, nextAttackTick: 4 },
    { tick: 4, nextAttackTick: 11 },
    { tick: 7, nextAttackTick: 11 },
    { tick: 11, nextAttackTick: 18 },
  ])('points at the next beat after tick $tick', ({ tick, nextAttackTick }) => {
    expect(timerAt(tick)).toEqual({ nextAttackTick, attackSpeed: 7 });
  });

  it('reports no timer while both attack mechanics are disabled', () => {
    expect(timerAt(4, { meleeEnabled: false, rangedMagicEnabled: false })).toBeNull();
  });
});
