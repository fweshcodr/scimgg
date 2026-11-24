import { z } from 'zod';
import { getSpellCastInfo } from '../data/spellCatalog';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { Inventory } from './inventory';
import { DEFAULT_SPELLBOOK, isSpellbookType, type SpellbookType } from './spellbook';

/** Ammunition and runes never deplete, so supplies model only item presence. */
export type SupplyItem = {
  readonly id: number;
};

export type StandardRunePouch = {
  readonly kind: 'standard';
  readonly slots: readonly [SupplyItem | null, SupplyItem | null, SupplyItem | null];
};

export type DivineRunePouch = {
  readonly kind: 'divine';
  readonly slots: readonly [SupplyItem | null, SupplyItem | null, SupplyItem | null, SupplyItem | null];
};

export type RunePouch = StandardRunePouch | DivineRunePouch;

export type CombatSupplies = {
  readonly equippedAmmo: SupplyItem | null;
  readonly quiverAmmo: SupplyItem | null;
  readonly runePouch: RunePouch | null;
  /** Dart loaded in the toxic blowpipe. */
  readonly blowpipe: SupplyItem | null;
  /** Must belong to {@link spellbook}. */
  readonly selectedSpell: string | null;
  readonly spellbook: SpellbookType;
};

export type EncounterLoadout = {
  readonly equipment: PlayerEquipment;
  readonly inventory: Inventory;
  readonly supplies: CombatSupplies;
};

const positiveIntegerSchema = z.number().int().positive();
const supplyItemSchema = z.object({
  id: positiveIntegerSchema,
});
const runePouchSchema = z.object({
  kind: z.enum(['standard', 'divine']),
  slots: z.array(z.unknown()),
});
const combatSuppliesSchema = z.object({
  equippedAmmo: z.unknown().optional(),
  quiverAmmo: z.unknown().optional(),
  runePouch: z.unknown().optional(),
  blowpipe: z.unknown().optional(),
  selectedSpell: z.unknown().optional(),
  spellbook: z.unknown().optional(),
});

export function createEmptyCombatSupplies(): CombatSupplies {
  return {
    equippedAmmo: null,
    quiverAmmo: null,
    runePouch: null,
    blowpipe: null,
    selectedSpell: null,
    spellbook: DEFAULT_SPELLBOOK,
  };
}

function normalizeItem(raw: unknown): SupplyItem | null {
  const parsed = supplyItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected rune pouch kind: ${String(value)}`);
}

function normalizeRunePouch(raw: unknown): RunePouch | null {
  const parsed = runePouchSchema.safeParse(raw);
  if (!parsed.success) return null;

  const first = normalizeItem(parsed.data.slots[0]);
  const second = normalizeItem(parsed.data.slots[1]);
  const third = normalizeItem(parsed.data.slots[2]);
  switch (parsed.data.kind) {
    case 'standard':
      return { kind: 'standard', slots: [first, second, third] };
    case 'divine':
      return { kind: 'divine', slots: [first, second, third, normalizeItem(parsed.data.slots[3])] };
    default:
      return assertNever(parsed.data.kind);
  }
}

export function normalizeCombatSupplies(raw: unknown): CombatSupplies {
  const parsed = combatSuppliesSchema.safeParse(raw);
  if (!parsed.success) return createEmptyCombatSupplies();

  const parsedSpell = z.string().min(1).safeParse(parsed.data.selectedSpell);
  const spellbook = isSpellbookType(parsed.data.spellbook) ? parsed.data.spellbook : DEFAULT_SPELLBOOK;
  // A mismatched selected spell would autocast a spell outside the chosen spellbook.
  // Clear the spell rather than silently switching the player's book.
  const selectedSpell =
    parsedSpell.success && getSpellCastInfo(parsedSpell.data)?.spellbook === spellbook ? parsedSpell.data : null;
  return {
    equippedAmmo: normalizeItem(parsed.data.equippedAmmo),
    quiverAmmo: normalizeItem(parsed.data.quiverAmmo),
    runePouch: normalizeRunePouch(parsed.data.runePouch),
    blowpipe: normalizeItem(parsed.data.blowpipe),
    selectedSpell,
    spellbook,
  };
}

function cloneItem(item: SupplyItem | null): SupplyItem | null {
  return item ? { ...item } : null;
}

function cloneRunePouch(runePouch: RunePouch | null): RunePouch | null {
  if (!runePouch) return null;
  switch (runePouch.kind) {
    case 'standard':
      return {
        kind: 'standard',
        slots: [cloneItem(runePouch.slots[0]), cloneItem(runePouch.slots[1]), cloneItem(runePouch.slots[2])],
      };
    case 'divine':
      return {
        kind: 'divine',
        slots: [
          cloneItem(runePouch.slots[0]),
          cloneItem(runePouch.slots[1]),
          cloneItem(runePouch.slots[2]),
          cloneItem(runePouch.slots[3]),
        ],
      };
    default:
      return assertNever(runePouch);
  }
}

export function cloneCombatSupplies(supplies: CombatSupplies): CombatSupplies {
  return {
    equippedAmmo: cloneItem(supplies.equippedAmmo),
    quiverAmmo: cloneItem(supplies.quiverAmmo),
    runePouch: cloneRunePouch(supplies.runePouch),
    blowpipe: cloneItem(supplies.blowpipe),
    selectedSpell: supplies.selectedSpell,
    spellbook: supplies.spellbook,
  };
}

function itemsEqual(left: SupplyItem | null, right: SupplyItem | null): boolean {
  return left?.id === right?.id;
}

export function runePouchEqual(left: RunePouch | null, right: RunePouch | null): boolean {
  if (left?.kind !== right?.kind) return false;
  const leftSlots = left?.slots ?? [];
  const rightSlots = right?.slots ?? [];
  for (let index = 0; index < leftSlots.length; index++) {
    if (!itemsEqual(leftSlots[index] ?? null, rightSlots[index] ?? null)) return false;
  }
  return true;
}

export function withRunePouchSlot(runePouch: RunePouch, slotIndex: number, rune: SupplyItem | null): RunePouch {
  const at = (index: number): SupplyItem | null => (index === slotIndex ? rune : (runePouch.slots[index] ?? null));
  switch (runePouch.kind) {
    case 'standard':
      return { kind: 'standard', slots: [at(0), at(1), at(2)] };
    case 'divine':
      return { kind: 'divine', slots: [at(0), at(1), at(2), at(3)] };
    default:
      return assertNever(runePouch);
  }
}

export function combatSuppliesEqual(left: CombatSupplies, right: CombatSupplies): boolean {
  return (
    itemsEqual(left.equippedAmmo, right.equippedAmmo) &&
    itemsEqual(left.quiverAmmo, right.quiverAmmo) &&
    runePouchEqual(left.runePouch, right.runePouch) &&
    itemsEqual(left.blowpipe, right.blowpipe) &&
    left.selectedSpell === right.selectedSpell &&
    left.spellbook === right.spellbook
  );
}
