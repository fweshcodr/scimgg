import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { OSM_POPOUT_INSET, osmSystemStoneRect } from '../layout/osmClientLayout';
import { type OsmFrame, osmCssRect } from '../layout/osmFrame';
import { MOBILE } from '../resourcePack';
import { framedStoneBox, framedStoneSprites, StoneGlyph } from './MobileMenu';
import { type LayerSprite, PixelSpriteLayer } from './PixelSpriteLayer';
import { PanelContentScaleProvider } from './panelContentScale';
import { useHoverCard } from './ui/HoverCard';
import './MobileMenu.css';

/** How long the first tap keeps the stone armed for the second. */
export const RESTART_CONFIRM_WINDOW_MS = 3000;

interface MobileRestartStoneProps {
  readonly frame: OsmFrame;
  /** Which system slot it takes: under the full-screen stone, or the top one without it. */
  readonly slot: number;
  /** App's `handleReset`: the sidebar button's whole-fight restart, and Ctrl+R's where no practice restart takes it. */
  readonly onRestart: () => void;
  /** Mirrors the sidebar button's `resetDisabled`. */
  readonly disabled: boolean;
  /** Hidden with the menu while a drawer is open over this corner. */
  readonly tucked: boolean;
}

/**
 * The Mobile layout's Restart, the touch stand-in for Ctrl+R: a framed stone in the left
 * column's system stack, under full screen, away from the controls a fight taps.
 *
 * A restart throws the attempt away, so one tap only arms it: the stone lights and a card asks
 * for a second tap, which restarts. The arm lapses after RESTART_CONFIRM_WINDOW_MS, or at once on
 * a press anywhere else, so a stray tap here never costs a run.
 */
export const MobileRestartStone: React.FC<MobileRestartStoneProps> = ({ frame, slot, onRestart, disabled, tucked }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();
  const [armed, setArmed] = useState(false);
  const live = armed && !disabled && !tucked;

  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => setArmed(false), RESTART_CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [live]);
  // A disarm by the drawer or the intro must not leave the arm waiting to come back with it.
  useEffect(() => {
    if (disabled || tucked) setArmed(false);
  }, [disabled, tucked]);

  const { card } = useHoverCard({
    content: live ? 'Tap again to restart' : 'Restart',
    anchorRef: buttonRef,
    placement: 'inline',
    cardId,
    dwellMs: 0,
    cardClassName: 'hover-card--instant',
    forceOpen: live,
    onDismiss: () => setArmed(false),
    // The stone's own tap arms and confirms; the card follows the arm, not the press or focus.
    regionTouch: false,
    openOnFocus: false,
  });

  const rect = osmCssRect(frame, osmSystemStoneRect(slot));
  const stoneTop = Math.max(1, Math.round(OSM_POPOUT_INSET * frame.scale));
  const sprites: LayerSprite[] = framedStoneSprites(
    frame,
    rect,
    stoneTop,
    live ? MOBILE.popoutStoneSelected : MOBILE.popoutStone,
  );
  // Disabled fades the stone and its glyph together; the frame stays, as the column's frame does.
  if (disabled) {
    const stone = sprites.length - 1;
    sprites[stone] = { ...sprites[stone], opacity: 0.4 };
  }

  const press = () => {
    if (disabled) return;
    if (!live) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onRestart();
  };

  return (
    <div
      className={`osm-menu osm-restart${tucked ? ' osm-menu--tucked' : ''}`}
      inert={tucked}
      data-armed={live || undefined}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className="osm-menu__frame" aria-hidden="true">
        <PanelContentScaleProvider value={1}>
          <PixelSpriteLayer width={rect.width} height={rect.height} sprites={sprites} />
        </PanelContentScaleProvider>
        <StoneGlyph name="restart" scale={frame.scale} box={framedStoneBox(frame, rect, stoneTop)} dimmed={disabled} />
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="osm-menu__toggle"
        aria-label="Restart"
        aria-describedby={live ? cardId : undefined}
        disabled={disabled}
        onClick={press}
        style={{ left: 0, top: 0, width: rect.width, height: rect.height }}
      />
      {card}
    </div>
  );
};
