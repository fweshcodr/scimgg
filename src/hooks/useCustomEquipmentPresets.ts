import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CustomEquipmentPreset,
  type CustomEquipmentPresetMap,
  deleteCustomEquipmentPreset,
  getCustomEquipmentPresets,
  type ImportedPresetVerificationIssue,
  normalizeCustomEquipmentPresetMap,
  type SaveCustomEquipmentPresetResult,
  saveCustomEquipmentPreset,
  updateCustomEquipmentPreset,
} from '../data/customEquipmentPresets';
import type { EncounterLoadout } from '../types/encounterLoadout';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-custom-equipment-presets';

export function useCustomEquipmentPresets() {
  const needsInitialSave = useRef(false);
  const [presets, setPresets] = useState<CustomEquipmentPresetMap>(() => {
    const normalized = normalizeCustomEquipmentPresetMap(loadSetting<unknown>(STORAGE_KEY));
    needsInitialSave.current = normalized.repaired;
    return normalized.presets;
  });
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      if (!needsInitialSave.current) return;
      needsInitialSave.current = false;
    }
    saveSetting(STORAGE_KEY, presets);
  }, [presets]);

  const getPresets = useCallback(
    (encounterKind: string): readonly CustomEquipmentPreset[] => getCustomEquipmentPresets(presets, encounterKind),
    [presets],
  );

  const savePreset = useCallback(
    (
      encounterKind: string,
      id: string,
      name: string,
      loadout: EncounterLoadout,
      verificationIssues: readonly ImportedPresetVerificationIssue[] = [],
      reservedNames: readonly string[] = [],
    ): SaveCustomEquipmentPresetResult => {
      const result = saveCustomEquipmentPreset(
        presets,
        encounterKind,
        id,
        name,
        loadout,
        verificationIssues,
        reservedNames,
      );
      if (result.kind === 'saved') {
        setPresets(result.presets);
      }
      return result;
    },
    [presets],
  );

  const deletePreset = useCallback(
    (encounterKind: string, id: string): void => {
      setPresets(deleteCustomEquipmentPreset(presets, encounterKind, id));
    },
    [presets],
  );

  const updatePreset = useCallback(
    (encounterKind: string, id: string, loadout: EncounterLoadout): boolean => {
      const next = updateCustomEquipmentPreset(presets, encounterKind, id, loadout);
      if (next === null) return false;
      setPresets(next);
      return true;
    },
    [presets],
  );

  return { deletePreset, getPresets, savePreset, updatePreset } as const;
}
