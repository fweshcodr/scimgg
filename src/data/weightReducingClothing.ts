import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';

/**
 * Weight-reducing clothing is two items: equipping swaps the inventory form for a "worn" form
 * whose cache weight is the reduced value (boots of lightness 88 weighs 0.34 kg, worn 89 weighs
 * -4.535 kg). Only the id pairing lives here; both weights are read from the cache.
 * Pairs: RuneLite runelite-api gameval/ItemID.java `*_WORN` constants (BSD-2-Clause).
 */
type WornPair = readonly [inventoryId: number, wornId: number];

/** Pieces in {@link GRACEFUL_REGEN_PERCENT} order: hood, cape, top, legs, gloves, boots. */
type GracefulSet = readonly [WornPair, WornPair, WornPair, WornPair, WornPair, WornPair];

// https://oldschool.runescape.wiki/w/Graceful_outfit: every recolor, mixable within one set.
const GRACEFUL_SETS: readonly GracefulSet[] = [
  [
    [11850, 11851],
    [11852, 11853],
    [11854, 11855],
    [11856, 11857],
    [11858, 11859],
    [11860, 11861],
  ], // default
  [
    [13579, 13580],
    [13581, 13582],
    [13583, 13584],
    [13585, 13586],
    [13587, 13588],
    [13589, 13590],
  ], // Arceuus
  [
    [13591, 13592],
    [13593, 13594],
    [13595, 13596],
    [13597, 13598],
    [13599, 13600],
    [13601, 13602],
  ], // Piscarilius
  [
    [13603, 13604],
    [13605, 13606],
    [13607, 13608],
    [13609, 13610],
    [13611, 13612],
    [13613, 13614],
  ], // Lovakengj
  [
    [13615, 13616],
    [13617, 13618],
    [13619, 13620],
    [13621, 13622],
    [13623, 13624],
    [13625, 13626],
  ], // Shayzien
  [
    [13627, 13628],
    [13629, 13630],
    [13631, 13632],
    [13633, 13634],
    [13635, 13636],
    [13637, 13638],
  ], // Hosidius
  [
    [13667, 13668],
    [13669, 13670],
    [13671, 13672],
    [13673, 13674],
    [13675, 13676],
    [13677, 13678],
  ], // Kourend
  [
    [21061, 21063],
    [21064, 21066],
    [21067, 21069],
    [21070, 21072],
    [21073, 21075],
    [21076, 21078],
  ], // Agility Arena
  [
    [24743, 24745],
    [24746, 24748],
    [24749, 24751],
    [24752, 24754],
    [24755, 24757],
    [24758, 24760],
  ], // Hallowed
  [
    [25069, 25071],
    [25072, 25074],
    [25075, 25077],
    [25078, 25080],
    [25081, 25083],
    [25084, 25086],
  ], // Trailblazer
  [
    [27444, 27446],
    [27447, 27449],
    [27450, 27452],
    [27453, 27455],
    [27456, 27458],
    [27459, 27461],
  ], // Adventurer
  [
    [30045, 30047],
    [30048, 30050],
    [30051, 30053],
    [30054, 30056],
    [30057, 30059],
    [30060, 30062],
  ], // Varlamore
];

/** Agility capes and the max cape stand in for the graceful cape in the set effect. */
const GRACEFUL_CAPE_SUBSTITUTES: readonly WornPair[] = [
  [9771, 13340], // Agility cape
  [9772, 13341], // Agility cape (t)
  [13280, 13342], // Max cape
];

const OTHER_WEIGHT_REDUCING: readonly WornPair[] = [
  [88, 89], // Boots of lightness
  [10069, 10073], // Spotted cape
  [10071, 10074], // Spottier cape
  [10553, 10554], // Penance gloves
  [10053, 28839], // Wood camo top
  [10055, 28842], // Wood camo legs
  [10057, 28845], // Jungle camo top
  [10059, 28848], // Jungle camo legs
  [10061, 28851], // Desert camo top
  [10063, 28854], // Desert camo legs
  [10065, 28857], // Polar camo top
  [10067, 28860], // Polar camo legs
];

// https://oldschool.runescape.wiki/w/Graceful_outfit: +3/3/4/4/3/3% per piece, and the full
// set adds another 10% for 30% total.
const GRACEFUL_REGEN_PERCENT = [3, 3, 4, 4, 3, 3] as const;
const GRACEFUL_CAPE_INDEX = 1;
const GRACEFUL_FULL_SET_BONUS_PERCENT = 10;

/** Every pairing, for tests that check each against the cache. */
export const WEIGHT_REDUCING_PAIRS: readonly WornPair[] = [
  ...GRACEFUL_SETS.flat(),
  ...GRACEFUL_CAPE_SUBSTITUTES,
  ...OTHER_WEIGHT_REDUCING,
];

const wornIdByInventoryId = new Map<number, number>(WEIGHT_REDUCING_PAIRS);

/** Which graceful piece (index into GRACEFUL_REGEN_PERCENT) an id is, in either form. */
const gracefulPieceById = new Map<number, number>();
for (const set of GRACEFUL_SETS) {
  set.forEach((pair, piece) => {
    for (const id of pair) gracefulPieceById.set(id, piece);
  });
}
for (const pair of GRACEFUL_CAPE_SUBSTITUTES) {
  for (const id of pair) gracefulPieceById.set(id, GRACEFUL_CAPE_INDEX);
}

/** The id whose cache weight applies while equipped. Worn and ordinary ids pass through. */
export function equippedWeightItemId(itemId: number): number {
  return wornIdByInventoryId.get(itemId) ?? itemId;
}

/** Percent added to run energy regeneration by equipped graceful pieces (0, 3..20, or 30). */
export function gracefulRegenBonusPercent(equipment: PlayerEquipment): number {
  const pieces = new Set<number>();
  for (const itemId of Object.values(equipment)) {
    const piece = itemId === undefined ? undefined : gracefulPieceById.get(itemId);
    if (piece !== undefined) pieces.add(piece);
  }
  let percent = 0;
  for (const piece of pieces) percent += GRACEFUL_REGEN_PERCENT[piece];
  return pieces.size === GRACEFUL_REGEN_PERCENT.length ? percent + GRACEFUL_FULL_SET_BONUS_PERCENT : percent;
}
