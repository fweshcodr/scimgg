import { describe, expect, it } from 'vitest';
import type { NpcCombatState } from '../../actors/types';
import {
  applyFlinch,
  flinchCooldownTicks,
  flinchWindowStartTick,
  isFlinchable,
  NPC_COMBAT_TIMEOUT_TICKS,
} from '../flinch';
import { scheduleNpcAction } from '../npcActionClock';

const IMPACT_TICK = 100;
const PLAYER = 'player';

function combatState(overrides: Partial<NpcCombatState> = {}): NpcCombatState {
  return {
    attackSpeed: 4,
    attackRange: 10,
    attackStyle: 'magic',
    nextActionTick: 0,
    targetId: null,
    animations: { idle: null, walk: null, run: null, attack: null, death: null },
    lastAttackTick: null,
    ...overrides,
  };
}

describe('flinchCooldownTicks', () => {
  it.each([
    ['Kalphite Queen', 4, 2],
    ['K\u2019ril Tsutsaroth', 6, 3],
    ['Scarab mage', 15, 7],
  ])('gives %s (speed %i) a %i-tick retaliation delay', (_npc, attackSpeed, expected) => {
    expect(flinchCooldownTicks(attackSpeed)).toBe(expected);
  });

  it.each([
    [1, 0],
    [2, 1],
    [5, 2],
  ])('rounds a speed-%i attacker down to %i', (attackSpeed, expected) => {
    expect(flinchCooldownTicks(attackSpeed)).toBe(expected);
  });
});

describe('flinchWindowStartTick', () => {
  const hit = { launchTick: 100, impactTick: 105 };

  it.each([
    ['melee', 'melee' as const, true],
    ['ranged', 'range' as const, true],
    ['magic', 'magic' as const, true],
    ['a missed melee attack', 'melee' as const, false],
    ['a missed ranged attack', 'range' as const, false],
  ])('starts %s at impact', (_label, style, accuracySucceeded) => {
    expect(flinchWindowStartTick({ ...hit, style, accuracySucceeded })).toBe(hit.impactTick);
  });

  it('starts a splashed spell on the NPC tick after the cast', () => {
    const splash = { ...hit, style: 'magic' as const, accuracySucceeded: false };

    expect(flinchWindowStartTick(splash)).toBe(hit.launchTick + 1);
  });
});

describe('isFlinchable', () => {
  it('accepts an NPC that has never attacked', () => {
    expect(isFlinchable(combatState(), IMPACT_TICK, PLAYER)).toBe(true);
  });

  it('refuses an NPC still inside the combat window with the player', () => {
    const combat = combatState({
      targetId: PLAYER,
      nextActionTick: IMPACT_TICK - NPC_COMBAT_TIMEOUT_TICKS,
    });

    expect(isFlinchable(combat, IMPACT_TICK, PLAYER)).toBe(false);
  });

  it('accepts an NPC one tick past the combat window', () => {
    const combat = combatState({
      targetId: PLAYER,
      nextActionTick: IMPACT_TICK - NPC_COMBAT_TIMEOUT_TICKS - 1,
    });

    expect(isFlinchable(combat, IMPACT_TICK, PLAYER)).toBe(true);
  });

  it('accepts an NPC swinging at another NPC however recently it acted', () => {
    const combat = combatState({ targetId: 'glyph', lastAttackTick: IMPACT_TICK });

    expect(isFlinchable(combat, IMPACT_TICK, PLAYER)).toBe(true);
  });

  it.each([
    { outgoing: null, incoming: null },
    { outgoing: null, incoming: 92 },
    { outgoing: null, incoming: 91 },
    { outgoing: 91, incoming: 92 },
    { outgoing: 92, incoming: 91 },
    { outgoing: 92, incoming: null },
    { outgoing: 100, incoming: 100 },
  ])('ignores metadata for outgoing=$outgoing incoming=$incoming', ({ outgoing, incoming }) => {
    const combat = combatState({
      targetId: PLAYER,
      lastAttackTick: outgoing,
      nextActionTick: 91,
      retaliation: { mode: 'standard', pending: [], lastIncomingAttackTick: incoming },
    });

    const flinchable = isFlinchable(combat, IMPACT_TICK, PLAYER);

    expect(flinchable).toBe(true);
  });

  it.each([
    'glyph',
    'other-player',
    null,
  ])('keeps target %s rephaseable despite recent incoming activity', (targetId) => {
    const combat = combatState({
      targetId,
      lastAttackTick: IMPACT_TICK,
      retaliation: { mode: 'standard', pending: [], lastIncomingAttackTick: IMPACT_TICK },
    });

    const flinchable = isFlinchable(combat, IMPACT_TICK, PLAYER);

    expect(flinchable).toBe(true);
  });
});

describe('applyFlinch', () => {
  it.each([
    [-1, 102],
    [0, 102],
    [1, 102],
    [2, 102],
    [3, 103],
    [4, 104],
  ])('never advances a glyph action with %s ticks remaining', (remaining, expected) => {
    const combat = combatState({ targetId: 'glyph', nextActionTick: IMPACT_TICK + remaining });

    const accepted = applyFlinch(combat, IMPACT_TICK, PLAYER);

    expect({ accepted, nextActionTick: combat.nextActionTick }).toEqual({ accepted: true, nextActionTick: expected });
  });

  it.each([8, 9])('anchors the strict combat window to successful action readiness at offset %s', (idleTicks) => {
    const combat = combatState({ targetId: PLAYER, lastAttackTick: 100 });
    scheduleNpcAction(combat, 100, 4);

    const accepted = applyFlinch(combat, 104 + idleTicks, PLAYER);

    expect(accepted).toBe(idleTicks === 9);
    expect(combat.nextActionTick).toBe(idleTicks === 9 ? 115 : 104);
  });

  it.each([
    [0, 100],
    [100, 100],
    [101, 101],
  ])('preserves rate-one readiness %s despite a zero-tick retaliation delay', (nextActionTick, expected) => {
    const combat = combatState({ attackSpeed: 1, nextActionTick });

    applyFlinch(combat, IMPACT_TICK, PLAYER);

    expect(combat.nextActionTick).toBe(expected);
  });
  it('re-phases an NPC that has never attacked', () => {
    const combat = combatState({ nextActionTick: 0 });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(true);
    expect(combat.nextActionTick).toBe(102);
  });

  it('leaves an NPC mid-rotation against the player on its own cadence', () => {
    const combat = combatState({
      nextActionTick: 101,
      targetId: PLAYER,
      lastAttackTick: IMPACT_TICK - 2,
    });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(false);
    expect(combat.nextActionTick).toBe(101);
  });

  it('re-phases an NPC mid-rotation against the glyph', () => {
    const combat = combatState({
      nextActionTick: 101,
      targetId: 'glyph',
      lastAttackTick: IMPACT_TICK - 2,
    });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(true);
    expect(combat.nextActionTick).toBe(102);
  });

  it('re-phases again once the NPC has dropped out of combat', () => {
    const combat = combatState({
      nextActionTick: IMPACT_TICK - NPC_COMBAT_TIMEOUT_TICKS - 1,
      targetId: PLAYER,
      lastAttackTick: IMPACT_TICK - NPC_COMBAT_TIMEOUT_TICKS - 1,
    });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(true);
    expect(combat.nextActionTick).toBe(102);
  });

  it('preserves a longer existing wait when the NPC is eligible', () => {
    const combat = combatState({ nextActionTick: 105 });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(true);
    expect(combat.nextActionTick).toBe(105);
  });

  it('accepts an eligible reaction even when the readiness tick stays equal', () => {
    const combat = combatState({ nextActionTick: 102 });

    expect(applyFlinch(combat, IMPACT_TICK, PLAYER)).toBe(true);
    expect(combat.nextActionTick).toBe(102);
  });
});
