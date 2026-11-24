import type React from 'react';
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio';
import {
  CLASSIC_PANEL_CONTENT,
  type ClientLayoutMode,
  FIXED_PANEL_CONTENT,
  FIXED_SIDE_COLUMN_ORIGIN,
  type Rect,
} from '../../layout/osrsClientLayout';
import { MINIMAP } from '../../resourcePack';
import { PixelSprite, type SpriteSourceRect } from '../PixelSprite';
import { usePanelContentScaleOrNull } from '../panelContentScale';
import {
  BAR_ICON_SIZE,
  BAR_ICON_TOP_INSET,
  paintBar,
  paintBarValue,
  prayerBarColor,
  STATUS_BAR_COLORS,
} from './statusBarsPaint';

/**
 * RuneLite's Status Bars plugin, in its default configuration: a hitpoints bar
 * left of the inventory and a prayer bar right of it.
 *
 * Upstream is RuneLite's `statusbars` package — `StatusBarsOverlay` for the
 * placement, `Viewport` for the per-layout offsets. Every constant below cites
 * the field it is a port of, because they are all magic numbers upstream too and
 * a "tidier" round value silently stops matching the real client. The upstream
 * files' BSD-2-Clause headers, read at RuneLite ced4c4a, are reproduced in
 * licenses.txt and listed in THIRD_PARTY_NOTICES.md.
 */

/** `BarRenderer.DEFAULT_WIDTH`, which is also `StatusBarsConfig.barWidth()`'s default. */
const BAR_WIDTH = 20;
/** `StatusBarsOverlay.HEIGHT` and `.RESIZED_BOTTOM_HEIGHT`. */
const SIDE_COLUMN_BAR_HEIGHT = 252;
const MODERN_BAR_HEIGHT = 272;
/** The y component of `Viewport.FIXED` / `RESIZED_BOX`'s offsets, negated as the overlay does. */
const SIDE_COLUMN_BAR_DY = 4;
/**
 * `Viewport.RESIZED_BOTTOM`'s offsets folded through `RESIZED_BOTTOM_OFFSET_X`
 * (10) and `RESIZED_BOTTOM_OFFSET_Y` (12) at the default bar width, which is
 * what makes the y offset cancel to zero: `location.y - 12 - (-12)`.
 */
const MODERN_LEFT_BAR_DX = 10 - 61;
const MODERN_RIGHT_BAR_DX = 10 - 35;
/**
 * The icon on `StatusBarsOverlay`'s prayer bar is built from
 * `skillIconManager.getSkillImage(Skill.PRAYER, true)`, not from an orb sprite —
 * a byte copy of RuneLite's `skill_icons_small/prayer.png`. Hitpoints stays
 * pack-owned because upstream reads it from the cache too
 * (`loadSprite(SpriteID.OrbIcon.HITPOINTS)`).
 */
export const STATUS_BAR_PRAYER_ICON = '/assets/ui/status-bars/prayer.png';
/**
 * The window onto a pack's 26x26 hitpoints orb icon that normalizes it to the
 * prayer icon beside it. A pack whose art falls outside this window is clipped.
 */
const HITPOINTS_ICON_WINDOW: SpriteSourceRect = { x: 5, y: 6, width: BAR_ICON_SIZE, height: BAR_ICON_SIZE };

export interface StatusBarsPlacement {
  readonly left: Rect;
  readonly right: Rect;
  /** The union both bars fit in — the one canvas covers exactly this. */
  readonly bounds: Rect;
}

function boundsOf(left: Rect, right: Rect): Rect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  };
}

/** `StatusBarsOverlay.render`'s non-`RESIZED_BOTTOM` branch, in the side column's own space. */
function sideColumnPlacement(content: Rect): StatusBarsPlacement {
  const y = content.y + SIDE_COLUMN_BAR_DY;
  const left: Rect = { x: content.x - BAR_WIDTH, y, width: BAR_WIDTH, height: SIDE_COLUMN_BAR_HEIGHT };
  const right: Rect = { x: content.x + content.width, y, width: BAR_WIDTH, height: SIDE_COLUMN_BAR_HEIGHT };
  return { left, right, bounds: boundsOf(left, right) };
}

/**
 * Where both bars sit, in the coordinates of the box the overlay is mounted in:
 * the side column for fixed and classic, the 204x275 panel shell for modern and mobile.
 *
 * Modern's are negative on purpose — upstream hangs them off the left of the
 * side background rather than reserving space, so the inventory never reflows.
 */
export function statusBarsPlacement(mode: ClientLayoutMode): StatusBarsPlacement {
  switch (mode) {
    case 'fixed':
      return sideColumnPlacement({
        x: FIXED_PANEL_CONTENT.x - FIXED_SIDE_COLUMN_ORIGIN.x,
        y: FIXED_PANEL_CONTENT.y - FIXED_SIDE_COLUMN_ORIGIN.y,
        width: FIXED_PANEL_CONTENT.width,
        height: FIXED_PANEL_CONTENT.height,
      });
    case 'classic':
      return sideColumnPlacement(CLASSIC_PANEL_CONTENT);
    // Mobile's side panel is the same 204x275 shell, mounted the same way.
    case 'modern':
    case 'mobile': {
      const left: Rect = { x: MODERN_LEFT_BAR_DX, y: 0, width: BAR_WIDTH, height: MODERN_BAR_HEIGHT };
      const right: Rect = { x: MODERN_RIGHT_BAR_DX, y: 0, width: BAR_WIDTH, height: MODERN_BAR_HEIGHT };
      return { left, right, bounds: boundsOf(left, right) };
    }
  }
}

export interface StatusBarsProps {
  readonly mode: ClientLayoutMode;
  readonly currentHitpoints: number;
  readonly maxHitpoints: number;
  readonly currentPrayer: number;
  readonly maxPrayer: number;
  readonly anyPrayerActive: boolean;
  readonly showValues: boolean;
}

/**
 * Both bar FILLS on ONE canvas spanning their union, with the two icons as `PixelSprite`
 * children over it.
 *
 * Direct painting rather than `PixelComposedLayer`: the fill height moves with
 * every tick, so a cached raster would be a miss on each one and would evict a
 * panel's worth of real sprites from the shared store on the way past.
 */
export const StatusBars: React.FC<StatusBarsProps> = memo(
  ({ mode, currentHitpoints, maxHitpoints, currentPrayer, maxPrayer, anyPrayerActive, showValues }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const uiScale = usePanelContentScaleOrNull() ?? 1;
    const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
    const placement = useMemo(() => statusBarsPlacement(mode), [mode]);
    const { left, right, bounds } = placement;
    const prayerColor = prayerBarColor(anyPrayerActive);

    const paint = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const deviceScale = uiScale * dpr;
      const bufferW = Math.max(1, Math.round(bounds.width * deviceScale));
      const bufferH = Math.max(1, Math.round(bounds.height * deviceScale));
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, bufferW, bufferH);

      const shared = { bounds, deviceScale };
      paintBar(ctx, {
        ...shared,
        bar: left,
        max: maxHitpoints,
        current: currentHitpoints,
        color: STATUS_BAR_COLORS.hitpoints,
      });
      paintBar(ctx, { ...shared, bar: right, max: maxPrayer, current: currentPrayer, color: prayerColor });
      if (showValues) {
        paintBarValue(ctx, { ...shared, bar: left, current: currentHitpoints });
        paintBarValue(ctx, { ...shared, bar: right, current: currentPrayer });
      }
    }, [
      bounds,
      left,
      right,
      currentHitpoints,
      maxHitpoints,
      currentPrayer,
      maxPrayer,
      prayerColor,
      showValues,
      uiScale,
      dpr,
    ]);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      paint();
      canvas.addEventListener('contextrestored', paint);
      return () => canvas.removeEventListener('contextrestored', paint);
    }, [paint]);

    /** `BarRenderer.renderIconsAndCounters` centers the icon across the bar it belongs to. */
    const iconStyle = (bar: Rect): React.CSSProperties => ({
      position: 'absolute',
      left: bar.x + Math.floor(bar.width / 2) - Math.floor(BAR_ICON_SIZE / 2) - bounds.x,
      top: bar.y + BAR_ICON_TOP_INSET - bounds.y,
    });

    return (
      <div
        aria-hidden
        data-status-bars={mode}
        style={{
          position: 'absolute',
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          pointerEvents: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: bounds.width,
            height: bounds.height,
            imageRendering: 'pixelated',
          }}
        />
        <PixelSprite src={MINIMAP.orbHitpointsIcon} sourceRect={HITPOINTS_ICON_WINDOW} style={iconStyle(left)} />
        <PixelSprite src={STATUS_BAR_PRAYER_ICON} style={iconStyle(right)} />
      </div>
    );
  },
);
