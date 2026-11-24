import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { CacheSystem } from '../../src/rs/cache/CacheSystem';
import { Bzip2 } from '../../src/rs/compression/Bzip2';
import { readCacheZipFiles } from '../../src/test/helpers/cacheZipFiles';
import { setupOutputPath, skipWithoutSetup } from '../../src/test/helpers/setupAssets';
import { buildPixelFont, PIXEL_FONTS } from '../assets/generateFonts';
import { readSpriteManifest } from '../assets/generateSprites';
import { renderRecipe, SpriteSource } from '../assets/spriteRecipes';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * Pinned sprite pixels, as SHA-256 of their RGBA with transparent pixels zeroed.
 * One recipe of each kind: a single sprite, a color-mapped one, a multi-layer sheet, an animated
 * WebP's stacked pages, and an interface sprite.
 */
const COMMITTED_PIXELS: Record<string, string> = {
  'public/assets/ui/hitsplat-damage.png': 'c1b8d136beaa167748f5cce3e47ddeb0e00772de78b8702c4168f5ed2b6790cc',
  'public/assets/ui/Augury.png': 'ff677fd33ec4bbe0b6741cb33776f0569fa41d81e25fbeef7e3fe6665ae27afd',
  'public/red_click_sheet.webp': 'b0acbd818d9202a5714505b9b2e3fe43548a9e840a93a4b6464fb8349cef8ffb',
  'public/red_click.webp': 'd08534453fc6d4b42cab21dc5e2d15b3d60559e5374560aabcacca81c86a09a8',
  'public/assets/ui/packs/pack-vanilla/tabs/inventory.png':
    '21d8c1955bcef799a6df6962849e8dd31d4475ecf98541484e607e0e5caa5303',
};

/**
 * The fonts setup writes. Their glyph bitmaps, advances and vertical metrics match the reference
 * TTFs, except RuneScape-Small: its reference TTF is a third-party build, and the cache's face differs
 * from it in nine glyph bitmaps and the ellipsis advance, and lacks a few of its extra glyphs (e.g.
 * `Œ`, `™`, `—`). The bytes are pinned so a writer change that moves
 * any of that shows up here.
 */
const FONT_BYTES: Record<string, string> = {
  'RuneScape-Plain-11': 'eab39031312218955512272c1e151a62e0bf4dc8c2c09e9af2c727cfbb26240a',
  'RuneScape-Plain-12': 'fa07757cc05e2dd9c705dbbabb36b0d4631dea2f5c211699170ca02fe0310316',
  'RuneScape-Bold-12': '598d68991e5e081faa41f22f335e367c281a416586ad656583b732d24e0e7363',
  'RuneScape-Quill-8': '24521e14ca201e6e6803b668880fa2971db047c065dcee8085614ebe9a2a8596',
  'RuneScape-Small': '03a41287291897d20a27221949c20d913b293453e3d6115ee2cd7af66ce81b8a',
};

describe.skipIf(skipWithoutSetup('fullCache'))('asset generators, on the pinned cache', () => {
  let files: Map<string, ArrayBuffer>;

  beforeAll(async () => {
    await Bzip2.initWasm();
    files = await readCacheZipFiles(setupOutputPath('fullCache'));
  }, 120_000);

  it('draws sprites pixel-for-pixel as pinned', () => {
    const source = new SpriteSource(CacheSystem.fromMap('dat2', files, [8]).getIndex(8));
    const recipes = new Map(readSpriteManifest().sprites.map((recipe) => [recipe.path, recipe]));

    for (const [path, expected] of Object.entries(COMMITTED_PIXELS)) {
      const recipe = recipes.get(path);
      expect(recipe, path).toBeDefined();
      expect(sha256(renderRecipe(source, recipe!).rgba), path).toBe(expected);
    }
  });

  it('writes the same fonts byte for byte', () => {
    const cache = CacheSystem.fromMap('dat2', files, [8, 13]);

    expect(PIXEL_FONTS.map((font) => font.file).sort()).toEqual(Object.keys(FONT_BYTES).sort());
    for (const font of PIXEL_FONTS) {
      expect(sha256(buildPixelFont(cache, font)), font.file).toBe(FONT_BYTES[font.file]);
    }
  });
});
