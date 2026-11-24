import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ItemIconManifest } from '../../../scripts/fetch-item-icons';
import { CUSTOMIZABLE_GEAR_SLOTS, getGearCatalog } from '../customEquipmentPresets';
import { INFOBOX_ITEM_IDS } from '../infoboxItemIds';
import { getInventoryCatalog } from '../inventoryItemCatalog';
import { ITEM_ACTIONS } from '../itemEffects';
import { collectItemIconIds } from '../itemIconIds';
import { EQUIPMENT_PRESETS } from '../playerPresets';

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = join(REPO_ROOT, 'scripts', 'item-icon-manifest.json');
const MIRROR_DIR = join(REPO_ROOT, 'public', 'assets', 'items');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as ItemIconManifest;

describe('collectItemIconIds', () => {
  const ids = new Set(collectItemIconIds());

  it('is sorted, deduplicated, and positive', () => {
    const list = collectItemIconIds();
    expect(list.length).toBe(new Set(list).size);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
    expect(list.filter((id) => id <= 0)).toEqual([]);
  });

  it('covers every gear the slot pickers can offer', () => {
    for (const slot of CUSTOMIZABLE_GEAR_SLOTS) {
      for (const item of getGearCatalog(slot)) {
        expect(ids.has(item.id), `${slot} catalog item ${item.id} has no mirrored icon`).toBe(true);
      }
    }
  });

  it('covers every item the inventory picker can offer', () => {
    for (const item of getInventoryCatalog()) {
      expect(ids.has(item.id), `inventory catalog item ${item.id} has no mirrored icon`).toBe(true);
    }
  });

  // A dose-down or a decant swaps the slot's id mid-fight, so the replacement's icon has to
  // be mirrored even when no picker or preset ever names it.
  it('covers consumables and the ids they turn into when used', () => {
    for (const [id, action] of Object.entries(ITEM_ACTIONS)) {
      expect(ids.has(Number(id)), `ITEM_ACTIONS id ${id} has no mirrored icon`).toBe(true);
      if (action.consume.type === 'replace') {
        expect(ids.has(action.consume.withId), `${id} consumes into ${action.consume.withId}, unmirrored`).toBe(true);
      }
    }
  });

  // Infobox sprites are the one class no picker or preset can reach, so the catalog unions
  // miss them entirely. Asserting through the shared constant is what stops a new timer
  // shipping an unmirrored id.
  it('covers every item icon the infobox row paints', () => {
    for (const [name, id] of Object.entries(INFOBOX_ITEM_IDS)) {
      expect(ids.has(id), `infobox ${name} (${id}) has no mirrored icon`).toBe(true);
    }
  });

  it('covers every equipment and inventory id the built-in presets place', () => {
    for (const [encounter, presets] of Object.entries(EQUIPMENT_PRESETS)) {
      for (const [name, preset] of Object.entries(presets)) {
        for (const itemId of Object.values(preset.equipment)) {
          if (typeof itemId === 'number' && itemId > 0) {
            expect(ids.has(itemId), `${encounter}/${name} equips ${itemId}, unmirrored`).toBe(true);
          }
        }
        for (const slot of preset.inventory) {
          if (slot && slot.id > 0) {
            expect(ids.has(slot.id), `${encounter}/${name} carries ${slot.id}, unmirrored`).toBe(true);
          }
        }
      }
    }
  });
});

/**
 * `getItemSpriteUrl` has no upstream fallback, so an id the UI can reach but the mirror
 * does not hold renders a broken image in the picker. That is only safe while this holds,
 * and it is checked against the committed manifest because `npm test` can run on a fresh
 * clone, before setup — the PNGs themselves are not there yet.
 *
 * Failing here means running `npx tsx scripts/fetch-item-icons.ts`.
 */
describe('item icon mirror coverage', () => {
  const mirrored = new Set(manifest.mirrored);
  const REMEDY = 'run `npx tsx scripts/fetch-item-icons.ts` and commit scripts/item-icon-manifest.json';

  it('mirrors every id the UI can reach', () => {
    const unmirrored = collectItemIconIds().filter((id) => !mirrored.has(id));
    expect(unmirrored, `${unmirrored.length} id(s) reachable but not mirrored \u2014 ${REMEDY}`).toEqual([]);
  });

  it('holds nothing the UI can no longer reach', () => {
    const reachable = new Set(collectItemIconIds());
    const stale = manifest.mirrored.filter((id) => !reachable.has(id));
    expect(stale, `${stale.length} id(s) mirrored but unreachable \u2014 ${REMEDY}`).toEqual([]);
  });

  // Only meaningful once setup has populated the mirror; on a fresh clone this suite runs before
  // the fetch script, and the PNGs are gitignored. Both directions matter: a file the manifest
  // does not claim still gets copied into dist/ by Vite.
  it.runIf(existsSync(MIRROR_DIR))('holds exactly the files the manifest claims', () => {
    const onDisk = new Set(readdirSync(MIRROR_DIR).filter((name) => name.endsWith('.png')));
    const claimed = new Set(manifest.mirrored.map((id) => `${id}.png`));

    expect(
      [...claimed].filter((name) => !onDisk.has(name)),
      'mirrored but absent from disk',
    ).toEqual([]);
    expect(
      [...onDisk].filter((name) => !claimed.has(name)),
      'on disk but unclaimed',
    ).toEqual([]);
  });
});
