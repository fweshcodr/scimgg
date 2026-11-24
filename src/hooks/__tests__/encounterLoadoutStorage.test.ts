import { describe, expect, it } from 'vitest';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { normalizeLoadoutMap } from '../encounterLoadoutStorage';

describe('normalizeLoadoutMap', () => {
  it.each([25633, 999999999])('preserves off-catalog saved item %s without requesting a repair', (itemId) => {
    const preset = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    const loadout = {
      equipment: { ...preset.equipment, weapon: itemId },
      inventory: [{ id: itemId }, ...preset.inventory.slice(1)],
      supplies: preset.supplies,
    };
    const normalized = normalizeLoadoutMap({ yama_p3: loadout });
    expect(normalized.repaired).toBe(false);
    expect(normalized.map.yama_p3?.equipment.weapon).toBe(itemId);
    expect(normalized.map.yama_p3?.equipment.head).toBe(preset.equipment.head);
    expect(normalized.map.yama_p3?.inventory).toEqual(loadout.inventory);
    expect(loadout.equipment.weapon).toBe(itemId);
  });

  it('drops the runtime stack quantity on an inventory slot', () => {
    const preset = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    const loadout = {
      equipment: preset.equipment,
      inventory: [{ id: 11959, quantity: 198000 }, ...preset.inventory.slice(1)],
      supplies: preset.supplies,
    };

    const normalized = normalizeLoadoutMap({ yama_p3: loadout });

    expect(normalized.map.yama_p3?.inventory[0]).toEqual({ id: 11959 });
  });
});

describe('retired-kind loadout consolidation', () => {
  const waves = EQUIPMENT_PRESETS.inferno.max_tbow;
  const zuk = EQUIPMENT_PRESETS.inferno.atlatl_eclipse;
  const saved = (preset: typeof waves) => ({
    equipment: preset.equipment,
    inventory: preset.inventory,
    supplies: preset.supplies ?? createEmptyCombatSupplies(),
  });
  const yama = saved(EQUIPMENT_PRESETS.yama_p3['learner-mage']);

  it('moves a Zuk-only save onto the Inferno', () => {
    const { map, repaired } = normalizeLoadoutMap({ zuk: saved(zuk), yama_p3: yama });
    expect(repaired).toBe(true);
    expect(map).not.toHaveProperty('zuk');
    expect(map.inferno).toEqual(saved(zuk));
    expect(map.yama_p3).toEqual(normalizeLoadoutMap({ yama_p3: yama }).map.yama_p3);
  });

  it('keeps a waves-only save as it is, with nothing to repair', () => {
    const { map, repaired } = normalizeLoadoutMap({ inferno: saved(waves) });
    expect(repaired).toBe(false);
    expect(map).toEqual({ inferno: saved(waves) });
  });

  it('lets the saved Zuk loadout win when both were saved', () => {
    const { map, repaired } = normalizeLoadoutMap({ inferno: saved(waves), zuk: saved(zuk) });
    expect(repaired).toBe(true);
    expect(map).toEqual({ inferno: saved(zuk) });
  });

  it('is idempotent: a consolidated map needs no further repair', () => {
    const first = normalizeLoadoutMap({ inferno: saved(waves), zuk: saved(zuk), yama_p3: yama });
    const second = normalizeLoadoutMap(JSON.parse(JSON.stringify(first.map)));
    expect(second.repaired).toBe(false);
    expect(second.map).toEqual(first.map);
  });
});
