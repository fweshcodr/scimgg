import { loadCachedImage } from '../util/imageCache';

/**
 * Icons are mirrored from RuneLite into `public/assets/items/`. They stay same-origin with no upstream fallback:
 * these sprites are resampled through a canvas, so serving them from a third party made
 * rendering depend on that party's CORS header. `itemIconIds.test.ts` covers every id the
 * catalogs, presets and infoboxes can reach;
 an id from outside them — a hand-edited or
 * older stored loadout, which `normalizeEncounterLoadout` accepts as any finite number —
 * paints nothing rather than falling back off-origin.
 */
function buildUrl(itemId: number): string {
  return `/assets/items/${itemId}.png`;
}

export function getItemSpriteUrl(itemId: number): string {
  return buildUrl(itemId);
}

export async function preloadItemSprites(itemIds: number[]): Promise<{ failed: number[] }> {
  const failed: number[] = [];

  await Promise.all(
    [...new Set(itemIds.filter((id) => id > 0))].map(async (id) => {
      if ((await loadCachedImage(buildUrl(id))) === null) failed.push(id);
    }),
  );

  return { failed };
}
