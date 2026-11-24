import type { MechanicsToggleInfo } from '../core/encounters/types';
import { createEmptyCombatSupplies, type EncounterLoadout } from '../types/encounterLoadout';
import type { EncounterPreset, PresetRequirements } from '../types/player';
import { PLAYER_STAT_DISPLAY_NAMES, PLAYER_STAT_KEYS, type PlayerStats } from '../types/playerState';
import { GLOBAL_MECHANICS_TOGGLES, GLOBAL_PLAYER_TOGGLES } from '../types/simulation';
import { loadoutsEqual } from '../util/loadoutUtils';
import { getUnmetPresetRequirements } from '../util/presetRequirements';

/** Sentinel dropdown value shown when the current loadout matches no built-in preset. */
export const CUSTOM_PRESET_KEY = '__custom__';

/**
 * Resolve which preset the encounter dropdown should show as selected for the
 * current loadout. Matching is complete-loadout identity — equipment, inventory
 * AND supplies — so a supplies-only edit is the draft it looks like, and a preset
 * that ships no supplies means empty supplies, not "any". Returns
 * {@link CUSTOM_PRESET_KEY} when the loadout matches no preset (e.g. an in-fight
 * gear swap or a custom setup) so the UI surfaces it as "Custom" instead of
 * mislabeling it as the first preset.
 */
export function resolveSelectedPresetKey(
  presetEntries: [string, EncounterPreset][],
  loadout: EncounterLoadout,
): string {
  for (const [key, preset] of presetEntries) {
    const presetLoadout: EncounterLoadout = {
      equipment: preset.equipment,
      inventory: preset.inventory,
      supplies: preset.supplies ?? createEmptyCombatSupplies(),
    };
    if (loadoutsEqual(presetLoadout, loadout)) {
      return key;
    }
  }
  return CUSTOM_PRESET_KEY;
}

/** Globals join the encounter here; the in-fight panel receives the encounter list directly. */
function allMechanicsToggles(mechanicsToggles: readonly MechanicsToggleInfo[]): MechanicsToggleInfo[] {
  return [...GLOBAL_MECHANICS_TOGGLES, ...GLOBAL_PLAYER_TOGGLES, ...mechanicsToggles];
}

/** Essential setup choices, kept separate so pickers allow preselection even if a mechanic is off. */
export function selectSetupToggles(mechanicsToggles: readonly MechanicsToggleInfo[]): MechanicsToggleInfo[] {
  return allMechanicsToggles(mechanicsToggles).filter((toggle) => toggle.setup === true && toggle.group !== 'player');
}

/** Account-level toggles, which the configurer shows beside the player's stats instead. */
export function selectPlayerToggles(mechanicsToggles: readonly MechanicsToggleInfo[]): MechanicsToggleInfo[] {
  return allMechanicsToggles(mechanicsToggles).filter((toggle) => toggle.group === 'player');
}

/**
 * Render an unmet-requirements map as a concise, stat-ordered phrase such as
 * `80 Attack, 80 Defence` for preset option labels and incompatibility warnings.
 * Returns an empty string when nothing is unmet.
 */
export function formatUnmetRequirements(unmet: PresetRequirements): string {
  const parts: string[] = [];
  for (const stat of PLAYER_STAT_KEYS) {
    const level = unmet[stat];
    if (level !== undefined) {
      parts.push(`${level} ${PLAYER_STAT_DISPLAY_NAMES[stat]}`);
    }
  }
  return parts.join(', ');
}

export interface PresetGating {
  /** Unmet requirement map per preset key (empty map value means fully compatible). */
  readonly unmetByKey: ReadonlyMap<string, PresetRequirements>;
  readonly selectedUnmet: PresetRequirements;
  readonly selectedIncompatible: boolean;
}

export function isPresetBlocked(unmet: PresetRequirements | undefined): boolean {
  return unmet !== undefined && Object.keys(unmet).length > 0;
}

export function computePresetGating(
  presetEntries: [string, EncounterPreset][],
  stats: PlayerStats,
  selectedPresetKey: string,
): PresetGating {
  const unmetByKey = new Map<string, PresetRequirements>();
  for (const [key, preset] of presetEntries) {
    unmetByKey.set(key, getUnmetPresetRequirements(stats, preset));
  }
  const selectedUnmet = unmetByKey.get(selectedPresetKey) ?? {};
  return { unmetByKey, selectedUnmet, selectedIncompatible: isPresetBlocked(selectedUnmet) };
}

export function presetOptionLabel(preset: EncounterPreset, unmet: PresetRequirements | undefined): string {
  return isPresetBlocked(unmet) ? `${preset.name} (requires ${formatUnmetRequirements(unmet ?? {})})` : preset.name;
}

/**
 * Lead copy for the note shown when the equipped preset is auto-switched to a compatible
 * one after a stat change. The unmet-requirement skill chips render immediately after it.
 */
export function presetSwitchedMessage(fromName: string, toName: string): string {
  return `Switched to ${toName}. ${fromName} needs`;
}

/** Shown when no equipment set matches the configured combat levels (every encounter normally ships a requirement-free set). */
export function noCompatiblePresetsMessage(): string {
  return 'No equipment sets match your current combat levels.';
}

/**
 * Lead copy for the note shown when every real equipment set is blocked by the
 * configured stats, so the loadout is parked on the No-Equipment fallback until the
 * player levels up. Requirement chips for the nearest set render after it.
 */
export function fallbackLoadoutMessage(): string {
  return 'All equipment sets need higher combat levels. Staying on No Equipment until you level up:';
}

/** Ordered [key, preset] view; readonly so callers cannot reorder declaration priority. */
export type PresetEntry = readonly [string, EncounterPreset];

export interface AutoPresetContext {
  /** Real (non-fallback) presets in declaration order — the recovery priority list. */
  readonly realPresetEntries: readonly PresetEntry[];
  readonly fallbackEntry: PresetEntry | undefined;
  /** Unmet requirements per preset key from {@link computePresetGating}. */
  readonly unmetByKey: ReadonlyMap<string, PresetRequirements>;
  readonly selectedPresetKey: string;
  /** Preset the selected key points at, or undefined for a custom loadout. */
  readonly selectedPreset: EncounterPreset | undefined;
}

/**
 * Decide which preset the loadout should auto-apply, or null to leave it untouched.
 *
 * Two deterministic transitions, declaration order = priority:
 * 1. A real preset that no longer meets the configured stats moves to the first
 *    compatible real set, or to the fallback when every real set is blocked.
 * 2. The fallback recovers to the first compatible real set as soon as stats allow.
 *
 * Custom loadouts (no matching preset) and compatible real selections are left alone.
 */
export function resolveAutoPresetKey({
  realPresetEntries,
  fallbackEntry,
  unmetByKey,
  selectedPresetKey,
  selectedPreset,
}: AutoPresetContext): string | null {
  const selectedIsFallback = selectedPreset?.isFallback === true;
  const selectedIsRealPreset = selectedPreset !== undefined && !selectedIsFallback;
  const firstCompatibleReal = realPresetEntries.find(([key]) => !isPresetBlocked(unmetByKey.get(key)));

  if (selectedIsRealPreset && isPresetBlocked(unmetByKey.get(selectedPresetKey))) {
    const target = firstCompatibleReal ?? fallbackEntry;
    return target ? target[0] : null;
  }

  if (selectedIsFallback) {
    return firstCompatibleReal ? firstCompatibleReal[0] : null;
  }

  return null;
}
