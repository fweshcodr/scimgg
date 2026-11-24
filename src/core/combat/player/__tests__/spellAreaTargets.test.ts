import { describe, expect, it } from 'vitest';
import type { NpcActor } from '../../../actors/NpcActor';
import { canReceiveNewAttack } from '../../../npcDeath';
import { selectSecondarySpellTargets } from '../spellAreaTargets';

function npc(id: string, position: readonly [number, number], size = 1, alive = true): NpcActor {
  return {
    id,
    kind: 'npc',
    alive,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    size,
    vitals: { hp: 100, maxHp: 100 },
    npcTypeId: 1,
    archetypeId: id,
    history: new Map(),
    combat: {
      attackSpeed: 4,
      attackRange: 1,
      attackStyle: 'melee',
      nextActionTick: 0,
      targetId: 'player',
      animations: {},
    },
  } as NpcActor;
}

describe('selectSecondarySpellTargets', () => {
  it('uses true tiles rather than either actor footprint', () => {
    const primary = npc('primary', [10, 10], 3);
    const inside = npc('inside', [9, 9]);
    const insideLarge = npc('inside-large', [11, 11], 3);
    const overlappingFootprintOnly = npc('overlapping-footprint-only', [7, 10], 3);
    const visuallyAdjacentEast = npc('visually-adjacent-east', [12, 10]);
    const footprintOnlyNorth = npc('footprint-only-north', [10, 12]);
    const dead = npc('dead', [10, 9], 1, false);

    expect(
      selectSecondarySpellTargets(
        primary,
        [primary, inside, insideLarge, overlappingFootprintOnly, visuallyAdjacentEast, footprintOnlyNorth, dead],
        { radius: 1, maxTargets: 9 },
        canReceiveNewAttack,
      ).map((target) => target.id),
    ).toEqual(['inside', 'inside-large']);
  });

  it('keeps the total target count at nine including the primary', () => {
    const primary = npc('primary', [10, 10]);
    const candidates = Array.from({ length: 10 }, (_, index) => npc(`secondary-${index}`, [10, 10]));

    expect(
      selectSecondarySpellTargets(primary, candidates, { radius: 1, maxTargets: 9 }, canReceiveNewAttack).map(
        (target) => target.id,
      ),
    ).toEqual(candidates.slice(0, 8).map((target) => target.id));
  });
});
