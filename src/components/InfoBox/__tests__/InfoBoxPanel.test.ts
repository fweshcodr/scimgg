import { describe, expect, it } from 'vitest';
import type { UIPosition } from '../../../hooks/usePersistedSettings';
import {
  CLASSIC_COLUMN,
  FIXED_SIDE_COLUMN_SIZE,
  gamePanelAttachmentMetrics,
  MODERN_PANEL,
} from '../../../layout/osrsClientLayout';
import { GAME_PANEL_HEIGHT, GAME_PANEL_ICON_BAR_HEIGHT, GAME_PANEL_WIDTH } from '../../GamePanel';
import { SNAP_GAP_PX } from '../../snap';
import {
  computeInfoboxDefaultPosition,
  computeStripScreenPosition,
  dampedInfoboxScale,
  infoboxContentScale,
  parseTranslate3d,
} from '../InfoBoxPanel';

describe('computeInfoboxDefaultPosition', () => {
  it('matches the default one-scale six-tile strip position', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: 190, uiScale: 1 })).toEqual({
      x: 14,
      y: GAME_PANEL_ICON_BAR_HEIGHT + 2 + GAME_PANEL_HEIGHT + SNAP_GAP_PX,
      anchorX: 'right',
      anchorY: 'bottom',
    });
  });

  it('scales the default position at uiScale=2', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: 190, uiScale: 2 })).toEqual({
      x: 28,
      y: Math.round(GAME_PANEL_ICON_BAR_HEIGHT * 2) + 2 + GAME_PANEL_HEIGHT * 2 + SNAP_GAP_PX,
      anchorX: 'right',
      anchorY: 'bottom',
    });
  });

  it('scales the default position at uiScale=0.85', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: 190, uiScale: 0.85 })).toEqual({
      x: (GAME_PANEL_WIDTH - 190) * 0.85,
      y: Math.round(GAME_PANEL_ICON_BAR_HEIGHT * 0.85) + 2 + GAME_PANEL_HEIGHT * 0.85 + SNAP_GAP_PX,
      anchorX: 'right',
      anchorY: 'bottom',
    });
  });

  it('uses x=0 when the strip is full GamePanel width', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: GAME_PANEL_WIDTH, uiScale: 1 }).x).toBe(0);
  });

  it('uses x=0 defensively when the strip is wider than GamePanel', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: 300, uiScale: 1 }).x).toBe(0);
  });

  it('always anchors to the viewport bottom-right', () => {
    expect(computeInfoboxDefaultPosition({ panelWidth: 190, uiScale: 1 })).toMatchObject({
      anchorX: 'right',
      anchorY: 'bottom',
    });
  });

  describe('with gamePanelPosition', () => {
    it('tracks a right/bottom-anchored GamePanel dragged left', () => {
      const gp = {
        x: 100,
        y: GAME_PANEL_ICON_BAR_HEIGHT + 2,
        anchorX: 'right' as const,
        anchorY: 'bottom' as const,
      };
      expect(
        computeInfoboxDefaultPosition({ panelWidth: 190, panelHeight: 30, uiScale: 1, gamePanelPosition: gp }),
      ).toEqual({
        x: 100 + (GAME_PANEL_WIDTH - 190),
        y: GAME_PANEL_ICON_BAR_HEIGHT + 2 + GAME_PANEL_HEIGHT + SNAP_GAP_PX,
        anchorX: 'right',
        anchorY: 'bottom',
      });
    });

    it('tracks a left/bottom-anchored GamePanel', () => {
      const gp = { x: 50, y: 80, anchorX: 'left' as const, anchorY: 'bottom' as const };
      // Strip's LEFT edge aligns with panel's LEFT edge → share x directly.
      expect(
        computeInfoboxDefaultPosition({ panelWidth: 190, panelHeight: 30, uiScale: 1, gamePanelPosition: gp }),
      ).toEqual({
        x: 50,
        y: 80 + GAME_PANEL_HEIGHT + SNAP_GAP_PX,
        anchorX: 'left',
        anchorY: 'bottom',
      });
    });

    it('tracks a top-anchored GamePanel and flips the strip to top anchor', () => {
      const gp = { x: 12, y: 200, anchorX: 'right' as const, anchorY: 'top' as const };
      const panelHeight = 30;
      expect(
        computeInfoboxDefaultPosition({ panelWidth: 190, panelHeight, uiScale: 1, gamePanelPosition: gp }),
      ).toEqual({
        x: 12 + (GAME_PANEL_WIDTH - 190),
        y: 200 - SNAP_GAP_PX - panelHeight,
        anchorX: 'right',
        anchorY: 'top',
      });
    });

    it('clamps y to 0 if the GamePanel is too close to the viewport top', () => {
      const gp = { x: 0, y: 5, anchorX: 'right' as const, anchorY: 'top' as const };
      const result = computeInfoboxDefaultPosition({
        panelWidth: 190,
        panelHeight: 30,
        uiScale: 1,
        gamePanelPosition: gp,
      });
      expect(result.y).toBe(0);
      expect(result.anchorY).toBe('top');
    });

    it('scales the GamePanel-relative offset at uiScale=2', () => {
      const gp = { x: 40, y: 50, anchorX: 'right' as const, anchorY: 'bottom' as const };
      expect(
        computeInfoboxDefaultPosition({ panelWidth: 190, panelHeight: 30, uiScale: 2, gamePanelPosition: gp }),
      ).toEqual({
        x: 40 + (GAME_PANEL_WIDTH - 190) * 2,
        y: 50 + GAME_PANEL_HEIGHT * 2 + SNAP_GAP_PX,
        anchorX: 'right',
        anchorY: 'bottom',
      });
    });
  });
});

describe('parseTranslate3d', () => {
  it('parses a standard translate3d value', () => {
    expect(parseTranslate3d('translate3d(100px, 200px, 0)')).toEqual({ left: 100, top: 200 });
  });

  it('parses fractional and negative values', () => {
    expect(parseTranslate3d('translate3d(-12.5px, 0px, 0)')).toEqual({ left: -12.5, top: 0 });
  });

  it('tolerates extra whitespace around the numbers', () => {
    expect(parseTranslate3d('translate3d(  42px ,   18px , 0)')).toEqual({ left: 42, top: 18 });
  });

  it('returns null for an empty transform', () => {
    expect(parseTranslate3d('')).toBeNull();
  });

  it('returns null for non-translate3d transforms', () => {
    expect(parseTranslate3d('matrix(1, 0, 0, 1, 10, 20)')).toBeNull();
    expect(parseTranslate3d('scale(2)')).toBeNull();
  });
});

describe('computeStripScreenPosition', () => {
  it('aligns the strip LEFT edge with the GamePanel LEFT edge', () => {
    const result = computeStripScreenPosition({
      gamePanelLeft: 800,
      gamePanelTop: 500,
      stripScaledHeight: 30,
    });
    expect(result.left).toBe(800);
  });

  it('places the strip BOTTOM edge SNAP_GAP_PX above the GamePanel TOP edge', () => {
    const result = computeStripScreenPosition({
      gamePanelLeft: 0,
      gamePanelTop: 500,
      stripScaledHeight: 60,
    });
    expect(result.top + 60).toBe(500 - SNAP_GAP_PX);
  });

  it('clamps strip TOP to 0 when the GamePanel is dragged into the viewport top', () => {
    const result = computeStripScreenPosition({
      gamePanelLeft: 0,
      gamePanelTop: 10,
      stripScaledHeight: 60, // taller than gpTop - SNAP_GAP_PX
    });
    expect(result.top).toBe(0);
  });

  it('scales correctly with a larger stripScaledHeight at uiScale=2', () => {
    const result = computeStripScreenPosition({
      gamePanelLeft: 100,
      gamePanelTop: 500,
      stripScaledHeight: 30 * 2,
    });
    expect(result).toEqual({ left: 100, top: 500 - SNAP_GAP_PX - 60 });
  });
});

describe('dampedInfoboxScale', () => {
  it('is parity (1.0) at uiScale 1.0', () => {
    expect(dampedInfoboxScale(1)).toBe(1);
  });

  it('grows at ~0.35x rate above 1.0 (1.35 at the 2.0 cap)', () => {
    expect(dampedInfoboxScale(2)).toBeCloseTo(1.35, 5);
    expect(dampedInfoboxScale(1.5)).toBeCloseTo(1.175, 5);
  });
});

describe('infoboxContentScale', () => {
  it('is parity (1.0) at uiScale 1.0', () => {
    expect(infoboxContentScale(1)).toBe(1);
  });

  it('dampens the strip against the fixed-size HUD instead of growing it 1:1', () => {
    expect(infoboxContentScale(2)).toBeCloseTo(0.675, 5);
    expect(infoboxContentScale(2) * 2).toBeCloseTo(dampedInfoboxScale(2), 5);
    expect(infoboxContentScale(1.5) * 1.5).toBeCloseTo(dampedInfoboxScale(1.5), 5);
  });

  it('clamps to <=1 so the strip never grows faster than the linear baseline', () => {
    expect(infoboxContentScale(0.5)).toBe(1);
  });

  it('degrades to parity for a non-positive scale', () => {
    expect(infoboxContentScale(0)).toBe(1);
    expect(infoboxContentScale(-1)).toBe(1);
  });
});

describe('computeInfoboxDefaultPosition across client layouts', () => {
  // The strip aligns its leading edge with the game panel's and clears its top edge, so
  // the box it attaches to differs per layout: modern's 204x275 body vs classic/fixed's
  // taller side column.
  const GAME_PANEL: UIPosition = { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' };

  it('defaults to the modern panel body when no metrics are supplied', () => {
    const withDefault = computeInfoboxDefaultPosition({ panelWidth: 100, panelHeight: 20, uiScale: 1 });
    const withModern = computeInfoboxDefaultPosition({
      panelWidth: 100,
      panelHeight: 20,
      uiScale: 1,
      gamePanelMetrics: MODERN_PANEL,
    });

    expect(withDefault).toEqual(withModern);
  });

  it('clears the taller classic column instead of the modern body', () => {
    const modern = computeInfoboxDefaultPosition({
      panelWidth: 100,
      panelHeight: 20,
      uiScale: 1,
      gamePanelPosition: GAME_PANEL,
      gamePanelMetrics: MODERN_PANEL,
    });
    const classic = computeInfoboxDefaultPosition({
      panelWidth: 100,
      panelHeight: 20,
      uiScale: 1,
      gamePanelPosition: GAME_PANEL,
      gamePanelMetrics: CLASSIC_COLUMN,
    });

    expect(classic.y - modern.y).toBe(CLASSIC_COLUMN.height - MODERN_PANEL.height);
    expect(classic.x - modern.x).toBe(CLASSIC_COLUMN.width - MODERN_PANEL.width);
  });

  it('uses the fixed side column for fixed layout', () => {
    expect(gamePanelAttachmentMetrics('fixed')).toEqual(FIXED_SIDE_COLUMN_SIZE);
    expect(gamePanelAttachmentMetrics('classic')).toEqual(CLASSIC_COLUMN);
    expect(gamePanelAttachmentMetrics('modern')).toEqual(MODERN_PANEL);
  });
});
