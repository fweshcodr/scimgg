import { describe, expect, it } from 'vitest';
import { createVoidFlareActor } from '../../../npcs/yama/voidFlare';
import type { Coordinate } from '../../../types/simulation';

describe('createVoidFlareActor', () => {
  const id = 'vf-test-0';
  const position: Coordinate = [25, 30];
  const spawnTick = 61;

  function makeFlare() {
    return createVoidFlareActor({ id, damageRollIndex: 0, position, spawnTick, chargeTicks: 26 });
  }

  it('creates NpcActor with npcTypeId 14179', () => {
    expect(makeFlare().npcTypeId).toBe(14179);
  });

  it('spawns with hp 71 (half) and maxHp 140 (from NPC data)', () => {
    const actor = makeFlare();
    expect(actor.vitals.hp).toBe(71);
    expect(actor.vitals.maxHp).toBe(140);
  });

  it('respects a custom starting hp while keeping maxHp 140', () => {
    const actor = createVoidFlareActor({ id, damageRollIndex: 0, position, spawnTick, chargeTicks: 26, currentHp: 35 });
    expect(actor.vitals.hp).toBe(35);
    expect(actor.vitals.maxHp).toBe(140);
  });

  it('has size 2 and role minion', () => {
    const actor = makeFlare();
    expect(actor.size).toBe(2);
    expect(actor.role).toBe('minion');
  });

  it('has combat.animations.death === 12134', () => {
    expect(makeFlare().combat.animations.death).toBe(12134);
  });

  it('has combat.animations.idle === 12133', () => {
    expect(makeFlare().combat.animations.idle).toBe(12133);
  });

  it('uses synchronized formula stats for player accuracy', () => {
    const actor = makeFlare();
    const formulaStats = actor.formulaStats;
    if (formulaStats === undefined) throw new TypeError('Expected void flare formula stats');
    const def = formulaStats.defensive;
    expect(def.stab).toBe(0);
    expect(def.slash).toBe(0);
    expect(def.crush).toBe(0);
    expect(def.rangedLight).toBe(0);
    expect(def.rangedStandard).toBe(0);
    expect(def.rangedHeavy).toBe(0);
    expect(def.magic).toBe(0);

    expect(formulaStats.levels.defence).toBe(100);
    expect(formulaStats.levels.magic).toBe(200);
  });

  it('archetypeId is voidflare', () => {
    expect(makeFlare().archetypeId).toBe('voidflare');
  });

  it('id matches the provided id param', () => {
    expect(makeFlare().id).toBe(id);
    expect(
      createVoidFlareActor({ id: 'vf-99', damageRollIndex: 99, position: [20, 20], spawnTick: 100, chargeTicks: 26 })
        .id,
    ).toBe('vf-99');
  });

  it('position matches the provided position param', () => {
    const actor = makeFlare();
    expect(actor.position).toEqual(position);
    expect(actor.previousPosition).toEqual(position);
  });

  it('is alive by default', () => {
    expect(makeFlare().alive).toBe(true);
  });

  it('kind is npc', () => {
    expect(makeFlare().kind).toBe('npc');
  });

  it('has no attack capability (attackSpeed 0, attackRange 0)', () => {
    const actor = makeFlare();
    expect(actor.combat.attackSpeed).toBe(0);
    expect(actor.combat.attackRange).toBe(0);
    expect(actor.combat.targetId).toBeNull();
  });
});
