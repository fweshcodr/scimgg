import React from 'react';
import { useRemainingSeconds } from '../../contexts/TickProgressContext';
import { isSyntheticInput, runSyntheticInput } from '../../input/inputProvenance';
import { isTouchPointer, listenCompatMouseSwallow } from '../../input/touchHold';
import { OSM_BUFF_BAR, osmBuffTile } from '../../layout/osmHud';
import { getItemSpriteUrl } from '../../services/ItemSpriteService';
import type { SimulationState } from '../../types/simulation';
import { getReplayPointerTarget } from '../../util/viewportBounds';
import { PixelSprite } from '../PixelSprite';
import { usePanelContentScaleOrNull } from '../panelContentScale';
import type { TooltipContent } from '../Tooltip';
import { MOBILE_TAP_TOOLTIP_MS, TOOLTIP_COLORS, useTooltip } from '../Tooltip';
import type { InfoBoxData } from './infoboxTypes';
import { type InfoBoxSettings, selectInfoboxes } from './selectInfoboxes';
import { formatSecondsClock } from './timerFormat';
import './InfoBox.css';

interface InfoBoxOverlayProps {
  simulationState: SimulationState;
  infoBoxSettings?: InfoBoxSettings;
  /**
   * Per-tile content scale (<=1) that dampens infobox growth relative to the
   * global UI scale so the strip stays in the size family of the chrome beside it (the
   * chatbox, the launcher row). Exposed to CSS as `--infobox-scale`. Defaults to 1 (no
   * damping) for standalone callers.
   */
  contentScale?: number;
  /**
   * Row width in content px, when the column count is fixed by the caller rather than
   * by the container. Without it the strip fills its container.
   */
  wrapWidth?: number;
  /**
   * Rows in reading order, first tiles on top, still anchored at the bottom edge so the strip
   * grows upward (the Chatbox placement). Otherwise overflow rows stack ABOVE the first row, as
   * OSRS does.
   */
  readingOrder?: boolean;
  /**
   * Mobile layout: lay the tiles out as the mobile client's buff bar instead of a strip, in its
   * 91x249 box at this many CSS pixels per logical pixel, one 32x32 tile per 37-pixel cell from
   * the bottom-right upward (osmBuffTile). Tiles past the bar's twelve cells are not drawn, as
   * the client draws no buff past them.
   */
  osmBuffBarScale?: number;
}

/** Keep in step with `.infobox-sprite` in InfoBox.css. */
const SPRITE_SIZE = 24;

function buildInfoBoxTooltip(title: string, detail: string): TooltipContent {
  return {
    lines: [
      {
        spans: [{ text: title, color: TOOLTIP_COLORS.item }],
      },
      {
        spans: [{ text: detail, color: TOOLTIP_COLORS.action }],
      },
    ],
  };
}

interface InfoBoxTextProps {
  text: string;
  hasSprite: boolean;
  /** Unset for a countdown, which takes the one shared timer color from `.infobox-text`. */
  color: string | undefined;
  tone: InfoBoxData['tone'];
}

const InfoBoxText: React.FC<InfoBoxTextProps> = ({ text, hasSprite, color, tone }) => (
  <span
    // One face and size for every value (InfoBox.css); only the no-icon tile differs, in position.
    className={`infobox-text${hasSprite ? '' : ' infobox-text--solo'}${tone ? ` infobox-text--${tone}` : ''}`}
    style={{ color }}
  >
    {text}
  </span>
);

/**
 * Countdown text that steps on true one-second boundaries.
 *
 * The tick count alone only changes every 0.6s, so formatting it directly made
 * each displayed second last either 600ms or 1200ms - a visible stutter. This
 * subtracts how far the current tick has advanced, and because the subscription
 * snapshots the whole SECOND, it re-renders about once per second rather than
 * once per frame. Outside a TickProgressProvider it falls back to the
 * tick-boundary value.
 */
const InfoBoxTimerText: React.FC<
  Omit<InfoBoxTextProps, 'text'> & { ticksRemaining: number; sampledAtTick: number }
> = ({ ticksRemaining, sampledAtTick, ...rest }) => {
  const seconds = useRemainingSeconds(ticksRemaining, sampledAtTick);
  return <InfoBoxText text={formatSecondsClock(seconds)} {...rest} />;
};

const InfoBoxItem: React.FC<{
  infobox: InfoBoxData;
  contentScale: number;
  hovered: boolean;
  placement?: React.CSSProperties;
}> = ({ infobox, contentScale, hovered, placement }) => {
  const spriteSrc = infobox.spriteUrl ?? (infobox.itemId && infobox.itemId > 0 ? getItemSpriteUrl(infobox.itemId) : '');

  const hasSprite = Boolean(spriteSrc);
  // Every countdown shares one color, set in CSS from the pack; only a non-timer value brings its own.
  const isTimer = infobox.ticksRemaining !== undefined;
  const color = isTimer ? undefined : infobox.textColor;
  const tone = isTimer ? undefined : infobox.tone;

  return (
    <div
      className={`infobox-item${hovered ? ' is-hovered' : ''}`}
      style={placement}
      role="img"
      // The detail is in the label because the tile is `pointer-events: none` and its
      // tooltip is driven by a cursor hit test — a reader that never moves a cursor has
      // no other route to it.
      aria-label={`${infobox.tooltipTitle}. ${infobox.tooltipDetail}`}
      data-infobox-id={infobox.id}
      data-infobox-title={infobox.tooltipTitle}
      data-infobox-detail={infobox.tooltipDetail}
    >
      {spriteSrc && (
        <PixelSprite
          src={spriteSrc}
          alt={infobox.tooltipTitle}
          className="infobox-sprite"
          /* Passed as a number because the resample needs the box before layout, and a
             CSS variable is not readable without measuring. */
          width={SPRITE_SIZE * contentScale}
          height={SPRITE_SIZE * contentScale}
        />
      )}
      {infobox.ticksRemaining === undefined || infobox.sampledAtTick === undefined ? (
        <InfoBoxText text={infobox.text} hasSprite={hasSprite} color={color} tone={tone} />
      ) : (
        <InfoBoxTimerText
          ticksRemaining={infobox.ticksRemaining}
          sampledAtTick={infobox.sampledAtTick}
          hasSprite={hasSprite}
          color={color}
          tone={tone}
        />
      )}
    </div>
  );
};

/**
 * Tooltip-on-hover for a strip whose tiles the mouse passes straight through.
 *
 * The strip is inside a `pointerPassthrough` panel so clicks, camera drags and
 * right-click menus reach the world underneath it, which also means no tile ever
 * receives mouseenter. Hover is therefore computed the way RuneLite computes it —
 * cursor position against tile rectangles (InfoBoxOverlay.java) — and published
 * through the tooltip provider's virtual-trigger API.
 *
 * A finger gets the mobile client's buff bar instead, which these tiles are: a tap on a tile
 * toggles its tooltip, the tap is the tile's own rather than falling through to the world, a
 * tap on another tile moves it there, and it removes itself after `MOBILE_TAP_TOOLTIP_MS`. A
 * press anywhere else dismisses it, as it does on the mobile client in use, and still reaches
 * whatever it landed on.
 *
 * Returns the hovered tile's id so the strip can paint hover feedback that `:hover`
 * can no longer provide.
 */
function useVirtualTileHover(stripRef: React.RefObject<HTMLDivElement | null>): string | null {
  const { showVirtualTooltip, showTapTooltip, ownsTapTooltip, hideVirtualTooltip } = useTooltip();
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const ownerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<{ key: string; content: TooltipContent } | null>(null);

  React.useEffect(() => {
    let tapTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(tapTimer);
      const owner = ownerRef.current;
      if (!owner) return;
      ownerRef.current = null;
      contentRef.current = null;
      setHoveredId(null);
      hideVirtualTooltip(owner);
    };

    const tileAt = (x: number, y: number): HTMLElement | null => {
      const strip = stripRef.current;
      if (!strip) return null;
      for (const tile of strip.querySelectorAll<HTMLElement>('[data-infobox-id]')) {
        const r = tile.getBoundingClientRect();
        if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return tile;
      }
      return null;
    };

    /**
     * Whether the tile is the frontmost thing painted at the cursor.
     *
     * Rect containment alone cannot tell — the mechanics tray, a sidebar or a modal can
     * all cover the strip, and hovering one of those would otherwise raise the tooltip
     * of a tile the user cannot even see. Making the strip hit-testable for the length
     * of one `elementFromPoint` asks the browser that question directly, which is why
     * this is a probe and not a z-index comparison nobody can keep in sync.
     *
     * A replay's recorded cursor looks through the viewer's own chrome (the transport, the
     * tool window), which the recorder never had over the tile.
     */
    const isFrontmost = (tile: HTMLElement, x: number, y: number): boolean => {
      if (typeof document.elementFromPoint !== 'function') return true;
      const strip = stripRef.current;
      if (!strip) return false;
      const previous = strip.style.pointerEvents;
      strip.style.pointerEvents = 'auto';
      const atCursor = isSyntheticInput() ? getReplayPointerTarget(x, y) : document.elementFromPoint(x, y);
      strip.style.pointerEvents = previous;
      return !!atCursor && tile.contains(atCursor);
    };

    let frame: number | null = null;
    let pendingX = 0;
    let pendingY = 0;
    let pendingSynthetic = false;

    const evaluate = () => {
      frame = null;
      const tile = tileAt(pendingX, pendingY);
      if (!tile) {
        release();
        return;
      }
      // Only re-probe on arrival: the answer cannot change while the cursor stays
      // inside one 32px tile, and the probe costs a forced style recalc.
      if (tile !== ownerRef.current && !isFrontmost(tile, pendingX, pendingY)) {
        release();
        return;
      }

      const title = tile.dataset.infoboxTitle ?? '';
      const detail = tile.dataset.infoboxDetail ?? '';
      const key = `${title}\u0000${detail}`;
      // Rebuild only when the text changes, so a live timer refreshes its tooltip
      // while a static one hands the provider the same object every frame and its
      // setContent bails out of the re-render.
      if (contentRef.current?.key !== key) {
        contentRef.current = { key, content: buildInfoBoxTooltip(title, detail) };
      }

      ownerRef.current = tile;
      setHoveredId(tile.dataset.infoboxId ?? null);
      showVirtualTooltip(tile, contentRef.current.content);
    };

    const trackCursor = (e: MouseEvent) => {
      pendingX = e.clientX;
      pendingY = e.clientY;
      // The tooltip provider tells a replay's cursor from the viewer's by provenance, which is
      // only marked during the synchronous dispatch; carry the latest sample's into the frame.
      pendingSynthetic = isSyntheticInput();
      if (frame === null)
        frame = requestAnimationFrame(() => {
          if (pendingSynthetic) runSyntheticInput(evaluate);
          else evaluate();
        });
    };
    // Real input is read from pointer events, which say which device moved: a finger has no
    // hover, and neither its drags nor a tap's compatibility mouse events may raise or release
    // one. A replay's recorded cursor dispatches only mousemove.
    const handlePointerMove = (e: PointerEvent) => {
      if (!isTouchPointer(e)) trackCursor(e);
    };
    const handleReplayMouseMove = (e: MouseEvent) => {
      if (isSyntheticInput()) trackCursor(e);
    };

    // Created before the listener below, so on a tap this one's own disarm runs first and
    // the arm below takes the browser's click for the tap.
    const compatSwallow = listenCompatMouseSwallow(['click']);
    // Window capture: the tiles pass pointers through, so the touch targets whatever is under
    // them, and stopping it here keeps it from that element (a walk, a camera drag, a hold).
    const handlePointerDown = (e: PointerEvent) => {
      // Only the first finger taps a tile; any press may dismiss one.
      const touch = isTouchPointer(e) && e.isPrimary;
      // Asked of the provider, not remembered here: a menu opening or a tab change may have
      // hidden it since, and a tap on its tile must then reopen it rather than toggle it off.
      const tapped = ownerRef.current && ownsTapTooltip(ownerRef.current) ? ownerRef.current : null;
      // Any other press only matters to a tap tooltip; a mouse's hover is the moves'.
      if (!touch && !tapped) return;
      const hit = tileAt(e.clientX, e.clientY);
      const tile = hit && isFrontmost(hit, e.clientX, e.clientY) ? hit : null;
      if (!touch || !tile) {
        // A press anywhere but the tapped tile dismisses its tooltip, and goes on to what it hit.
        if (tapped && tile !== tapped) release();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      compatSwallow.arm();
      if (tile === tapped) {
        release();
        return;
      }
      clearTimeout(tapTimer);
      const title = tile.dataset.infoboxTitle ?? '';
      const detail = tile.dataset.infoboxDetail ?? '';
      contentRef.current = { key: `${title}\u0000${detail}`, content: buildInfoBoxTooltip(title, detail) };
      ownerRef.current = tile;
      showTapTooltip(tile, contentRef.current.content, e.clientX, e.clientY);
      tapTimer = setTimeout(release, MOBILE_TAP_TOOLTIP_MS);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('mousemove', handleReplayMouseMove);
    window.addEventListener('pointerdown', handlePointerDown, true);
    // The cursor leaving the window produces no further mousemove, so nothing else
    // would ever retire a tooltip left showing at the edge of the screen.
    document.addEventListener('mouseleave', release);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleReplayMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('mouseleave', release);
      compatSwallow.dispose();
      if (frame !== null) cancelAnimationFrame(frame);
      release();
    };
  }, [stripRef, showVirtualTooltip, showTapTooltip, ownsTapTooltip, hideVirtualTooltip]);

  return hoveredId;
}

export const InfoBoxOverlay: React.FC<InfoBoxOverlayProps> = ({
  simulationState,
  infoBoxSettings,
  contentScale = 1,
  wrapWidth,
  readingOrder = false,
  osmBuffBarScale,
}) => {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const hoveredId = useVirtualTileHover(stripRef);
  /**
   * The zoom DraggablePanel applied to this strip, published to CSS so the tile's
   * corner radius and hairline can divide it back out and paint at a constant size.
   * `zoom` multiplies EVERY length, and the tile's own size is deliberately damped
   * (INFOBOX_SCALE_DAMP), so left alone the chrome grows by the full UI scale while
   * the box it outlines grows by ~a third of that.
   *
   * Null outside a panel — this component renders bare in its own tests — where
   * there is no zoom to undo.
   */
  const panelZoom = usePanelContentScaleOrNull() ?? 1;
  const infoboxes = selectInfoboxes(simulationState, infoBoxSettings);

  if (infoboxes.length === 0) {
    return null;
  }

  const outlineEnabled = infoBoxSettings?.infoboxTextOutlineEnabled ?? true;
  const outlineColor = infoBoxSettings?.infoboxTextOutlineColor ?? '#000000';

  if (osmBuffBarScale !== undefined) {
    const scale = osmBuffBarScale;
    return (
      <div
        ref={stripRef}
        className={`infobox-strip infobox-strip--osm-buff-bar${outlineEnabled ? ' infobox-strip--outlined' : ''}`}
        style={
          {
            position: 'relative',
            width: OSM_BUFF_BAR.width * scale,
            height: OSM_BUFF_BAR.height * scale,
            '--infobox-scale': scale,
            '--infobox-zoom': panelZoom,
            ...(outlineEnabled ? { '--infobox-outline-color': outlineColor } : {}),
          } as React.CSSProperties
        }
      >
        {infoboxes.map((infobox, index) => {
          const tile = osmBuffTile(index);
          if (!tile) return null;
          return (
            <InfoBoxItem
              key={infobox.id}
              infobox={infobox}
              contentScale={scale}
              hovered={infobox.id === hoveredId}
              placement={{ position: 'absolute', left: tile.x * scale, top: tile.y * scale }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      className={`infobox-strip${readingOrder ? ' infobox-strip--reading-order' : ''}${outlineEnabled ? ' infobox-strip--outlined' : ''}`}
      style={
        {
          '--infobox-scale': contentScale,
          '--infobox-zoom': panelZoom,
          ...(wrapWidth !== undefined ? { width: wrapWidth } : {}),
          ...(outlineEnabled ? { '--infobox-outline-color': outlineColor } : {}),
        } as React.CSSProperties
      }
    >
      {infoboxes.map((infobox) => (
        <InfoBoxItem
          key={infobox.id}
          infobox={infobox}
          contentScale={contentScale}
          hovered={infobox.id === hoveredId}
        />
      ))}
    </div>
  );
};
