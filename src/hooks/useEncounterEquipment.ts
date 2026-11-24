import { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeEquipmentAgainstCatalog } from '../data/equipmentSanitization';
import { canonicalEncounterKind } from '../encounters/catalog';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import { type CombatSupplies, cloneCombatSupplies, type EncounterLoadout } from '../types/encounterLoadout';
import type { Inventory } from '../types/inventory';
import { cloneEquipment, cloneInventory } from '../util/loadoutUtils';
import { loadSetting, saveSetting } from '../util/storage';
import {
  cloneEncounterLoadout,
  type EncounterLoadoutMap,
  getDefaultLoadout,
  normalizeLoadoutMap,
} from './encounterLoadoutStorage';

const STORAGE_KEY = 'osrs-encounter-equipment';

function loadoutForUse(loadout: EncounterLoadout): EncounterLoadout {
  return {
    ...cloneEncounterLoadout(loadout),
    equipment: sanitizeEquipmentAgainstCatalog(loadout.equipment),
  };
}

export function useEncounterEquipment() {
  const needsInitialSave = useRef(false);
  // Keep catalog-omitted ids in state/storage: an item may return to the catalog later.
  const [map, setMap] = useState<EncounterLoadoutMap>(() => {
    const normalized = normalizeLoadoutMap(loadSetting<unknown>(STORAGE_KEY));
    needsInitialSave.current = normalized.repaired;
    return normalized.map;
  });
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      if (!needsInitialSave.current) return;
      needsInitialSave.current = false;
    }
    saveSetting(STORAGE_KEY, map);
  }, [map]);

  // Every read and write goes through the kind's canonical key, so a retired kind (`zuk`) and the
  // encounter that now owns it share one saved loadout.
  const getLoadout = useCallback(
    (requestedKind: string): EncounterLoadout => {
      const encounterKind = canonicalEncounterKind(requestedKind);
      return loadoutForUse(map[encounterKind] ?? getDefaultLoadout(encounterKind));
    },
    [map],
  );

  const getEquipment = useCallback(
    (encounterKind: string): PlayerEquipment => cloneEquipment(getLoadout(encounterKind).equipment),
    [getLoadout],
  );

  const getInventory = useCallback(
    (encounterKind: string): Inventory => cloneInventory(getLoadout(encounterKind).inventory),
    [getLoadout],
  );

  const getSupplies = useCallback(
    (encounterKind: string): CombatSupplies => cloneCombatSupplies(getLoadout(encounterKind).supplies),
    [getLoadout],
  );

  // Explicit edits save what the player sees; other encounters retain their hidden saved ids.
  const setLoadout = useCallback((requestedKind: string, loadout: EncounterLoadout) => {
    const encounterKind = canonicalEncounterKind(requestedKind);
    setMap((previous) => ({ ...previous, [encounterKind]: loadoutForUse(loadout) }));
  }, []);

  const setEquipment = useCallback((requestedKind: string, equipment: PlayerEquipment) => {
    const encounterKind = canonicalEncounterKind(requestedKind);
    setMap((previous) => ({
      ...previous,
      [encounterKind]: {
        ...(previous[encounterKind] ?? getDefaultLoadout(encounterKind)),
        equipment: sanitizeEquipmentAgainstCatalog(equipment),
      },
    }));
  }, []);

  const setInventory = useCallback((requestedKind: string, inventory: Inventory) => {
    const encounterKind = canonicalEncounterKind(requestedKind);
    setMap((previous) => ({
      ...previous,
      [encounterKind]: {
        ...loadoutForUse(previous[encounterKind] ?? getDefaultLoadout(encounterKind)),
        inventory: cloneInventory(inventory),
      },
    }));
  }, []);

  const setSupplies = useCallback((requestedKind: string, supplies: CombatSupplies) => {
    const encounterKind = canonicalEncounterKind(requestedKind);
    setMap((previous) => ({
      ...previous,
      [encounterKind]: {
        ...loadoutForUse(previous[encounterKind] ?? getDefaultLoadout(encounterKind)),
        supplies: cloneCombatSupplies(supplies),
      },
    }));
  }, []);

  return {
    getEquipment,
    getInventory,
    getSupplies,
    getLoadout,
    setEquipment,
    setInventory,
    setSupplies,
    setLoadout,
  } as const;
}
