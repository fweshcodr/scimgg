import {
  PARAM_ATTACK_CRUSH,
  PARAM_ATTACK_MAGIC,
  PARAM_ATTACK_RANGE,
  PARAM_ATTACK_RANGED,
  PARAM_ATTACK_SLASH,
  PARAM_ATTACK_SPEED,
  PARAM_ATTACK_STAB,
  PARAM_DEFENCE_CRUSH,
  PARAM_DEFENCE_MAGIC,
  PARAM_DEFENCE_RANGED,
  PARAM_DEFENCE_SLASH,
  PARAM_DEFENCE_STAB,
  PARAM_MAGIC_DAMAGE,
  PARAM_MELEE_STRENGTH,
  PARAM_PRAYER,
  PARAM_RANGED_STRENGTH_AMMO,
  PARAM_RANGED_STRENGTH_WORN,
} from '../src/types/equipmentStats';

export interface Witness {
  readonly item: number;
  readonly name: string;
  /** Published combat stats from the item's OSRS Wiki page. */
  readonly wiki: ReadonlyArray<readonly [param: number, label: string, expected: number]>;
}

export const WITNESSES: readonly Witness[] = [
  {
    item: 6585,
    name: 'Amulet of fury',
    wiki: [
      [PARAM_ATTACK_STAB, 'stab attack', 10],
      [PARAM_ATTACK_SLASH, 'slash attack', 10],
      [PARAM_ATTACK_CRUSH, 'crush attack', 10],
      [PARAM_ATTACK_MAGIC, 'magic attack', 10],
      [PARAM_ATTACK_RANGED, 'ranged attack', 10],
      [PARAM_DEFENCE_STAB, 'stab defence', 15],
      [PARAM_DEFENCE_SLASH, 'slash defence', 15],
      [PARAM_DEFENCE_CRUSH, 'crush defence', 15],
      [PARAM_DEFENCE_MAGIC, 'magic defence', 15],
      [PARAM_DEFENCE_RANGED, 'ranged defence', 15],
      [PARAM_MELEE_STRENGTH, 'melee strength', 8],
      [PARAM_PRAYER, 'prayer', 5],
    ],
  },
  {
    item: 11832,
    name: 'Bandos chestplate',
    // Distinct defence bonuses separate ids that the other witnesses cannot distinguish.
    wiki: [
      [PARAM_ATTACK_MAGIC, 'magic attack', -15],
      [PARAM_ATTACK_RANGED, 'ranged attack', -10],
      [PARAM_DEFENCE_STAB, 'stab defence', 98],
      [PARAM_DEFENCE_SLASH, 'slash defence', 93],
      [PARAM_DEFENCE_CRUSH, 'crush defence', 105],
      [PARAM_DEFENCE_MAGIC, 'magic defence', -6],
      [PARAM_DEFENCE_RANGED, 'ranged defence', 133],
      [PARAM_MELEE_STRENGTH, 'melee strength', 4],
      [PARAM_PRAYER, 'prayer', 1],
    ],
  },
  {
    item: 4151,
    name: 'Abyssal whip',
    wiki: [
      [PARAM_ATTACK_SLASH, 'slash attack', 82],
      [PARAM_MELEE_STRENGTH, 'melee strength', 82],
      [PARAM_ATTACK_SPEED, 'attack speed (ticks)', 4],
    ],
  },
  {
    item: 1127,
    name: 'Rune platebody',
    wiki: [
      [PARAM_ATTACK_MAGIC, 'magic attack', -30],
      [PARAM_ATTACK_RANGED, 'ranged attack', -15],
      [PARAM_DEFENCE_STAB, 'stab defence', 82],
      [PARAM_DEFENCE_SLASH, 'slash defence', 80],
      [PARAM_DEFENCE_CRUSH, 'crush defence', 72],
      [PARAM_DEFENCE_MAGIC, 'magic defence', -6],
      [PARAM_DEFENCE_RANGED, 'ranged defence', 80],
    ],
  },
  {
    item: 1215,
    name: 'Dragon dagger',
    wiki: [
      [PARAM_ATTACK_STAB, 'stab attack', 40],
      [PARAM_ATTACK_SLASH, 'slash attack', 25],
      [PARAM_ATTACK_CRUSH, 'crush attack', -4],
    ],
  },
  {
    item: 9185,
    name: 'Rune crossbow',
    wiki: [
      [PARAM_ATTACK_RANGED, 'ranged attack', 90],
      [PARAM_ATTACK_RANGE, 'attack range (tiles)', 7],
      [PARAM_ATTACK_SPEED, 'attack speed (ticks)', 6],
    ],
  },
  {
    item: 892,
    name: 'Rune arrow',
    wiki: [[PARAM_RANGED_STRENGTH_AMMO, 'ranged strength (ammunition)', 49]],
  },
  {
    item: 22109,
    name: "Ava's assembler",
    wiki: [[PARAM_RANGED_STRENGTH_WORN, 'ranged strength (worn)', 2]],
  },
  {
    item: 21018,
    name: 'Ancestral hat',
    // The published +3% is stored as 30, establishing the tenths-of-a-percent scale.
    wiki: [[PARAM_MAGIC_DAMAGE, 'magic damage (tenths of a percent)', 30]],
  },
];

export type ParamReadings = ReadonlyMap<number, ReadonlyMap<number, number>>;

export function paramsUnderTest(witnesses: readonly Witness[] = WITNESSES): number[] {
  const ids = new Set<number>();
  for (const witness of witnesses) {
    for (const [param] of witness.wiki) ids.add(param);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Finds a non-identity one-to-one assignment of ids that satisfies every cache reading.
 * Searching complete assignments catches cycles that pairwise swaps miss. Candidates must
 * come from the same cross-read cache data as the verifier because declarations on disjoint
 * witness items cannot distinguish ids by themselves.
 */
export function unpinnedParams(witnesses: readonly Witness[], readings: ParamReadings): string[] {
  const ids = paramsUnderTest(witnesses);
  const expectations = new Map<number, Array<{ item: number; expected: number }>>();
  for (const witness of witnesses) {
    for (const [param, , expected] of witness.wiki) {
      const rows = expectations.get(param) ?? [];
      rows.push({ item: witness.item, expected });
      expectations.set(param, rows);
    }
  }

  const candidates = new Map(
    ids.map((param) => {
      const rows = expectations.get(param) ?? [];
      return [param, ids.filter((id) => rows.every(({ item, expected }) => readings.get(item)?.get(id) === expected))];
    }),
  );

  const taken = new Set<number>();
  const rival: Array<[number, number]> = [];
  const search = (index: number, diverged: boolean): boolean => {
    if (index === ids.length) return diverged;
    const param = ids[index];
    for (const id of candidates.get(param) ?? []) {
      if (taken.has(id)) continue;
      taken.add(id);
      if (search(index + 1, diverged || id !== param)) {
        if (id !== param) rival.push([param, id]);
        return true;
      }
      taken.delete(id);
    }
    return false;
  };

  if (!search(0, false)) return [];
  return rival
    .sort(([a], [b]) => a - b)
    .map(([param, id]) => `param ${param} is indistinguishable from ${id} across every witness`);
}
