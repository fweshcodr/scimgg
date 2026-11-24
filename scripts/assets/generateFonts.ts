/**
 * Builds the interface's pixel fonts (public/fonts/RuneScape-*.ttf) from the game cache.
 *
 * Each font is an index-8 sprite group of 256 glyph frames, one per CP-1252 code, plus an index-13
 * file with the same id holding 256 advance widths and an ascent byte (the layout RuneLite's BSD
 * `cache/definitions/loaders/FontLoader.java` reads). A glyph frame's offset on the group canvas is
 * its position from the pen: `x` to the right, `y` down from `ascent` above the baseline.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CacheSystem } from '../../src/rs/cache/CacheSystem';
import { type BitmapFontMetrics, type BitmapGlyph, writeBitmapFont } from './bitmapFont';
import { decodeSpriteGroup } from './spriteRecipes';

const SPRITE_INDEX = 8;
const FONT_METRICS_INDEX = 13;

export interface PixelFontSpec {
  /** File stem under public/fonts/, also the PostScript name. */
  readonly file: string;
  /** CSS font-family name `src/index.css` declares. */
  readonly family: string;
  /** Sprite group and index-13 file id. */
  readonly cacheFont: number;
  /**
   * Pixels added to the cache's ascent. RuneScape Small has always carried the 11px face one pixel
   * higher in its em than RuneScape Plain 11 does, with an ascent one pixel greater to match.
   */
  readonly raise?: number;
  /** OS/2 typographic ascender, where it has differed from the hhea ascender. */
  readonly typoAscender?: number;
  readonly gaspFlags: number;
  readonly fsSelection: number;
}

/** The five faces the interface uses (CSS families in src/index.css, preloads in index.html). */
export const PIXEL_FONTS: readonly PixelFontSpec[] = [
  { file: 'RuneScape-Plain-11', family: 'RuneScape Plain 11', cacheFont: 494, gaspFlags: 0, fsSelection: 0xc0 },
  { file: 'RuneScape-Plain-12', family: 'RuneScape Plain 12', cacheFont: 495, gaspFlags: 0, fsSelection: 0xc0 },
  { file: 'RuneScape-Bold-12', family: 'RuneScape Bold 12', cacheFont: 496, gaspFlags: 0, fsSelection: 0xc0 },
  { file: 'RuneScape-Quill-8', family: 'RuneScape Quill 8', cacheFont: 497, gaspFlags: 0, fsSelection: 0xc0 },
  {
    file: 'RuneScape-Small',
    family: 'RuneScape Small',
    cacheFont: 494,
    raise: 1,
    typoAscender: 10,
    gaspFlags: 2,
    fsSelection: 0,
  },
];

/** CP-1252 bytes 0x80-0x9f; every other byte is the Latin-1 code point of the same value. */
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0, 0,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

export function cp1252ToUnicode(byte: number): number {
  return byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80]! : byte;
}

export function buildPixelFont(cache: CacheSystem, spec: PixelFontSpec): Uint8Array {
  const spriteData = cache.getIndex(SPRITE_INDEX).getFile(spec.cacheFont, 0)?.data;
  const metricsData = cache.getIndex(FONT_METRICS_INDEX).getFile(spec.cacheFont, 0)?.data;
  if (!spriteData || !metricsData) throw new Error(`cache font ${spec.cacheFont} is missing`);
  const frames = decodeSpriteGroup(spriteData);
  const metrics = new Uint8Array(metricsData.buffer, metricsData.byteOffset, metricsData.byteLength);
  if (frames.length !== 256 || metrics.length !== 257) {
    throw new Error(`cache font ${spec.cacheFont}: expected 256 glyphs and 257 metric bytes`);
  }
  const ascent = metrics[256]! + (spec.raise ?? 0);

  const glyphs: BitmapGlyph[] = [];
  for (let byte = 32; byte < 256; byte++) {
    const codePoint = cp1252ToUnicode(byte);
    const frame = frames[byte]!;
    const inked = frame.width > 0 && frame.height > 0;
    // Space and no-break space are blank but still advance; other blank frames are unused codes.
    if (codePoint === 0 || (!inked && byte !== 32 && byte !== 160)) continue;
    const ink: boolean[] = [];
    for (let i = 0; i < frame.width * frame.height; i++) ink.push(frame.rgba[i * 4 + 3]! > 0);
    glyphs.push({
      codePoint,
      // The cache gives no-break space no advance; it is a space.
      advance: byte === 160 && metrics[byte] === 0 ? metrics[32]! : metrics[byte]!,
      left: frame.x,
      top: ascent - frame.y,
      width: frame.width,
      height: frame.height,
      ink,
    });
  }
  const descender = Math.max(0, ...glyphs.filter((g) => g.height > 0).map((g) => g.height - g.top));
  const fontMetrics: BitmapFontMetrics = {
    family: spec.family,
    postScriptName: spec.file,
    copyright: 'Glyphs from the Old School RuneScape game cache, (c) Jagex Ltd. Generated locally by scripts/setup.ts.',
    unitsPerEm: 16,
    ascender: ascent,
    descender,
    typoAscender: spec.typoAscender,
    gaspFlags: spec.gaspFlags,
    fsSelection: spec.fsSelection,
  };
  return writeBitmapFont(fontMetrics, glyphs);
}

export function generateFonts(cache: CacheSystem, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  return PIXEL_FONTS.map((spec) => {
    const out = path.join(outDir, `${spec.file}.ttf`);
    writeFileSync(out, buildPixelFont(cache, spec));
    return out;
  });
}
