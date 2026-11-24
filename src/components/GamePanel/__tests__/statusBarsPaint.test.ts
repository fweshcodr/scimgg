import { describe, expect, it } from 'vitest';
import type { ClientLayoutMode, Rect } from '../../../layout/osrsClientLayout';
import { statusBarsPlacement } from '../StatusBars';
import {
  BAR_ICON_SIZE,
  BAR_ICON_TOP_INSET,
  barFillHeight,
  barFillRect,
  paintBar,
  paintBarValue,
  prayerBarColor,
  STATUS_BAR_COLORS,
  STATUS_BAR_VALUE,
} from '../statusBarsPaint';

describe('bar fill — BarRenderer.getBarHeight', () => {
  const bar = { x: 11, y: 42, width: 20, height: 252 } as const;

  it('rounds the proportion, saturates at the maximum, and is empty below it', () => {
    expect(barFillHeight(99, 99, 252)).toBe(252);
    expect(barFillHeight(99, 120, 252)).toBe(252);
    // 129.81 is the only case here that separates the two: truncating gives 129.
    expect(barFillHeight(99, 51, 252)).toBe(130);
    expect(barFillHeight(99, 50, 252)).toBe(127);
    expect(barFillHeight(99, 0, 252)).toBe(0);
    expect(barFillHeight(0, 5, 252)).toBe(0);
    expect(barFillHeight(99, -3, 252)).toBe(0);
  });

  it('insets the fill by the one-pixel border and pins it to the bottom as it drains', () => {
    expect(barFillRect(bar, 99, 99)).toEqual({ x: 12, y: 43, width: 18, height: 250 });
    expect(barFillRect(bar, 99, 50)).toEqual({ x: 12, y: 168, width: 18, height: 125 });
    for (const current of [99, 75, 50, 25, 4]) {
      const fill = barFillRect(bar, 99, current);
      expect(fill, `no fill at ${current}`).not.toBeNull();
      if (fill) expect(fill.y + fill.height).toBe(bar.y + bar.height - 1);
    }
  });

  it('draws nothing when the fill cannot clear its own border', () => {
    expect(barFillRect(bar, 99, 0)).toBeNull();
    // round(2/1000 * 252) = 1, which upstream turns into a -1 tall rect.
    expect(barFillRect(bar, 1000, 2)).toBeNull();
  });
});

const rgba255 = (red: number, green: number, blue: number, alpha255: number): string =>
  `rgba(${red}, ${green}, ${blue}, ${alpha255 / 255})`;

describe('STATUS_BAR_COLORS — RuneLite parity', () => {
  it("matches the plugin's own Color constants", () => {
    expect(STATUS_BAR_COLORS).toEqual({
      background: rgba255(0, 0, 0, 150),
      hitpoints: rgba255(225, 35, 0, 125),
      prayer: rgba255(50, 200, 200, 175),
      prayerActive: rgba255(57, 255, 186, 225),
    });
  });

  it('brightens the prayer bar while a prayer is burning', () => {
    expect(prayerBarColor(false)).toBe(STATUS_BAR_COLORS.prayer);
    expect(prayerBarColor(true)).toBe(STATUS_BAR_COLORS.prayerActive);
  });
});

interface FillOp {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

interface PaintProbe {
  fillStyle: string;
  fillRect: (x: number, y: number, width: number, height: number) => void;
}

interface BarValues {
  readonly mode?: ClientLayoutMode;
  readonly currentHitpoints?: number;
  readonly currentPrayer?: number;
  readonly anyPrayerActive?: boolean;
}

/**
 * Drives `paintBar` over the same two bars, in the same order and with the same
 * colors, that `StatusBars`' effect hands it. At `deviceScale: 1`, so every
 * expected rect below is plain logical pixels.
 */
function paintOps(values: BarValues = {}): FillOp[] {
  const { mode = 'modern', currentHitpoints = 99, currentPrayer = 99, anyPrayerActive = false } = values;
  const ops: FillOp[] = [];
  const probe: PaintProbe = {
    fillStyle: '',
    fillRect: (x, y, width, height) => void ops.push({ x, y, width, height, color: probe.fillStyle }),
  };
  const { left, right, bounds } = statusBarsPlacement(mode);
  const canvas = { bounds, deviceScale: 1, max: 99 };
  paintBar(probe, { ...canvas, bar: left, current: currentHitpoints, color: STATUS_BAR_COLORS.hitpoints });
  paintBar(probe, { ...canvas, bar: right, current: currentPrayer, color: prayerBarColor(anyPrayerActive) });
  return ops;
}

const opsColored = (ops: readonly FillOp[], color: string): FillOp[] => ops.filter((op) => op.color === color);

describe('paintBar paints the bars RuneLite draws', () => {
  it('lays a translucent black box down for each bar, then re-strokes its border', () => {
    const background = opsColored(paintOps(), STATUS_BAR_COLORS.background);
    // Five ops per bar, not one: upstream re-strokes the same translucent black over
    // the ring it just filled, which is the only thing making the border read darker.
    expect(background).toHaveLength(10);
    expect(background.slice(0, 5).map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 20, height: 272 },
      { x: 0, y: 0, width: 20, height: 1 },
      { x: 0, y: 271, width: 20, height: 1 },
      { x: 0, y: 1, width: 1, height: 270 },
      { x: 19, y: 1, width: 1, height: 270 },
    ]);
    const modern = statusBarsPlacement('modern');
    expect(background[5]?.x).toBe(modern.right.x - modern.bounds.x);
  });

  it('fills both bars to the top when hitpoints and prayer are full', () => {
    const ops = paintOps();
    expect(opsColored(ops, STATUS_BAR_COLORS.hitpoints)).toEqual([
      { x: 1, y: 1, width: 18, height: 270, color: STATUS_BAR_COLORS.hitpoints },
    ]);
    expect(opsColored(ops, STATUS_BAR_COLORS.prayer)).toEqual([
      { x: 27, y: 1, width: 18, height: 270, color: STATUS_BAR_COLORS.prayer },
    ]);
  });

  it('drains each bar downward, independently of the other', () => {
    const ops = paintOps({ currentHitpoints: 25, currentPrayer: 99 });
    // round(25/99 * 272) = 69 filled, less the two border rows, anchored to the bottom.
    expect(opsColored(ops, STATUS_BAR_COLORS.hitpoints)).toEqual([
      { x: 1, y: 204, width: 18, height: 67, color: STATUS_BAR_COLORS.hitpoints },
    ]);
    expect(opsColored(ops, STATUS_BAR_COLORS.prayer)).toHaveLength(1);
  });

  it('paints no fill at all for a bar that is empty', () => {
    const ops = paintOps({ currentHitpoints: 0 });
    expect(opsColored(ops, STATUS_BAR_COLORS.hitpoints)).toEqual([]);
    expect(opsColored(ops, STATUS_BAR_COLORS.prayer)).toHaveLength(1);
  });

  it('switches the prayer bar to its active color while a prayer burns', () => {
    const ops = paintOps({ anyPrayerActive: true });
    expect(opsColored(ops, STATUS_BAR_COLORS.prayer)).toEqual([]);
    expect(opsColored(ops, STATUS_BAR_COLORS.prayerActive)).toEqual([
      { x: 27, y: 1, width: 18, height: 270, color: STATUS_BAR_COLORS.prayerActive },
    ]);
  });

  it('paints the side-column layouts too, at their own 252-tall geometry', () => {
    for (const mode of ['fixed', 'classic'] as const) {
      const { left, right, bounds } = statusBarsPlacement(mode);
      const ops = paintOps({ mode });
      const background = opsColored(ops, STATUS_BAR_COLORS.background);
      expect(background[0]).toEqual({
        x: left.x - bounds.x,
        y: left.y - bounds.y,
        width: 20,
        height: 252,
        color: STATUS_BAR_COLORS.background,
      });
      expect(background[5]?.x).toBe(right.x - bounds.x);
      expect(opsColored(ops, STATUS_BAR_COLORS.hitpoints)).toHaveLength(1);
    }
  });
});

/** `skill_icons_small` are 16x16, and `BarRenderer.renderIconsAndCounters` insets by 4. */
const ICON_SIZE = 16;
const ICON_TOP_INSET = 4;

interface TextOp {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly font: string;
  readonly align: string;
  readonly baseline: string;
}

interface TextProbe {
  fillStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillText: (text: string, x: number, y: number) => void;
}

interface ValuePaint {
  readonly mode?: ClientLayoutMode;
  readonly current?: number;
  readonly deviceScale?: number;
}

/** Drives `paintBarValue` over the same two bars `StatusBars`' effect hands it. */
function valueOps(values: ValuePaint = {}): { left: TextOp[]; right: TextOp[] } {
  const { mode = 'modern', current = 70, deviceScale = 1 } = values;
  const { left, right, bounds } = statusBarsPlacement(mode);
  const collect = (bar: Rect): TextOp[] => {
    const ops: TextOp[] = [];
    const probe: TextProbe = {
      fillStyle: '',
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      fillText: (text, x, y) => {
        const { fillStyle: color, font, textAlign: align, textBaseline: baseline } = probe;
        ops.push({ text, x, y, color, font, align, baseline });
      },
    };
    paintBarValue(probe, { bar, bounds, deviceScale, current });
    return ops;
  };
  return { left: collect(left), right: collect(right) };
}

describe('paintBarValue — the counter under each icon', () => {
  it('keeps the icon geometry the counter hangs off in one place', () => {
    expect(BAR_ICON_SIZE).toBe(ICON_SIZE);
    expect(BAR_ICON_TOP_INSET).toBe(ICON_TOP_INSET);
  });

  it('writes the current value alone, never current over maximum', () => {
    const { left, right } = valueOps({ current: 70 });

    expect(left.map((op) => op.text)).toEqual(['70', '70']);
    expect(right.map((op) => op.text)).toEqual(['70', '70']);
    for (const op of [...left, ...right]) {
      expect(op.text).not.toContain('/');
    }
  });

  it('centers the counter on its own bar, directly under the icon', () => {
    const { left, right } = valueOps({ current: 70 });
    const modern = statusBarsPlacement('modern');
    const centreOf = (bar: Rect) => bar.x + bar.width / 2 - modern.bounds.x;

    const leftValue = left.at(-1);
    const rightValue = right.at(-1);
    expect(leftValue?.align).toBe('center');
    expect(leftValue?.baseline).toBe('top');
    expect(leftValue?.x).toBe(centreOf(modern.left));
    expect(rightValue?.x).toBe(centreOf(modern.right));
    expect(leftValue?.y).toBe(modern.left.y - modern.bounds.y + ICON_TOP_INSET + ICON_SIZE);
    expect(rightValue?.y).toBe(leftValue?.y);
  });

  it('lays a one-pixel black shadow under the white value, as the HUD readouts do', () => {
    const [shadow, value] = valueOps({ current: 50 }).left;

    expect(shadow?.color).toBe(STATUS_BAR_VALUE.shadowColor);
    expect(value?.color).toBe(STATUS_BAR_VALUE.color);
    expect(shadow?.x).toBe((value?.x ?? 0) + 1);
    expect(shadow?.y).toBe((value?.y ?? 0) + 1);
  });

  it("draws at the pixel font's crisp 16px size", () => {
    expect(STATUS_BAR_VALUE.fontPx).toBe(16);
    for (const op of valueOps().left) {
      expect(op.font).toBe(`16px ${STATUS_BAR_VALUE.fontFamily}`);
    }
  });

  it('scales the counter, its shadow and its font with the device scale', () => {
    const { left } = valueOps({ current: 99, deviceScale: 2 });
    const modern = statusBarsPlacement('modern');
    const [shadow, value] = left;

    expect(value?.font).toBe(`32px ${STATUS_BAR_VALUE.fontFamily}`);
    expect(value?.x).toBe((modern.left.x + 10 - modern.bounds.x) * 2);
    expect(value?.y).toBe((modern.left.y - modern.bounds.y + ICON_TOP_INSET + ICON_SIZE) * 2);
    expect(shadow?.x).toBe((value?.x ?? 0) + 2);
    expect(shadow?.y).toBe((value?.y ?? 0) + 2);
  });

  it('places the counter in the side-column layouts against their own bounds', () => {
    for (const mode of ['fixed', 'classic'] as const) {
      const { left: leftOps, right: rightOps } = valueOps({ mode, current: 12 });
      const { left, right, bounds } = statusBarsPlacement(mode);

      expect(leftOps.at(-1)?.x, mode).toBe(left.x + left.width / 2 - bounds.x);
      expect(rightOps.at(-1)?.x, mode).toBe(right.x + right.width / 2 - bounds.x);
      expect(leftOps.at(-1)?.y, mode).toBe(left.y - bounds.y + ICON_TOP_INSET + ICON_SIZE);
    }
  });
});
