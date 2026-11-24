import { describe, expect, it, vi } from 'vitest';
import { getAutocastableSpells } from '../../../../data/spellCatalog';
import type { PlayerEquipment } from '../../../../rs/model/PlayerModelLoader';
import { resolveSpellHitEffects, resolveSpellLaunchHeal, SMOKE_POISON_CHANCE } from '../spellHitEffects';

const never = (): number => 1;
const always = (): number => 0;

/** No weapon: the base, unboosted amounts. */
const BARE: Readonly<PlayerEquipment> = {};
/** Canonical Ice ancient sceptre. Any of the five upgrades boosts all four families alike. */
const SCEPTRE: Readonly<PlayerEquipment> = { weapon: 28262 };

describe('resolveSpellHitEffects', () => {
  it('gives every Ancient combat spell the secondary effect its family is named for', () => {
    const effects = Object.fromEntries(
      getAutocastableSpells('ancient').map((spell) => [
        spell.name,
        resolveSpellHitEffects(spell.name, always, BARE)?.[0],
      ]),
    );

    expect(effects).toEqual({
      'Smoke Rush': { effect: 'poison', severity: 10 },
      'Smoke Burst': { effect: 'poison', severity: 10 },
      'Smoke Blitz': { effect: 'poison', severity: 20 },
      'Smoke Barrage': { effect: 'poison', severity: 20 },
      'Shadow Rush': { effect: 'drain_attack', percent: 10 },
      'Shadow Burst': { effect: 'drain_attack', percent: 10 },
      'Shadow Blitz': { effect: 'drain_attack', percent: 15 },
      'Shadow Barrage': { effect: 'drain_attack', percent: 15 },
      // Blood carries no post-hit effect at all: its heal rides the cast tick instead.
      'Blood Rush': undefined,
      'Blood Burst': undefined,
      'Blood Blitz': undefined,
      'Blood Barrage': undefined,
      'Ice Rush': { effect: 'freeze', durationTicks: 8 },
      'Ice Burst': { effect: 'freeze', durationTicks: 16 },
      'Ice Blitz': { effect: 'freeze', durationTicks: 24 },
      'Ice Barrage': { effect: 'freeze', durationTicks: 32 },
    });
  });

  it('resolves Blood as a launch heal rather than a post-hit effect', () => {
    // The capture puts the drain MESSAGE on the FIRE tick while the impact spotanim is still
    // `delay` cycles out, so this must not resolve through postHitEffects. The hitpoints lines in
    // that capture are XP drops from a caster at 99/99, NOT heals; `resolveSpellLaunchHeal` carries
    // the full evidence and the part of it that stays inference.
    for (const spell of ['Blood Rush', 'Blood Burst', 'Blood Blitz', 'Blood Barrage']) {
      expect(resolveSpellLaunchHeal(spell), spell).toEqual({ percentOfDamage: 25, minimumHeal: 0 });
      expect(resolveSpellHitEffects(spell, always, BARE), spell).toBeUndefined();
    }
  });

  it('gives the other three families no launch heal', () => {
    for (const spell of ['Smoke Barrage', 'Shadow Barrage', 'Ice Barrage', 'Fire Surge']) {
      expect(resolveSpellLaunchHeal(spell), spell).toBeUndefined();
    }
    expect(resolveSpellLaunchHeal(undefined)).toBeUndefined();
  });

  // Pinned to the literal 1/8 from /w/Smoke_spells rather than derived from the constant: bounds
  // computed off SMOKE_POISON_CHANCE pass for ANY value it holds, so they never check the rate.
  it('rolls Smoke poison at one in eight, and only for Smoke', () => {
    expect(SMOKE_POISON_CHANCE).toBe(0.125);

    expect(resolveSpellHitEffects('Smoke Barrage', () => 0.124, BARE)).toEqual([{ effect: 'poison', severity: 20 }]);
    expect(resolveSpellHitEffects('Smoke Barrage', () => 0, BARE)).toEqual([{ effect: 'poison', severity: 20 }]);
    expect(resolveSpellHitEffects('Smoke Barrage', () => 0.125, BARE)).toBeUndefined();
    expect(resolveSpellHitEffects('Smoke Barrage', () => 0.126, BARE)).toBeUndefined();
    expect(resolveSpellHitEffects('Smoke Barrage', never, BARE)).toBeUndefined();
  });

  it('draws no randomness for the three families that always apply', () => {
    const random = vi.fn(always);

    for (const spell of ['Shadow Barrage', 'Ice Barrage']) {
      expect(resolveSpellHitEffects(spell, random, BARE)).toHaveLength(1);
    }

    expect(random).not.toHaveBeenCalled();
  });

  it('leaves spells without a secondary effect alone', () => {
    expect(resolveSpellHitEffects('Fire Surge', always, BARE)).toBeUndefined();
    expect(resolveSpellHitEffects('Undead Grasp', always, BARE)).toBeUndefined();
    expect(resolveSpellHitEffects(undefined, always, BARE)).toBeUndefined();
    expect(resolveSpellHitEffects('Not A Spell', always, BARE)).toBeUndefined();
  });

  describe('Ancient sceptre', () => {
    // /w/Ice_spells?oldid=15304566 states the boosted durations outright: 8/17/26/35.
    it.each([
      { spell: 'Ice Rush', base: 8, boosted: 8 },
      { spell: 'Ice Burst', base: 16, boosted: 17 },
      { spell: 'Ice Blitz', base: 24, boosted: 26 },
      { spell: 'Ice Barrage', base: 32, boosted: 35 },
    ])('extends $spell from $base to $boosted ticks', ({ spell, base, boosted }) => {
      expect(resolveSpellHitEffects(spell, always, BARE)).toEqual([{ effect: 'freeze', durationTicks: base }]);
      expect(resolveSpellHitEffects(spell, always, SCEPTRE)).toEqual([{ effect: 'freeze', durationTicks: boosted }]);
    });

    it.each([
      { spell: 'Smoke Rush', severity: 11 },
      { spell: 'Smoke Barrage', severity: 22 },
    ])('raises $spell poison severity to $severity without touching the 1/8 chance', ({ spell, severity }) => {
      expect(resolveSpellHitEffects(spell, always, SCEPTRE)).toEqual([{ effect: 'poison', severity }]);
      // The chance boundary is unchanged: 0.125 still fails, so the sceptre scales severity only.
      expect(resolveSpellHitEffects(spell, () => 0.125, SCEPTRE)).toBeUndefined();
    });

    it.each([
      { spell: 'Shadow Rush', percent: 11 },
      { spell: 'Shadow Barrage', percent: 16.5 },
    ])('raises $spell drain to $percent percent, unfloored', ({ spell, percent }) => {
      // 16.5 must survive as a fraction: `drainOfCurrentLevel` floors the integer stat loss once,
      // at the end, so flooring to 16 here would quietly shrink every Blitz/Barrage drain.
      expect(resolveSpellHitEffects(spell, always, SCEPTRE)).toEqual([{ effect: 'drain_attack', percent }]);
    });

    it.each([
      27624, 28260, 28264, 28262, 28266, 27626, 28473, 28474, 28475, 28476,
    ])('recognizes canonical and aliased sceptre id %i', (weapon) => {
      expect(resolveSpellHitEffects('Ice Barrage', always, { weapon })).toEqual([
        { effect: 'freeze', durationTicks: 35 },
      ]);
    });

    it.each([28254, 1381, 28238, undefined])('leaves the base amounts alone for non-sceptre weapon %s', (weapon) => {
      expect(resolveSpellHitEffects('Ice Barrage', always, weapon === undefined ? {} : { weapon })).toEqual([
        { effect: 'freeze', durationTicks: 32 },
      ]);
    });

    it('does not touch the Blood heal, whose combined rounding is unsettled', () => {
      expect(resolveSpellLaunchHeal('Blood Barrage')).toEqual({ percentOfDamage: 25, minimumHeal: 0 });
      expect(resolveSpellHitEffects('Blood Barrage', always, SCEPTRE)).toBeUndefined();
    });
  });
});
