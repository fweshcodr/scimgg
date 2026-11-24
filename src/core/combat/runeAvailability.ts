/**
 * Whether the player can pay for a spell.
 *
 * This is a presence check, not an accounting one: runes are infinite in this
 * simulator, so a rune the player carries never runs out. What still matters is
 * the rune TYPE: a requirement is satisfied by the rune itself, by a combination
 * rune containing it, or by an unlimited source
 * (https://oldschool.runescape.wiki/w/Runes#Combination_runes,
 * https://oldschool.runescape.wiki/w/Magic#Runes).
 *
 * Members-only gating, Fountain of Rune, Nightmare Zone runes and fake/blighted
 * runes are all deliberately out of scope; none of them exist in this simulator.
 */

import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';
import {
  getSpellLevelRequirement,
  getSpellRuneRequirement,
  SUBSTITUTE_RUNES,
  UNLIMITED_RUNE_SOURCES,
} from '../../data/spellRunes';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import type { RunePouch } from '../../types/encounterLoadout';
import type { Inventory } from '../../types/inventory';

export interface RuneSourceContext {
  readonly equipment: PlayerEquipment;
  readonly inventory: Inventory;
  readonly runePouch: RunePouch | null;
}

export interface SpellCastContext extends RuneSourceContext {
  /**
   * The player's CURRENT (boosted) Magic level. Boosts count: a Magic potion lets you
   * cast above your base level. Omit to skip the level check entirely.
   */
  readonly magicLevel?: number;
}

export type SpellCastCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unknown-spell' | 'missing-level' | 'missing-runes' };

function acceptedRunes(runeId: number): readonly number[] {
  const substitutes = SUBSTITUTE_RUNES[runeId];
  return substitutes ? [runeId, ...substitutes] : [runeId];
}

function hasUnlimitedSupply(runeId: number, equipment: PlayerEquipment): boolean {
  for (const itemId of [equipment.weapon, equipment.shield]) {
    if (itemId === undefined) continue;
    if (UNLIMITED_RUNE_SOURCES[getEquipmentCombatBaseId(itemId)]?.includes(runeId)) return true;
  }
  return false;
}

export function hasRune(runeId: number, ctx: RuneSourceContext): boolean {
  if (hasUnlimitedSupply(runeId, ctx.equipment)) return true;

  const accepted = acceptedRunes(runeId);
  for (const slot of ctx.inventory) {
    if (slot && accepted.includes(slot.id)) return true;
  }
  for (const stack of ctx.runePouch?.slots ?? []) {
    if (stack && accepted.includes(stack.id)) return true;
  }
  return false;
}

/** Checks the Magic level before the runes, the order the game checks them in. */
export function checkSpellCast(spellName: string, ctx: SpellCastContext): SpellCastCheck {
  const requiredRunes = getSpellRuneRequirement(spellName);
  if (!requiredRunes) return { ok: false, reason: 'unknown-spell' };

  if (!meetsSpellLevel(spellName, ctx.magicLevel)) return { ok: false, reason: 'missing-level' };

  const hasEveryRune = requiredRunes.every((runeId) => hasRune(runeId, ctx));
  return hasEveryRune ? { ok: true } : { ok: false, reason: 'missing-runes' };
}

export function meetsSpellLevel(spellName: string, magicLevel: number | undefined): boolean {
  if (magicLevel === undefined) return true;
  const required = getSpellLevelRequirement(spellName);
  return required === null || magicLevel >= required;
}

export function canCastSpell(spellName: string, ctx: SpellCastContext): boolean {
  return checkSpellCast(spellName, ctx).ok;
}
