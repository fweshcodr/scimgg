// @vitest-environment happy-dom
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { healthbarFiles } from '../../../scripts/assets/runeliteHealthbars';
import { VARIANT_REWARD_ICON } from '../../components/encounterPickerMeta';
import { SIDE_BACKGROUND_SPRITES } from '../../components/GamePanel/GamePanel';
import { MOBILE_TAB_SLOT } from '../../components/GamePanel/MobileSideChrome';
import { PRAYER_SLOT_ICON_NAMES } from '../../components/GamePanel/prayerFilterUtils';
import { quickPrayerStylesheetSprites } from '../../components/GamePanel/QuickPrayerSetup';
import { STATUS_BAR_PRAYER_ICON } from '../../components/GamePanel/StatusBars';
import {
  calculateSpellbookLayout,
  getSpellIconPath,
  SPELLBOOKS,
} from '../../components/GamePanel/spellbookFilterUtils';
import { entryFrameStylesheetSprites } from '../../components/MobileEntry';
import { REPLAY_CLICK_SHEET_URLS } from '../../components/replayClickVisuals';
import { INFOBOX_ITEM_IDS } from '../../data/infoboxItemIds';
import { getAutocastableSpells, spellIconName } from '../../data/spellCatalog';
import { ENCOUNTER_PRESENTATION_MODULES } from '../../encounters/presentationModules';
import { CLICK_SPRITE_URLS } from '../../hooks/useClickAnimation';
import { OSM_TAB_SLOTS } from '../../layout/osmClientLayout';
import { HITSPLAT_SPRITE_BY_TYPE } from '../../render/components/hitsplatSprites';
import { HEALTHBAR_WIDTH_BY_SIZE } from '../../render/npc/NpcInstanceManager';
import { PRAYER_OVERHEAD_ICON_PATHS } from '../../render/overlay/UIOverlayRenderer';
import * as resourcePack from '../../resourcePack';
import { PRAYER, packSprite } from '../../resourcePack';
import { skipWithoutSetup } from '../../test/helpers/setupAssets';
import { PLAYER_STAT_KEYS } from '../../types/playerState';
import { PrayerType } from '../../types/simulation';
import type { SpellbookType } from '../../types/spellbook';
import { getCachedNaturalSize, getStylesheetUrl, isImageCached, resetImageCache } from '../../util/imageCache';
import {
  collectEncounterArtPaths,
  collectLocalAssetPaths,
  collectStylesheetSpritePaths,
  PRELOADABLE_ASSET_PATH,
  preloadAllAssets,
  preloadDeferredAssets,
  preloadUiAssets,
  resetUiPreloadState,
} from '../AssetPreloader';
import { getItemSpriteUrl } from '../ItemSpriteService';

const NATURAL_SIZE = 24;

function stubImageLoader(requested: string[]): () => void {
  const realImage = globalThis.Image;

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = NATURAL_SIZE;
    naturalHeight = NATURAL_SIZE;
    private loaded = '';
    get src() {
      return this.loaded;
    }
    set src(value: string) {
      this.loaded = value;
      requested.push(value);
      queueMicrotask(() => this.onload?.());
    }
    decode() {
      return Promise.resolve();
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;

  return () => {
    globalThis.Image = realImage;
  };
}

const PUBLIC_DIR = join(process.cwd(), 'public');

function allPaths(): string[] {
  return [...new Set([...collectLocalAssetPaths(), ...collectEncounterArtPaths()])];
}

describe('collectLocalAssetPaths', () => {
  // The viewports and the preloader both read HITSPLAT_SPRITE_BY_TYPE, so this asserts the
  // derivation rather than a copied list. A sprite missing from the preloader pops in mid-fight.
  it('covers every hitsplat sprite the viewports can render', () => {
    const paths = new Set(collectLocalAssetPaths());
    for (const sprite of Object.values(HITSPLAT_SPRITE_BY_TYPE)) {
      expect(paths.has(sprite), `${sprite} is not preloaded`).toBe(true);
    }
  });

  it('covers infobox glyphs that first appear mid-fight', () => {
    const paths = new Set(collectLocalAssetPaths());
    expect(paths.has('/assets/ui/packs/pack-vanilla/spells/arceuus_spell/mark_of_darkness.png')).toBe(true);
  });

  // A preloader walking only each slot's own icon misses the replacements, and the book pops the
  // first time an account crosses 62 Prayer.
  it('covers every prayer sprite the book can paint, replacements included', () => {
    const paths = new Set(collectLocalAssetPaths());

    for (const icon of PRAYER_SLOT_ICON_NAMES) {
      expect(paths.has(PRAYER.icon(icon)), `${icon} is not preloaded`).toBe(true);
      expect(paths.has(PRAYER.iconDisabled(icon)), `${icon} disabled is not preloaded`).toBe(true);
    }
    expect(PRAYER_SLOT_ICON_NAMES).toEqual(expect.arrayContaining(['deadeye', 'mystic_vigour', 'zeal']));
  });

  it('returns only same-origin absolute paths', () => {
    for (const path of collectLocalAssetPaths()) {
      // Rejects protocol-relative `//other-origin/...` too, which `startsWith('/')` alone allows.
      expect(new URL(path, window.location.origin).origin, `${path} is not same-origin`).toBe(window.location.origin);
    }
  });

  // `collectPackAssetPaths` walks a hand-listed set of sprite groups. Adding a group to
  // resourcePack.ts and forgetting to list it is silent — the sprites simply load late — so the
  // module's own exports are the source of truth here rather than that list.
  it('covers every pack sprite group resourcePack exports', () => {
    const paths = new Set(collectLocalAssetPaths());

    for (const [name, group] of Object.entries(resourcePack)) {
      if (typeof group !== 'object' || group === null) continue;
      for (const value of Object.values(group)) {
        if (typeof value !== 'string' || !value.startsWith('/assets/ui/packs/')) continue;
        expect(paths.has(value), `${name} sprite ${value} is not preloaded`).toBe(true);
      }
    }
  });

  // The spellbook renders at 24px classically and 40px in the resized filtering view; the autocast
  // picker uses the large variant too. Asserting through `getSpellIconPath` — the same resolver the
  // components call — means a new layout size cannot start rendering icons nobody preloaded.
  it('covers every spell icon variant the spellbook can render', () => {
    const paths = new Set(collectLocalAssetPaths());

    const sizes = new Set<number>();
    for (const spellbook of Object.keys(SPELLBOOKS) as SpellbookType[]) {
      const count = SPELLBOOKS[spellbook].grid.length;
      sizes.add(calculateSpellbookLayout(false, count, spellbook).slotSize);
      for (let visible = 1; visible <= count; visible++) {
        sizes.add(calculateSpellbookLayout(true, visible, spellbook).slotSize);
      }
    }

    const missing: string[] = [];
    for (const spellbook of Object.values(SPELLBOOKS)) {
      for (const spell of spellbook.grid) {
        for (const size of sizes) {
          for (const available of [true, false]) {
            const path = getSpellIconPath(spellbook.iconDir, spell.icon, size, available);
            if (!paths.has(path)) missing.push(path);
          }
        }
      }
    }

    expect(sizes.size, 'no layout sizes sampled').toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  // The combat tab's autocast slot (small) and the autocast picker (large) draw from the spell
  // catalog, not a book grid. The standard book has no grid at all, so nothing else covers it.
  it('covers every autocast spell icon, in the combat tab and the picker', () => {
    const paths = new Set(collectLocalAssetPaths());
    const missing: string[] = [];
    for (const book of Object.keys(SPELLBOOKS) as SpellbookType[]) {
      for (const spell of getAutocastableSpells(book)) {
        for (const size of [24, 40]) {
          const path = getSpellIconPath(SPELLBOOKS[book].iconDir, spellIconName(spell.name), size, true);
          if (!paths.has(path)) missing.push(path);
        }
      }
    }
    expect(getAutocastableSpells('standard').length, 'no standard autocast spells sampled').toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('covers the Mobile tab icons, read from the mobile slot manifest', () => {
    const paths = new Set(collectLocalAssetPaths());
    for (const [tab, slot] of Object.entries(MOBILE_TAB_SLOT)) {
      expect(paths.has(packSprite(OSM_TAB_SLOTS[slot].iconPath)), `${tab} mobile icon is not preloaded`).toBe(true);
    }
  });

  // A prayer flicked on mid-fight puts its overhead up at once; Redemption's was missed before.
  it('covers every overhead prayer icon', () => {
    const paths = new Set(collectLocalAssetPaths());
    const icons = Object.entries(PRAYER_OVERHEAD_ICON_PATHS);
    expect(icons.map(([prayer]) => prayer)).toContain(PrayerType.Redemption);
    for (const [prayer, icon] of icons) {
      expect(icon && paths.has(icon), `${prayer} overhead is not preloaded`).toBe(true);
    }
  });

  // Every NPC size draws its own bar width, in both bar styles; sizes 3 and 4 (Zuk's Jal-Xil and
  // Jal-Zek) were missed before and popped in on the first hit.
  it('covers both health bar styles at every width an NPC size can give', () => {
    const paths = new Set(collectLocalAssetPaths());
    for (const [size, w] of Object.entries(HEALTHBAR_WIDTH_BY_SIZE)) {
      for (const sprite of ['default_back', 'default_front', 'dark_back', 'yellow_front']) {
        const path = `/assets/ui/healthbar/${sprite}_${w}px.png`;
        expect(paths.has(path), `size ${size} ${path} is not preloaded`).toBe(true);
      }
    }
  });

  it('covers the stat icons, the status bars prayer icon and the click sprites', () => {
    const paths = new Set(collectLocalAssetPaths());
    for (const stat of PLAYER_STAT_KEYS) {
      expect(paths.has(`/assets/ui/skill-${stat}.png`), `${stat} icon is not preloaded`).toBe(true);
    }
    expect(paths.has(STATUS_BAR_PRAYER_ICON)).toBe(true);
    for (const sprite of Object.values(CLICK_SPRITE_URLS)) {
      expect(paths.has(sprite), `${sprite} is not preloaded`).toBe(true);
    }
  });

  it('lists each path once', () => {
    const paths = collectLocalAssetPaths();
    expect(paths.length).toBe(new Set(paths).size);
  });
});

const onDisk = (path: string) => join(PUBLIC_DIR, path);

/** Interface sprites `npm run setup` builds from the cache, and the healthbars it downloads; none is committed. */
const GENERATED = new Set([
  ...(
    JSON.parse(readFileSync(join(process.cwd(), 'scripts/assets/sprite-manifest.json'), 'utf8')) as {
      sprites: { path: string }[];
    }
  ).sprites.map((sprite) => sprite.path.slice('public'.length)),
  ...healthbarFiles().map((name) => `/assets/ui/healthbar/${name}`),
]);

/** Item icons `npm run setup` mirrors (scripts/fetch-item-icons.ts). */
const MIRRORED_ICONS = new Set(
  (
    JSON.parse(readFileSync(join(process.cwd(), 'scripts/item-icon-manifest.json'), 'utf8')) as { mirrored: number[] }
  ).mirrored.map((id) => `/assets/items/${id}.png`),
);

/** Whether a fresh clone has `path`, or `npm run setup` generates it. */
const shipped = (path: string) => GENERATED.has(path) || MIRRORED_ICONS.has(path) || existsSync(onDisk(path));

/**
 * A path that no longer exists preloads nothing and warns on every boot; the browser audit that
 * finds it needs a person driving it. Cheap to assert here instead.
 */
describe('preloaded paths on disk', () => {
  it('includes the Mobile art and the selected equipment sprites', () => {
    const paths = new Set(allPaths());
    for (const path of Object.values(resourcePack.MOBILE)) {
      expect(path).toContain('/pack-vanilla/mobile/');
      expect(paths.has(path)).toBe(true);
    }
    for (const path of Object.values(resourcePack.EQUIPMENT_SLOTS)) {
      expect(paths.has(path)).toBe(true);
    }
  });

  it('resolves to a committed or generated file for every path', () => {
    expect(allPaths().filter((p) => !shipped(p))).toEqual([]);
  });
});

/**
 * The blocking tier gates time-to-interactive, so it holds what the interface paints and nothing
 * else. `public/assets` is ~11 MB; these ceilings are roughly double what each tier costs today,
 * which leaves room for real growth while a directory sweep or a stray hero render fails loudly.
 */
describe('preload budget', () => {
  const kilobytes = (paths: string[]) => paths.reduce((sum, p) => sum + statSync(onDisk(p)).size, 0) / 1024;

  it.skipIf(skipWithoutSetup('sprites'))('keeps the blocking tier small', () => {
    const paths = [...new Set(collectLocalAssetPaths())];
    expect(paths.length, 'too many interface assets preload').toBeLessThan(900);
    expect(kilobytes(paths), 'the interface preload is too heavy').toBeLessThan(900);
  });

  it('keeps encounter hero art out of the blocking tier', () => {
    const blocking = new Set(collectLocalAssetPaths());
    for (const { presentation } of ENCOUNTER_PRESENTATION_MODULES) {
      if (presentation?.heroArt) {
        expect(blocking.has(presentation.heroArt), `${presentation.heroArt} should be deferred`).toBe(false);
      }
    }
  });
});

describe('collectEncounterArtPaths', () => {
  it('covers the hero art and thumbnail of every encounter that declares them', () => {
    const paths = new Set(collectEncounterArtPaths());

    for (const { kind, presentation } of ENCOUNTER_PRESENTATION_MODULES) {
      if (presentation?.heroArt) {
        expect(paths.has(presentation.heroArt), `${kind} heroArt is not preloaded`).toBe(true);
      }
      if (presentation?.thumb) {
        expect(paths.has(presentation.thumb), `${kind} thumb is not preloaded`).toBe(true);
      }
    }
  });

  it('covers every contract reward icon', () => {
    const paths = new Set(collectEncounterArtPaths());
    for (const [contract, icon] of Object.entries(VARIANT_REWARD_ICON)) {
      expect(paths.has(icon), `${contract} reward icon is not preloaded`).toBe(true);
    }
  });

  it('deduplicates icons shared by several contracts', () => {
    const paths = collectEncounterArtPaths();
    expect(paths.length).toBe(new Set(paths).size);
  });

  it('stays disjoint from the blocking tier so nothing is fetched twice', () => {
    const blocking = new Set(collectLocalAssetPaths());
    for (const path of collectEncounterArtPaths()) {
      expect(blocking.has(path), `${path} is in both preload tiers`).toBe(false);
    }
  });
});

/**
 * The collection tests above only prove the path lists are right. This one proves the deferred
 * tier actually fetches them, so deleting the load call (or its wiring) cannot stay green.
 *
 * `preloadDeferredAssets` memoizes at module scope, so this is the only place in the file that
 * calls it.
 */
describe('preloadDeferredAssets', () => {
  it('requests every deferred path exactly once, and only once across calls', async () => {
    const requested: string[] = [];
    const restore = stubImageLoader(requested);

    try {
      await preloadDeferredAssets();
      const afterFirstCall = [...requested];
      await preloadDeferredAssets();

      expect(afterFirstCall.length, 'nothing was requested — the assertion below would be vacuous').toBeGreaterThan(0);
      expect([...afterFirstCall].sort()).toEqual([...collectEncounterArtPaths()].sort());
      expect(requested).toEqual(afterFirstCall);
    } finally {
      restore();
    }
  });
});

/**
 * Preloading must warm the cache the render path reads, or a panel reloads each sprite and waits
 * a frame for its size.
 *
 * `isImageCached` / `getCachedNaturalSize` are exactly what `pixelSpriteStore` answers
 * `PixelSprite` from, so asserting on them asserts on the render path.
 */
describe('preloadUiAssets', () => {
  afterEach(() => {
    resetUiPreloadState();
    resetImageCache();
  });

  it('leaves every interface sprite decoded and measurable without another load', async () => {
    const restore = stubImageLoader([]);
    try {
      await preloadUiAssets();

      for (const path of collectLocalAssetPaths()) {
        expect(isImageCached(path), `${path} is not warm after preloading`).toBe(true);
        expect(getCachedNaturalSize(path)).toEqual({ width: NATURAL_SIZE, height: NATURAL_SIZE });
      }
    } finally {
      restore();
    }
  });
});

/**
 * A stylesheet cannot set `crossOrigin`, so it paints the object URL the image cache makes from a
 * sprite's bytes. Made during the preload, a stylesheet's first paint is final and never fetches
 * the file a second time.
 */
describe('stylesheet sprites', () => {
  // The setup file's `fetch` stub, which answers `/assets/*.png` offline. Restored by hand:
  // `vi.unstubAllGlobals()` would also remove that stub, leaving happy-dom's real fetch, which
  // never settles against the unserved test origin and hangs every later preload in this file.
  const realFetch = globalThis.fetch;
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;

  afterEach(() => {
    resetUiPreloadState();
    resetImageCache();
    globalThis.fetch = realFetch;
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  });

  it('collects every surface’s stylesheet sprites into the blocking tier', () => {
    const stylesheet = collectStylesheetSpritePaths();
    const blocking = new Set(collectLocalAssetPaths());
    const surfaces = [
      ...entryFrameStylesheetSprites(),
      ...Object.values(SIDE_BACKGROUND_SPRITES),
      ...quickPrayerStylesheetSprites(),
      ...Object.values(REPLAY_CLICK_SHEET_URLS),
    ];
    expect(new Set(stylesheet)).toEqual(new Set(surfaces));
    for (const path of stylesheet) expect(blocking.has(path), `${path} is not in the blocking tier`).toBe(true);
  });

  it('makes each one’s object URL, once, while the interface preloads', async () => {
    const restore = stubImageLoader([]);
    const fetched: string[] = [];
    globalThis.fetch = (async (url: string) => {
      fetched.push(url);
      return { ok: true, blob: async () => new Blob(['png']) };
    }) as unknown as typeof fetch;
    let made = 0;
    URL.createObjectURL = () => `blob:preloaded-${++made}`;
    URL.revokeObjectURL = () => {};
    try {
      await preloadUiAssets();

      const paths = new Set(collectStylesheetSpritePaths());
      for (const path of paths) {
        expect(getStylesheetUrl(path), `${path} has no stylesheet URL`).toMatch(/^blob:preloaded-/);
      }
      expect(made).toBe(paths.size);
      expect(new Set(fetched)).toEqual(paths);
    } finally {
      restore();
    }
  });
});

describe('preloadAllAssets', () => {
  afterEach(() => {
    resetUiPreloadState();
    resetImageCache();
  });

  // Timer infoboxes paint an item icon of their own (antipoison while poisoned), which no loadout
  // or item action need carry.
  it('warms the item icons the infobox row paints', async () => {
    const requested: string[] = [];
    const restore = stubImageLoader(requested);
    try {
      await preloadAllAssets([]);
      for (const [name, id] of Object.entries(INFOBOX_ITEM_IDS)) {
        expect(requested, `${name} infobox icon is not preloaded`).toContain(getItemSpriteUrl(id));
      }
    } finally {
      restore();
    }
  });
});

/**
 * Drives the DEV late-asset warning. Over-matching buries real findings in item-icon noise:
 * a preload covers a loadout, while browsing the gear picker legitimately fetches icons nobody
 * preloaded.
 */
describe('PRELOADABLE_ASSET_PATH', () => {
  it.each([
    '/assets/ui/compass.png',
    '/assets/ui/packs/pack-vanilla/panel/tab_stone_middle.png',
    '/fonts/x.ttf',
  ])('flags %s as something a preload tier should already have warmed', (path) => {
    expect(PRELOADABLE_ASSET_PATH.test(path)).toBe(true);
  });

  it.each([
    '/assets/items/11802.png',
    '/osrs-cache/disk.zip',
  ])('ignores %s, which is fetched on demand by design', (path) => {
    expect(PRELOADABLE_ASSET_PATH.test(path)).toBe(false);
  });
});
