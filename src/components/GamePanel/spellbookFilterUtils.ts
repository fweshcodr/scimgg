import { canCastSpell, hasRune, meetsSpellLevel, type SpellCastContext } from '../../core/combat/runeAvailability';
import { isAutocastableSpell } from '../../data/spellCatalog';
import { getSpellRuneRequirement, RUNE } from '../../data/spellRunes';
import { packSprite } from '../../resourcePack';
import type { SpellCategory, SpellFilterOptions } from '../../types/panelFilters';
import type { SpellbookType } from '../../types/spellbook';

export interface SpellSlot {
  /** Interface sprite base name (lowercase, no extension) */
  icon: string;
  label: string;
  category: SpellCategory;
  /** Cache param `spell_levelreq` (604). */
  level: number;
  /** Cache params `magic_runetype_1` through `_4` (603/606/608/610). */
  runeTypes: readonly number[];
  /**
   * Force-enable a slot the engine implements directly (teleports, self-casts).
   * Combat spells do not need this — {@link isSpellSlotEnabled} derives them from
   * the damage catalog.
   */
  supported?: boolean;
  /**
   * Set when an OSRS unlock this simulator models gates the spell, which is what
   * the "Show spells you lack the requirements to cast" row hides
   * (https://oldschool.runescape.wiki/w/Spellbook#Spellbook_filtering). No slot sets
   * it today: every
   * quest, scroll and diary unlock behind these books is treated as earned, so the
   * row hides nothing here — exactly as it behaves on an account that has them.
   * A future slot that IS gated marks itself here and the filter picks it up.
   */
  locked?: true;
}

function spell(
  icon: string,
  label: string,
  category: SpellCategory,
  level: number,
  runeTypes: readonly number[],
  supported = false,
): SpellSlot {
  return { icon, label, category, level, runeTypes, ...(supported ? { supported: true } : {}) };
}

interface SpellbookDefinition {
  type: SpellbookType;
  iconDir: string;
  grid: SpellSlot[];
  /** False for books whose grid has not been authored yet (standard, lunar). */
  available: boolean;
}

/**
 * Whether the engine can actually resolve this spell, independent of level, runes
 * and the player's state. Every book is authored in full, so this is what separates
 * a spell the simulator implements from one that is only drawn.
 */
export function isSpellSimulated(slot: SpellSlot): boolean {
  if (slot.supported === true) return true;
  return slot.category === 'combat' && isAutocastableSpell(slot.label);
}

/**
 * Whether a spell slot renders enabled (full-color, clickable) rather than
 * grayed out.
 *
 * Mirrors the live client's icon gate: a spell dims when the Magic level is too low,
 * and again when the runes are missing
 * (https://oldschool.runescape.wiki/w/Interface#Spellbook). The level is checked
 * against the player's BOOSTED level.
 * Passing no cast context skips both checks, which is what callers outside a live
 * encounter want.
 */
export function isSpellSlotEnabled(slot: SpellSlot, castContext?: SpellCastContext | null): boolean {
  if (castContext && !meetsSpellLevel(slot.label, castContext.magicLevel)) return false;
  if (slot.supported === true) {
    // A `supported` spell still has to be paid for when the engine knows its runes. Returning true
    // regardless drew Death Charge full-color with an empty rune pouch and then had the engine
    // refuse the click, which reads as a dead button rather than a grayed-out spell. Teleports
    // carry no rune data, so they keep the unconditional pass.
    if (!castContext || getSpellRuneRequirement(slot.label) === null) return true;
    return canCastSpell(slot.label, castContext);
  }
  if (!isSpellSimulated(slot)) return false;
  return castContext ? canCastSpell(slot.label, castContext) : true;
}

/**
 * Build the spell icon path, one of the four icons each spell carries as cache params:
 * - param 597: small ON (24px) = icon.png
 * - param 598: small OFF (24px) = icon_disabled.png
 * - param 599: large ON (40px) = icon_resized.png
 * - param 600: large OFF (40px) = icon_disabled_resized.png
 */
export function getSpellIconPath(iconDir: string, icon: string, slotSize: number, available: boolean): string {
  const large = slotSize >= 40;
  const suffix = available ? (large ? '_resized' : '') : large ? '_disabled_resized' : '_disabled';
  const iconDirRelativeToPack = iconDir.replace(/^\/assets\/ui\/packs\/[^/]+\//, '');
  return packSprite(`${iconDirRelativeToPack}/${icon}${suffix}.png`);
}

export const ARCEUUS_GRID: SpellSlot[] = [
  spell('home_teleport', 'Arceuus Home Teleport', 'teleport', 1, [], true),
  // Same icon and no-rune, level-1, unsimulated treatment as the Ancient Magicks entry: this spell
  // is shared across every spellbook (https://oldschool.runescape.wiki/w/Minigame_Teleport).
  spell('minigame_teleport', 'Minigame Teleport', 'teleport', 1, []),
  spell('arceuus_library_teleport', 'Arceuus Library Teleport', 'teleport', 6, [RUNE.earth, RUNE.law]),
  spell('basic_reanimation', 'Basic Reanimation', 'utility', 16, [RUNE.body, RUNE.nature]),
  spell('draynor_manor_teleport', 'Draynor Manor Teleport', 'teleport', 17, [RUNE.earth, RUNE.water, RUNE.law]),
  spell('battlefront_teleport', 'Battlefront Teleport', 'teleport', 23, [RUNE.earth, RUNE.fire, RUNE.law]),
  spell('mind_altar_teleport', 'Mind Altar Teleport', 'teleport', 28, [RUNE.mind, RUNE.law]),
  spell('respawn_teleport', 'Respawn Teleport', 'teleport', 34, [RUNE.soul, RUNE.law]),
  spell('ghostly_grasp', 'Ghostly Grasp', 'combat', 35, [RUNE.air, RUNE.chaos]),
  spell('ressurect_lesser_ghost', 'Resurrect Lesser Ghost', 'utility', 38, [RUNE.air, RUNE.mind, RUNE.cosmic]),
  spell('ressurect_lesser_skeleton', 'Resurrect Lesser Skeleton', 'utility', 38, [RUNE.air, RUNE.mind, RUNE.cosmic]),
  spell('ressurect_lesser_zombie', 'Resurrect Lesser Zombie', 'utility', 38, [RUNE.air, RUNE.mind, RUNE.cosmic]),
  spell('salve_graveyard_teleport', 'Salve Graveyard Teleport', 'teleport', 40, [RUNE.soul, RUNE.law]),
  spell('adept_reanimation', 'Adept Reanimation', 'utility', 41, [RUNE.body, RUNE.nature, RUNE.soul]),
  spell('inferior_demonbane', 'Inferior Demonbane', 'combat', 44, [RUNE.fire, RUNE.chaos]),
  spell('shadow_veil', 'Shadow Veil', 'combat', 47, [RUNE.earth, RUNE.fire, RUNE.cosmic]),
  spell('fenkenstrains_castle_teleport', "Fenkenstrain's Castle Teleport", 'teleport', 48, [
    RUNE.earth,
    RUNE.soul,
    RUNE.law,
  ]),
  spell('dark_lure', 'Dark Lure', 'combat', 50, [RUNE.nature, RUNE.death]),
  spell('skeletal_grasp', 'Skeletal Grasp', 'combat', 56, [RUNE.earth, RUNE.death]),
  spell('ressurect_superior_ghost', 'Resurrect Superior Ghost', 'utility', 57, [RUNE.earth, RUNE.death, RUNE.cosmic]),
  spell('ressurect_superior_skeleton', 'Resurrect Superior Skeleton', 'utility', 57, [
    RUNE.earth,
    RUNE.death,
    RUNE.cosmic,
  ]),
  spell('ressurect_superior_zombie', 'Resurrect Superior Zombie', 'utility', 57, [RUNE.earth, RUNE.death, RUNE.cosmic]),
  spell('mark_of_darkness', 'Mark of Darkness', 'combat', 59, [RUNE.cosmic, RUNE.soul], true),
  spell('west_ardougne_teleport', 'West Ardougne Teleport', 'teleport', 61, [RUNE.law, RUNE.soul]),
  spell('superior_demonbane', 'Superior Demonbane', 'combat', 62, [RUNE.fire, RUNE.soul]),
  spell('lesser_corruption', 'Lesser Corruption', 'combat', 64, [RUNE.death, RUNE.soul]),
  spell('harmony_island_teleport', 'Harmony Island Teleport', 'teleport', 65, [RUNE.law, RUNE.soul, RUNE.nature]),
  spell('vile_vigour', 'Vile Vigour', 'utility', 66, [RUNE.air, RUNE.soul]),
  spell('degrime', 'Degrime', 'utility', 70, [RUNE.earth, RUNE.nature]),
  spell('cemetary_teleport', 'Cemetery Teleport', 'teleport', 71, [RUNE.law, RUNE.soul, RUNE.blood]),
  spell('expert_reanimation', 'Expert Reanimation', 'utility', 72, [RUNE.nature, RUNE.blood, RUNE.soul]),
  spell('ward_of_arceuus', 'Ward of Arceuus', 'combat', 73, [RUNE.cosmic, RUNE.nature, RUNE.soul]),
  spell('ressurect_greater_ghost', 'Resurrect Greater Ghost', 'utility', 76, [RUNE.fire, RUNE.blood, RUNE.cosmic]),
  spell('ressurect_greater_skeleton', 'Resurrect Greater Skeleton', 'utility', 76, [
    RUNE.fire,
    RUNE.blood,
    RUNE.cosmic,
  ]),
  spell('ressurect_greater_zombie', 'Resurrect Greater Zombie', 'utility', 76, [RUNE.fire, RUNE.blood, RUNE.cosmic]),
  spell('reanimate_crops', 'Resurrect Crops', 'utility', 78, [RUNE.soul, RUNE.nature, RUNE.blood, RUNE.earth]),
  spell('undead_grasp', 'Undead Grasp', 'combat', 79, [RUNE.fire, RUNE.blood]),
  spell('death_charge', 'Death Charge', 'combat', 80, [RUNE.death, RUNE.blood, RUNE.soul], true),
  spell('dark_demonbane', 'Dark Demonbane', 'combat', 82, [RUNE.fire, RUNE.soul]),
  spell('barrows_teleport', 'Barrows Teleport', 'teleport', 83, [RUNE.law, RUNE.soul, RUNE.blood]),
  spell('demonic_offering', 'Demonic Offering', 'utility', 84, [RUNE.soul, RUNE.wrath]),
  spell('greater_corruption', 'Greater Corruption', 'combat', 85, [RUNE.blood, RUNE.soul]),
  spell('master_reanimation', 'Master Reanimation', 'utility', 90, [RUNE.nature, RUNE.blood, RUNE.soul]),
  spell('ape_atoll_teleport', 'Ape Atoll Teleport', 'teleport', 90, [RUNE.law, RUNE.soul, RUNE.blood]),
  spell('sinister_offering', 'Sinister Offering', 'utility', 92, [RUNE.blood, RUNE.wrath]),
];

/**
 * Row-major order from https://oldschool.runescape.wiki/w/Ancient_Magicks#Spell_summary.
 * Use the detailed table, not the introduction's outdated count: both shared teleports belong here.
 * `home_teleport` retains the shared Home Teleport art and the simulator's lobby action.
 */
export const ANCIENT_GRID: SpellSlot[] = [
  spell('home_teleport', 'Edgeville Home Teleport', 'teleport', 1, [], true),
  spell('minigame_teleport', 'Minigame Teleport', 'teleport', 1, []),
  spell('smoke_rush', 'Smoke Rush', 'combat', 50, [RUNE.air, RUNE.fire, RUNE.chaos, RUNE.death]),
  spell('shadow_rush', 'Shadow Rush', 'combat', 52, [RUNE.air, RUNE.soul, RUNE.chaos, RUNE.death]),
  spell('paddewwa_teleport', 'Paddewwa Teleport', 'teleport', 54, [RUNE.air, RUNE.fire, RUNE.law]),
  spell('blood_rush', 'Blood Rush', 'combat', 56, [RUNE.blood, RUNE.chaos, RUNE.death]),
  spell('ice_rush', 'Ice Rush', 'combat', 58, [RUNE.water, RUNE.chaos, RUNE.death]),
  spell('senntisten_teleport', 'Senntisten Teleport', 'teleport', 60, [RUNE.soul, RUNE.law]),
  spell('smoke_burst', 'Smoke Burst', 'combat', 62, [RUNE.air, RUNE.fire, RUNE.chaos, RUNE.death]),
  spell('shadow_burst', 'Shadow Burst', 'combat', 64, [RUNE.air, RUNE.soul, RUNE.chaos, RUNE.death]),
  spell('kharyrll_teleport', 'Kharyrll Teleport', 'teleport', 66, [RUNE.blood, RUNE.law]),
  spell('blood_burst', 'Blood Burst', 'combat', 68, [RUNE.blood, RUNE.chaos, RUNE.death]),
  spell('ice_burst', 'Ice Burst', 'combat', 70, [RUNE.water, RUNE.chaos, RUNE.death]),
  spell('lassar_teleport', 'Lassar Teleport', 'teleport', 72, [RUNE.water, RUNE.law]),
  spell('smoke_blitz', 'Smoke Blitz', 'combat', 74, [RUNE.air, RUNE.fire, RUNE.blood, RUNE.death]),
  spell('shadow_blitz', 'Shadow Blitz', 'combat', 76, [RUNE.air, RUNE.soul, RUNE.blood, RUNE.death]),
  spell('dareeyak_teleport', 'Dareeyak Teleport', 'teleport', 78, [RUNE.air, RUNE.fire, RUNE.law]),
  spell('blood_blitz', 'Blood Blitz', 'combat', 80, [RUNE.blood, RUNE.death]),
  spell('ice_blitz', 'Ice Blitz', 'combat', 82, [RUNE.water, RUNE.blood, RUNE.death]),
  // Renamed from "Carrallangar" in 2023; the interface sprite keeps the old spelling.
  spell('carrallangar_teleport', 'Carrallanger Teleport', 'teleport', 84, [RUNE.soul, RUNE.law]),
  spell('teleport_to_target', 'Teleport to Target', 'teleport', 85, [RUNE.law, RUNE.chaos, RUNE.death]),
  spell('smoke_barrage', 'Smoke Barrage', 'combat', 86, [RUNE.air, RUNE.fire, RUNE.blood, RUNE.death]),
  spell('shadow_barrage', 'Shadow Barrage', 'combat', 88, [RUNE.air, RUNE.soul, RUNE.blood, RUNE.death]),
  spell('annakarl_teleport', 'Annakarl Teleport', 'teleport', 90, [RUNE.blood, RUNE.law]),
  spell('blood_barrage', 'Blood Barrage', 'combat', 92, [RUNE.blood, RUNE.soul, RUNE.death]),
  spell('ice_barrage', 'Ice Barrage', 'combat', 94, [RUNE.water, RUNE.blood, RUNE.death]),
  spell('ghorrock_teleport', 'Ghorrock Teleport', 'teleport', 96, [RUNE.water, RUNE.law]),
];

function spellPackBase(): string {
  return packSprite('spells');
}

export const SPELLBOOKS: Record<SpellbookType, SpellbookDefinition> = {
  get arceuus() {
    return {
      type: 'arceuus' as const,
      iconDir: `${spellPackBase()}/arceuus_spell`,
      grid: ARCEUUS_GRID,
      available: true,
    };
  },
  get ancient() {
    return {
      type: 'ancient' as const,
      iconDir: `${spellPackBase()}/ancient_spell`,
      grid: ANCIENT_GRID,
      available: true,
    };
  },
  get standard() {
    return {
      type: 'standard' as const,
      iconDir: `${spellPackBase()}/normal_spell`,
      grid: [] as SpellSlot[],
      available: false,
    };
  },
  get lunar() {
    return {
      type: 'lunar' as const,
      iconDir: `${spellPackBase()}/lunar_spell`,
      grid: [] as SpellSlot[],
      available: false,
    };
  },
};

export const SELECTABLE_SPELLBOOKS: readonly SpellbookType[] = (Object.keys(SPELLBOOKS) as SpellbookType[]).filter(
  (book) => SPELLBOOKS[book].available,
);

export function sortSpellGrid(customOrder: string[] | null, grid: SpellSlot[]): SpellSlot[] {
  if (!customOrder) return grid;
  const rank = new Map(customOrder.map((icon, index) => [icon, index]));
  return [...grid].sort((a, b) => {
    const aRank = rank.get(a.icon);
    const bRank = rank.get(b.icon);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return grid.findIndex((s) => s.icon === a.icon) - grid.findIndex((s) => s.icon === b.icon);
  });
}

/**
 * The account state the spellbook filters read.
 *
 * Magic carries BOTH levels because the filter's level rule is not the icon's: the
 * filter hides a spell only when base AND current are short of it, so a Magic potion
 * reveals spells and drained Magic hides none. The icon gate in
 * {@link isSpellSlotEnabled} reads the boosted level alone.
 * Not settled by a permitted public source; it is the behavior this simulator
 * assumes and the one thing here a live-client check should confirm before it is relied on.
 */
export interface SpellAvailability {
  /** The base (unboosted) Magic level. */
  baseMagicLevel?: number;
  /** Runes, staves and tomes the player can draw on. */
  runeContext?: SpellCastContext | null;
}

/**
 * Independent filter conjuncts in panel order, followed by this simulator's coverage row.
 * Options use the positive "show" sense defined in src/types/panelFilters.ts.
 */
export function passesSpellFilter(
  slot: SpellSlot,
  activeCategorySet: Set<SpellCategory>,
  filterOptions: SpellFilterOptions,
  availability: SpellAvailability,
): boolean {
  if (!activeCategorySet.has(slot.category)) return false;

  if (!filterOptions.showLackLevel) {
    const boosted = availability.runeContext?.magicLevel;
    const noLevelContext = availability.baseMagicLevel === undefined && boosted === undefined;
    const baseMeets = availability.baseMagicLevel !== undefined && availability.baseMagicLevel >= slot.level;
    const boostedMeets = boosted !== undefined && boosted >= slot.level;
    if (!noLevelContext && !baseMeets && !boostedMeets) {
      return false;
    }
  }
  const runeContext = availability.runeContext;
  if (!filterOptions.showLackRunes && runeContext && !slot.runeTypes.every((runeId) => hasRune(runeId, runeContext))) {
    return false;
  }
  if (!filterOptions.showLackRequirements && slot.locked) return false;
  if (!filterOptions.showUnsimulated && !isSpellSimulated(slot)) return false;

  return true;
}

export function filterSpellGrid(
  sortedGrid: SpellSlot[],
  hiddenSet: Set<string>,
  activeCategorySet: Set<SpellCategory>,
  filterOptions: SpellFilterOptions,
  filteringEnabled: boolean,
  reorderMode: boolean,
  availability: SpellAvailability = {},
): SpellSlot[] {
  if (reorderMode) return sortedGrid;
  const filtered = sortedGrid.filter((slot) => !hiddenSet.has(slot.icon));
  if (!filteringEnabled) return filtered;
  return filtered.filter((slot) => passesSpellFilter(slot, activeCategorySet, filterOptions, availability));
}

/** Integer division that truncates, for the whole-pixel grid layout. */
function intDiv(numerator: number, denominator: number): number {
  return Math.trunc(numerator / denominator);
}

interface ClassicGrid {
  cols: number;
  gapX: number;
  gapY: number;
  /** Spell layer offset inside the content box: centered on x, top-aligned on y. */
  offsetX: number;
  offsetY: number;
}

/**
 * Each book's hand-authored grid: `(cols, gapX, gapY)` per spellbook. The row count
 * only sizes the spell layer; slot positions come from the running index, so it is not
 * needed here. The offsets are the layer's position within the content box.
 */
const CLASSIC_GRIDS: Record<SpellbookType, ClassicGrid> = {
  standard: { cols: 7, gapX: 0, gapY: 0, offsetX: 1, offsetY: 15 },
  ancient: { cols: 4, gapX: 20, gapY: 4, offsetX: 2, offsetY: 8 },
  lunar: { cols: 6, gapX: 6, gapY: 5, offsetX: 0, offsetY: 8 },
  arceuus: { cols: 6, gapX: 9, gapY: 7, offsetX: 0, offsetY: 0 },
};

/** Slot size the live client uses for every book but the resized filtering view. */
const SLOT_SIZE = 24;
/** The 204x275 panel has a 7px border, so its content box is 190x261. */
const PANEL_INSET = 7;
const CONTENT_W = 190;
/** Filtering shrinks the spell area to make room for the Filters button. */
const FILTER_CONTENT_W = 184;
const FILTER_CONTENT_H = 240;
const FILTER_CONTENT_X = PANEL_INSET + intDiv(CONTENT_W - FILTER_CONTENT_W, 2);

export interface SpellbookLayout {
  slotSize: number;
  startX: number;
  startY: number;
  gapX: number;
  gapY: number;
  cols: number;
}

/**
 * Spell grid geometry. Spells are placed row-major at a pitch of `slotSize + gap`
 * on each axis.
 *
 * Two layouts exist, selected by whether spell filtering is on:
 *
 * - Filtering off is the game default and uses the book's authored grid — see
 *   {@link CLASSIC_GRIDS}. Its geometry is fixed, so hiding spells never reflows
 *   the book.
 * - Filtering on shrinks the content box to 184x240 and derives slot size, columns
 *   and gaps from the number of visible spells. Whether a short list may grow its
 *   icons to 40px is the filter panel's last row.
 */
export function calculateSpellbookLayout(
  filteringEnabled: boolean,
  count: number,
  spellbook: SpellbookType,
  iconResizing = true,
): SpellbookLayout {
  if (!filteringEnabled) {
    const grid = CLASSIC_GRIDS[spellbook];
    const gridWidth = grid.cols * SLOT_SIZE + (grid.cols - 1) * grid.gapX;
    return {
      slotSize: SLOT_SIZE,
      startX: PANEL_INSET + intDiv(CONTENT_W - gridWidth, 2) + grid.offsetX,
      startY: PANEL_INSET + grid.offsetY,
      gapX: grid.gapX,
      gapY: grid.gapY,
      cols: grid.cols,
    };
  }

  let slotSize = SLOT_SIZE;
  let cols: number;
  if (!iconResizing) {
    // 24px throughout, and four columns until the book outgrows them.
    cols = count <= 28 ? 4 : Math.max(4, Math.min(7, intDiv(count + 8, 9)));
  } else if (count <= 15) {
    slotSize = 40;
    cols = 3;
  } else if (count <= 20) {
    slotSize = 40;
    cols = 4;
  } else {
    cols = Math.max(4, Math.min(7, intDiv(count + 8, 9)));
  }

  // The gap is at most 5/7 of the slot size; with resizing blocked it is capped at the
  // slot size instead.
  const maxGapX = iconResizing ? intDiv(5 * slotSize, 7) : slotSize;
  const gapX = Math.max(0, Math.min(maxGapX, intDiv(FILTER_CONTENT_W - slotSize * cols, cols - 1)));
  const rows = Math.max(1, intDiv(count + (cols - 1), cols));
  const gapY = rows >= 2 ? Math.max(0, Math.min(gapX, intDiv(FILTER_CONTENT_H - slotSize * rows, rows - 1))) : 0;

  const gridWidth = cols * slotSize + (cols - 1) * gapX;
  const gridHeight = rows * slotSize + (rows - 1) * gapY;
  /**
   * The spell layer is centered in the content box, so its height — not the grid's
   * — decides where the first row lands. With resizing blocked that height is
   * floored at `contentH - 30`, which pins a short book to the top
   * of the panel instead of drifting it into the middle.
   */
  const layerHeight = iconResizing ? gridHeight : Math.max(gridHeight, FILTER_CONTENT_H - 30);
  return {
    slotSize,
    startX: FILTER_CONTENT_X + intDiv(FILTER_CONTENT_W - gridWidth, 2),
    startY: PANEL_INSET + intDiv(FILTER_CONTENT_H - layerHeight, 2),
    gapX,
    gapY,
    cols,
  };
}
