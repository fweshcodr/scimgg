/**
 * Writes every interface sprite `sprite-manifest.json` lists, from cache index 8, to the path the
 * app already serves it from. PNGs and lossless WebPs carry no metadata (sharp writes none unless
 * asked), as the public-asset hardening expects.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { CacheSystem } from '../../src/rs/cache/CacheSystem';
import { type RgbaImage, renderRecipe, type SpriteManifest, type SpriteRecipe, SpriteSource } from './spriteRecipes';

const SPRITE_INDEX = 8;
export const SPRITE_MANIFEST_PATH = path.join(import.meta.dirname, 'sprite-manifest.json');

export function readSpriteManifest(): SpriteManifest {
  return JSON.parse(readFileSync(SPRITE_MANIFEST_PATH, 'utf-8')) as SpriteManifest;
}

export async function encodeSprite(recipe: SpriteRecipe, image: RgbaImage): Promise<Buffer> {
  const pageHeight = recipe.size[1];
  const input = sharp(Buffer.from(image.rgba), {
    raw: { width: image.width, height: image.height, channels: 4, ...(recipe.pages ? { pageHeight } : {}) },
  });
  if (recipe.path.endsWith('.webp')) {
    return input
      .webp({
        lossless: true,
        effort: 6,
        ...(recipe.pages ? { loop: 0, delay: recipe.pages.map((page) => page.delay) } : {}),
      })
      .toBuffer();
  }
  if (recipe.path.endsWith('.png')) return input.png({ compressionLevel: 9 }).toBuffer();
  throw new Error(`${recipe.path}: only .png and .webp sprites are supported`);
}

export async function generateSprites(cache: CacheSystem, repoRoot: string): Promise<number> {
  const manifest = readSpriteManifest();
  const source = new SpriteSource(cache.getIndex(SPRITE_INDEX));
  for (const recipe of manifest.sprites) {
    const out = path.join(repoRoot, recipe.path);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, await encodeSprite(recipe, renderRecipe(source, recipe)));
  }
  return manifest.sprites.length;
}
