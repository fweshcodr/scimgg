import { describe, expect, it } from 'vitest';
import { createEmptyStats, type EquipmentStats } from '../../../types/equipmentStats';
import { CALC_GAPS } from '../combatGaps';
import {
  doubleRollHitChance,
  hitChance,
  type NpcFormulaActor,
  type PlayerFormulaActor,
  type PrayerMultipliers,
  steadyStateHitChance,
} from '../formulas';
import { selectPlayerAttackProfile } from '../player/playerAttackProfileSelection';
import { type PlayerAttackProfile, type PlayerAttackRequest, planPlayerAttack } from '../playerAttackPlanning';
import type { AccuracyBranchProfile, SplitShareProfile } from '../playerAttackProfiles';
import { projectPlayerAttack } from '../playerAttackProjection';
import { resolvePlayerAttack } from '../playerAttackResolution';
import type { NonEmptyReadonlyArray, ReadyPlayerAttackPlan } from '../playerAttackTypes';

const ATTACKER: PlayerFormulaActor = {
  kind: 'player',
  levels: { attack: 99, strength: 99, defence: 99, ranged: 99, magic: 99 },
  stance: 'Controlled',
};

const TARGET: NpcFormulaActor = {
  kind: 'npc',
  levels: { attack: 1, strength: 1, defence: 80, ranged: 1, magic: 80 },
  offensive: { atk: 0, str: 0, ranged: 0, rangedStr: 0, magic: 0, magicStr: 0 },
  defensive: { stab: 36, slash: 20, crush: 36, rangedLight: 36, rangedStandard: 36, rangedHeavy: 36, magic: 36 },
};

const NO_PRAYERS: PrayerMultipliers = {
  attack: 1,
  strength: 1,
  defence: 1,
  ranged: 1,
  rangedStrength: 1,
  magic: 1,
  magicDamage: 1,
};

const EQUIPMENT: EquipmentStats = {
  ...createEmptyStats(),
  attackSlash: 100,
  meleeStrength: 176,
};

const APPLICATION = {
  outgoingDamageMultiplier: 1.25,
  specialAttackDamageMultiplier: 1.5,
} as const;

function request(
  profile: PlayerAttackProfile,
  overrides: Partial<Omit<PlayerAttackRequest, 'profile'>> = {},
): PlayerAttackRequest {
  return {
    attacker: ATTACKER,
    target: TARGET,
    formulaStyle: 'melee_slash',
    equipmentStats: EQUIPMENT,
    prayerMultipliers: NO_PRAYERS,
    attackSpeedTicks: 5,
    delivery: { style: 'melee', attackKind: 'melee_slash', impactDelayTicks: 3 },
    application: APPLICATION,
    profile,
    rangedDefenceType: 'standard',
    ...overrides,
  };
}

function readyPlan(
  profile: PlayerAttackProfile,
  overrides: Partial<Omit<PlayerAttackRequest, 'profile'>> = {},
): ReadyPlayerAttackPlan {
  const plan = planPlayerAttack(request(profile, overrides));
  switch (plan.kind) {
    case 'ready':
      return plan;
    case 'unsupported':
      throw new TypeError(`Expected ready plan, received gaps: ${plan.gaps.join(', ')}`);
    default:
      return plan;
  }
}

describe('planPlayerAttack', () => {
  it('compiles an ordinary standard-accuracy hit and preserves attack metadata', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'standard' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile);

    expect(plan).toEqual({
      kind: 'ready',
      attackSpeedTicks: 5,
      application: APPLICATION,
      diagnostics: {
        baseAttackRoll: 17_712,
        baseDefenceRoll: 7_476,
        baseMaxHit: 41,
        profileMaxHit: 41,
      },
      hits: [
        {
          style: 'melee',
          attackKind: 'melee_slash',
          impactDelayTicks: 3,
          gate: { kind: 'always' },
          accuracy: { kind: 'roll', chance: hitChance(17_712, 7_476) },
          damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 41 },
        },
      ],
    });
  });

  it('floors staged attack-roll modifiers before applying double-roll accuracy', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: {
          kind: 'doubleRoll',
          attackRollStages: [
            { numerator: 4, denominator: 5 },
            { numerator: 3, denominator: 2 },
          ],
        },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile);

    expect(plan.hits[0].accuracy).toEqual({
      kind: 'roll',
      chance: doubleRollHitChance(21_253, 7_476),
    });
  });

  it('compiles steady-state standard accuracy from single- and double-roll probabilities', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'standard' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile, { standardAccuracyMode: 'steady_state' });
    const singlePlan = readyPlan(profile, { standardAccuracyMode: 'single_roll' });
    const doublePlan = readyPlan(profile, { standardAccuracyMode: 'double_roll' });
    const singleAccuracy = singlePlan.hits[0].accuracy;
    const doubleAccuracy = doublePlan.hits[0].accuracy;
    if (singleAccuracy.kind !== 'roll' || doubleAccuracy.kind !== 'roll') {
      throw new TypeError('Expected roll accuracy plans');
    }

    expect(plan.hits[0].accuracy).toEqual({
      kind: 'roll',
      chance: steadyStateHitChance(singleAccuracy.chance, doubleAccuracy.chance),
    });
  });

  it('compiles guaranteed accuracy without roll stages or chance', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'guaranteed' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile);

    expect(plan.hits[0].accuracy).toEqual({ kind: 'guaranteed' });
  });

  it('floors each staged max-hit modifier in sequence', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: {
        kind: 'staged',
        stages: [
          { numerator: 7, denominator: 6 },
          { numerator: 3, denominator: 2 },
        ],
      },
      hit: {
        accuracy: { kind: 'guaranteed' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile);

    expect(plan.hits[0].damage).toEqual({ kind: 'uniform', minimumInclusive: 0, maximumInclusive: 70 });
  });

  it('wraps an ordinary Magic roll with the landed-damage minimum', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'guaranteed' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const plan = readyPlan(profile, {
      attacker: { ...ATTACKER, magicBaseMaxHit: 29 },
      formulaStyle: 'magic',
      equipmentStats: createEmptyStats(),
      delivery: { style: 'magic', attackKind: 'magic_fire', impactDelayTicks: 4 },
    });

    expect(plan.hits[0].damage).toEqual({
      kind: 'minimum',
      minimumDamage: 1,
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 29 },
    });
  });

  it('rounds each explicit fractional bound without adding the Magic minimum wrapper', () => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'uniformMaxHitFractionBounds',
          minimum: { ratio: { numerator: 1, denominator: 3 }, rounding: 'ceiling' },
          maximum: { ratio: { numerator: 1, denominator: 2 }, rounding: 'floor' },
        },
      },
    };

    const plan = readyPlan(profile, {
      attacker: { ...ATTACKER, magicBaseMaxHit: 41 },
      formulaStyle: 'magic',
      equipmentStats: createEmptyStats(),
      delivery: { style: 'magic', attackKind: 'magic_shadow', impactDelayTicks: 2 },
    });

    expect(plan.hits[0].damage).toEqual({ kind: 'uniform', minimumInclusive: 14, maximumInclusive: 20 });
  });

  it('compiles independently accurate multi-hits from floored maximum fractions', () => {
    const profile: PlayerAttackProfile = {
      kind: 'independentMultiHit',
      maxHit: { kind: 'base' },
      accuracy: { kind: 'standard' },
      maximumFractions: [
        { numerator: 1, denominator: 2 },
        { numerator: 1, denominator: 3 },
      ],
    };

    const plan = readyPlan(profile);

    expect(plan.hits).toEqual([
      {
        style: 'melee',
        attackKind: 'melee_slash',
        impactDelayTicks: 3,
        gate: { kind: 'always' },
        accuracy: { kind: 'roll', chance: hitChance(17_712, 7_476) },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 20 },
      },
      {
        style: 'melee',
        attackKind: 'melee_slash',
        impactDelayTicks: 3,
        gate: { kind: 'always' },
        accuracy: { kind: 'roll', chance: hitChance(17_712, 7_476) },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 13 },
      },
    ]);
  });

  it('gates an independently rolled second hit and preserves an odd floor-ceiling split', () => {
    const profile: PlayerAttackProfile = {
      kind: 'secondHitIfFirstAccurate',
      maxHit: { kind: 'base' },
      first: {
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'uniformMaxHitFractionBounds',
          minimum: { ratio: { numerator: 0, denominator: 1 }, rounding: 'floor' },
          maximum: { ratio: { numerator: 1, denominator: 2 }, rounding: 'floor' },
        },
      },
      second: {
        impactDelayOffsetTicks: 1,
        accuracy: { kind: 'doubleRoll' },
        damage: {
          kind: 'uniformMaxHitFractionBounds',
          minimum: { ratio: { numerator: 0, denominator: 1 }, rounding: 'ceiling' },
          maximum: { ratio: { numerator: 1, denominator: 2 }, rounding: 'ceiling' },
        },
      },
    };

    const plan = readyPlan(profile);

    expect(plan.hits.map((hit) => hit.impactDelayTicks)).toEqual([3, 4]);
    expect(plan.hits[0].damage).toEqual({ kind: 'uniform', minimumInclusive: 0, maximumInclusive: 20 });
    expect(plan.hits[1]).toMatchObject({
      gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
      accuracy: { kind: 'roll', chance: doubleRollHitChance(17_712, 7_476) },
      damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 21 },
    });
  });

  it('compiles guaranteed follow-ups from referenced prior damage', () => {
    const profile: PlayerAttackProfile = {
      kind: 'priorDamageHits',
      maxHit: { kind: 'base' },
      first: {
        accuracy: { kind: 'standard' },
        damage: { kind: 'uniformToMaxHit' },
      },
      followUps: [
        { referenceHitIndex: 0, fraction: { numerator: 1, denominator: 2 }, impactDelayOffsetTicks: 2 },
        { referenceHitIndex: 1, fraction: { numerator: 2, denominator: 3 } },
      ],
    };

    const plan = readyPlan(profile);

    expect(plan.hits.map((hit) => hit.impactDelayTicks)).toEqual([3, 5, 3]);
    expect(plan.hits.slice(1)).toEqual([
      {
        style: 'melee',
        attackKind: 'melee_slash',
        impactDelayTicks: 5,
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'floorFractionOfPriorHit',
          priorHitIndex: 0,
          numerator: 1,
          denominator: 2,
        },
      },
      {
        style: 'melee',
        attackKind: 'melee_slash',
        impactDelayTicks: 3,
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 1 },
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'floorFractionOfPriorHit',
          priorHitIndex: 1,
          numerator: 2,
          denominator: 3,
        },
      },
    ]);
  });

  it.each([-1, 0.5])('rejects invalid impact-delay offset %s', (impactDelayOffsetTicks) => {
    const profile: PlayerAttackProfile = {
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        impactDelayOffsetTicks,
        accuracy: { kind: 'guaranteed' },
        damage: { kind: 'uniformToMaxHit' },
      },
    };

    const compile = (): ReadyPlayerAttackPlan => readyPlan(profile);

    expect(compile).toThrow(RangeError);
  });

  it("compiles the wiki's Burning barrage ranges for a 39 max hit", () => {
    const share = (numerator: number, denominator: number, offset: number): SplitShareProfile => ({
      fraction: { numerator, denominator },
      offset,
    });
    const branch = (
      minimum: number,
      maximum: number,
      shares: NonEmptyReadonlyArray<SplitShareProfile>,
    ): AccuracyBranchProfile => ({
      totalMinimum: { ratio: { numerator: minimum, denominator: 4 }, rounding: 'floor' },
      totalMaximum: { ratio: { numerator: maximum, denominator: 4 }, rounding: 'floor' },
      shares,
    });
    const profile: PlayerAttackProfile = {
      kind: 'accuracyBranchedSplit',
      // The fixture's base max hit is 41; 39/41 pins it to the 39 the wiki works its example from.
      maxHit: { kind: 'staged', stages: [{ numerator: 39, denominator: 41 }] },
      accuracy: { kind: 'standard' },
      branches: [
        branch(3, 7, [share(1, 4, 0), share(1, 4, 0), share(1, 2, 0)]),
        branch(2, 6, [share(1, 2, -1), share(1, 2, -1), share(0, 1, 2)]),
        branch(1, 5, [share(0, 1, 1), share(0, 1, 1), share(1, 1, -2)]),
      ],
      allMiss: [
        { weight: 20, damages: [0, 0, 0] },
        { weight: 40, damages: [0, 0, 1] },
        { weight: 40, damages: [0, 0, 2] },
      ],
    };

    const plan = readyPlan(profile);

    expect(plan.branchSelection?.attempts.map((attempt) => attempt.total)).toEqual([
      { minimumInclusive: 29, maximumInclusive: 68 },
      { minimumInclusive: 19, maximumInclusive: 58 },
      { minimumInclusive: 9, maximumInclusive: 48 },
    ]);
  });

  it('rejects an all-miss outcome that does not cover every hitsplat', () => {
    const profile: PlayerAttackProfile = {
      kind: 'accuracyBranchedSplit',
      maxHit: { kind: 'base' },
      accuracy: { kind: 'standard' },
      branches: [
        {
          totalMinimum: { ratio: { numerator: 1, denominator: 1 }, rounding: 'floor' },
          totalMaximum: { ratio: { numerator: 1, denominator: 1 }, rounding: 'floor' },
          shares: [
            { fraction: { numerator: 1, denominator: 2 }, offset: 0 },
            { fraction: { numerator: 1, denominator: 2 }, offset: 0 },
          ],
        },
      ],
      allMiss: [{ weight: 1, damages: [0] }],
    };

    expect(() => readyPlan(profile)).toThrow(RangeError);
  });

  it('returns unsupported gaps unchanged without a partial ready plan', () => {
    const gaps = [CALC_GAPS.ANIMATION_ONLY_SPECIAL, CALC_GAPS.PVP] as const;
    const profile: PlayerAttackProfile = { kind: 'unsupported', gaps };

    const plan = planPlayerAttack(request(profile));

    expect(plan).toEqual({ kind: 'unsupported', gaps });
    switch (plan.kind) {
      case 'unsupported':
        expect(plan.gaps).toBe(gaps);
        break;
      case 'ready':
        throw new TypeError('Expected unsupported plan');
      default:
        return plan;
    }
  });
});

describe('dragon claws Slice and Dice', () => {
  // The fixture's max hit is 41, and nothing in it adds an ordinary modifier stage.
  const profile = selectPlayerAttackProfile({ weaponId: 13652, targetSize: 1, isSpecialAttack: true });
  if (profile === null) throw new TypeError('Expected a Slice and Dice profile');
  const plan = readyPlan(profile);

  /** Resolves the swing with `misses` failed accuracy rolls, then a total roll landing on `total`. */
  function splats(misses: number, total: number): number[] {
    const attempt = plan.branchSelection?.attempts[misses];
    if (attempt === undefined) throw new RangeError(`No attempt ${misses}`);
    const { minimumInclusive, maximumInclusive } = attempt.total;
    const totalRoll = (total - minimumInclusive + 0.5) / (maximumInclusive - minimumInclusive + 1);
    const rolls = [...Array.from({ length: misses }, () => 0.999), 0, totalRoll];
    return resolvePlayerAttack(plan, () => rolls.shift() ?? 0).hits.map((hit) => hit.rolledDamage);
  }

  it('rolls the first landed strike between the wiki bounds for each branch', () => {
    expect(plan.hits).toHaveLength(4);
    expect(plan.branchSelection?.attempts.map((attempt) => attempt.total)).toEqual([
      { minimumInclusive: 20, maximumInclusive: 40 }, // half to one less than the max hit
      { minimumInclusive: 15, maximumInclusive: 35 }, // 3/8 to 7/8
      { minimumInclusive: 10, maximumInclusive: 30 }, // 1/4 to 3/4
      { minimumInclusive: 10, maximumInclusive: 51 }, // 1/4 to 5/4
    ]);
  });

  it.each([
    { misses: 0, total: 35, expected: [35, 17, 8, 9] },
    { misses: 1, total: 30, expected: [0, 30, 15, 16] },
    { misses: 2, total: 22, expected: [0, 0, 22, 23] },
    { misses: 3, total: 46, expected: [0, 0, 0, 46] },
  ])('reproduces the wiki example $expected', ({ misses, total, expected }) => {
    expect(splats(misses, total)).toEqual(expected);
  });

  it('lands an all-miss swing as 0-0-0-0 a third of the time and two single points otherwise', () => {
    const allMiss = (weightRoll: number) => {
      const rolls = [0.999, 0.999, 0.999, 0.999, weightRoll];
      return resolvePlayerAttack(plan, () => rolls.shift() ?? 0).hits.map((hit) => hit.rolledDamage);
    };
    expect(allMiss(0.3)).toEqual([0, 0, 0, 0]);
    expect(allMiss(0.4)).toEqual([1, 1, 0, 0]);
    expect(allMiss(0.55)).toEqual([0, 0, 1, 1]);
    expect(allMiss(0.7)).toEqual([1, 0, 1, 0]);
    expect(allMiss(0.9)).toEqual([0, 1, 0, 1]);
  });

  it('projects the all-miss outcomes jointly, so a missed swing never totals more than 2', () => {
    const selection = plan.branchSelection;
    if (selection === undefined) throw new TypeError('Expected a branch selection');
    const [first, ...rest] = selection.attempts;
    const certainMiss = {
      ...plan,
      branchSelection: {
        ...selection,
        attempts: [{ ...first, chance: 0 }, ...rest.map((attempt) => ({ ...attempt, chance: 0 }))] as const,
      },
    };
    const projection = projectPlayerAttack(certainMiss);
    expect(projection.maximumRolledDamagePerAttack).toBe(2);
    expect(projection.expectedRolledDamagePerAttack).toBeCloseTo(4 / 3);
  });
});
