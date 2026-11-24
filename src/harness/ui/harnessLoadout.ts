import { resolveEncounterPresetsKey } from '../../core/encounters/variantTypes';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { encounterRegistry } from '../../encounters/registry';
import { createEmptyCombatSupplies, type EncounterLoadout } from '../../types/encounterLoadout';
import { cloneInventory } from '../../util/loadoutUtils';

/**
 * Pick a real equipment preset for an encounter, so the harness lands on a
 * geared, stocked player instead of a naked one. `first` takes the first
 * non-fallback set — the same one the app falls back to. Returning null lets
 * the caller enter the encounter with whatever loadout is already stored.
 */
export function resolveHarnessLoadout(encounterKind: string, presetKey: string): EncounterLoadout | null {
  const descriptor = encounterRegistry.getDescriptorForKind(encounterKind);
  const group = EQUIPMENT_PRESETS[resolveEncounterPresetsKey(encounterKind, descriptor?.variants)];
  if (!group) return null;
  const entries = Object.entries(group);
  const match =
    presetKey === 'first'
      ? entries.find(([, preset]) => !preset.isFallback)
      : entries.find(([key]) => key === presetKey);
  const preset = match?.[1];
  if (!preset) return null;
  return {
    equipment: preset.equipment,
    inventory: cloneInventory(preset.inventory),
    supplies: preset.supplies ?? createEmptyCombatSupplies(),
  };
}
