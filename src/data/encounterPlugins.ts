import { baseEncounterKind } from '../encounters/catalog';

/**
 * Plugins that act only in certain encounters. The Plugins panel lists them, under the loaded
 * encounter's name, only while one of their encounters is loaded, and elsewhere they are off
 * ({@link encounterPluginOptions}); their settings persist either way.
 * Keyed by the row's `pluginKey`; `label` is the line under the row's name saying where it acts.
 */
export const ENCOUNTER_PLUGINS = {
  // Only the Colosseum's pillar LOCs (types/pillarAdditions.ts).
  colosseumAdditions: { encounters: ['sol_heredit'], label: 'Colosseum' },
  // Only the Inferno's pillar LOCs (types/pillarAdditions.ts).
  infernoAdditions: { encounters: ['inferno'], label: 'Inferno' },
  // Its NPC list covers the Inferno's waves and Zuk, and the Colosseum's warband (types/tzhaarHpTracker.ts).
  tzhaarHpTracker: { encounters: ['inferno', 'sol_heredit'], label: 'Inferno, Colosseum' },
  // The timer itself runs on wave 69 only (useZukSetTimer).
  setTimer: { encounters: ['inferno'], label: 'Inferno, Zuk wave' },
} as const satisfies Record<string, { readonly encounters: readonly string[]; readonly label: string }>;

export type EncounterPluginKey = keyof typeof ENCOUNTER_PLUGINS;

/**
 * The heading over each encounter's plugins, by base kind: where the plugins act, as players name
 * the place (the Colosseum, not its final boss).
 */
const ENCOUNTER_PLUGIN_SECTION_NAMES: Readonly<Record<string, string>> = {
  inferno: 'Inferno',
  sol_heredit: 'Colosseum',
};

/** Whether `plugin` applies in the loaded encounter (a variant counts as its base encounter). */
export function isEncounterPluginShown(plugin: EncounterPluginKey, encounterKind: string | null | undefined): boolean {
  if (!encounterKind) return false;
  const encounters: readonly string[] = ENCOUNTER_PLUGINS[plugin].encounters;
  return encounters.includes(baseEncounterKind(encounterKind));
}

/**
 * The options a plugin acts with in the loaded encounter: null (off) while its toggle is off or
 * outside its encounters, so a plugin left on never acts on the lobby's or another fight's NPCs.
 */
export function encounterPluginOptions<T>(
  plugin: EncounterPluginKey,
  encounterKind: string | null | undefined,
  enabled: boolean,
  options: T,
): T | null {
  return enabled && isEncounterPluginShown(plugin, encounterKind) ? options : null;
}

/** The heading for the loaded encounter's plugins, or null when it has none. */
export function encounterPluginSectionName(encounterKind: string | null | undefined): string | null {
  if (!encounterKind) return null;
  return ENCOUNTER_PLUGIN_SECTION_NAMES[baseEncounterKind(encounterKind)] ?? null;
}
