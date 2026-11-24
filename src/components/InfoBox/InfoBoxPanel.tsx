import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_GAME_PANEL_POSITION, type InfoboxPinTarget, type UIPosition } from '../../hooks/usePersistedSettings';
import {
  type ClientLayoutMode,
  gamePanelAttachmentMetrics,
  MODERN_PANEL,
  type Size,
} from '../../layout/osrsClientLayout';
import { chatboxInfoboxGrid } from '../../layout/topChromeLayout';
import type { SimulationState } from '../../types/simulation';
import type { ExclusionRect } from '../DraggablePanel';
import { DraggablePanel, TUTORIAL_PANEL_MOVED_EVENT } from '../DraggablePanel';
import { GAME_PANEL_ICON_BAR_HEIGHT } from '../GamePanel';
import { SNAP_GAP_PX } from '../snap';
import { useTooltip, useTooltipScale } from '../Tooltip';
import { InfoBoxOverlay } from './InfoBoxOverlay';
import type { InfoBoxSettings } from './selectInfoboxes';
import { selectInfoboxes } from './selectInfoboxes';

/**
 * Infobox tile geometry — kept in sync with InfoBox.css.
 *
 * The 1px translucent border is counted INSIDE the 32×32 rect (border-box), so the
 * rendered tile is exactly 32×32 and matches the panelWidth/panelHeight math below.
 *
 * Width is tuned to fit a single OSRS game-panel row (6 tiles = 32*6 + 2*5 gaps =
 * 202px) which is just under the 204px GamePanel width, so the strip can sit flush
 * along the panel's top edge with the strip's leading edge aligned to the panel's
 * leading edge.
 */
const TILE_SIZE = 32;
const TILE_GAP = 2;
const COLS_PER_ROW = 6;

/**
 * Infobox scale damping.
 *
 * The strip lives inside a DraggablePanel that scales linearly with `uiScale`
 * (1.0 -> 2.0), while the chrome it sits beside (the chatbox, the launcher row)
 * does not grow with it. Handing the strip that raw scale painted it at 2x,
 * far too big to read as part of the same screen.
 *
 * The same curve applies to EVERY pin target. The strip is one surface with one
 * size; only where it is anchored changes with the setting, never how big it
 * paints.
 */
const INFOBOX_SCALE_DAMP = 0.35;

/** damp(s) = 1 + (s - 1) * k. 1.0 at uiScale 1.0; ~1.35 at the 2.0 cap when k=0.35. */
export function dampedInfoboxScale(uiScale: number): number {
  return 1 + (uiScale - 1) * INFOBOX_SCALE_DAMP;
}

/**
 * Per-tile content scale applied INSIDE the DraggablePanel's own
 * `scale={uiScale}` transform: net painted size = base * contentScale * uiScale.
 *
 * Only SIZE is damped, never POSITION: every anchor below is derived from the
 * live rect of whatever the strip is pinned to, so the strip keeps tracking the
 * scaled UI exactly.
 *
 * We do NOT touch the DraggablePanel `scale` prop to achieve this (that is the
 * shared global scale the strip reads AND writes back via onScaleChange;
 * bending it would corrupt GamePanel/Minimap and the Alt+scroll round-trip).
 * The same factor feeds the panel geometry below, so the snap rect always
 * matches what is painted. Clamped to <=1 so the strip never grows FASTER than
 * the linear baseline; a non-positive uiScale degrades to parity (1).
 */
export function infoboxContentScale(uiScale: number): number {
  if (uiScale <= 0) return 1;
  return Math.min(1, dampedInfoboxScale(uiScale) / uiScale);
}

interface InfoBoxPanelProps {
  simulationState: SimulationState;
  infoBoxSettings?: InfoBoxSettings;
  /** Which client layout the game panel is drawn as — changes the box the strip attaches to. */
  clientLayoutMode?: ClientLayoutMode;
  /**
   * `null` (or undefined) = the free strip's default: flush above the GamePanel's
   * default slot, left-aligned with it, at the current UI scale. Once the user
   * drags, the parent passes a concrete UIPosition here and the strip stays where
   * they put it; Alt+right-click hands back `null`.
   */
  position?: UIPosition | null;
  onPositionChange?: (position: UIPosition | null) => void;
  viewportWidth?: number;
  viewportHeight?: number;
  exclusionRects?: ExclusionRect[];
  /**
   * Current GamePanel position, the fallback anchor for the 'inventory' pin until the
   * panel's rendered transform has been read. The free strip's default ignores it: it
   * sits above the GamePanel's DEFAULT slot, and follows the panel only while docked.
   */
  gamePanelPosition?: UIPosition;
  /**
   * Where the strip is pinned. Chosen via Settings → Interface → "Infobox
   * position".
   *
   * - 'hud' (shown as "Chatbox"): locked above the chatbox at `chatboxAnchor`, in
   *   balanced rows no wider than its `maxWidth`, growing upward. Every tile stays
   *   visible; nothing scrolls.
   * - 'inventory' (default): locked flush above the inventory/game panel,
   *   left-aligned, ignoring any persisted `position`.
   * - 'free': free-floating draggable panel using the stored `position`.
   */
  pinTarget?: InfoboxPinTarget;
  /**
   * The Chatbox anchor, in this overlay's pixels (layout/topChromeLayout.ts
   * `chatboxInfoboxAnchor`): the rows' left edge, the line their bottom sits on,
   * and the widest they may run (the chatbox's width).
   */
  chatboxAnchor?: { readonly left: number; readonly bottom: number; readonly maxWidth: number };
}

/**
 * Compute the strip's "attached" position so it sits flush above the
 * GamePanel with the strip's leading edge aligned to the panel's leading
 * edge — the same OSRS-style stacking the strip uses by default.
 *
 * Two valid call shapes (enforced via discriminated args so callers can't
 * accidentally land in the top-anchor branch without supplying panelHeight):
 *
 *   - **No gamePanelPosition** → the default-slot math is used
 *     (anchorX='right', anchorY='bottom', GamePanel at its default slot).
 *     `panelHeight` is irrelevant in this branch and may be omitted.
 *   - **With gamePanelPosition** → strip position is derived from the
 *     panel's anchors and offsets. `panelHeight` is REQUIRED because the
 *     top-anchor branch needs it to subtract the strip's own height when
 *     pinning the strip above a top-anchored GamePanel.
 */
export type ComputeInfoboxDefaultPositionArgs = (
  | {
      panelWidth: number;
      uiScale: number;
      gamePanelPosition?: undefined;
      panelHeight?: number;
    }
  | {
      panelWidth: number;
      panelHeight: number;
      uiScale: number;
      gamePanelPosition: UIPosition;
    }
) & {
  /**
   * The game panel's outer box. Defaults to modern's 204x275 body; classic and
   * fixed hand in the 241x335 column instead, since that is what the strip has
   * to align with and clear.
   */
  gamePanelMetrics?: Size;
};

export function computeInfoboxDefaultPosition(args: ComputeInfoboxDefaultPositionArgs): UIPosition {
  const { panelWidth, uiScale, gamePanelPosition } = args;
  const gamePanel = args.gamePanelMetrics ?? MODERN_PANEL;

  if (!gamePanelPosition) {
    return {
      x: Math.max(0, (gamePanel.width - panelWidth) * uiScale),
      y: Math.round(GAME_PANEL_ICON_BAR_HEIGHT * uiScale) + 2 + gamePanel.height * uiScale + SNAP_GAP_PX,
      anchorX: 'right',
      anchorY: 'bottom',
    };
  }

  // panelHeight is required by the discriminated args when gamePanelPosition
  // is supplied, so the union narrowing makes it safe to read here.
  const { panelHeight } = args;

  // Strip's leading edge aligned with the GamePanel's leading edge.
  //  - Panel anchored RIGHT: the panel's right edge sits gp.x from the
  //    viewport right. To put the strip's RIGHT edge `widthDelta` further
  //    in (so its LEFT edge aligns with the panel's LEFT edge), bump strip.x
  //    by widthDelta.
  //  - Panel anchored LEFT: the panel's left edge sits gp.x from the viewport
  //    left, and the strip's LEFT edge must match — share x directly.
  const widthDelta = Math.max(0, (gamePanel.width - panelWidth) * uiScale);
  const x = gamePanelPosition.x + (gamePanelPosition.anchorX === 'right' ? widthDelta : 0);

  // Strip's BOTTOM edge sits SNAP_GAP_PX above the GamePanel's TOP edge.
  //  - Panel anchored BOTTOM: panel top is `gp.y + GAME_PANEL_HEIGHT*scale`
  //    from viewport bottom; strip's bottom is that + SNAP_GAP_PX. Anchor the
  //    strip to bottom so the bottom edge is positioned directly.
  //  - Panel anchored TOP: panel top is `gp.y` from viewport top; strip's TOP
  //    edge must sit at `gp.y - SNAP_GAP_PX - panelHeight*scale`. Anchor the
  //    strip to top so its top edge is positioned directly. Clamped at 0 so
  //    the strip never asks DraggablePanel for a negative inset (which would
  //    snap-back via the viewport clamp anyway, but feels cleaner here).
  let y: number;
  let anchorY: 'top' | 'bottom';
  if (gamePanelPosition.anchorY === 'bottom') {
    y = gamePanelPosition.y + gamePanel.height * uiScale + SNAP_GAP_PX;
    anchorY = 'bottom';
  } else {
    y = Math.max(0, gamePanelPosition.y - SNAP_GAP_PX - panelHeight * uiScale);
    anchorY = 'top';
  }

  return { x, y, anchorX: gamePanelPosition.anchorX, anchorY };
}

/**
 * Parse the `translate3d(<x>px, <y>px, 0)` value DraggablePanel writes onto
 * its outer wrapper. Returns null if the transform isn't in that shape (e.g.
 * pre-mount, or after a setStyle('') reset).
 *
 * Reading `style.transform` is OM-only — no layout flush — so this helper is
 * safe to call from rAF-driven hot paths.
 */
const TRANSLATE3D_RE = /translate3d\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/;

export function parseTranslate3d(transform: string): { left: number; top: number } | null {
  const m = TRANSLATE3D_RE.exec(transform);
  if (!m) return null;
  return { left: Number.parseFloat(m[1]), top: Number.parseFloat(m[2]) };
}

/**
 * Given the GamePanel's screen-space top-left and the strip's scaled height,
 * compute where the infobox strip should be rendered so its LEFT edge aligns
 * with the GamePanel's LEFT edge and its BOTTOM edge sits SNAP_GAP_PX above
 * the GamePanel's TOP edge. Clamped at the viewport's top edge so the strip
 * never paints at a negative offset when the GamePanel is dragged into the
 * top of a fixed-resolution viewport.
 */
export function computeStripScreenPosition({
  gamePanelLeft,
  gamePanelTop,
  stripScaledHeight,
}: {
  gamePanelLeft: number;
  gamePanelTop: number;
  stripScaledHeight: number;
}): { left: number; top: number } {
  return {
    left: gamePanelLeft,
    top: Math.max(0, gamePanelTop - SNAP_GAP_PX - stripScaledHeight),
  };
}

/** Independent draggable wrapper around the infobox strip. */
export const InfoBoxPanel: React.FC<InfoBoxPanelProps> = ({
  simulationState,
  infoBoxSettings,
  clientLayoutMode = 'modern',
  position,
  onPositionChange,
  viewportWidth,
  viewportHeight,
  exclusionRects,
  gamePanelPosition,
  pinTarget = 'inventory',
  chatboxAnchor,
}) => {
  // Mirror GamePanel/Minimap: read scale from TooltipContext directly so the
  // strip stays in sync with the rest of the UI when the user Alt+scrolls
  // anywhere. Treating scale as a prop made this panel a write-only consumer
  // — it would render at the right scale on mount but Alt+scroll over the
  // strip itself only mutated DraggablePanel-local state and desynced from
  // the persisted setting.
  const { setScale: setUiScale } = useTooltip();
  const uiScale = useTooltipScale();
  const infoboxes = useMemo(
    () => selectInfoboxes(simulationState, infoBoxSettings),
    [simulationState, infoBoxSettings],
  );

  const contentScale = useMemo(() => infoboxContentScale(uiScale), [uiScale]);

  const { panelWidth, panelHeight, wrapWidth } = useMemo<{
    panelWidth: number;
    panelHeight: number;
    /** Where the row wraps. */
    wrapWidth?: number;
  }>(() => {
    const count = Math.max(1, infoboxes.length);
    // Geometry is expressed in the DraggablePanel's pre-scale content space, so
    // it uses the SAME damped tile/gap the CSS paints (`--infobox-scale`).
    // DraggablePanel then multiplies by uiScale, yielding the damped net size
    // while keeping the snap rect aligned to the rendered tiles.
    const tile = TILE_SIZE * contentScale;
    const gap = TILE_GAP * contentScale;

    // Chatbox: as many tiles a row as fit the chatbox's width, spread evenly over
    // the fewest rows (8 + 8, never 14 + 2), every tile visible. Free and Inventory
    // keep rows of up to six: Inventory lines up with the side panel's width.
    const { columns: cols, rows } =
      pinTarget === 'hud' && chatboxAnchor
        ? chatboxInfoboxGrid({ count, maxWidth: chatboxAnchor.maxWidth, tile, gap, scale: uiScale })
        : { columns: Math.min(count, COLS_PER_ROW), rows: Math.ceil(count / Math.min(count, COLS_PER_ROW)) };
    return {
      panelWidth: cols * tile + Math.max(0, cols - 1) * gap,
      panelHeight: rows * tile + Math.max(0, rows - 1) * gap,
      // DraggablePanel paints its box on whole device pixels, which can trim a fraction
      // of a pixel off this exact width, and a flex row that is short by any amount
      // wraps its last tile. One trailing gap of slack keeps the row at `cols` tiles.
      wrapWidth: cols * (tile + gap),
    };
  }, [infoboxes.length, contentScale, pinTarget, chatboxAnchor, uiScale]);

  // Mirror the band GamePanel keeps its modern body out of (ICON_BAR_HEIGHT*scale + 2
  // above the frame bottom) so the strip lands flush above the *rendered* panel, not
  // the stored position. Classic and fixed build both tab rows into the column, so
  // there is no band to clear.
  //
  // The free strip is derived from the panel's DEFAULT slot, a corner that stays put
  // through every resize, so its default is exact at any scale and window size. The
  // registry docks it to the panel at mount; a scale change re-expresses the same
  // default at the new size without undocking it (see PanelSnapRegistry).
  const gamePanelMetrics = useMemo(() => gamePanelAttachmentMetrics(clientLayoutMode), [clientLayoutMode]);
  const hostPosition = pinTarget === 'free' ? DEFAULT_GAME_PANEL_POSITION : gamePanelPosition;
  const clampedGamePanelPosition = useMemo<UIPosition | undefined>(() => {
    if (!hostPosition) return undefined;
    if (clientLayoutMode !== 'modern') return hostPosition;
    // Exactly the band GamePanel keeps its body out of, so the default lands on the
    // solved panel edge rather than a rounded pixel beside it.
    const minY = GAME_PANEL_ICON_BAR_HEIGHT * uiScale + 2;
    return hostPosition.y >= minY ? hostPosition : { ...hostPosition, y: minY };
  }, [hostPosition, uiScale, clientLayoutMode]);

  const computedDefault = useMemo<UIPosition>(
    () =>
      computeInfoboxDefaultPosition({
        panelWidth,
        panelHeight,
        uiScale,
        gamePanelPosition: clampedGamePanelPosition,
        gamePanelMetrics,
      }),
    [panelWidth, panelHeight, uiScale, clampedGamePanelPosition, gamePanelMetrics],
  );

  // `gamePanelPosition` is the PERSISTED position — DraggablePanel
  // deliberately never writes exclusion-rect displacement back into it
  // (opening a sidebar must not mutate saved positions). But the rendered
  // panel IS pushed aside by exclusion rects, and each panel resolves
  // exclusions against its own rect, so a strip position derived from the
  // persisted value drifts off the rendered panel by the displacement delta
  // (e.g. ~20px with the Plugins sidebar open) — and no amount of UI-scale
  // changing fixes it. Anchoring to the rendered transform keeps the strip
  // flush above the panel in every case: sidebars open/closed, scale
  // changes, drag releases.
  //
  // The value is (re)read in a layout effect after every render commit —
  // BEFORE the browser paints — so ordinary React-driven GamePanel moves
  // (scale / persisted position / viewport / exclusion changes) re-anchor
  // the strip in the same frame as the panel's own move. Landing pre-paint
  // matters: it lets the strip's DraggablePanel FLIP the correction, so the
  // strip glides in lockstep with the GamePanel's 120ms resize animation
  // instead of teleporting a frame later. During drags the panel-moved
  // listener below also feeds this state per frame, keeping it fresh.
  const [gpRendered, setGpRendered] = useState<{ left: number; top: number } | null>(null);

  const applyGpRendered = useCallback((parsed: { left: number; top: number } | null) => {
    setGpRendered((prev) => {
      if (prev === parsed) return prev;
      if (prev && parsed && prev.left === parsed.left && prev.top === parsed.top) return prev;
      return parsed;
    });
  }, []);

  const readRenderedGamePanelPosition = useCallback(() => {
    const gpEl = document.querySelector<HTMLElement>('[data-tutorial="game-panel"]');
    applyGpRendered(gpEl ? parseTranslate3d(gpEl.style.transform) : null);
  }, [applyGpRendered]);

  useLayoutEffect(() => {
    if (pinTarget !== 'inventory') {
      setGpRendered((prev) => (prev === null ? prev : null));
      return;
    }
    readRenderedGamePanelPosition();
  });

  // Attached position derived from the rendered panel; falls back to the
  // persisted-position math until the panel's transform has been observed
  // (first paint, or no GamePanel mounted at all in standalone/test callers).
  const attachedPosition = useMemo<UIPosition>(() => {
    if (!gpRendered) return computedDefault;
    const { left, top } = computeStripScreenPosition({
      gamePanelLeft: gpRendered.left,
      gamePanelTop: gpRendered.top,
      stripScaledHeight: panelHeight * uiScale,
    });
    return { x: left, y: top, anchorX: 'left', anchorY: 'top' };
  }, [gpRendered, computedDefault, panelHeight, uiScale]);

  // Live refs for the GamePanel follow's direct transform writes, kept current each
  // render so its listener reads the latest scaled strip height without being
  // re-created (which would re-subscribe it).
  const panelHeightRef = useRef(panelHeight);
  panelHeightRef.current = panelHeight;
  const uiScaleRef = useRef(uiScale);
  uiScaleRef.current = uiScale;

  // Chatbox: the strip's top-left from its anchor, the bottom of its rows on the anchor's line.
  const chatboxPosition = useMemo<UIPosition | null>(
    () =>
      chatboxAnchor
        ? {
            x: chatboxAnchor.left,
            y: Math.max(0, chatboxAnchor.bottom - panelHeight * uiScale),
            anchorX: 'left',
            anchorY: 'top',
          }
        : null,
    [chatboxAnchor, panelHeight, uiScale],
  );

  // Live-follow the GamePanel during its drag.
  //
  // The GamePanel's drag updates its DOM transform directly via a ref — no
  // React re-render — to stay smooth at 60fps. That means our React-derived
  // `computedDefault` stays stale until the drag ends and `gamePanelPosition`
  // state finally updates. Without intervention the strip jumps to the new
  // position only at drag-release, which feels broken.
  //
  // Fix: subscribe to `tutorial:panel-moved` (already fired by DraggablePanel
  // every drag frame, rAF-batched, free when no other listeners) and mirror
  // the same compositor-friendly trick — read the GamePanel's live transform
  // and write the strip's transform directly. No layout reads (style.transform
  // is OM-only), no synchronous re-renders. The strip's React-driven transform
  // takes over again on the next render.
  //
  // We ALSO feed each per-frame reading into `gpRendered` (batched, off the
  // hot path). This keeps React's idea of the strip position at most one
  // frame behind the painted one, so the commit at drag-release is a
  // no-op-sized correction instead of a leap from the pre-drag position.

  useEffect(() => {
    if (pinTarget !== 'inventory') return;

    let stripEl: HTMLElement | null = null;
    let gpEl: HTMLElement | null = null;
    const resolveElements = (): boolean => {
      if (!stripEl || !stripEl.isConnected) {
        stripEl = document.querySelector<HTMLElement>('[data-tutorial="infobox-panel"]');
      }
      if (!gpEl || !gpEl.isConnected) {
        gpEl = document.querySelector<HTMLElement>('[data-tutorial="game-panel"]');
      }
      return !!(stripEl && gpEl);
    };

    const sync = () => {
      if (!resolveElements()) return;
      // Non-null after resolveElements() returned true.
      const gp = parseTranslate3d(gpEl!.style.transform);
      if (!gp) return;
      const { left, top } = computeStripScreenPosition({
        gamePanelLeft: gp.left,
        gamePanelTop: gp.top,
        stripScaledHeight: panelHeightRef.current * uiScaleRef.current,
      });
      stripEl!.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      applyGpRendered(gp);
    };

    // Initial sync covers the case where the strip mounts mid-drag (rare but
    // possible: a sim tick adds an infobox while the user is dragging the
    // GamePanel). Also harmless when nothing is moving — the computed position
    // already matches.
    sync();

    window.addEventListener(TUTORIAL_PANEL_MOVED_EVENT, sync);
    return () => {
      window.removeEventListener(TUTORIAL_PANEL_MOVED_EVENT, sync);
    };
  }, [pinTarget, applyGpRendered]);

  if (infoboxes.length === 0) {
    return null;
  }

  const isChatboxPinned = pinTarget === 'hud' && chatboxPosition !== null;
  const isInventoryPinned = pinTarget === 'inventory';
  const overlay = (
    <InfoBoxOverlay
      simulationState={simulationState}
      infoBoxSettings={infoBoxSettings}
      contentScale={contentScale}
      wrapWidth={wrapWidth}
      readingOrder={isChatboxPinned}
    />
  );
  const locked = isChatboxPinned || isInventoryPinned;
  const effectivePosition = isChatboxPinned
    ? chatboxPosition
    : isInventoryPinned
      ? attachedPosition
      : (position ?? computedDefault);

  return (
    <DraggablePanel
      defaultPosition={computedDefault}
      position={effectivePosition}
      width={panelWidth}
      height={panelHeight}
      scale={uiScale}
      onPositionChange={pinTarget === 'free' ? onPositionChange : undefined}
      // The default is derived, so "back to default" is no saved position at all.
      onResetPosition={pinTarget === 'free' && onPositionChange ? () => onPositionChange(null) : undefined}
      onScaleChange={setUiScale}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      exclusionRects={exclusionRects}
      locked={locked}
      // A pinned strip lands where its anchor is at once (the GamePanel drag
      // listener writes the transform straight to the DOM), instead of
      // FLIP-gliding in from the previous anchor.
      externallyPositioned={locked}
      pointerPassthrough
      dataTutorial="infobox-panel"
    >
      {overlay}
    </DraggablePanel>
  );
};
