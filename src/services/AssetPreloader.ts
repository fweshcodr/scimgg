import { VARIANT_REWARD_ICON } from '../components/encounterPickerMeta';
import { SIDE_BACKGROUND_SPRITES } from '../components/GamePanel/GamePanel';
import { MOBILE_TAB_SLOT } from '../components/GamePanel/MobileSideChrome';
import { PRAYER_SLOT_ICON_NAMES } from '../components/GamePanel/prayerFilterUtils';
import { quickPrayerStylesheetSprites } from '../components/GamePanel/QuickPrayerSetup';
import { SPELLBOOKS } from '../components/GamePanel/SpellbookContent';
import { STATUS_BAR_PRAYER_ICON } from '../components/GamePanel/StatusBars';
import { getSpellIconPath } from '../components/GamePanel/spellbookFilterUtils';
import { entryFrameStylesheetSprites } from '../components/MobileEntry';
import { REPLAY_CLICK_SHEET_URLS } from '../components/replayClickVisuals';
import { INFOBOX_ITEM_IDS } from '../data/infoboxItemIds';
import { ITEM_ACTIONS } from '../data/itemEffects';
import { EQUIPMENT_PRESETS } from '../data/playerPresets';
import { getAutocastableSpells, spellIconName } from '../data/spellCatalog';
import { ENCOUNTER_PRESENTATION_MODULES } from '../encounters/presentationModules';
import { CLICK_SPRITE_URLS } from '../hooks/useClickAnimation';
import { OSM_TAB_SLOTS } from '../layout/osmClientLayout';
import { HITSPLAT_SPRITE_BY_TYPE } from '../render/components/hitsplatSprites';
import { HEALTHBAR_WIDTH_BY_SIZE } from '../render/npc/NpcInstanceManager';
import { PRAYER_OVERHEAD_ICON_PATHS } from '../render/overlay/UIOverlayRenderer';
import { collectPackAssetPaths, PRAYER, packSprite } from '../resourcePack';
import { WEAPON_CATEGORIES } from '../types/attackStyles';
import type { Inventory } from '../types/inventory';
import { PLAYER_STAT_KEYS } from '../types/playerState';
import type { SpellbookType } from '../types/spellbook';
import { loadCachedImage, loadStylesheetUrl } from '../util/imageCache';
import { log } from '../util/Logger';
import { preloadItemSprites } from './ItemSpriteService';

function collectAllItemIds(inventory: Inventory): number[] {
  const ids = new Set<number>();

  for (const id of Object.keys(ITEM_ACTIONS)) {
    const numId = Number(id);
    if (numId > 0) ids.add(numId);
  }

  for (const action of Object.values(ITEM_ACTIONS)) {
    if (action.consume.type === 'replace') {
      ids.add(action.consume.withId);
    }
  }

  for (const encounterPresets of Object.values(EQUIPMENT_PRESETS)) {
    for (const preset of Object.values(encounterPresets)) {
      for (const itemId of Object.values(preset.equipment)) {
        if (typeof itemId === 'number' && itemId > 0) {
          ids.add(itemId);
        }
      }
      for (const slot of preset.inventory) {
        if (slot && slot.id > 0) {
          ids.add(slot.id);
        }
      }
    }
  }

  for (const slot of inventory) {
    if (slot && slot.id > 0) {
      ids.add(slot.id);
    }
  }

  // Infobox icons for timers (poison, a heart's cooldown), which first appear mid-fight and are
  // not necessarily any item the loadout carries.
  for (const id of Object.values(INFOBOX_ITEM_IDS)) {
    ids.add(id);
  }

  return [...ids];
}

/**
 * Every image the interface can paint. A sprite not reachable from here is never warmed and
 * never resampled ahead of time, so it pops in on the first panel that renders it — derive new
 * entries from whatever manifest the component reads rather than listing them by hand.
 * `AssetPreloader.test.ts` enforces the coverage.
 */
export function collectLocalAssetPaths(): string[] {
  const paths: string[] = [];

  paths.push(...collectPackAssetPaths());

  // The Mobile rail and hotkeys draw a tab's icon from its slot in the mobile manifest, not from
  // TAB_ICONS; only the slots the simulator implements are painted.
  for (const slot of Object.values(MOBILE_TAB_SLOT)) {
    paths.push(packSprite(OSM_TAB_SLOTS[slot].iconPath));
  }

  // The player's overhead, which first appears when a protection prayer (or Redemption) goes up.
  for (const icon of Object.values(PRAYER_OVERHEAD_ICON_PATHS)) {
    if (icon) paths.push(icon);
  }

  paths.push(STATUS_BAR_PRAYER_ICON);

  // Hitsplat sprites (used by both 2D and 3D viewports), derived from the map both render from
  // so a new hitsplat type cannot ship unpreloaded and pop in mid-fight.
  for (const sprite of new Set(Object.values(HITSPLAT_SPRITE_BY_TYPE))) {
    paths.push(sprite);
  }

  // Health bars, at every width an NPC's size can give one (the player's is size 1's). Both bar
  // styles are drawn at any width, so all four sprites go in for each.
  for (const w of new Set(Object.values(HEALTHBAR_WIDTH_BY_SIZE))) {
    paths.push(`/assets/ui/healthbar/default_back_${w}px.png`);
    paths.push(`/assets/ui/healthbar/default_front_${w}px.png`);
    paths.push(`/assets/ui/healthbar/dark_back_${w}px.png`);
    paths.push(`/assets/ui/healthbar/yellow_front_${w}px.png`);
  }

  // The stat icons the levels editor, loadout requirement chips, XP drops and stat-boost
  // infoboxes paint; all of them key off a player stat.
  for (const stat of PLAYER_STAT_KEYS) {
    paths.push(`/assets/ui/skill-${stat}.png`);
  }

  for (const icon of PRAYER_SLOT_ICON_NAMES) {
    paths.push(PRAYER.icon(icon));
    paths.push(PRAYER.iconDisabled(icon));
  }

  const combatStyleIcons = new Set<string>();
  for (const category of Object.values(WEAPON_CATEGORIES)) {
    for (const style of category.styles) {
      if (style.icon) combatStyleIcons.add(style.icon);
    }
  }
  for (const icon of combatStyleIcons) {
    paths.push(`/assets/ui/combat-styles/${icon}`);
  }

  for (const spellbook of Object.values(SPELLBOOKS)) {
    for (const spell of spellbook.grid) {
      // Preload all 4 icon variants via getSpellIconPath (respects pack manifest fallback):
      // small on (24px), small off (24px disabled), large on (40px), large off (40px disabled)
      paths.push(getSpellIconPath(spellbook.iconDir, spell.icon, 24, true));
      paths.push(getSpellIconPath(spellbook.iconDir, spell.icon, 24, false));
      paths.push(getSpellIconPath(spellbook.iconDir, spell.icon, 40, true));
      paths.push(getSpellIconPath(spellbook.iconDir, spell.icon, 40, false));
    }
  }

  // Autocast spells are drawn outside the book grids: small in the combat tab's autocast slot,
  // large in the autocast picker. The standard book has no grid, so these are its only icons.
  for (const book of Object.keys(SPELLBOOKS) as SpellbookType[]) {
    const { iconDir } = SPELLBOOKS[book];
    for (const spell of getAutocastableSpells(book)) {
      const icon = spellIconName(spell.name);
      paths.push(getSpellIconPath(iconDir, icon, 24, true));
      paths.push(getSpellIconPath(iconDir, icon, 40, true));
    }
  }

  paths.push(...Object.values(CLICK_SPRITE_URLS));
  paths.push(...collectStylesheetSpritePaths());

  return [...new Set(paths)];
}

/**
 * Sprites a stylesheet paints (`useSpriteCssUrls`), from each surface's own list. Each also gets
 * its stylesheet object URL made while the loading screen is up, so the first paint is final and
 * the stylesheet never fetches the file a second time. All are on screen at load or mid-fight
 * (the Mobile entry sheet and side panel, quick prayers, replay clicks).
 */
export function collectStylesheetSpritePaths(): string[] {
  return [
    ...entryFrameStylesheetSprites(),
    ...Object.values(SIDE_BACKGROUND_SPRITES),
    ...quickPrayerStylesheetSprites(),
    ...Object.values(REPLAY_CLICK_SHEET_URLS),
  ];
}

/**
 * Deferred rather than blocking. None of it is on screen at load — the picker is at least one
 * click away — but it is the largest local image group (~376 kB, hero renders dominate), so
 * folding it into the startup gate would push time-to-interactive out for every session to
 * benefit only the ones that open the picker. Derived from the presentation manifest so a new
 * encounter is covered by its own entry; locked by AssetPreloader.test.ts.
 */
export function collectEncounterArtPaths(): string[] {
  const paths = new Set<string>();

  for (const { presentation } of ENCOUNTER_PRESENTATION_MODULES) {
    if (presentation?.heroArt) paths.add(presentation.heroArt);
    if (presentation?.thumb) paths.add(presentation.thumb);
  }
  for (const icon of Object.values(VARIANT_REWARD_ICON)) {
    paths.add(icon);
  }

  return [...paths];
}

async function preloadImages(paths: string[]): Promise<{ failed: string[] }> {
  const failed: string[] = [];

  await Promise.all(
    paths.map(async (path) => {
      if ((await loadCachedImage(path)) === null) failed.push(path);
    }),
  );

  return { failed };
}

let uiPromise: Promise<void> | null = null;

/**
 * Deliberately not gated behind the OSRS cache download: none of this depends on
 * it, and these are the sprites a player sees the instant the app is usable.
 */
export function preloadUiAssets(): Promise<void> {
  if (uiPromise) return uiPromise;

  uiPromise = (async () => {
    const paths = collectLocalAssetPaths();
    const [{ failed }] = await Promise.all([
      preloadImages(paths),
      Promise.all(collectStylesheetSpritePaths().map((path) => loadStylesheetUrl(path))),
    ]);

    if (import.meta.env.DEV && failed.length > 0) {
      log.warn('Cache', `Failed to preload ${failed.length} interface asset(s)`, { failedLocalPaths: failed });
    }
  })();

  return uiPromise;
}

export function resetUiPreloadState(): void {
  uiPromise = null;
}

export async function preloadAllAssets(inventory: Inventory): Promise<void> {
  const [, spriteResult] = await Promise.all([preloadUiAssets(), preloadItemSprites(collectAllItemIds(inventory))]);

  if (import.meta.env.DEV && spriteResult.failed.length > 0) {
    log.warn('Cache', `Failed to preload ${spriteResult.failed.length} item sprite(s)`, {
      failedSpriteIds: spriteResult.failed,
    });
  }
}

/**
 * Item icons are excluded because preload covers a loadout rather than every mirrored icon; browsing the gear picker
 * legitimately fetches icons nobody preloaded.
 */
export const PRELOADABLE_ASSET_PATH = /^\/assets\/(?!items\/)|^\/fonts\//;

/**
 * Dev-only regression detector for this whole class of bug: once both tiers have settled, any
 * further same-origin asset request is something a surface renders on first view without a
 * preload behind it. Started from inside a DEV branch so the bundler folds it out of builds.
 */
function startLateAssetObserver(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    const late = list
      .getEntries()
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(window.location.origin))
      .map((name) => name.slice(window.location.origin.length))
      .filter((path) => PRELOADABLE_ASSET_PATH.test(path));

    if (late.length > 0) {
      log.warn('Cache', `${late.length} asset(s) loaded after preload finished`, late);
    }
  });

  try {
    observer.observe({ type: 'resource', buffered: false });
  } catch (error) {
    // Spec'd to throw when the entry type is unsupported; diagnostics must never break boot.
    log.debug('Cache', 'Late-asset observer unavailable', error);
  }
}

let deferredPromise: Promise<void> | null = null;

/**
 * Second, non-blocking preload tier. Call it *after* the startup gate has already opened —
 * awaiting it would put ~376 kB of encounter picker art in front of time-to-interactive for
 * every session, including the ones that never open the picker.
 */
export async function preloadDeferredAssets(): Promise<void> {
  if (deferredPromise) return deferredPromise;

  deferredPromise = (async () => {
    const { failed } = await preloadImages(collectEncounterArtPaths());

    if (import.meta.env.DEV) {
      if (failed.length > 0) {
        log.warn('Cache', `Failed to preload ${failed.length} deferred asset(s)`, { failedLocalPaths: failed });
      }
      startLateAssetObserver();
    }
  })();

  return deferredPromise;
}
