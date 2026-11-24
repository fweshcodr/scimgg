import type { RunePouch, SupplyItem } from '../types/encounterLoadout';
import type { Inventory } from '../types/inventory';
import { COMBINATION_RUNE, RUNE } from './spellRunes';

export type RunePouchKind = RunePouch['kind'];

export interface RunePouchItem {
  readonly id: number;
  readonly name: string;
  readonly kind: RunePouchKind;
}

export interface RuneCatalogItem {
  readonly id: number;
  readonly name: string;
  readonly verified: boolean;
}

export const RUNE_POUCH_ITEM_ID = 12791;
export const DIVINE_RUNE_POUCH_ITEM_ID = 27281;

const STANDARD_POUCH: RunePouchItem = { id: RUNE_POUCH_ITEM_ID, name: 'Rune pouch', kind: 'standard' };
const DIVINE_POUCH: RunePouchItem = { id: DIVINE_RUNE_POUCH_ITEM_ID, name: 'Divine rune pouch', kind: 'divine' };

export const RUNE_POUCH_ITEMS: readonly RunePouchItem[] = [STANDARD_POUCH, DIVINE_POUCH];

function toRuneCatalogItem([key, id]: readonly [string, number]): RuneCatalogItem {
  return { id, name: `${key.charAt(0).toUpperCase()}${key.slice(1)} rune`, verified: true };
}

/**
 * Derived from the same two tables the cast checker resolves against, rather than listed by
 * hand here: a hand-kept list lets the picker offer a rune `hasRune` does not accept. It is
 * also why every entry is verified. `runeAvailability` resolves all 21, substitutes included.
 */
export const SUPPORTED_RUNES: readonly RuneCatalogItem[] = [
  ...Object.entries(RUNE),
  ...Object.entries(COMBINATION_RUNE),
]
  .map(toRuneCatalogItem)
  .sort((left, right) => left.name.localeCompare(right.name));

const RUNES_BY_ID = new Map(SUPPORTED_RUNES.map((rune) => [rune.id, rune]));

export function findSupportedRune(itemId: number): RuneCatalogItem | undefined {
  return RUNES_BY_ID.get(itemId);
}

export interface RuneGroup {
  readonly id: string;
  readonly runes: readonly RuneCatalogItem[];
}

function runeGroup(id: string, ids: readonly number[]): RuneGroup {
  return { id, runes: ids.flatMap((runeId) => RUNES_BY_ID.get(runeId) ?? []) };
}

/**
 * Grouped rather than name-ordered like {@link SUPPORTED_RUNES}, and NOT to be re-sorted into
 * agreement with it: the picker's cells draw a sprite and no name, so name order puts Dust
 * between Death and Earth and leaves recognizing one disc among twenty-one as the only way in.
 *
 * Aether sits with the catalytics despite being a combination rune: its components are cosmic
 * and soul (`COMBINATION_RUNE_ELEMENTS`), so nobody reaches for it among the elements.
 */
export const RUNE_GROUPS: readonly [RuneGroup, RuneGroup, RuneGroup] = [
  runeGroup('elemental', [RUNE.air, RUNE.water, RUNE.earth, RUNE.fire]),
  runeGroup('combination', [
    COMBINATION_RUNE.mist,
    COMBINATION_RUNE.dust,
    COMBINATION_RUNE.mud,
    COMBINATION_RUNE.smoke,
    COMBINATION_RUNE.steam,
    COMBINATION_RUNE.lava,
  ]),
  runeGroup('catalytic', [
    RUNE.mind,
    RUNE.body,
    RUNE.cosmic,
    RUNE.chaos,
    RUNE.nature,
    RUNE.law,
    RUNE.death,
    RUNE.blood,
    RUNE.soul,
    RUNE.wrath,
    COMBINATION_RUNE.aether,
  ]),
];

export function runePouchKindOf(itemId: number | undefined): RunePouchKind | undefined {
  return RUNE_POUCH_ITEMS.find((item) => item.id === itemId)?.kind;
}

export function isRunePouchItem(itemId: number | undefined): boolean {
  return runePouchKindOf(itemId) !== undefined;
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected rune pouch kind: ${String(value)}`);
}

export function syncRunePouchWithInventory(inventory: Inventory, runePouch: RunePouch | null): RunePouch | null {
  // The FIRST pouch in inventory order, not any of them: a second pouch two slots along must
  // not change what an edit elsewhere in the inventory resolves to.
  const kind = runePouchKindOf(inventory.find((slot) => isRunePouchItem(slot?.id))?.id);
  if (kind === undefined) return null;

  const packed = runePouch?.slots ?? [];
  const at = (index: number): SupplyItem | null => packed[index] ?? null;
  switch (kind) {
    case 'standard':
      return { kind: 'standard', slots: [at(0), at(1), at(2)] };
    case 'divine':
      return { kind: 'divine', slots: [at(0), at(1), at(2), at(3)] };
    default:
      return assertNever(kind);
  }
}
