import { baseEncounterKind } from '../encounters/catalog';
import type { TileMarker, TilePackPreset } from '../types/tileMarkers';

/** A RuneLite `#AARRGGBB` marker, whose alpha is the BORDER's. */
function rl(x: number, y: number, aarrggbb: string, label?: string): TileMarker {
  const hex = aarrggbb.startsWith('#') ? aarrggbb.slice(1) : aarrggbb;
  const alpha = parseInt(hex.slice(0, 2), 16);
  const rgb = hex.slice(2);
  return {
    x,
    y,
    color: `#${rgb.toUpperCase()}`,
    opacity: Math.round((alpha / 255) * 100) / 100,
    ...(label ? { label } : {}),
  };
}

// Consistent across all packs so users learn the color meanings once.
const C = {
  DANGER: '#CCFF6B35', // Hot orange — danger zones, no-fly areas
  SAFE: '#CC00BFA5', // Teal — safe tiles, landing spots
  CYCLE: '#CCFFAB00', // Warm gold — primary numbered cycle tiles
  WAVE: '#CC9B59B6', // Soft purple — wave dodge, early wave positions
  REFERENCE: '#9990A4AE', // Muted gray — faint reference/reset markers
} as const;

// All coordinates are region-local (regionId 6045 → sim coords are identical).

/**
 * "Yama No Fly" — pack id 66 in the RuneLite Tile Packs plugin (BSD-2-Clause, attributed in
 * scripts/vendoredNotices.ts), recolored onto `C`. Tiles and labels as published at
 * https://github.com/TrevorMDev/tile-packs/blob/fa48c15408c9dc86f1739c8d6def18d7a2fb19a6/src/main/resources/com/tilepacks/tilePacks.jsonc
 */
const YAMA_NO_FLY: TilePackPreset = {
  id: 'yama_p3_no_fly',
  name: 'Nofly',
  description: 'Safe tiles, no-fly zones, and wave dodge sequence (RuneLite Tile Packs)',
  encounterKind: 'yama_p3',
  link: 'https://www.youtube.com/watch?v=N6c-jW0kZC0',
  markers: [
    // Red — no-fly danger corners
    rl(24, 35, C.DANGER),
    rl(24, 34, C.DANGER),
    rl(23, 35, C.DANGER),
    rl(38, 35, C.DANGER),
    rl(38, 34, C.DANGER),
    rl(39, 35, C.DANGER),
    rl(23, 28, C.DANGER),
    rl(22, 28, C.DANGER),
    rl(22, 29, C.DANGER),
    rl(39, 28, C.DANGER),
    rl(40, 28, C.DANGER),
    rl(40, 29, C.DANGER),
    // Black — reference points
    rl(8, 47, C.REFERENCE),
    rl(7, 47, C.REFERENCE),
    rl(6, 47, C.REFERENCE),
    // Green — safe tiles
    rl(30, 35, C.SAFE),
    rl(30, 31, C.SAFE),
    rl(30, 30, C.SAFE),
    // Blue — early skip tiles
    rl(32, 35, C.WAVE, 'early skip'),
    rl(32, 31, C.WAVE),
    rl(32, 30, C.WAVE),
    // Yellow — wave dodge sequence
    rl(27, 33, C.WAVE, '1'),
    rl(28, 32, C.WAVE, '2'),
    rl(28, 31, C.WAVE, '3'),
    // Purple — alternate wave dodge
    rl(30, 33, C.WAVE, '2'),
    rl(29, 33, C.WAVE, '3'),
    rl(30, 34, C.WAVE, '1'),
  ],
};

/**
 * "Donofly" — OSRS Wiki documented advanced melee method.
 */
const YAMA_DONOFLY: TilePackPreset = {
  id: 'yama_p3_donofly',
  name: 'Donofly',
  description: 'Advanced melee P3 method. Avoids waves, crashes, and melee (OSRS Wiki)',
  encounterKind: 'yama_p3',
  link: 'https://oldschool.runescape.wiki/w/Yama/Strategies#Advanced_Yama_Methods',
  markers: [
    rl(30, 38, C.REFERENCE), // Landing/start reference
    rl(30, 34, C.SAFE),
    rl(30, 36, C.SAFE),
    rl(35, 35, C.CYCLE, '1'),
    rl(38, 31, C.CYCLE, '2'),
    rl(29, 33, C.CYCLE, '3'),
    rl(26, 30, C.CYCLE, '4w'),
    rl(32, 33, C.CYCLE, '5'),
  ],
};

/**
 * "Yama Mage Contract" — OSRS Wiki Phase 3 mage strategy tile pack.
 * Tile module: https://oldschool.runescape.wiki/w/Module:Tile_markers/Yama_mage_contract.json
 */
const YAMA_MAGE_CONTRACT: TilePackPreset = {
  id: 'yama_p3_mage_contract',
  name: 'Yama Mage Contract',
  description: 'Phase 3 mage strategy: wave-dodge tile path (OSRS Wiki)',
  encounterKind: 'yama_p3',
  link: 'https://oldschool.runescape.wiki/w/Yama/Strategies',
  markers: [
    // Wiki "solid white" — primary wave-dodge positions
    rl(31, 35, C.CYCLE),
    rl(29, 35, C.CYCLE),
    rl(31, 36, C.CYCLE),
    rl(29, 36, C.CYCLE),
    rl(30, 36, C.CYCLE),
    // Wiki "faint white" — fallback/reference positions
    rl(30, 38, C.REFERENCE),
    rl(31, 38, C.REFERENCE),
    rl(29, 38, C.REFERENCE),
    rl(30, 40, C.REFERENCE),
    // Wiki "green" — sentinel anchor tiles
    rl(29, 34, C.SAFE),
    rl(30, 39, C.SAFE),
  ],
};

/**
 * "Wave Dodge Lane" — beginner practice markers for the Shadow Waves tutorial.
 * The shadow wave sweeps north up the lane; each time it reaches the tile four
 * ahead of you, you run one tile to the next marker and let the wave pass beneath
 * you. Alternating colors show the step pattern: you shuttle from one color to the
 * next.
 */
const YAMA_WAVE_CROSS: TilePackPreset = {
  id: 'yama_p3_wave_cross',
  name: 'Wave Dodge Lane',
  description: 'Beginner shadow-wave dodge. Run between the marked tiles as each wave sweeps past',
  encounterKind: 'yama_p3',
  hidden: true,
  markers: [rl(30, 40, C.SAFE), rl(30, 38, C.WAVE), rl(30, 36, C.SAFE), rl(30, 34, C.WAVE)],
};

const YAMA_P3_PRESETS: TilePackPreset[] = [YAMA_DONOFLY, YAMA_NO_FLY, YAMA_MAGE_CONTRACT, YAMA_WAVE_CROSS];

/**
 * Inferno tiles as published by RuneMarkers (MIT; it and its tile credits are attributed in
 * scripts/vendoredNotices.ts), recolored onto `C`. Tiles and the UNSAFE label as at the pinned
 * `link`; the pack's name and description are our own.
 */
const ZUK_INFERNO: TilePackPreset = {
  id: 'zuk_inferno',
  name: 'Zuk Inferno Tiles',
  description: 'Zuk safe columns, danger tiles, and positional references',
  encounterKind: 'zuk',
  link: 'https://github.com/jamiegyoung/runemarkers/blob/b6fb9d0b3aa5706662267c2bdf0b00d4113dd158/entities/inferno.json',
  // Declared here rather than seeded into TILE_MARKER_DEFAULTS.activePresetIds, so
  // a user can switch it off durably.
  defaultActive: true,
  markers: [
    rl(36, 46, C.SAFE),
    rl(42, 46, C.SAFE),
    rl(26, 46, C.SAFE),
    rl(20, 46, C.SAFE),
    rl(40, 46, C.DANGER),
    rl(39, 46, C.DANGER),
    rl(38, 46, C.DANGER),
    rl(31, 45, C.DANGER, 'UNSAFE'),
    rl(23, 46, C.DANGER),
    rl(22, 46, C.DANGER),
    rl(24, 46, C.DANGER),
    rl(33, 43, C.REFERENCE),
    rl(32, 29, C.REFERENCE),
    rl(26, 34, C.REFERENCE),
  ],
};

const ZUK_PRESETS: TilePackPreset[] = [ZUK_INFERNO];

const PRESETS_BY_ENCOUNTER = new Map<string, TilePackPreset[]>();

function registerPresets(presets: TilePackPreset[]): void {
  for (const preset of presets) {
    // Keyed by the owning kind, so a pack authored for a retired kind (Zuk's) serves the Inferno.
    const kind = baseEncounterKind(preset.encounterKind);
    const existing = PRESETS_BY_ENCOUNTER.get(kind) ?? [];
    existing.push(preset);
    PRESETS_BY_ENCOUNTER.set(kind, existing);
  }
}

registerPresets(YAMA_P3_PRESETS);
registerPresets(ZUK_PRESETS);

/**
 * A variant kind answers with its parent's packs: Yama's contracts are the same arena and the
 * same movement, so a pack authored for the base fight applies unchanged.
 */
export function getPresetsForEncounter(encounterKind: string): TilePackPreset[] {
  return PRESETS_BY_ENCOUNTER.get(baseEncounterKind(encounterKind)) ?? [];
}

/**
 * The packs a player may pick from. Use this for anything that renders the pack
 * list; every other caller — resolving active ids into markers, clearing every
 * pack, exporting one — wants `getPresetsForEncounter`, because a hidden pack a
 * tutorial switched on still has to render and still has to be clearable.
 */
export function getListedPresetsForEncounter(encounterKind: string): TilePackPreset[] {
  return getPresetsForEncounter(encounterKind).filter((preset) => !preset.hidden);
}

export function getPresetById(presetId: string): TilePackPreset | undefined {
  for (const presets of PRESETS_BY_ENCOUNTER.values()) {
    const found = presets.find((p) => p.id === presetId);
    if (found) return found;
  }
  return undefined;
}

export function getAllPresets(): TilePackPreset[] {
  const all: TilePackPreset[] = [];
  for (const presets of PRESETS_BY_ENCOUNTER.values()) {
    all.push(...presets);
  }
  return all;
}
