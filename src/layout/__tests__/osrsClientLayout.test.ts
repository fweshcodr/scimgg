import { describe, expect, it } from 'vitest';
import {
  CLASSIC_BACKGROUND,
  CLASSIC_COLUMN,
  CLASSIC_EDGE_LEFT,
  CLASSIC_EDGE_RIGHT,
  CLASSIC_PANEL_CONTENT,
  CLASSIC_SIDE_COLUMN,
  CLASSIC_TAB_ROW_BOTTOM,
  CLASSIC_TAB_ROW_TOP,
  CLASSIC_TAB_SLOT_X,
  CLIENT_LAYOUT_MODES,
  FIXED_CHAT,
  FIXED_CHAT_AREA,
  FIXED_CHAT_BUTTON_Y,
  FIXED_CHAT_CONTROLS,
  FIXED_CHAT_DISPLAY,
  FIXED_CHAT_INPUT,
  FIXED_CHAT_REPORT_SIZE,
  FIXED_CHAT_REPORT_X,
  FIXED_CHAT_SCROLL_ARROW,
  FIXED_CHAT_SCROLL_THUMB_MIN,
  FIXED_CHAT_SCROLLAREA,
  FIXED_CHAT_SCROLLBAR,
  FIXED_CHAT_TAB_SIZE,
  FIXED_CHAT_TAB_SLOT_X,
  FIXED_COLUMN_WIDTH,
  FIXED_EDGE_LEFT_LOWER,
  FIXED_EDGE_LEFT_LOWER_LIP,
  FIXED_EDGE_LEFT_UPPER,
  FIXED_EDGE_RIGHT,
  FIXED_FRAME,
  FIXED_FRAME_EDGE_LEFT,
  FIXED_FRAME_EDGE_TOP,
  FIXED_MINIMAP,
  FIXED_MINIMAP_BLOCK,
  FIXED_MINIMAP_BLOCK_ORIGIN,
  FIXED_MINIMAP_BLOCK_RECT,
  FIXED_MINIMAP_ORB_FRAME_ORIGINS,
  FIXED_MINIMAP_ORBS_ORIGIN,
  FIXED_PANEL_CONTENT,
  FIXED_SCALE_MAX,
  FIXED_SCALE_MIN,
  FIXED_SCENE,
  FIXED_SIDE_COLUMN,
  FIXED_SIDE_COLUMN_ORIGIN,
  FIXED_SIDE_COLUMN_RECT,
  FIXED_SIDE_COLUMN_SIZE,
  FIXED_TAB_ROW_BOTTOM,
  FIXED_TAB_ROW_TOP,
  FIXED_TAB_ROW_TOP_STONE_Y,
  FIXED_TAB_SLOT_X_BOTTOM,
  FIXED_TAB_SLOT_X_TOP,
  FIXED_TOP_RIGHT_CORNER,
  FIXED_VIEWPORT,
  FIXED_XP_ORB,
  fitFixedFrame,
  fixedFrameSizeAtScale,
  gamePanelAttachmentMetrics,
  ifTransAlpha,
  isClientLayoutMode,
  MODERN_PANEL,
  MODERN_PANEL_CONTENT,
  PANEL_SHELL_INSET,
  panelShellOrigin,
  placeFixedFrame,
  type Rect,
  SELECTED_TAB_STONE_WIDTH,
  SIDE_TRANSPARENCY_DEFAULT,
  scaleRect,
  selectedTabStonePlacement,
  sideBackgroundFill,
  TAB_STONE,
} from '../osrsClientLayout';

/**
 * These lock the cache-decoded numbers themselves. They are not testing logic —
 * they are the guard that stops someone "tidying" a constant that was read out
 * of interface group 548/161/164 and has to keep matching it.
 */
describe('osrsClientLayout geometry', () => {
  it('tiles the fixed frame exactly', () => {
    expect(FIXED_FRAME).toEqual({ width: 765, height: 503 });

    expect(FIXED_VIEWPORT.y + FIXED_VIEWPORT.height).toBe(FIXED_CHAT.y);
    expect(FIXED_CHAT.y + FIXED_CHAT.height).toBe(FIXED_FRAME.height);
    expect(FIXED_MINIMAP.x + FIXED_MINIMAP.width).toBe(FIXED_FRAME.width);
    expect(FIXED_TAB_ROW_BOTTOM.y + FIXED_TAB_ROW_BOTTOM.height).toBe(FIXED_FRAME.height);

    expect(FIXED_MINIMAP.y).toBeLessThan(FIXED_TAB_ROW_TOP.y);
    expect(FIXED_TAB_ROW_TOP.y).toBeLessThan(FIXED_PANEL_CONTENT.y);
    expect(FIXED_PANEL_CONTENT.y).toBeLessThan(FIXED_TAB_ROW_BOTTOM.y);
  });

  it('hands the scene the chatbox space when the chatbox is hidden', () => {
    // Component 10's origin and width, run down over CHAT_CONTAINER to the
    // frame's bottom edge — exactly as far as CHAT_CONTAINER itself goes. The
    // frame has no bottom border component (only 1 left, 7 top, 8 corner), so
    // stopping short would open a gutter with nothing authentic to fill it.
    expect(FIXED_SCENE.x).toBe(FIXED_VIEWPORT.x);
    expect(FIXED_SCENE.y).toBe(FIXED_VIEWPORT.y);
    expect(FIXED_SCENE.width).toBe(FIXED_VIEWPORT.width);
    expect(FIXED_SCENE.height).toBeGreaterThan(FIXED_VIEWPORT.height);
    // Collapsing keeps the controls row, so the scene stops at its top edge
    // rather than running to the bottom of the frame.
    expect(FIXED_SCENE.y + FIXED_SCENE.height).toBe(FIXED_CHAT_CONTROLS.y);
    expect(FIXED_SCENE.y + FIXED_SCENE.height).toBeLessThan(FIXED_FRAME.height);
    expect(FIXED_SCENE.x + FIXED_SCENE.width).toBeLessThanOrEqual(FIXED_MINIMAP.x);
  });

  it('splits CHAT_CONTAINER into the chat area and the controls row', () => {
    // Group 162 mounts comp 1 (23 tall, bottom-anchored) and gives comp 34 the
    // rest. Sprite 1017 is 519x142, so the remainder is the cache's own number:
    // rounding either half independently opens a seam across the chatbox.
    expect(FIXED_CHAT_CONTROLS.height).toBe(23);
    expect(FIXED_CHAT_AREA.height).toBe(142);
    expect(FIXED_CHAT_AREA.height + FIXED_CHAT_CONTROLS.height).toBe(FIXED_CHAT.height);
    expect(FIXED_CHAT_AREA.y).toBe(FIXED_CHAT.y);
    expect(FIXED_CHAT_CONTROLS.y).toBe(FIXED_CHAT_AREA.y + FIXED_CHAT_AREA.height);
    expect(FIXED_CHAT_CONTROLS.y + FIXED_CHAT_CONTROLS.height).toBe(FIXED_CHAT.y + FIXED_CHAT.height);
    expect(FIXED_CHAT_AREA.width).toBe(FIXED_CHAT.width);
    expect(FIXED_CHAT_CONTROLS.width).toBe(FIXED_CHAT.width);
  });

  it('lays the seven chat tabs and the report button inside the controls row', () => {
    // Every button graphic is 22 tall at y=1 inside a 23px row, so the row has
    // exactly one spare pixel and no button may be grown into it.
    expect(FIXED_CHAT_BUTTON_Y + FIXED_CHAT_TAB_SIZE.height).toBe(FIXED_CHAT_CONTROLS.height);
    expect(FIXED_CHAT_BUTTON_Y + FIXED_CHAT_REPORT_SIZE.height).toBe(FIXED_CHAT_CONTROLS.height);

    expect(FIXED_CHAT_TAB_SLOT_X).toHaveLength(7);
    // The on-screen positions, not the ones the components ship
    // with — the first tab starts 5 from the left, not 3.
    expect(FIXED_CHAT_TAB_SLOT_X[0]).toBe(5);
    // Uniform 62px pitch — a slot list that drifts off it is a decode error.
    for (let i = 1; i < FIXED_CHAT_TAB_SLOT_X.length; i++) {
      expect(FIXED_CHAT_TAB_SLOT_X[i] - FIXED_CHAT_TAB_SLOT_X[i - 1]).toBe(62);
    }

    // The report button is anchored to the row's right edge, not to the pitch.
    expect(FIXED_CHAT_REPORT_X + FIXED_CHAT_REPORT_SIZE.width).toBe(FIXED_CHAT_CONTROLS.width - 3);
    const lastTabRight = FIXED_CHAT_TAB_SLOT_X[6] + FIXED_CHAT_TAB_SIZE.width;
    expect(FIXED_CHAT_REPORT_X).toBeGreaterThanOrEqual(lastTabRight);
  });

  it('divides the chat area into display, scrollarea, scrollbar and input', () => {
    // CHATDISPLAY is CHATAREA inset 14x12 and centered, so the margins are even.
    expect(FIXED_CHAT_DISPLAY.x - FIXED_CHAT_AREA.x).toBe(7);
    expect(FIXED_CHAT_AREA.x + FIXED_CHAT_AREA.width - (FIXED_CHAT_DISPLAY.x + FIXED_CHAT_DISPLAY.width)).toBe(7);
    expect(FIXED_CHAT_DISPLAY.y - FIXED_CHAT_AREA.y).toBe(6);
    expect(FIXED_CHAT_AREA.y + FIXED_CHAT_AREA.height - (FIXED_CHAT_DISPLAY.y + FIXED_CHAT_DISPLAY.height)).toBe(6);

    // The 16 SCROLLAREA gives up across is the scrollbar; the 16 down is the
    // input row. Both must stay exact or the two halves overlap or gap.
    expect(FIXED_CHAT_SCROLLAREA.width + FIXED_CHAT_SCROLLBAR.width).toBe(FIXED_CHAT_DISPLAY.width);
    expect(FIXED_CHAT_SCROLLAREA.height + FIXED_CHAT_INPUT.height).toBe(FIXED_CHAT_DISPLAY.height);
    expect(FIXED_CHAT_SCROLLBAR.x + FIXED_CHAT_SCROLLBAR.width).toBe(FIXED_CHAT_DISPLAY.x + FIXED_CHAT_DISPLAY.width);
    expect(FIXED_CHAT_SCROLLBAR.height).toBe(FIXED_CHAT_SCROLLAREA.height);

    expect(FIXED_CHAT_INPUT.y + FIXED_CHAT_INPUT.height).toBe(FIXED_CHAT_DISPLAY.y + FIXED_CHAT_DISPLAY.height);
    expect(FIXED_CHAT_INPUT.y + FIXED_CHAT_INPUT.height).toBeLessThan(FIXED_CHAT_CONTROLS.y);

    expect(FIXED_CHAT_SCROLLBAR.height).toBeGreaterThan(FIXED_CHAT_SCROLL_ARROW * 2 + FIXED_CHAT_SCROLL_THUMB_MIN);
  });

  it('gives the scene the cache viewport when the chatbox is shown', () => {
    // The two scene rects Grid picks between. Showing the chatbox must not move
    // the scene's origin or width, or the left bezel and the side column stop
    // meeting it — only the height differs.
    expect(FIXED_VIEWPORT.x).toBe(FIXED_SCENE.x);
    expect(FIXED_VIEWPORT.width).toBe(FIXED_SCENE.width);
    expect(FIXED_VIEWPORT.y + FIXED_VIEWPORT.height).toBe(FIXED_CHAT.y);
  });

  it('covers the fixed frame height with one unbroken right-hand column', () => {
    expect(FIXED_MINIMAP_BLOCK_ORIGIN.y).toBe(0);
    expect(FIXED_MINIMAP_BLOCK.height).toBe(FIXED_SIDE_COLUMN_ORIGIN.y);
    expect(FIXED_SIDE_COLUMN_ORIGIN.y + FIXED_SIDE_COLUMN_SIZE.height).toBe(FIXED_FRAME.height);
    expect(FIXED_MINIMAP_BLOCK.width).toBe(FIXED_COLUMN_WIDTH);
    expect(FIXED_SIDE_COLUMN_SIZE.width).toBe(FIXED_COLUMN_WIDTH);
    expect(FIXED_MINIMAP_BLOCK_ORIGIN.x).toBe(FIXED_SIDE_COLUMN_ORIGIN.x);
    expect(FIXED_SIDE_COLUMN_ORIGIN.x + FIXED_COLUMN_WIDTH).toBe(FIXED_FRAME.width);
  });

  it('composes the complete top bezel from the cache-authored frame sprites', () => {
    expect(FIXED_FRAME_EDGE_TOP).toEqual({ x: 0, y: 0, width: 717, height: 4 });
    expect(FIXED_TOP_RIGHT_CORNER).toEqual({ x: 717, y: 0, width: 48, height: 4 });
    expect(FIXED_FRAME_EDGE_TOP.width + FIXED_TOP_RIGHT_CORNER.width).toBe(FIXED_FRAME.width);
  });

  it('uses the fixed-client orb group positions without hand-tuned pitch', () => {
    expect(FIXED_MINIMAP_ORBS_ORIGIN).toEqual({ x: 0, y: 4 });
    expect(FIXED_XP_ORB).toEqual({ x: 0, y: 17, width: 27, height: 27 });
    expect(FIXED_MINIMAP_ORB_FRAME_ORIGINS).toEqual({
      hitpoints: { x: 0, y: 37 },
      prayer: { x: 0, y: 71 },
      run: { x: 10, y: 103 },
      special: { x: 32, y: 128 },
    });
  });

  it('wraps the fixed content box in the pack edges without leaving a gap', () => {
    for (const edge of [FIXED_EDGE_LEFT_UPPER, FIXED_EDGE_LEFT_LOWER]) {
      expect(edge.x + edge.width).toBe(FIXED_PANEL_CONTENT.x);
    }
    expect(FIXED_EDGE_RIGHT.x).toBe(FIXED_PANEL_CONTENT.x + FIXED_PANEL_CONTENT.width);
    expect(FIXED_EDGE_RIGHT.x + FIXED_EDGE_RIGHT.width).toBe(FIXED_FRAME.width);

    // The two left pieces split on the chat container's top edge — which is why
    // the lower one is narrower — and together cover the content box's rows.
    expect(FIXED_EDGE_LEFT_UPPER.y).toBe(FIXED_PANEL_CONTENT.y);
    expect(FIXED_EDGE_LEFT_UPPER.y + FIXED_EDGE_LEFT_UPPER.height).toBe(FIXED_CHAT.y);
    expect(FIXED_EDGE_LEFT_LOWER.y).toBe(FIXED_CHAT.y);
    expect(FIXED_EDGE_LEFT_LOWER.x).toBe(FIXED_CHAT.x + FIXED_CHAT.width);
    expect(FIXED_EDGE_LEFT_UPPER.height + FIXED_EDGE_LEFT_LOWER.height).toBe(FIXED_PANEL_CONTENT.height);
    expect(FIXED_EDGE_RIGHT.y).toBe(FIXED_PANEL_CONTENT.y);
    expect(FIXED_EDGE_RIGHT.height).toBe(FIXED_PANEL_CONTENT.height);
  });

  it('gives every layout the same 190x261 content box', () => {
    const box = { width: 190, height: 261 };
    expect({ width: FIXED_PANEL_CONTENT.width, height: FIXED_PANEL_CONTENT.height }).toEqual(box);
    expect({ width: CLASSIC_PANEL_CONTENT.width, height: CLASSIC_PANEL_CONTENT.height }).toEqual(box);
    expect(MODERN_PANEL_CONTENT).toEqual(box);
  });

  it("keeps modern's shell identical to the simulator's original panel", () => {
    expect(MODERN_PANEL).toEqual({ width: 204, height: 275 });
    expect(MODERN_PANEL.width).toBe(MODERN_PANEL_CONTENT.width + PANEL_SHELL_INSET * 2);
    expect(MODERN_PANEL.height).toBe(MODERN_PANEL_CONTENT.height + PANEL_SHELL_INSET * 2);
  });

  it('fits the classic column pieces inside the column', () => {
    for (const rect of [
      CLASSIC_TAB_ROW_TOP,
      CLASSIC_TAB_ROW_BOTTOM,
      CLASSIC_EDGE_LEFT,
      CLASSIC_EDGE_RIGHT,
      CLASSIC_BACKGROUND,
      CLASSIC_PANEL_CONTENT,
    ]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(CLASSIC_COLUMN.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(CLASSIC_COLUMN.height);
    }
    expect(CLASSIC_TAB_ROW_TOP.y).toBe(0);
    expect(CLASSIC_TAB_ROW_BOTTOM.y + CLASSIC_TAB_ROW_BOTTOM.height).toBe(CLASSIC_COLUMN.height);
  });

  it('keeps seven tab slots inside a row, in ascending order', () => {
    expect(CLASSIC_TAB_SLOT_X).toHaveLength(7);
    for (let i = 1; i < CLASSIC_TAB_SLOT_X.length; i++) {
      expect(CLASSIC_TAB_SLOT_X[i]).toBeGreaterThan(CLASSIC_TAB_SLOT_X[i - 1] as number);
    }
    const last = CLASSIC_TAB_SLOT_X[CLASSIC_TAB_SLOT_X.length - 1] as number;
    expect(last + TAB_STONE.width).toBeLessThanOrEqual(CLASSIC_TAB_ROW_TOP.width);
    expect(TAB_STONE).toEqual({ width: 33, height: 36 });
  });

  it('derives the panel shell origin from a content rect', () => {
    expect(panelShellOrigin(CLASSIC_PANEL_CONTENT)).toEqual({ x: 19, y: 30 });
    expect(panelShellOrigin(FIXED_PANEL_CONTENT)).toEqual({ x: 540, y: 198 });
  });
});

describe('side column geometry', () => {
  const toFrame = (rect: Rect): Rect => ({
    ...rect,
    x: rect.x + FIXED_SIDE_COLUMN_ORIGIN.x,
    y: rect.y + FIXED_SIDE_COLUMN_ORIGIN.y,
  });

  it('keeps classic composing exactly the pieces it always has', () => {
    expect(CLASSIC_SIDE_COLUMN.size).toEqual(CLASSIC_COLUMN);
    expect(CLASSIC_SIDE_COLUMN.background).toEqual(CLASSIC_BACKGROUND);
    expect(CLASSIC_SIDE_COLUMN.backgroundTiled).toBe(true);
    expect(CLASSIC_SIDE_COLUMN.backgroundOffsetY).toBe(0);
    expect(CLASSIC_SIDE_COLUMN.edges).toEqual([
      { sprite: 'classicLeft', rect: CLASSIC_EDGE_LEFT },
      { sprite: 'classicRight', rect: CLASSIC_EDGE_RIGHT },
    ]);
    expect(CLASSIC_SIDE_COLUMN.spriteSet).toBe('classic');
    expect(CLASSIC_SIDE_COLUMN.tabRowTop.rect).toEqual(CLASSIC_TAB_ROW_TOP);
    expect(CLASSIC_SIDE_COLUMN.tabRowBottom.rect).toEqual(CLASSIC_TAB_ROW_BOTTOM);
    expect(CLASSIC_SIDE_COLUMN.tabRowTop.slotX).toEqual(CLASSIC_TAB_SLOT_X);
    expect(CLASSIC_SIDE_COLUMN.tabRowBottom.slotX).toEqual(CLASSIC_TAB_SLOT_X);
    expect(CLASSIC_SIDE_COLUMN.panelShell).toEqual(panelShellOrigin(CLASSIC_PANEL_CONTENT));
  });

  it('lands every fixed piece on its cache rect', () => {
    expect(FIXED_SIDE_COLUMN.size).toEqual(FIXED_SIDE_COLUMN_SIZE);
    // Sprite 1031 is a one-shot 190x261 fill sized to the content box, not a
    // tile — repeating it stamps its baked border across the panel as a dark
    // cross. It is drawn once on the content rect; the stone edges and the two
    // tab rows cover the remaining 59px of column width.
    expect(FIXED_SIDE_COLUMN.background).toEqual({ x: 31, y: 38, width: 190, height: 261 });
    expect(toFrame(FIXED_SIDE_COLUMN.background)).toEqual(FIXED_PANEL_CONTENT);
    expect(FIXED_SIDE_COLUMN.backgroundTiled).toBe(false);
    expect(FIXED_SIDE_COLUMN.backgroundOffsetY).toBe(0);

    // The lip is a second draw of the upper sprite, clipped to the 3 columns the
    // lower piece leaves bare because the client hides them behind the chatbox.
    // It must come before the lower piece, which overdraws the rest of it.
    expect(FIXED_SIDE_COLUMN.edges.map((edge) => edge.sprite)).toEqual([
      'fixedLeftUpper',
      'fixedLeftUpper',
      'fixedLeftLower',
      'fixedRight',
    ]);
    expect(FIXED_SIDE_COLUMN.edges.map((edge) => toFrame(edge.rect))).toEqual([
      FIXED_EDGE_LEFT_UPPER,
      FIXED_EDGE_LEFT_LOWER_LIP,
      FIXED_EDGE_LEFT_LOWER,
      FIXED_EDGE_RIGHT,
    ]);
    // Clipped, never fitted: the sprite keeps its authored 31x133.
    expect(FIXED_SIDE_COLUMN.edges[1]?.sourceSize).toEqual({
      width: FIXED_EDGE_LEFT_UPPER.width,
      height: FIXED_EDGE_LEFT_UPPER.height,
    });
    expect(FIXED_EDGE_LEFT_LOWER_LIP.x + FIXED_EDGE_LEFT_LOWER_LIP.width).toBe(FIXED_EDGE_LEFT_LOWER.x);
    expect(FIXED_EDGE_LEFT_LOWER_LIP.x).toBe(FIXED_EDGE_LEFT_UPPER.x);

    const shell = panelShellOrigin(FIXED_PANEL_CONTENT);
    expect(FIXED_SIDE_COLUMN.panelShell.x + FIXED_SIDE_COLUMN_ORIGIN.x).toBe(shell.x);
    expect(FIXED_SIDE_COLUMN.panelShell.y + FIXED_SIDE_COLUMN_ORIGIN.y).toBe(shell.y);

    expect(FIXED_SIDE_COLUMN.spriteSet).toBe('fixed');
    const top = toFrame(FIXED_SIDE_COLUMN.tabRowTop.rect);
    const bottom = toFrame(FIXED_SIDE_COLUMN.tabRowBottom.rect);
    expect(top).toEqual(FIXED_TAB_ROW_TOP);
    expect(bottom).toEqual(FIXED_TAB_ROW_BOTTOM);
    expect(FIXED_SIDE_COLUMN.tabRowTop.stoneY).toBe(FIXED_TAB_ROW_TOP_STONE_Y);
    expect(bottom.y + bottom.height).toBe(FIXED_FRAME.height);
  });

  it('puts each fixed stone on its own cache slot', () => {
    // Fixed draws the client's fixed-mode row sprites at their real container
    // rects, so slots are the cache origins directly with nothing to correct for.
    expect(FIXED_SIDE_COLUMN.tabRowTop.slotX).toEqual(FIXED_TAB_SLOT_X_TOP);
    expect(FIXED_SIDE_COLUMN.tabRowBottom.slotX).toEqual(FIXED_TAB_SLOT_X_BOTTOM);
    for (const row of [FIXED_SIDE_COLUMN.tabRowTop, FIXED_SIDE_COLUMN.tabRowBottom]) {
      const last = row.slotX[row.slotX.length - 1] as number;
      expect(row.slotX).toHaveLength(7);
      expect(last + TAB_STONE.width).toBeLessThanOrEqual(row.rect.width);
      expect(row.stoneY + TAB_STONE.height).toBeLessThanOrEqual(row.rect.height);
    }
  });

  it('keeps every fixed piece inside the column', () => {
    const pieces: Rect[] = [
      FIXED_SIDE_COLUMN.background,
      FIXED_SIDE_COLUMN.tabRowTop.rect,
      FIXED_SIDE_COLUMN.tabRowBottom.rect,
      ...FIXED_SIDE_COLUMN.edges.map((edge) => edge.rect),
    ];
    for (const rect of pieces) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(FIXED_SIDE_COLUMN.size.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(FIXED_SIDE_COLUMN.size.height);
    }
  });
});

describe('fitFixedFrame', () => {
  it('renders at native size when the stage matches exactly', () => {
    expect(fitFixedFrame(765, 503)).toEqual({ scale: 1, width: 765, height: 503 });
  });

  it('fits to the limiting axis and preserves aspect ratio', () => {
    const wide = fitFixedFrame(4000, 1006);
    expect(wide.scale).toBe(2);
    expect(wide.width).toBe(1530);
    expect(wide.height).toBe(1006);

    const tall = fitFixedFrame(765, 4000);
    expect(tall.scale).toBe(1);
    expect(tall.height).toBe(503);
  });

  it('shrinks rather than clipping when the stage is smaller than the client', () => {
    // The frame is sized in whole pixels so scaleRect has a solid box to snap
    // against, so a stage that lands the fit on a fraction gets the nearest whole
    // frame and the scale that frame was actually laid out at.
    const small = fitFixedFrame(382.5, 1000);
    expect(small.width).toBe(383);
    expect(small.height).toBe(252);
    expect(small.scale).toBe(383 / FIXED_FRAME.width);
  });

  it('reports the scale the frame was actually laid out at', () => {
    // Callers recover the factor as measuredWidth / 765; fitFixedFrame must agree
    // with that or every snapped rect drifts against the frame it sits in.
    for (const stage of [1237, 1401, 1550, 900, 766]) {
      const fit = fitFixedFrame(stage, stage);
      expect(Number.isInteger(fit.width)).toBe(true);
      expect(Number.isInteger(fit.height)).toBe(true);
      expect(fit.scale).toBe(fit.width / FIXED_FRAME.width);
    }
  });

  it('lands shared boundaries on the same physical pixel', () => {
    // The real bug this guards: the left bezel's right edge and the scene's left
    // edge are both 4 logical px in, and the frame's right edge and the side
    // column's are both 765. Scaling sizes independently rounds them apart and
    // leaves a hairline of the scene showing through.
    for (const stage of [1237, 1401, 1550, 903]) {
      const { scale } = fitFixedFrame(stage, Math.round((stage * 503) / 765));
      const bezel = scaleRect(FIXED_FRAME_EDGE_LEFT, scale);
      const scene = scaleRect(FIXED_SCENE, scale);
      expect(bezel.x + bezel.width).toBe(scene.x);

      const column = scaleRect({ x: FIXED_MINIMAP.x, y: 0, width: FIXED_COLUMN_WIDTH, height: 1 }, scale);
      const frame = scaleRect({ x: 0, y: 0, ...FIXED_FRAME }, scale);
      expect(column.x + column.width).toBe(frame.width);

      // Collapsed, the scene stops against the controls row. Snapping the two
      // separately is what would leave a hairline of background along that seam.
      const controls = scaleRect(FIXED_CHAT_CONTROLS, scale);
      expect(scene.y + scene.height).toBe(controls.y);
      expect(controls.y + controls.height).toBe(frame.height);
    }
  });

  it('never reports a degenerate scale for an unmeasured stage', () => {
    expect(fitFixedFrame(0, 0).scale).toBe(1);
  });

  it('recovers the scale from the laid-out frame width, as Grid does', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [800, 600],
    ] as const) {
      const fit = fitFixedFrame(w, h);
      expect(fit.width / FIXED_FRAME.width).toBeCloseTo(fit.scale, 10);
    }
  });

  describe('requested scale', () => {
    it('honors a multiple the stage can fit', () => {
      expect(fitFixedFrame(4000, 4000, 2)).toEqual({ scale: 2, width: 1530, height: 1006 });
      // 1.5x lands the width on 1147.5; the frame is whole pixels, so `scale`
      // reports the 1148/765 the frame was actually laid out at.
      const oneAndAHalf = fitFixedFrame(4000, 4000, 1.5);
      expect(oneAndAHalf.width).toBe(1148);
      expect(oneAndAHalf.height).toBe(755);
      expect(oneAndAHalf.scale).toBe(1148 / FIXED_FRAME.width);
    });

    it.each([
      [1920, 1080, 3],
      [740, 600, 1],
      [1000, 400, 1],
      [390, 400, 1],
    ])('preserves the selected scale when a %ix%i stage cannot fit %ix', (width, height, scale) => {
      expect(fitFixedFrame(width, height, scale)).toEqual({ scale, ...fixedFrameSizeAtScale(scale) });
    });

    it('still fits a small stage when no scale is selected', () => {
      expect(fitFixedFrame(740, 400).height).toBe(400);
    });

    it('never enlarges past the stage even for a scale below the fit', () => {
      const fit = fitFixedFrame(1920, 1080);
      expect(fitFixedFrame(1920, 1080, 1).width).toBeLessThanOrEqual(fit.width);
    });

    it('clamps an out-of-range request to the allowed bounds', () => {
      // A huge stage removes the stage clamp, leaving only the scale bounds.
      expect(fitFixedFrame(100000, 100000, 99).scale).toBe(FIXED_SCALE_MAX);
      expect(fitFixedFrame(100000, 100000, 0.01).width).toBe(fixedFrameSizeAtScale(FIXED_SCALE_MIN).width);
    });

    it('falls back to the plain fit for a non-finite request', () => {
      expect(fitFixedFrame(1920, 1080, Number.NaN)).toEqual(fitFixedFrame(1920, 1080));
    });
  });
});

describe('placeFixedFrame', () => {
  const unstretched = (stageWidth: number, stageHeight: number, requested?: number) => {
    const layout = fitFixedFrame(stageWidth, stageHeight, requested);
    return { layout, painted: { width: layout.width, height: layout.height } };
  };

  it('is fitFixedFrame for Fit and for an explicit multiple, painted as laid out', () => {
    expect(placeFixedFrame(1920, 1080, 'fit')).toEqual(unstretched(1920, 1080));
    expect(placeFixedFrame(1920, 1080, 2)).toEqual(unstretched(1920, 1080, 2));
    // Integer scaling has nothing to round on a chosen multiple.
    expect(placeFixedFrame(1920, 1080, 1.5, true)).toEqual(unstretched(1920, 1080, 1.5));
  });

  it('floors Fit to a whole multiple with Integer scaling', () => {
    // 2560x1440: the plain fit is 2.86x; integer keeps 2x.
    expect(placeFixedFrame(2560, 1440, 'fit', true)).toEqual(unstretched(2560, 1440, 2));
    expect(placeFixedFrame(2560, 1440, 'fit').layout.scale).toBeCloseTo(1440 / 503, 2);
  });

  it('keeps the fractional fit where the window has no room for 1x', () => {
    expect(placeFixedFrame(700, 450, 'fit', true)).toEqual(unstretched(700, 450));
  });

  it('stretches to fill the stage, laid out at the smaller axis so that axis is painted 1:1', () => {
    // 16:9 at 1080p: height limits (2.147x), the width is stretched the remaining ~1.17x.
    const { layout, painted } = placeFixedFrame(1920, 1080, 'stretch');
    expect(layout).toEqual(fitFixedFrame(1920, 1080));
    expect(painted).toEqual({ width: 1920, height: layout.height });
    expect(painted.width / layout.width).toBeCloseTo(1.17, 2);

    // A tall stage limits the width instead, and stretches the height.
    const tall = placeFixedFrame(800, 1200, 'stretch');
    expect(tall.painted).toEqual({ width: tall.layout.width, height: 1200 });
    expect(tall.layout.width).toBe(800);
  });

  it('floors each axis independently with Integer scaling', () => {
    // 2560x1440: 3.35x wide, 2.86x tall -> 3x by 2x, laid out at 2x.
    expect(placeFixedFrame(2560, 1440, 'stretch', true)).toEqual({
      layout: fitFixedFrame(100000, 100000, 2),
      painted: { width: 765 * 3, height: 1006 },
    });
    // 1920x1080 floors to 2x on both: no stretch left at all.
    const square = placeFixedFrame(1920, 1080, 'stretch', true);
    expect(square.painted).toEqual({ width: square.layout.width, height: square.layout.height });
    expect(square.layout.scale).toBe(2);
  });

  it('keeps the fraction for an axis with no room for 1x under Integer scaling', () => {
    // 700 wide is under 765: that axis stays 700/765, the height floors to 2x.
    const { layout, painted } = placeFixedFrame(700, 1200, 'stretch', true);
    expect(layout.width).toBe(700);
    expect(painted).toEqual({ width: 700, height: 1006 });
  });

  it('only ever sizes in whole pixels and never paints smaller than laid out', () => {
    for (const [width, height] of [
      [1366, 768],
      [1441, 901],
      [2559, 1079],
      [3440, 1440],
      [801, 1333],
      [500, 300],
    ]) {
      for (const integer of [false, true]) {
        const { layout, painted } = placeFixedFrame(width, height, 'stretch', integer);
        for (const value of [layout.width, layout.height, painted.width, painted.height]) {
          expect(Number.isInteger(value)).toBe(true);
        }
        expect(painted.width).toBeGreaterThanOrEqual(layout.width);
        expect(painted.height).toBeGreaterThanOrEqual(layout.height);
        // One axis is never resampled.
        expect(painted.width === layout.width || painted.height === layout.height).toBe(true);
        expect(painted.width).toBeLessThanOrEqual(width);
      }
    }
  });

  it('falls back to native size for a stage that has not been measured', () => {
    expect(placeFixedFrame(0, 0, 'stretch', true)).toEqual(unstretched(0, 0));
  });
});

describe('fixedFrameSizeAtScale', () => {
  it('reports the frame size the requested multiple asks for, ignoring any stage', () => {
    expect(fixedFrameSizeAtScale(1)).toEqual({ width: 765, height: 503 });
    expect(fixedFrameSizeAtScale(2)).toEqual({ width: 1530, height: 1006 });
    expect(fixedFrameSizeAtScale(1.5)).toEqual({ width: 1148, height: 755 });
  });
});

describe('scaleRect', () => {
  it('scales origin and size together', () => {
    expect(scaleRect(FIXED_VIEWPORT, 2)).toEqual({ x: 8, y: 8, width: 1024, height: 668 });
  });

  it('is identity at scale 1', () => {
    expect(scaleRect(FIXED_SCENE, 1)).toEqual(FIXED_SCENE);
  });
});

describe('pinned fixed-mode containers', () => {
  // Every scale a user can reach: the presets, the fits a real window produces,
  // and a spread of arbitrary customs. A seam is a boundary that rounds apart at
  // ONE scale, so the sweep matters more than any single case.
  const scales: number[] = [];
  for (const stage of [765, 800, 903, 1237, 1280, 1401, 1550, 1920, 2560, 3440]) {
    scales.push(fitFixedFrame(stage, Math.round((stage * 503) / 765)).scale);
  }
  for (let s = 0.5; s <= 6; s += 0.137) scales.push(fitFixedFrame(100000, 100000, s).scale);

  it('lays the frame out at the scale its own width implies', () => {
    // Rounding the height from the REQUESTED scale while every rect inside is
    // snapped against the width-derived one disagrees by up to ~0.8px,
    // landing exactly between the top-anchored minimap and the bottom-anchored
    // column: a seam straight across the right-hand column.
    for (const scale of scales) {
      const frame = scaleRect({ x: 0, y: 0, ...FIXED_FRAME }, scale);
      expect(frame.height).toBe(fixedFrameSizeAtScale(scale).height);
      expect(frame.width).toBe(fixedFrameSizeAtScale(scale).width);
    }
  });

  it('butts the minimap block against the side column at every scale', () => {
    for (const scale of scales) {
      const block = scaleRect(FIXED_MINIMAP_BLOCK_RECT, scale);
      const column = scaleRect(FIXED_SIDE_COLUMN_RECT, scale);
      expect(block.y + block.height).toBe(column.y);
    }
  });

  it('runs both containers to the frame edges at every scale', () => {
    for (const scale of scales) {
      const frame = scaleRect({ x: 0, y: 0, ...FIXED_FRAME }, scale);
      const block = scaleRect(FIXED_MINIMAP_BLOCK_RECT, scale);
      const column = scaleRect(FIXED_SIDE_COLUMN_RECT, scale);
      expect(block.y).toBe(0);
      expect(block.x + block.width).toBe(frame.width);
      expect(column.x + column.width).toBe(frame.width);
      expect(column.y + column.height).toBe(frame.height);
    }
  });

  it('gives every container a whole-pixel box', () => {
    // The reason the panels are snapped at all: a fractional box puts the
    // panel's compositing layer off the device pixel grid, and the whole layer
    // is resampled — which is what paints a blended row at every sprite
    // boundary inside it.
    for (const scale of scales) {
      for (const rect of [scaleRect(FIXED_MINIMAP_BLOCK_RECT, scale), scaleRect(FIXED_SIDE_COLUMN_RECT, scale)]) {
        expect(Number.isInteger(rect.x)).toBe(true);
        expect(Number.isInteger(rect.y)).toBe(true);
        expect(Number.isInteger(rect.width)).toBe(true);
        expect(Number.isInteger(rect.height)).toBe(true);
      }
    }
  });
});

describe('mode helpers', () => {
  it('accepts exactly the four client layouts', () => {
    expect(CLIENT_LAYOUT_MODES).toEqual(['fixed', 'classic', 'modern', 'mobile']);
    for (const mode of CLIENT_LAYOUT_MODES) expect(isClientLayoutMode(mode)).toBe(true);
    for (const bad of ['resizable', '', null, undefined, 0, {}]) expect(isClientLayoutMode(bad)).toBe(false);
  });

  it('attaches widgets to the panel box the active layout actually draws', () => {
    expect(gamePanelAttachmentMetrics('modern')).toEqual(MODERN_PANEL);
    expect(gamePanelAttachmentMetrics('classic')).toEqual(CLASSIC_COLUMN);
    expect(gamePanelAttachmentMetrics('fixed')).toEqual(FIXED_SIDE_COLUMN_SIZE);
    // Mobile's 204x275 side panel beside its 85x280 expanded rail.
    expect(gamePanelAttachmentMetrics('mobile')).toEqual({ width: 289, height: 280 });
  });

  it('gives the row-end slots their own corner highlight, not the middle one', () => {
    // Highlighting every slot from PreEocStones (panel/tab_stone_middle_selected)
    // would use modern's sprite. Fixed and
    // classic draw from SideStoneHighlights, where slots 0 and 6 are distinct
    // corner art. Cache: group 548 comps 64-70 / 48-54, group 161 comps 59-65 / 43-49.
    expect(selectedTabStonePlacement('top', 0, 7)).toEqual({ stone: 'topLeft', dx: -4, width: 38 });
    expect(selectedTabStonePlacement('top', 6, 7)).toEqual({ stone: 'topRight', dx: -1, width: 38 });
    expect(selectedTabStonePlacement('bottom', 0, 7)).toEqual({ stone: 'bottomLeft', dx: -4, width: 38 });
    expect(selectedTabStonePlacement('bottom', 6, 7)).toEqual({ stone: 'bottomRight', dx: -1, width: 38 });

    // Every one of them draws on the same 38x36 canvas at natural size. The
    // middle sprite simply leaves its right 5 columns transparent, so it covers
    // the 33px slot exactly; scaling it down to TAB_STONE.width instead shrinks
    // the stone itself to ~28.6px and leaves the slot visibly unfilled.
    for (const slot of [1, 2, 3, 4, 5]) {
      for (const row of ['top', 'bottom'] as const) {
        expect(selectedTabStonePlacement(row, slot, 7)).toEqual({
          stone: 'middle',
          dx: 0,
          width: SELECTED_TAB_STONE_WIDTH,
        });
      }
    }
    expect(SELECTED_TAB_STONE_WIDTH).toBeGreaterThan(TAB_STONE.width);
  });

  it('lands each end highlight where the cache puts it', () => {
    // Slot origin + dx must reproduce the selected component's own x.
    const end = (slotX: readonly number[], row: 'top' | 'bottom', slot: number) =>
      (slotX[slot] as number) + selectedTabStonePlacement(row, slot, 7).dx;

    expect(end(FIXED_TAB_SLOT_X_TOP, 'top', 0)).toBe(6); // 548/64
    expect(end(FIXED_TAB_SLOT_X_TOP, 'top', 6)).toBe(209); // 548/70
    expect(end(FIXED_TAB_SLOT_X_BOTTOM, 'bottom', 0)).toBe(3); // 548/48
    expect(end(FIXED_TAB_SLOT_X_BOTTOM, 'bottom', 6)).toBe(206); // 548/54
    expect(end(CLASSIC_TAB_SLOT_X, 'top', 0)).toBe(0); // 161/59
    expect(end(CLASSIC_TAB_SLOT_X, 'top', 6)).toBe(203); // 161/65
  });
});

describe('side background', () => {
  it('defaults to TRADEBACKING_LIGHT at transparency 150', () => {
    expect(SIDE_TRANSPARENCY_DEFAULT).toBe(0);
    expect(sideBackgroundFill(SIDE_TRANSPARENCY_DEFAULT)).toEqual({ sprite: 'tradebackingLight', alpha: 105 / 255 });
  });

  it('is TRADEBACKING_DARK, opaque, with side transparency 1', () => {
    expect(sideBackgroundFill(1)).toEqual({ sprite: 'tradebackingDark', alpha: 1 });
  });

  it('reads IF3 transparency as 0 opaque to 255 invisible', () => {
    expect(ifTransAlpha(0)).toBe(1);
    expect(ifTransAlpha(255)).toBe(0);
    expect(ifTransAlpha(140)).toBeCloseTo(115 / 255);
  });
});
