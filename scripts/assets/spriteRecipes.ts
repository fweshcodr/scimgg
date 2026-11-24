/**
 * Rebuilds the interface sprites in `sprite-manifest.json` from cache index 8.
 *
 * A sprite group decodes as our `SpriteLoader` reads it, plus the per-frame alpha plane (flags
 * bit 1) that RuneLite's BSD `cache/definitions/loaders/SpriteLoader.java` documents: a palette
 * index other than 0 is opaque, and index 0 takes its alpha from the plane.
 *
 * A recipe layer draws a frame's opaque bounding box (not the frame's own canvas) with its top-left
 * at `at`, so a recipe does not depend on how much transparent margin a frame carries.
 */
import type { CacheIndex } from '../../src/rs/cache/CacheIndex';

export interface SpriteFrame {
  /** Where the frame sits on the group's canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** `width * height * 4`; a fully transparent pixel is all zeroes. */
  readonly rgba: Uint8Array;
}

export interface RecipeLayer {
  readonly sprite: number;
  readonly frame: number;
  readonly at: readonly [number, number];
}

export interface RecipePage {
  /** Milliseconds this page shows for, in an animated WebP. */
  readonly delay: number;
  readonly layers: readonly RecipeLayer[];
}

export interface SpriteRecipe {
  /** Output path, relative to the repository root. */
  readonly path: string;
  readonly size: readonly [number, number];
  /** A still image. Exactly one of `layers` and `pages` is present. */
  readonly layers?: readonly RecipeLayer[];
  /** An animated WebP, one page per entry, each `size` large. */
  readonly pages?: readonly RecipePage[];
  /** `rrggbb` -> `rrggbb`, applied to opaque pixels after the layers are drawn. */
  readonly colourMap?: Readonly<Record<string, string>>;
}

export interface SpriteManifest {
  readonly cache: number;
  readonly sprites: readonly SpriteRecipe[];
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export function decodeSpriteGroup(data: Int8Array): SpriteFrame[] {
  const u = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (offset: number) => (u[offset]! << 8) | u[offset + 1]!;
  const count = u16(u.length - 2);
  let offset = u.length - 7 - count * 8;
  const paletteSize = u[offset + 4]! + 1;
  offset += 5;
  const field = (index: number) => Array.from({ length: count }, (_, i) => u16(offset + (index * count + i) * 2));
  const xs = field(0);
  const ys = field(1);
  const widths = field(2);
  const heights = field(3);

  let p = u.length - 7 - count * 8 - (paletteSize - 1) * 3;
  const palette = new Int32Array(paletteSize);
  for (let i = 1; i < paletteSize; i++, p += 3) {
    // 0 is reserved for transparent, so a black palette entry is stored as 1.
    palette[i] = (u[p]! << 16) | (u[p + 1]! << 8) | u[p + 2]! || 1;
  }

  const frames: SpriteFrame[] = [];
  p = 0;
  for (let i = 0; i < count; i++) {
    const width = widths[i]!;
    const height = heights[i]!;
    const n = width * height;
    const flags = u[p++]!;
    const readPlane = (): Uint8Array => {
      const plane = new Uint8Array(n);
      if (flags & 1) {
        for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) plane[x + y * width] = u[p++]!;
      } else {
        for (let j = 0; j < n; j++) plane[j] = u[p++]!;
      }
      return plane;
    };
    const indices = readPlane();
    const alpha = flags & 2 ? readPlane() : null;
    const rgba = new Uint8Array(n * 4);
    for (let j = 0; j < n; j++) {
      const index = indices[j]!;
      const a = index !== 0 ? 255 : (alpha?.[j] ?? 0);
      if (a === 0) continue;
      const colour = palette[index]!;
      rgba[j * 4] = (colour >> 16) & 0xff;
      rgba[j * 4 + 1] = (colour >> 8) & 0xff;
      rgba[j * 4 + 2] = colour & 0xff;
      rgba[j * 4 + 3] = a;
    }
    frames.push({ x: xs[i]!, y: ys[i]!, width, height, rgba });
  }
  return frames;
}

/** Decodes sprite groups on demand and keeps them for the rest of the run. */
export class SpriteSource {
  private readonly groups = new Map<number, SpriteFrame[]>();

  constructor(private readonly spriteIndex: CacheIndex) {}

  frame(sprite: number, frame: number): SpriteFrame {
    let group = this.groups.get(sprite);
    if (!group) {
      const data = this.spriteIndex.getFile(sprite, 0)?.data;
      if (!data || data.length === 0) throw new Error(`sprite group ${sprite} is missing from the cache`);
      group = decodeSpriteGroup(data);
      this.groups.set(sprite, group);
    }
    const decoded = group[frame];
    if (!decoded) throw new Error(`sprite group ${sprite} has no frame ${frame}`);
    return decoded;
  }
}

/** The frame cropped to its opaque bounding box, or null when it has no opaque pixel. */
function opaqueBox(frame: SpriteFrame): RgbaImage | null {
  let x0 = frame.width;
  let y0 = frame.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.rgba[(y * frame.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((y0 + y) * frame.width + x0) * 4;
    rgba.set(frame.rgba.subarray(start, start + width * 4), y * width * 4);
  }
  return { width, height, rgba };
}

/** Layers are drawn in order and clipped to the target; a later opaque pixel replaces an earlier one. */
function drawLayers(source: SpriteSource, layers: readonly RecipeLayer[], target: RgbaImage): void {
  for (const layer of layers) {
    const box = opaqueBox(source.frame(layer.sprite, layer.frame));
    if (!box) continue;
    for (let y = 0; y < box.height; y++) {
      const ty = layer.at[1] + y;
      if (ty < 0 || ty >= target.height) continue;
      for (let x = 0; x < box.width; x++) {
        const tx = layer.at[0] + x;
        if (tx < 0 || tx >= target.width) continue;
        const from = (y * box.width + x) * 4;
        if (box.rgba[from + 3] === 0) continue;
        target.rgba.set(box.rgba.subarray(from, from + 4), (ty * target.width + tx) * 4);
      }
    }
  }
}

function applyColourMap(image: RgbaImage, colourMap: Readonly<Record<string, string>>): void {
  const map = new Map(Object.entries(colourMap).map(([from, to]) => [Number.parseInt(from, 16), to]));
  const { rgba } = image;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const to = map.get((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!);
    if (to === undefined) continue;
    rgba[i] = Number.parseInt(to.slice(0, 2), 16);
    rgba[i + 1] = Number.parseInt(to.slice(2, 4), 16);
    rgba[i + 2] = Number.parseInt(to.slice(4, 6), 16);
  }
}

/** The recipe's pixels; an animated recipe's pages are stacked top to bottom. */
export function renderRecipe(source: SpriteSource, recipe: SpriteRecipe): RgbaImage {
  const [width, pageHeight] = recipe.size;
  const pages = recipe.pages ?? [{ delay: 0, layers: recipe.layers ?? [] }];
  const image: RgbaImage = {
    width,
    height: pageHeight * pages.length,
    rgba: new Uint8Array(width * pageHeight * pages.length * 4),
  };
  pages.forEach((page, index) => {
    const pageImage: RgbaImage = { width, height: pageHeight, rgba: new Uint8Array(width * pageHeight * 4) };
    drawLayers(source, page.layers, pageImage);
    image.rgba.set(pageImage.rgba, index * pageImage.rgba.length);
  });
  if (recipe.colourMap) applyColourMap(image, recipe.colourMap);
  return image;
}
