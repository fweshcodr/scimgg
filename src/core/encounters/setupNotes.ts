import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import type { Inventory } from '../../types/inventory';
import type { EncounterModifierSelection } from './encounterFactory';

/** The saved loadout and modifier selection an encounter's setup notes inspect. */
export interface EncounterSetupContext {
  readonly equipment: PlayerEquipment;
  readonly inventory: Inventory | undefined;
  readonly modifiers: EncounterModifierSelection;
}

/** An advisory shown before a run; it never blocks starting. */
export interface EncounterSetupNote {
  readonly id: string;
  readonly message: string;
}

export interface EncounterSetupNoteRule extends EncounterSetupNote {
  readonly applies: (context: EncounterSetupContext) => boolean;
}

export function resolveSetupNotes(
  rules: readonly EncounterSetupNoteRule[] | undefined,
  context: EncounterSetupContext,
): EncounterSetupNote[] {
  return (rules ?? []).filter((rule) => rule.applies(context)).map(({ id, message }) => ({ id, message }));
}

export function loadoutHasItem(context: EncounterSetupContext, itemIds: readonly number[]): boolean {
  return (
    Object.values(context.equipment).some((id) => id !== undefined && itemIds.includes(id)) ||
    (context.inventory?.some((slot) => slot !== null && itemIds.includes(slot.id)) ?? false)
  );
}
