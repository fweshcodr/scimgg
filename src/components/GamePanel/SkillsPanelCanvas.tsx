import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { loadCachedImage } from '../../util/imageCache';
import { log } from '../../util/Logger';
import { usePanelContentScale } from '../panelContentScale';
import { getComposedRaster } from '../pixelSpriteStore';
import { cellOrigin, ICON, ICON_X, ICON_Y, PANEL_H, PANEL_W, RIGHT_TILE_X, TILE } from './skillsPanelLayout';

/** A resolved skill-icon source, aligned by array index to the canonical cell order. */
export interface SkillIconSource {
  readonly name: string;
  readonly src: string;
}

interface SkillsPanelCanvasProps {
  /** Resolved `stats/new_tile_left.png`. */
  readonly tileLeft: string;
  /** Resolved `stats/new_tile_right_with_slash.png`. */
  readonly tileRightWithSlash: string;
  /** Resolved skill icons in canonical grid order (index maps to `cellOrigin(index)`). */
  readonly icons: readonly SkillIconSource[];
}

/**
 * The panel's backing buffer in device pixels.
 *
 * Rounded, not ceiled, so the canvas-to-device blit stays ~1:1 rather than resampling the whole
 * panel a second time at a fractional scale.
 */
export function getBackingSize(deviceScale: number): { readonly width: number; readonly height: number } {
  return {
    width: Math.round(PANEL_W * deviceScale),
    height: Math.round(PANEL_H * deviceScale),
  };
}

/** Resolves from `imageCache`, so a preloaded icon needs no load at all. */
const loadImage = (src: string): Promise<HTMLImageElement | null> => loadCachedImage(src, 'immediate');

/**
 * Single-canvas renderer for the Skills panel's 46 tile halves and 23 icons.
 *
 * As separate <img> elements they showed 1-device-pixel seams at fractional UI scales:
 * Firefox's WebRender snaps each primitive's dest rect to device pixels independently, so
 * adjacent halves and the overlapping grid cells (COL_PITCH 63 < CELL_W 67, ROW_PITCH 30 <
 * CELL_H 36) round apart. One raster has no inter-tile boundaries to open. Same strategy as
 * the panel chrome — see the block above BORDER_TILE_SIZE in GamePanel.tsx.
 *
 * The density MUST come from `usePanelContentScale`, not the raw UI scale. Classic and fixed
 * put the tab rows and this panel in ONE zoom-scaled DraggablePanel whose cover factor is
 * ~0.4% off the raw scale, and a raster built at the raw scale is resampled by that ratio.
 */
export const SkillsPanelCanvas: React.FC<SkillsPanelCanvasProps> = ({ tileLeft, tileRightWithSlash, icons }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiScale = usePanelContentScale();
  // Track DPR for users who drag the window between monitors of differing density.
  const [dpr, setDpr] = useState<number>(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [dpr]);

  useEffect(() => {
    let cancelled = false;
    const deviceScale = uiScale * dpr;
    Promise.all([loadImage(tileLeft), loadImage(tileRightWithSlash), ...icons.map((icon) => loadImage(icon.src))])
      .then(([leftTile, rightTile, ...iconImages]) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!leftTile || !rightTile) {
          // A required tile is missing at this scale. Blanking the canvas leaves the level
          // overlays and panel chrome rendering; keeping the old raster would show the previous
          // tiles, at the previous density.
          canvas.width = 0;
          canvas.height = 0;
          return;
        }

        const { width: bufferW, height: bufferH } = getBackingSize(deviceScale);
        canvas.width = bufferW;
        canvas.height = bufferH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, bufferW, bufferH);
        // The composed raster is already at the backing size, so this is a 1:1 blit.
        ctx.imageSmoothingEnabled = false;

        // Compose the whole panel at its LOGICAL size, then resample that one raster.
        //
        // Every join in this surface is between pieces that abut or overlap: the two halves of
        // a cell share an edge at RIGHT_TILE_X, and the cells themselves overlap (CELL_W 67 on a
        // COL_PITCH 63). Resampling each piece to its own device box makes every one of those
        // joins round independently, so at some scales a hairline of panel shows through and at
        // others a column is drawn twice. Drawn at 1:1 first, they are exact integer boundaries
        // between whole source pixels, and the reconstruction sees one continuous image.
        const composed = getComposedRaster(
          `skills|${tileLeft}|${tileRightWithSlash}|${icons.map((i) => i.src).join(',')}`,
          PANEL_W,
          PANEL_H,
          bufferW,
          bufferH,
          (flat) => {
            // Canonical order: left tile, right-with-slash tile, then the skill icon on top.
            // Later cells overdraw earlier ones.
            icons.forEach((_icon, index) => {
              const origin = cellOrigin(index);
              flat.drawImage(leftTile, origin.x, origin.y, TILE, TILE);
              flat.drawImage(rightTile, origin.x + RIGHT_TILE_X, origin.y, TILE, TILE);
              const iconImage = iconImages[index];
              if (iconImage) flat.drawImage(iconImage, origin.x + ICON_X, origin.y + ICON_Y, ICON, ICON);
            });
          },
        );
        if (composed) ctx.drawImage(composed, 0, 0);
      })
      .catch((error: unknown) => {
        // `loadCachedImage` resolves rather than rejects, so anything arriving here came from the
        // composition itself — a tainted-canvas readback or a failed allocation. Silence would
        // leave a blank panel with nothing to explain it.
        log.error('SkillsPanelCanvas', 'Failed to compose the skills panel:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [uiScale, dpr, tileLeft, tileRightWithSlash, icons]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="skills-canvas"
      data-tile-left={tileLeft}
      data-tile-right={tileRightWithSlash}
      data-skill-icons={JSON.stringify(icons)}
      style={{
        position: 'absolute',
        inset: 0,
        width: PANEL_W,
        height: PANEL_H,
        zIndex: 0,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  );
};
