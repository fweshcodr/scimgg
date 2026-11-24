import type React from 'react';
import { useId, useRef } from 'react';
import type { FullscreenControl } from '../hooks/useMobileEntry';
import { OSM_POPOUT_FRAME, OSM_POPOUT_INSET, OSM_SYSTEM_STONE_ORIGIN } from '../layout/osmClientLayout';
import { type OsmFrame, osmCssRect } from '../layout/osmFrame';
import { MOBILE } from '../resourcePack';
import { framedStoneBox, framedStoneSprites, StoneGlyph } from './MobileMenu';
import { PixelSpriteLayer } from './PixelSpriteLayer';
import { PanelContentScaleProvider } from './panelContentScale';
import { useHoverCard } from './ui/HoverCard';
import './MobileMenu.css';
import './MobileEntry.css';

const HOME_SCREEN_STEPS =
  'On iPhone, full screen only works from the Home Screen. Tap Share, then Add to Home Screen, and open Scim.GG from there.';

interface MobileFullscreenStoneProps {
  readonly frame: OsmFrame;
  readonly control: Exclude<FullscreenControl, null>;
  readonly onToggle: () => void;
  /** Hidden with the menu while a drawer is open over this corner. */
  readonly tucked: boolean;
  /** Each new value sweeps one glint across the stone (see `MobileEntry.stoneAttention`). */
  readonly attention?: number;
}

/**
 * The browser's full-screen switch, top-left in the Mobile layout's left column where the
 * mobile client keeps Logout. Drawn as group 728's framed stone so it matches the pop-out
 * below it; the glyph is four corner brackets opening out (enter) or turned in (exit).
 */
export const MobileFullscreenStone: React.FC<MobileFullscreenStoneProps> = ({
  frame,
  control,
  onToggle,
  tucked,
  attention = 0,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();
  const rect = osmCssRect(frame, { ...OSM_SYSTEM_STONE_ORIGIN, ...OSM_POPOUT_FRAME });
  const homeScreen = control === 'home-screen';
  const { card } = useHoverCard({
    content: homeScreen ? HOME_SCREEN_STEPS : control === 'exit' ? 'Exit full screen' : 'Full screen',
    anchorRef: buttonRef,
    placement: 'inline',
    cardClassName: homeScreen ? 'osm-fullscreen-card hover-card--instant' : 'hover-card--instant',
    cardId,
    dwellMs: 0,
    openOnFocus: false,
    dismissOnPress: !homeScreen,
    // iPhone's existing tap disclosure is the action, not a hover hint on a working switch.
    regionTouch: homeScreen,
  });
  const stoneTop = Math.max(1, Math.round(OSM_POPOUT_INSET * frame.scale));
  const sprites = framedStoneSprites(frame, rect, stoneTop, MOBILE.popoutStone);

  return (
    <div
      className={`osm-menu osm-fullscreen${tucked ? ' osm-menu--tucked' : ''}`}
      inert={tucked}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className="osm-menu__frame" aria-hidden="true">
        <PanelContentScaleProvider value={1}>
          <PixelSpriteLayer width={rect.width} height={rect.height} sprites={sprites} />
        </PanelContentScaleProvider>
        <StoneGlyph
          name={control === 'exit' ? 'fullscreenExit' : 'fullscreenEnter'}
          scale={frame.scale}
          box={framedStoneBox(frame, rect, stoneTop)}
        />
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="osm-menu__toggle"
        aria-label={control === 'exit' ? 'Exit full screen' : 'Full screen'}
        aria-describedby={homeScreen ? cardId : undefined}
        // On iPhone the tap opens the card (useHoverCard's touch path); there is nothing to switch.
        onClick={homeScreen ? undefined : onToggle}
        style={{ left: 0, top: 0, width: rect.width, height: rect.height }}
      />
      {/* Keyed by the count, so each hand-over replays the sweep from the start. */}
      {attention > 0 && <span key={attention} className="osm-fullscreen__glint" aria-hidden="true" />}
      {card}
    </div>
  );
};
