/**
 * Writes a TrueType font whose glyphs are pixel bitmaps: one font unit is one pixel, and each
 * glyph is a set of axis-aligned rectangles, so at a 16px font size (a 16-unit em) every edge
 * falls on a pixel boundary and the face renders as the bitmap it was built from.
 *
 * Only the tables a browser and FreeType need are written (head, hhea, maxp, OS/2, hmtx, cmap,
 * loca, glyf, name, post, gasp). There are no hints: `gasp` tells the rasterizer not to grid-fit.
 */

export interface BitmapGlyph {
  readonly codePoint: number;
  readonly advance: number;
  /** Pixel columns from the pen position to the bitmap's left edge. */
  readonly left: number;
  /** Pixel rows from the baseline up to the bitmap's top edge. */
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Row-major, `width * height`; true where the glyph is inked. */
  readonly ink: readonly boolean[];
}

export interface BitmapFontMetrics {
  readonly family: string;
  /** PostScript name, also the file stem. */
  readonly postScriptName: string;
  readonly copyright: string;
  readonly unitsPerEm: number;
  readonly ascender: number;
  /** Positive: pixels below the baseline. */
  readonly descender: number;
  /** OS/2 typographic ascender, when it differs from `ascender`. */
  readonly typoAscender?: number;
  /** `gasp` behavior flags for every size (0: no grid-fitting or smoothing hints). */
  readonly gaspFlags: number;
  /** OS/2 fsSelection; bit 7 makes Windows use the typographic metrics. */
  readonly fsSelection: number;
}

/** 2026-11-18T00:00:00Z in seconds since 1904-01-01, the epoch TrueType dates count from. */
const FIXED_DATE = 2_082_844_800 + Date.UTC(2026, 10, 18) / 1000;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Inked runs of each row, merged downward while the run below spans the same columns. */
function glyphRects(glyph: BitmapGlyph): Rect[] {
  const done: Rect[] = [];
  let open: Rect[] = [];
  for (let row = 0; row < glyph.height; row++) {
    const runs: [number, number][] = [];
    for (let x = 0; x < glyph.width; x++) {
      if (!glyph.ink[row * glyph.width + x]) continue;
      const last = runs.at(-1);
      if (last && last[1] === x) last[1] = x + 1;
      else runs.push([x, x + 1]);
    }
    // Font units: y grows upward from the baseline; this row spans [top - row - 1, top - row].
    const yTop = glyph.top - row;
    const next: Rect[] = [];
    for (const [a, b] of runs) {
      const x0 = glyph.left + a;
      const x1 = glyph.left + b;
      const extend = open.find((rect) => rect.x0 === x0 && rect.x1 === x1 && rect.y0 === yTop);
      if (extend) {
        extend.y0 = yTop - 1;
        next.push(extend);
      } else {
        next.push({ x0, x1, y0: yTop - 1, y1: yTop });
      }
    }
    for (const rect of open) if (!next.includes(rect)) done.push(rect);
    open = next;
  }
  return [...done, ...open];
}

class Writer {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    return this.u16(Math.floor(v / 0x10000)).u16(v);
  }
  tag(s: string) {
    for (const ch of s) this.u8(ch.charCodeAt(0));
    return this;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.u8(0);
    return this;
  }
  pad4() {
    while (this.bytes.length % 4) this.u8(0);
    return this;
  }
  get length() {
    return this.bytes.length;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum =
      (sum + ((data[i]! << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0))) >>> 0;
  }
  return sum;
}

function utf16be(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    out.push(unit >> 8, unit & 0xff);
  }
  return out;
}

export function writeBitmapFont(metrics: BitmapFontMetrics, glyphs: readonly BitmapGlyph[]): Uint8Array {
  const sorted = [...glyphs].sort((a, b) => a.codePoint - b.codePoint);
  // Glyph 0 is .notdef: an empty box, never mapped.
  const notdefAdvance = sorted.find((g) => g.codePoint === 32)?.advance ?? 4;
  const outlines: Rect[][] = [[], ...sorted.map(glyphRects)];
  const advances = [notdefAdvance, ...sorted.map((g) => g.advance)];
  const numGlyphs = outlines.length;

  // glyf + loca
  const glyf = new Writer();
  const loca: number[] = [];
  const bounds = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const lsbs: number[] = [];
  let maxPoints = 0;
  let maxContours = 0;
  for (const rects of outlines) {
    loca.push(glyf.length);
    if (rects.length === 0) {
      lsbs.push(0);
      continue;
    }
    const xMin = Math.min(...rects.map((r) => r.x0));
    const yMin = Math.min(...rects.map((r) => r.y0));
    const xMax = Math.max(...rects.map((r) => r.x1));
    const yMax = Math.max(...rects.map((r) => r.y1));
    bounds.xMin = Math.min(bounds.xMin, xMin);
    bounds.yMin = Math.min(bounds.yMin, yMin);
    bounds.xMax = Math.max(bounds.xMax, xMax);
    bounds.yMax = Math.max(bounds.yMax, yMax);
    lsbs.push(xMin);
    maxPoints = Math.max(maxPoints, rects.length * 4);
    maxContours = Math.max(maxContours, rects.length);
    glyf.i16(rects.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    for (let i = 0; i < rects.length; i++) glyf.u16(i * 4 + 3);
    glyf.u16(0); // no instructions
    // Every point on-curve, coordinates as 16-bit deltas. Clockwise (y up): an outer contour.
    const points = rects.flatMap((r) => [
      [r.x0, r.y0],
      [r.x0, r.y1],
      [r.x1, r.y1],
      [r.x1, r.y0],
    ]);
    for (let i = 0; i < points.length; i++) glyf.u8(0x01);
    let px = 0;
    for (const [x] of points) {
      glyf.i16(x! - px);
      px = x!;
    }
    let py = 0;
    for (const [, y] of points) {
      glyf.i16(y! - py);
      py = y!;
    }
    glyf.pad4();
  }
  loca.push(glyf.length);

  const locaTable = new Writer();
  for (const offset of loca) locaTable.u32(offset);

  const hmtx = new Writer();
  for (const [i, advance] of advances.entries()) hmtx.u16(advance).i16(lsbs[i]!);

  const advanceMax = Math.max(...advances);
  const inked = outlines.map((rects, i) => ({ rects, i })).filter(({ rects }) => rects.length > 0);
  const minLsb = Math.min(0, ...inked.map(({ i }) => lsbs[i]!));
  const minRsb = Math.min(0, ...inked.map(({ rects, i }) => advances[i]! - Math.max(...rects.map((r) => r.x1))));
  const xMaxExtent = Math.max(0, ...inked.map(({ rects }) => Math.max(...rects.map((r) => r.x1))));

  const head = new Writer()
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0) // checkSumAdjustment, patched below
    .u32(0x5f0f3cf5)
    .u16(0x000b) // baseline at y=0, lsb at x=0, integer ppem
    .u16(metrics.unitsPerEm)
    // created, modified: a fixed date (the pinned cache's, 2026-11-18) keeps every run byte-identical
    .u32(0)
    .u32(FIXED_DATE)
    .u32(0)
    .u32(FIXED_DATE)
    .i16(bounds.xMin)
    .i16(bounds.yMin)
    .i16(bounds.xMax)
    .i16(bounds.yMax)
    .u16(0) // macStyle
    .u16(8) // lowestRecPPEM
    .i16(2)
    .i16(1) // long loca
    .i16(0);

  const hhea = new Writer()
    .u32(0x00010000)
    .i16(metrics.ascender)
    .i16(-metrics.descender)
    .i16(0)
    .u16(advanceMax)
    .i16(minLsb)
    .i16(minRsb)
    .i16(xMaxExtent)
    .i16(1)
    .i16(0)
    .i16(0)
    .zeros(8)
    .i16(0)
    .u16(numGlyphs);

  const maxp = new Writer()
    .u32(0x00010000)
    .u16(numGlyphs)
    .u16(maxPoints)
    .u16(maxContours)
    .u16(0)
    .u16(0)
    .u16(2)
    .zeros(16);

  const codePoints = sorted.map((g) => g.codePoint);
  const inkedAdvances = advances.slice(1).filter((a) => a > 0);
  const os2 = new Writer()
    .u16(4)
    .i16(Math.round(inkedAdvances.reduce((s, a) => s + a, 0) / Math.max(1, inkedAdvances.length)))
    .u16(400)
    .u16(5)
    .u16(0) // fsType: installable
    .zeros(22) // sub/superscript sizes and offsets, strikeout, family class
    .zeros(10) // panose
    .u32(codePoints.some((c) => c >= 0x80 && c <= 0xff) ? 0b11 : 0b1) // Basic Latin, Latin-1 Supplement
    .zeros(12)
    .tag('NONE')
    .u16(metrics.fsSelection)
    .u16(Math.min(...codePoints))
    .u16(Math.min(0xffff, Math.max(...codePoints)))
    .i16(metrics.typoAscender ?? metrics.ascender)
    .i16(-metrics.descender)
    .i16(0)
    .u16(metrics.ascender)
    .u16(metrics.descender)
    .u32(1) // code page 1252
    .u32(0)
    .zeros(4) // x-height, cap height
    .u16(0)
    .u16(32)
    .u16(1);

  // cmap: one format-4 subtable for Unicode BMP (0,3) and Windows Unicode (3,1). Glyph ids follow
  // code-point order, so a run of consecutive code points is one segment with a constant delta.
  const segments: { start: number; end: number; delta: number }[] = [];
  sorted.forEach((g, i) => {
    const gid = i + 1;
    const last = segments.at(-1);
    if (last && last.end + 1 === g.codePoint && (last.delta + g.codePoint) % 0x10000 === gid) last.end = g.codePoint;
    else segments.push({ start: g.codePoint, end: g.codePoint, delta: (gid - g.codePoint + 0x10000) % 0x10000 });
  });
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segX2 = segments.length * 2;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segments.length));
  const format4 = new Writer()
    .u16(4)
    .u16(16 + segments.length * 8)
    .u16(0)
    .u16(segX2)
    .u16(searchRange)
    .u16(Math.log2(searchRange / 2))
    .u16(segX2 - searchRange);
  for (const s of segments) format4.u16(s.end);
  format4.u16(0);
  for (const s of segments) format4.u16(s.start);
  for (const s of segments) format4.u16(s.delta);
  for (const _ of segments) format4.u16(0);
  const cmap = new Writer().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20);
  for (const b of format4.done()) cmap.u8(b);

  const names: [number, string][] = [
    [0, metrics.copyright],
    [1, metrics.family],
    [2, 'Regular'],
    [3, metrics.postScriptName],
    [4, metrics.family],
    [5, 'Version 1.0'],
    [6, metrics.postScriptName],
  ];
  const encoded = names.map(([id, text]) => [id, utf16be(text)] as const);
  const name = new Writer()
    .u16(0)
    .u16(encoded.length)
    .u16(6 + encoded.length * 12);
  let stringOffset = 0;
  for (const [id, bytes] of encoded) {
    name.u16(3).u16(1).u16(0x409).u16(id).u16(bytes.length).u16(stringOffset);
    stringOffset += bytes.length;
  }
  for (const [, bytes] of encoded) for (const b of bytes) name.u8(b);

  const post = new Writer().u32(0x00030000).u32(0).i16(-1).i16(1).u32(0).zeros(16);

  const gasp = new Writer().u16(1).u16(1).u16(0xffff).u16(metrics.gaspFlags);

  const tables = new Map<string, Uint8Array>([
    ['OS/2', os2.done()],
    ['cmap', cmap.done()],
    ['gasp', gasp.done()],
    ['glyf', glyf.done()],
    ['head', head.done()],
    ['hhea', hhea.done()],
    ['hmtx', hmtx.done()],
    ['loca', locaTable.done()],
    ['maxp', maxp.done()],
    ['name', name.done()],
    ['post', post.done()],
  ]);
  const tags = [...tables.keys()].sort();
  const numTables = tags.length;
  const tableSearchRange = 16 * 2 ** Math.floor(Math.log2(numTables));
  const font = new Writer()
    .u32(0x00010000)
    .u16(numTables)
    .u16(tableSearchRange)
    .u16(Math.log2(tableSearchRange / 16))
    .u16(numTables * 16 - tableSearchRange);
  let offset = 12 + numTables * 16;
  const placed: { tag: string; offset: number; data: Uint8Array }[] = [];
  for (const tag of tags) {
    const data = tables.get(tag)!;
    font.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    placed.push({ tag, offset, data });
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const { data } of placed) {
    for (const b of data) font.u8(b);
    font.pad4();
  }
  const bytes = font.done();
  const headOffset = placed.find((t) => t.tag === 'head')!.offset;
  const adjustment = (0xb1b0afba - checksum(bytes) + 0x100000000) % 0x100000000;
  new DataView(bytes.buffer).setUint32(headOffset + 8, adjustment);
  return bytes;
}
