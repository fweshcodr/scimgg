import type React from 'react';

/**
 * The launcher icons ("Glyph 12"): three bars (Menu), a bullseye (Practice), a bolt (Actions),
 * horizontal sliders (Modifiers) and a rewind (Replay), plus the sidebar headers' magnifier (Search), keyboard and close X,
 * drawn from bitmaps (`#` is ink). The row shows them together in its icon form;
 * in its labeled form every launcher is its label.
 *
 * Monochrome, like the labels they stand in for: crisp rects in the button's current color over
 * the labels' 1px black pixel shadow, so rest, hover, open and disabled
 * recolor them exactly as they do the text.
 *
 * Every glyph sits in one fixed 16x16 cell, which the 28px icon button centers at (6,6), a whole
 * pixel in from its edges whatever its border. Each glyph's `origin` places its ink in the cell so
 * the ink box is centered in the button: equal margins, or one pixel apart where an odd ink size
 * leaves no middle (the rewind is 13 wide). The shadow is drawn past the ink and is not part of
 * that measure.
 *
 * Not `PixelSprite`: that reconstructs raster sprites from the cache; these are vector rects on a
 * whole-pixel grid, which land on device pixels wherever the chrome's zoom times the display's
 * pixel ratio is whole, as the pixel fonts beside them do. At a fractional product they are snapped
 * (`crispEdges`): sharp, not pixel-exact.
 */
export interface LauncherGlyphData {
  /**
   * The ink's top-left in the 16x16 cell. The launcher row's glyphs stay inside it; a sidebar
   * header mark may start at -1 and bleed one pixel past either side into its button's padding.
   */
  readonly origin: readonly [x: number, y: number];
  /** Rectangular rows, trimmed to the ink. */
  readonly rows: readonly string[];
}

/** The fixed cell every glyph is drawn in, and where the 28px button puts it. */
export const LAUNCHER_GLYPH_CELL = 16;
export const LAUNCHER_ICON_BUTTON = 28;

// Ink-box margins in the 28px button, shadow excluded (left/right, top/bottom):
// bars 9/9, 10/10; bullseye 8/8, 8/8; bolt 9/9, 8/8; sliders 8/8, 8/9; rewind 7/8, 8/8.
// The 16x16 cell starts at (6,6); odd ink sizes leave one extra pixel right or below.
export const LAUNCHER_GLYPHS = {
  // 10x8: three 2px bars 1px apart, trimmed to their ink and inset a pixel each side of the
  // set's 12px grid, as the three-bar mark is lighter than a closed shape.
  menu: {
    origin: [3, 4],
    rows: [
      '##########',
      '##########',
      '..........',
      '##########',
      '##########',
      '..........',
      '##########',
      '##########',
    ],
  },
  // 12x12: a 2px octagonal ring with 3-step corners, a 2x2 dot, 3px clear between.
  practice: {
    origin: [2, 2],
    rows: [
      '...######...',
      '..########..',
      '.###....###.',
      '###......###',
      '##........##',
      '##...##...##',
      '##...##...##',
      '##........##',
      '###......###',
      '.###....###.',
      '..########..',
      '...######...',
    ],
  },
  // 10x12.
  actions: {
    origin: [3, 2],
    rows: [
      '.....#####',
      '....#####.',
      '...#####..',
      '..#####...',
      '.#####....',
      '#####.....',
      '##########',
      '....#####.',
      '...####...',
      '..###.....',
      '.##.......',
      '#.........',
    ],
  },
  // 12x11: three horizontal sliders, the usual "tune" mark: 1px tracks the full width, each through
  // a 3x3 knob, with a clear row between sliders. Thin tracks keep it open (2px tracks with 4px
  // knobs packed the box solid); the knobs zig-zag (right, left, middle) so it never reads as Menu's
  // bars. Lighter than its neighbors by design. Odd tall: one pixel more below.
  modifiers: {
    origin: [2, 2],
    rows: [
      '.......###..',
      '############',
      '.......###..',
      '............',
      '..###.......',
      '############',
      '..###.......',
      '............',
      '......###...',
      '############',
      '......###...',
    ],
  },
  // 12x12: a tile plan with three occupied cells, distinct from the sliders and bullseye.
  layout: {
    origin: [2, 2],
    rows: [
      '############',
      '#....#.....#',
      '#.##.#.##..#',
      '#.##.#.##..#',
      '#....#.....#',
      '############',
      '#....#.....#',
      '#....#.....#',
      '#.##.#.....#',
      '#.##.#.....#',
      '#....#.....#',
      '############',
    ],
  },
  // 13x12: odd wide, so one pixel more on the right.
  replay: {
    origin: [1, 2],
    rows: [
      '.....#......#',
      '....##.....##',
      '...###....###',
      '..####...####',
      '.#####..#####',
      '######.######',
      '######.######',
      '.#####..#####',
      '..####...####',
      '...###....###',
      '....##.....##',
      '.....#......#',
    ],
  },
  // The Settings and Plugins headers' actions (Search, keyboard, close) are one set: line icons
  // drawn in 2px strokes, all 11-13px tall, so no mark looks bigger or brighter than the rest at 1x.

  // 14x13: a 10px lens (2px ring, 2-step corners). The handle is as
  // heavy as the ring, three pixels a row at 45 degrees from the lens's bottom-right corner, which
  // it meets only at a diagonal, so it reads as a handle and not as part of a "Q". Odd tall: one
  // pixel more below.
  search: {
    origin: [1, 1],
    rows: [
      '..######......',
      '.########.....',
      '###....###....',
      '##......##....',
      '##......##....',
      '##......##....',
      '##......##....',
      '###....###....',
      '.########.....',
      '..######.###..',
      '..........###.',
      '...........###',
      '............##',
    ],
  },
  // 17x11: a keyboard outline, a 2px rim round two rows of single-pixel keys and a spacebar. Wide,
  // as a keyboard is, so it bleeds a pixel past the cell into the button's padding (see
  // LauncherGlyphData.origin).
  keyboard: {
    origin: [-1, 2],
    rows: [
      '.###############.',
      '#################',
      '##.............##',
      '##.#.#.#.#.#.#.##',
      '##.............##',
      '##.#.#.#.#.#.#.##',
      '##.............##',
      '##...#######...##',
      '##.............##',
      '#################',
      '.###############.',
    ],
  },
  // 13x13: drawn for Scim.GG, two 3px diagonals on an odd grid, so they cross on a single middle
  // pixel and the box clips each end to a 2px point. As heavy as the lens's ring and handle, and
  // the lens's height. Odd both ways: one pixel more right and below.
  close: {
    origin: [1, 1],
    rows: [
      '##.........##',
      '###.......###',
      '.###.....###.',
      '..###...###..',
      '...###.###...',
      '....#####....',
      '.....###.....',
      '....#####....',
      '...###.###...',
      '..###...###..',
      '.###.....###.',
      '###.......###',
      '##.........##',
    ],
  },
} as const satisfies Record<string, LauncherGlyphData>;

export type LauncherGlyph = keyof typeof LAUNCHER_GLYPHS;

/** The glyph as horizontal runs of ink in the cell, one rect each. */
function runs({ origin: [ox, oy], rows }: LauncherGlyphData): { x: number; y: number; width: number }[] {
  const out: { x: number; y: number; width: number }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === '#') x++;
      out.push({ x: ox + start, y: oy + y, width: x - start });
    }
  });
  return out;
}

const RUNS = Object.fromEntries(Object.entries(LAUNCHER_GLYPHS).map(([name, data]) => [name, runs(data)])) as Record<
  LauncherGlyph,
  ReturnType<typeof runs>
>;

/** One launcher glyph in its 16x16 cell, in `currentColor` over its 1px shadow. */
export const LauncherIcon: React.FC<{ readonly glyph: LauncherGlyph }> = ({ glyph }) => (
  <svg
    className="launcher-icon"
    width={LAUNCHER_GLYPH_CELL}
    height={LAUNCHER_GLYPH_CELL}
    viewBox={`0 0 ${LAUNCHER_GLYPH_CELL} ${LAUNCHER_GLYPH_CELL}`}
    overflow="visible"
    aria-hidden="true"
    focusable="false"
    data-glyph={glyph}
  >
    <g fill="#000">
      {RUNS[glyph].map(({ x, y, width }) => (
        <rect key={`s${x}-${y}`} x={x + 1} y={y + 1} width={width} height={1} />
      ))}
    </g>
    <g fill="currentColor">
      {RUNS[glyph].map(({ x, y, width }) => (
        <rect key={`g${x}-${y}`} x={x} y={y} width={width} height={1} />
      ))}
    </g>
  </svg>
);
