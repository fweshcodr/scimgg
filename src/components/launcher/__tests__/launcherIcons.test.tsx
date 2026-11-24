// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  LAUNCHER_GLYPH_CELL,
  LAUNCHER_GLYPHS,
  LAUNCHER_ICON_BUTTON,
  type LauncherGlyph,
  LauncherIcon,
} from '../launcherIcons';

const NAMES = Object.keys(LAUNCHER_GLYPHS) as LauncherGlyph[];
/** The sidebar headers' marks beside Search; the rest are the launcher row's. */
const HEADER_MARKS: readonly LauncherGlyph[] = ['search', 'keyboard', 'close'];
/** Where the button centers the cell: (28 - 16) / 2. */
const CELL_AT = (LAUNCHER_ICON_BUTTON - LAUNCHER_GLYPH_CELL) / 2;

/** The ink box in the 28px button, shadow excluded, as its four margins. */
function margins(name: LauncherGlyph) {
  const { origin, rows } = LAUNCHER_GLYPHS[name];
  const inked = rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [[x, y]] : [])));
  const xs = inked.map(([x]) => x);
  const ys = inked.map(([, y]) => y);
  const left = CELL_AT + origin[0] + Math.min(...xs);
  const top = CELL_AT + origin[1] + Math.min(...ys);
  const right = LAUNCHER_ICON_BUTTON - (CELL_AT + origin[0] + Math.max(...xs) + 1);
  const bottom = LAUNCHER_ICON_BUTTON - (CELL_AT + origin[1] + Math.max(...ys) + 1);
  return { left, right, top, bottom };
}

describe('the launcher icon set', () => {
  it('draws the launchers and the sidebar header actions as rectangular ink-and-blank grids', () => {
    expect([...NAMES].sort()).toEqual([
      'actions',
      'close',
      'keyboard',
      'layout',
      'menu',
      'modifiers',
      'practice',
      'replay',
      'search',
    ]);
    for (const name of NAMES) {
      const { rows } = LAUNCHER_GLYPHS[name];
      for (const row of rows) {
        expect(row, name).toMatch(/^[.#]+$/);
        expect(row.length, name).toBe(rows[0].length);
      }
    }
  });

  it('keeps the launcher glyphs and their shadows inside the 16px cell, and the header marks within a pixel of it', () => {
    for (const name of NAMES) {
      const { origin, rows } = LAUNCHER_GLYPHS[name];
      // The header buttons' padding takes a pixel of bleed; the launcher row's cell is exact.
      const bleed = HEADER_MARKS.includes(name) ? 1 : 0;
      expect(Math.min(...origin), name).toBeGreaterThanOrEqual(-bleed);
      expect(origin[0] + rows[0].length + 1, name).toBeLessThanOrEqual(LAUNCHER_GLYPH_CELL + bleed);
      expect(origin[1] + rows.length + 1, name).toBeLessThanOrEqual(LAUNCHER_GLYPH_CELL + bleed);
    }
  });

  it('centers each ink box in the 28px button: equal margins, or one pixel apart where the ink is odd', () => {
    // The menu mark at the set's (2,2) on its 12px grid: its bars inset a pixel, 10x8 of ink.
    expect(margins('menu')).toEqual({ left: 9, right: 9, top: 10, bottom: 10 });
    expect(margins('practice')).toEqual({ left: 8, right: 8, top: 8, bottom: 8 });
    expect(margins('actions')).toEqual({ left: 9, right: 9, top: 8, bottom: 8 });
    expect(margins('layout')).toEqual({ left: 8, right: 8, top: 8, bottom: 8 });
    // 11 tall: one more below.
    expect(margins('modifiers')).toEqual({ left: 8, right: 8, top: 8, bottom: 9 });
    // 13 wide: no middle pixel, so one more on the right (centered to the half pixel).
    expect(margins('replay')).toEqual({ left: 7, right: 8, top: 8, bottom: 8 });
    // 14x13: one more below.
    expect(margins('search')).toEqual({ left: 7, right: 7, top: 7, bottom: 8 });
    // The wide keyboard bleeds a pixel either side of the cell, odd pixel right and below.
    expect(margins('keyboard')).toEqual({ left: 5, right: 6, top: 8, bottom: 9 });
    // 13x13, the lens's height: one more right and below.
    expect(margins('close')).toEqual({ left: 7, right: 8, top: 7, bottom: 8 });
    for (const name of NAMES) {
      const m = margins(name);
      expect(Math.abs(m.left - m.right), name).toBeLessThanOrEqual(1);
      expect(Math.abs(m.top - m.bottom), name).toBeLessThanOrEqual(1);
    }
  });

  it('paints each glyph in the current color over its 1px black shadow in a fixed 16px cell', () => {
    for (const name of NAMES) {
      const { container, unmount } = render(<LauncherIcon glyph={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe(String(LAUNCHER_GLYPH_CELL));
      expect(svg?.getAttribute('height')).toBe(String(LAUNCHER_GLYPH_CELL));
      const [shadow, ink] = Array.from(container.querySelectorAll('svg > g'));
      expect(shadow.getAttribute('fill')).toBe('#000');
      expect(ink.getAttribute('fill')).toBe('currentColor');
      const inkCells = [...LAUNCHER_GLYPHS[name].rows.join('')].filter((cell) => cell === '#').length;
      const width = (g: Element) =>
        Array.from(g.querySelectorAll('rect')).reduce((sum, rect) => sum + Number(rect.getAttribute('width')), 0);
      expect(width(ink)).toBe(inkCells);
      expect(width(shadow)).toBe(inkCells);
      unmount();
    }
  });

  it('keeps the header marks mirror-symmetric, as the shapes they draw are', () => {
    for (const name of ['keyboard', 'close'] as const) {
      for (const row of LAUNCHER_GLYPHS[name].rows) expect(row, name).toBe([...row].reverse().join(''));
    }
  });

  it('draws the header marks to one height, so none stands over the others in the row', () => {
    for (const name of HEADER_MARKS) {
      expect(LAUNCHER_GLYPHS[name].rows.length, name).toBeGreaterThanOrEqual(11);
      expect(LAUNCHER_GLYPHS[name].rows.length, name).toBeLessThanOrEqual(13);
    }
  });
});
