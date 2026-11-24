/**
 * Shared activation model for marker preset packs.
 *
 * Tile packs and line groups are the same mechanism — named bundles of markers
 * a user switches on per encounter — so they share this state shape. What they
 * do NOT share is the selection policy: tile packs are competing strategies for
 * one fight and only one may be on ({@link PresetSelection} `'single'`), while
 * line groups are reference overlays that compose (`'multi'`). Declaring that
 * per registry keeps the difference intentional instead of re-implemented.
 *
 * Activation is stored as explicit per-preset choices rather than a list of
 * active ids. A list cannot tell "never touched" from "switched off", which
 * forces default-on packs to be seeded into the default state — and a seeded id
 * is indistinguishable from a user's choice, so it cannot be switched off
 * durably, and a pack added later can never start on for existing users.
 *
 * Choices are keyed by encounter kind first. A pack is offered to every variant
 * of the encounter that registered it (Yama's contracts share the base fight's
 * packs), so without that dimension the same preset id would carry one shared
 * on/off state across all Yama kinds and a pack chosen for one contract would
 * follow the user into the next.
 */

import { consolidateRetiredEncounterKinds } from '../encounters/catalog';

/** The minimum a preset must expose for its activation to be resolved here. */
export interface SelectablePreset {
  id: string;
  /** On for a user who has never touched it. An explicit choice always wins. */
  defaultActive?: boolean;
}

export type PresetSelection = 'single' | 'multi';

/** One encounter kind's choices, keyed by preset id; a missing entry means "never touched". */
export type PresetChoices = Record<string, boolean>;

/** Every encounter kind's choices, keyed by encounter kind. */
export type PresetOverrides = Record<string, PresetChoices>;

/** The choices recorded for one encounter kind. Empty when the user has touched none of its packs. */
export function presetChoicesFor(overrides: PresetOverrides, encounterKind: string): PresetChoices {
  return overrides[encounterKind] ?? {};
}

export function isPresetActive(preset: SelectablePreset, choices: PresetChoices): boolean {
  return choices[preset.id] ?? preset.defaultActive ?? false;
}

export function resolveActivePresetIds(presets: readonly SelectablePreset[], choices: PresetChoices): string[] {
  return presets.filter((preset) => isPresetActive(preset, choices)).map((preset) => preset.id);
}

/**
 * Flips one preset within `encounterKind`. Under `'single'` the other presets in
 * `presets` are switched off explicitly — `presets` is the set in scope (one
 * encounter's packs), so choosing a pack never disturbs another encounter's choice.
 */
export function togglePresetOverrides(
  overrides: PresetOverrides,
  encounterKind: string,
  presets: readonly SelectablePreset[],
  presetId: string,
  selection: PresetSelection,
): PresetOverrides {
  const target = presets.find((preset) => preset.id === presetId);
  // An id outside the scope has no resolvable state, and writing one would let
  // 'single' switch every real preset off in favor of a preset that isn't there.
  if (!target) return overrides;
  const choices = presetChoicesFor(overrides, encounterKind);
  const turningOn = !isPresetActive(target, choices);
  const next: PresetChoices = { ...choices, [presetId]: turningOn };
  if (turningOn && selection === 'single') {
    for (const preset of presets) {
      if (preset.id !== presetId) next[preset.id] = false;
    }
  }
  return { ...overrides, [encounterKind]: next };
}

/** Switches the given presets on for one encounter kind, leaving everything else untouched. */
export function activatePresetOverrides(
  overrides: PresetOverrides,
  encounterKind: string,
  presetIds: readonly string[],
): PresetOverrides {
  const next = { ...presetChoicesFor(overrides, encounterKind) };
  for (const id of presetIds) next[id] = true;
  return { ...overrides, [encounterKind]: next };
}

/** Switches the given presets off explicitly for one encounter kind, so default-on packs stay off. */
export function deactivatePresetOverrides(
  overrides: PresetOverrides,
  encounterKind: string,
  presetIds: readonly string[],
): PresetOverrides {
  const next = { ...presetChoicesFor(overrides, encounterKind) };
  for (const id of presetIds) next[id] = false;
  return { ...overrides, [encounterKind]: next };
}

function choicesEqual(current: PresetChoices, next: PresetChoices): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(current).length) return false;
  return keys.every((key) => current[key] === next[key]);
}

/** True when applying `next` would leave the stored choices unchanged. */
export function presetOverridesEqual(current: PresetOverrides, next: PresetOverrides): boolean {
  const kinds = Object.keys(next);
  if (kinds.length !== Object.keys(current).length) return false;
  return kinds.every((kind) => current[kind] !== undefined && choicesEqual(current[kind], next[kind]));
}

/**
 * Keys that would reach `Object.prototype` instead of the map. `overrides['__proto__']`
 * returns the prototype rather than `undefined`, so the `?? {}` fallback below would hand
 * back a live prototype to write onto. Rejected on BOTH dimensions: `constructor` reaches
 * the inherited `Object` before any own property exists. localStorage is the only source,
 * so this is self-inflicted rather than remote — but the blast radius is every object in
 * the tab, and no real encounter or preset id looks like this.
 */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Reads persisted choices, keeping each `{ encounterKind: { presetId: boolean } }` entry and
 * dropping anything else, then folds a retired encounter kind's choices into the kind that owns it.
 */
export function normalizePresetOverrides(stored: Record<string, unknown>): PresetOverrides {
  const overrides: PresetOverrides = {};
  const raw = stored.presetOverrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return overrides;

  for (const [encounterKind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(encounterKind) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [presetId, choice] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_KEYS.has(presetId) || typeof choice !== 'boolean') continue;
      const choices = overrides[encounterKind] ?? {};
      choices[presetId] = choice;
      overrides[encounterKind] = choices;
    }
  }
  // A retired kind's choices (Zuk's) belong to the kind that owns it now; per preset, the retired
  // kind's choice wins, an explicit `false` included.
  return consolidateRetiredEncounterKinds(overrides, (owned, retired) => ({ ...owned, ...retired })).map;
}
