import { z } from 'zod';
import { consolidateRetiredEncounterKinds } from '../encounters/catalog';
import { cloneEncounterLoadout, normalizeEncounterLoadout } from '../hooks/encounterLoadoutStorage';
import type { EncounterLoadout } from '../types/encounterLoadout';
import { equipmentEqual, loadoutsEqual } from '../util/loadoutUtils';
import { type EquipmentSlot, getCanonicalEquipmentItemId, getEquipmentCatalog } from './equipmentCatalog';
import {
  CATALOG_SLOT_BY_GEAR_SLOT,
  type CustomizableGearSlot,
  sanitizeEquipmentAgainstCatalog,
} from './equipmentSanitization';
import { isVerifiedEquipmentPiece } from './equipmentSupport';

export {
  CUSTOMIZABLE_GEAR_SLOTS,
  type CustomizableGearSlot,
  isTwoHandedWeapon,
  sanitizeEquipmentAgainstCatalog,
} from './equipmentSanitization';

export type GearCatalogItem = {
  readonly id: number;
  readonly name: string;
  readonly isTwoHanded: boolean;
  /** False for gear the simulator does not run correctly. See {@link isVerifiedEquipmentPiece}. */
  readonly verified: boolean;
  /**
   * What separates this id from another under the same name, e.g. "Charged", "Locked + Charged".
   * Carried so the picker can tell same-named pieces apart instead of collapsing them into one.
   */
  readonly version?: string;
  /** Set when `itemAliases.json` makes this a variant of another piece. See its use in the picker. */
  readonly canonicalId?: number;
};

export type CustomEquipmentPreset = {
  readonly id: string;
  readonly name: string;
  readonly loadout: EncounterLoadout;
  readonly verificationIssues?: readonly ImportedPresetVerificationIssue[];
};

export type ImportedPresetVerificationIssue = {
  readonly id: number;
  readonly name: string;
  readonly reason: 'unverified' | 'unsupported';
  readonly omitted: boolean;
};

export type CustomEquipmentPresetMap = Record<string, readonly CustomEquipmentPreset[]>;

export type NormalizedCustomEquipmentPresetMap = {
  readonly presets: CustomEquipmentPresetMap;
  readonly repaired: boolean;
};

export type SaveCustomEquipmentPresetResult =
  | { readonly kind: 'saved'; readonly presets: CustomEquipmentPresetMap }
  | { readonly kind: 'duplicate-name'; readonly name: string; readonly presets: CustomEquipmentPresetMap }
  | { readonly kind: 'empty-name'; readonly presets: CustomEquipmentPresetMap };

function catalogForSlot(slot: EquipmentSlot): readonly GearCatalogItem[] {
  return getEquipmentCatalog()
    .filter((piece) => piece.slot === slot)
    .map((piece) => {
      const canonicalId = getCanonicalEquipmentItemId(piece.id);
      return {
        id: piece.id,
        name: piece.name,
        isTwoHanded: piece.isTwoHanded,
        verified: isVerifiedEquipmentPiece(piece),
        ...(piece.version === undefined ? {} : { version: piece.version }),
        ...(canonicalId === piece.id ? {} : { canonicalId }),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function gearForSlot(slot: CustomizableGearSlot): readonly GearCatalogItem[] {
  return catalogForSlot(CATALOG_SLOT_BY_GEAR_SLOT[slot]);
}

/**
 * Ammunition the picker can offer. Deliberately NOT a member of GEAR_CATALOG_BY_SLOT:
 * ammo has no PlayerEquipment key and is stored on CombatSupplies, so keeping it out of
 * that record is what stops anything indexing it as though `equipment.ammo` existed.
 */
const AMMO_CATALOG: readonly GearCatalogItem[] = catalogForSlot('ammo');

export function getAmmoCatalog(): readonly GearCatalogItem[] {
  return AMMO_CATALOG;
}

/**
 * Every piece the catalog knows for each slot, verified or not.
 *
 * Catalog membership means the simulator can name the item, NOT that it runs it correctly. That second,
 * narrower question is each item's own `verified` flag; the picker offers only verified
 * gear until the player asks for the rest. Keep the two apart: conflating them is what lets
 * unmapped weapons reach players as Punch / Kick / Block.
 */
const GEAR_CATALOG_BY_SLOT: Record<CustomizableGearSlot, readonly GearCatalogItem[]> = {
  head: gearForSlot('head'),
  cape: gearForSlot('cape'),
  amulet: gearForSlot('amulet'),
  weapon: gearForSlot('weapon'),
  body: gearForSlot('body'),
  shield: gearForSlot('shield'),
  legs: gearForSlot('legs'),
  hands: gearForSlot('hands'),
  boots: gearForSlot('boots'),
  ring: gearForSlot('ring'),
};

const customPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  loadout: z.unknown(),
  verificationIssues: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        reason: z.enum(['unverified', 'unsupported']),
        omitted: z.boolean().default(false),
      }),
    )
    .optional(),
});

const customPresetMapSchema = z.record(z.string(), z.array(z.unknown()));

function clonePreset(preset: CustomEquipmentPreset): CustomEquipmentPreset {
  return {
    ...preset,
    loadout: cloneEncounterLoadout(preset.loadout),
    ...(preset.verificationIssues
      ? { verificationIssues: preset.verificationIssues.map((issue) => ({ ...issue })) }
      : {}),
  };
}

function clonePresetMap(presets: CustomEquipmentPresetMap): CustomEquipmentPresetMap {
  return Object.fromEntries(
    Object.entries(presets).map(([encounterKind, entries]) => [encounterKind, entries.map(clonePreset)]),
  );
}

export function getGearCatalog(slot: CustomizableGearSlot): readonly GearCatalogItem[] {
  return GEAR_CATALOG_BY_SLOT[slot];
}

export function getCustomEquipmentPresets(
  presets: CustomEquipmentPresetMap,
  encounterKind: string,
): readonly CustomEquipmentPreset[] {
  return (presets[encounterKind] ?? []).map(clonePreset);
}

export function findMatchingCustomEquipmentPreset(
  presets: readonly CustomEquipmentPreset[],
  loadout: EncounterLoadout,
): CustomEquipmentPreset | undefined {
  return presets.find((preset) => loadoutsEqual(preset.loadout, loadout));
}

function sanitizedLoadout(loadout: EncounterLoadout): EncounterLoadout {
  return {
    ...cloneEncounterLoadout(loadout),
    equipment: sanitizeEquipmentAgainstCatalog(loadout.equipment),
  };
}

function normalizedName(name: string): string {
  return name.trim();
}

function namesMatch(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

export function normalizeCustomEquipmentPresetMap(raw: unknown): NormalizedCustomEquipmentPresetMap {
  const parsed = customPresetMapSchema.safeParse(raw);
  if (!parsed.success) {
    return { presets: {}, repaired: false };
  }

  const presets: CustomEquipmentPresetMap = {};
  let repaired = false;
  for (const [encounterKind, rawEntries] of Object.entries(parsed.data)) {
    const entries: CustomEquipmentPreset[] = [];
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const rawEntry of rawEntries) {
      const entry = customPresetSchema.safeParse(rawEntry);
      if (!entry.success) {
        repaired = true;
        continue;
      }
      const name = normalizedName(entry.data.name);
      const nameKey = name.toLocaleLowerCase();
      if (!name || names.has(nameKey) || ids.has(entry.data.id)) {
        repaired = true;
        continue;
      }
      const loadout = normalizeEncounterLoadout(entry.data.loadout);
      const sanitized = sanitizedLoadout(loadout);
      if (!equipmentEqual(loadout.equipment, sanitized.equipment)) {
        repaired = true;
      }
      names.add(nameKey);
      ids.add(entry.data.id);
      entries.push({
        id: entry.data.id,
        name,
        loadout: sanitized,
        ...(entry.data.verificationIssues ? { verificationIssues: entry.data.verificationIssues } : {}),
      });
    }
    if (entries.length > 0) {
      presets[encounterKind] = entries;
    }
  }
  const consolidated = consolidateRetiredEncounterKinds(presets, (owned, retired) =>
    mergeRetiredPresets(owned ?? [], retired),
  );
  return { presets: consolidated.map, repaired: repaired || consolidated.consolidated };
}

/**
 * Joins a retired kind's saved sets onto the owning kind's (Zuk's onto the Inferno's). A set saved
 * under both with one id keeps the retired kind's copy, the precedence saved loadouts follow.
 * Distinct sets sharing a name both survive: the retired kind's keeps the name and the other is
 * numbered, because names stay unique within a kind and renaming a set beats dropping it.
 */
function mergeRetiredPresets(
  owned: readonly CustomEquipmentPreset[],
  retired: readonly CustomEquipmentPreset[],
): readonly CustomEquipmentPreset[] {
  const retiredById = new Map(retired.map((preset) => [preset.id, preset]));
  const survivors = owned.filter((preset) => !retiredById.has(preset.id));
  const retiredNames = new Set(retired.map((preset) => preset.name.toLocaleLowerCase()));
  const taken = new Set([...retiredNames, ...survivors.map((preset) => preset.name.toLocaleLowerCase())]);
  const renamed = new Map<string, string>();
  for (const preset of survivors) {
    if (!retiredNames.has(preset.name.toLocaleLowerCase())) continue;
    let suffix = 2;
    while (taken.has(`${preset.name} (${suffix})`.toLocaleLowerCase())) suffix += 1;
    const name = `${preset.name} (${suffix})`;
    taken.add(name.toLocaleLowerCase());
    renamed.set(preset.id, name);
  }
  const ownedIds = new Set(owned.map((preset) => preset.id));
  return [
    ...owned.map((preset) => {
      const name = renamed.get(preset.id);
      return retiredById.get(preset.id) ?? (name === undefined ? preset : { ...preset, name });
    }),
    ...retired.filter((preset) => !ownedIds.has(preset.id)),
  ];
}

export function saveCustomEquipmentPreset(
  presets: CustomEquipmentPresetMap,
  encounterKind: string,
  id: string,
  name: string,
  loadout: EncounterLoadout,
  verificationIssues: readonly ImportedPresetVerificationIssue[] = [],
  /**
   * Names already spoken for by sets this module cannot see: the encounter's shipped presets.
   * Without them a saved set can take a shipped set's name, and the two are then told apart
   * only by which group they sit in.
   */
  reservedNames: readonly string[] = [],
): SaveCustomEquipmentPresetResult {
  const next = clonePresetMap(presets);
  const trimmedName = normalizedName(name);
  if (!trimmedName) {
    return { kind: 'empty-name', presets: next };
  }
  const entries = next[encounterKind] ?? [];
  const taken =
    entries.find((preset) => namesMatch(preset.name, trimmedName)) ??
    reservedNames.find((reserved) => namesMatch(reserved, trimmedName));
  if (taken !== undefined) {
    return { kind: 'duplicate-name', name: typeof taken === 'string' ? taken : taken.name, presets: next };
  }
  next[encounterKind] = [
    ...entries,
    {
      id,
      name: trimmedName,
      loadout: sanitizedLoadout(loadout),
      ...(verificationIssues.length > 0
        ? { verificationIssues: verificationIssues.map((issue) => ({ ...issue })) }
        : {}),
    },
  ];
  return { kind: 'saved', presets: next };
}

export function deleteCustomEquipmentPreset(
  presets: CustomEquipmentPresetMap,
  encounterKind: string,
  id: string,
): CustomEquipmentPresetMap {
  const next = clonePresetMap(presets);
  const entries = next[encounterKind];
  if (!entries) {
    return next;
  }
  const remaining = entries.filter((preset) => preset.id !== id);
  if (remaining.length === 0) {
    delete next[encounterKind];
  } else {
    next[encounterKind] = remaining;
  }
  return next;
}

/** Updates only an existing custom id, never inserts or renames a set. */
export function updateCustomEquipmentPreset(
  presets: CustomEquipmentPresetMap,
  encounterKind: string,
  id: string,
  loadout: EncounterLoadout,
): CustomEquipmentPresetMap | null {
  if (!presets[encounterKind]?.some((preset) => preset.id === id)) return null;
  const next = clonePresetMap(presets);
  next[encounterKind] = next[encounterKind].map((preset) =>
    preset.id === id ? { ...preset, loadout: sanitizedLoadout(loadout) } : preset,
  );
  return next;
}
