/**
 * Group 728's framed stone, the art the Mobile layout's left column is drawn with: the
 * pop-out stone (the tool window's dock, MobileToolWindow) and the system stones above it,
 * with the glyphs those system stones carry.
 */
import type React from 'react';
import { OSM_POPOUT_INSET } from '../layout/osmClientLayout';
import type { OsmFrame } from '../layout/osmFrame';
import type { Size } from '../layout/osrsClientLayout';
import { MOBILE } from '../resourcePack';
import type { LayerSprite } from './PixelSpriteLayer';

/** Where the stone sits inside its frame, in the frame's CSS pixels. */
export interface StoneBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The stone inside a framed stone of `size`. Both axes fill the snapped frame less its inset:
 * rounding the stone's 40 rows on their own can disagree with the frame's snapped 46 and leave
 * an extra row of frame under the stone. `stoneTop` is where the stone starts, in CSS pixels.
 */
export function framedStoneBox(frame: OsmFrame, size: Size, stoneTop: number): StoneBox {
  const inset = Math.max(1, Math.round(OSM_POPOUT_INSET * frame.scale));
  return { x: inset, y: stoneTop, w: size.width - 2 * inset, h: size.height - stoneTop - inset };
}

/**
 * Group 728's framed stone: the rail's 9-slice around a 52x40 stone (728:10, 24). The pop-out
 * and the system stones are all drawn so; a system stone's glyph is `StoneGlyph`, over it.
 */
export function framedStoneSprites(frame: OsmFrame, size: Size, stoneTop: number, stoneSrc: string): LayerSprite[] {
  const inset = Math.max(1, Math.round(OSM_POPOUT_INSET * frame.scale));
  const stone = framedStoneBox(frame, size, stoneTop);
  return [
    ...frameSprites(size.width, size.height, inset),
    { src: stoneSrc, ...stone, width: stone.w, height: stone.h },
  ];
}

/**
 * The system stones' glyphs, drawn for Scim.GG on a pixel grid: one character per art pixel.
 * `#` is the outline, `L` the lit edge (facing up or left), `B` the body, `D` the shaded edge
 * (facing down or right), `.` clear. A pale stone-gray with a dark outline, so they sit with
 * the column's own painted icons.
 */
const GLYPH_TONES: Readonly<Record<string, string>> = {
  '#': '#000001',
  L: '#e8e0cf',
  B: '#c9c0ae',
  D: '#968c7a',
};

const GLYPH_MAPS = {
  /** Four corner brackets, opening out. */
  fullscreenEnter: [
    '##########.....##########',
    '#LLLLLLLD#.....#LLLLLLLD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#LBBBDDDD#.....#DDDDBBBD#',
    '#LBBD#####.....#####LBBD#',
    '#LBBD#.............#LBBD#',
    '#LBBD#.............#LBBD#',
    '#DDDD#.............#DDDD#',
    '######.............######',
    '.........................',
    '.........................',
    '.........................',
    '.........................',
    '.........................',
    '######.............######',
    '#LLLD#.............#LLLD#',
    '#LBBD#.............#LBBD#',
    '#LBBD#.............#LBBD#',
    '#LBBD#####.....#####LBBD#',
    '#LBBBLLLD#.....#LLLLBBBD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#DDDDDDDD#.....#DDDDDDDD#',
    '##########.....##########',
  ],
  /** The same brackets turned in, their corners toward the middle. */
  fullscreenExit: [
    '....######.....######....',
    '....#LLLD#.....#LLLD#....',
    '....#LBBD#.....#LBBD#....',
    '....#LBBD#.....#LBBD#....',
    '#####LBBD#.....#LBBD#####',
    '#LLLLBBBD#.....#LBBBLLLD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#DDDDDDDD#.....#DDDDDDDD#',
    '##########.....##########',
    '.........................',
    '.........................',
    '.........................',
    '.........................',
    '.........................',
    '##########.....##########',
    '#LLLLLLLD#.....#LLLLLLLD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#LBBBBBBD#.....#LBBBBBBD#',
    '#DDDDBBBD#.....#LBBBDDDD#',
    '#####LBBD#.....#LBBD#####',
    '....#LBBD#.....#LBBD#....',
    '....#LBBD#.....#LBBD#....',
    '....#DDDD#.....#DDDD#....',
    '....######.....######....',
  ],
  /** A ring open at the top right, its top end an arrowhead running clockwise into the gap. */
  restart: [
    '...........#####.........',
    '...........#LLD##........',
    '...........#LBBD##.......',
    '.......#####LBBBD###.....',
    '.....###LLLLBBBBBLD##....',
    '....##LLBBBBBBBBBBBD#....',
    '...##LBBBBBBBBBBBBD##....',
    '...#LBBBBBDDBBBBBD##.....',
    '..##LBBBDD##LBBDD##......',
    '..#LBBBD####LBD###.......',
    '.##LBBD##..#LD##.........',
    '.#LBBBD#...#D##..........',
    '.#LBBBD#...###...........',
    '.#LBBBD#.........#######.',
    '.#LBBBD#.........#LLLLD#.',
    '.#DBBBD#.........#LBBBD#.',
    '.##LBBD##.......##LBBD##.',
    '..#LBBBD##.....##LBBBD#..',
    '..#DBBBBD###.###LBBBBD#..',
    '..##DBBBBLD###LLBBBBD##..',
    '...##DBBBBBLLLBBBBBD##...',
    '....##DBBBBBBBBBBBD##....',
    '.....##DDBBBBBBBDD##.....',
    '......###DDDDDDD###......',
    '........#########........',
  ],
} as const;

export type StoneGlyphName = keyof typeof GLYPH_MAPS;

interface GlyphArt {
  readonly width: number;
  readonly height: number;
  /** One path of whole-pixel row runs per tone, painted in GLYPH_TONES order. */
  readonly layers: readonly { readonly fill: string; readonly d: string }[];
}

function glyphArt(rows: readonly string[]): GlyphArt {
  const layers = Object.entries(GLYPH_TONES).map(([key, fill]) => {
    let d = '';
    rows.forEach((row, y) => {
      for (const run of row.matchAll(/(.)\1*/g)) {
        if (run[1] === key) d += `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`;
      }
    });
    return { fill, d };
  });
  return { width: rows[0].length, height: rows.length, layers: layers.filter((layer) => layer.d) };
}

const GLYPHS: Readonly<Record<StoneGlyphName, GlyphArt>> = {
  fullscreenEnter: glyphArt(GLYPH_MAPS.fullscreenEnter),
  fullscreenExit: glyphArt(GLYPH_MAPS.fullscreenExit),
  restart: glyphArt(GLYPH_MAPS.restart),
};

/**
 * A system stone's glyph, `scale` CSS pixels to the art pixel. With `box`, it is centered on
 * that stone (positioned inside the stone's frame); without, it sits inline, as on the entry
 * sheet's stones. Vector rather than a sprite, with crisp edges, so every art pixel stays one
 * solid block at the frame's scale.
 */
export function StoneGlyph({
  name,
  scale = 1,
  box,
  dimmed = false,
  className,
}: {
  readonly name: StoneGlyphName;
  readonly scale?: number;
  readonly box?: StoneBox;
  /** Faded with a disabled stone, so the glyph never reads as live on a dead stone. */
  readonly dimmed?: boolean;
  readonly className?: string;
}) {
  const art = GLYPHS[name];
  const width = art.width * scale;
  const height = art.height * scale;
  const style: React.CSSProperties = box
    ? {
        position: 'absolute',
        left: box.x + Math.round((box.w - width) / 2),
        top: box.y + Math.round((box.h - height) / 2),
      }
    : {};
  if (dimmed) style.opacity = 0.4;
  return (
    <svg
      className={className}
      data-stone-glyph={name}
      width={width}
      height={height}
      viewBox={`0 0 ${art.width} ${art.height}`}
      shapeRendering="crispEdges"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {art.layers.map((layer) => (
        <path key={layer.fill} fill={layer.fill} d={layer.d} />
      ))}
    </svg>
  );
}

/** The rail's `_9SliceDark01_3x3` frame, as group 728 draws it around its buttons, solid throughout. */
export function frameSprites(width: number, height: number, corner: number): LayerSprite[] {
  const piece = (src: string, x: number, y: number, w: number, h: number): LayerSprite => ({
    src,
    x,
    y,
    w,
    h,
    width: w,
    height: h,
  });
  const c = corner;
  return [
    piece(MOBILE.railMiddle, c, c, width - 2 * c, height - 2 * c),
    piece(MOBILE.railTop, c, 0, width - 2 * c, c),
    piece(MOBILE.railBottom, c, height - c, width - 2 * c, c),
    piece(MOBILE.railLeft, 0, c, c, height - 2 * c),
    piece(MOBILE.railRight, width - c, c, c, height - 2 * c),
    piece(MOBILE.railTopLeft, 0, 0, c, c),
    piece(MOBILE.railTopRight, width - c, 0, c, c),
    piece(MOBILE.railBottomLeft, 0, height - c, c, c),
    piece(MOBILE.railBottomRight, width - c, height - c, c, c),
  ];
}
