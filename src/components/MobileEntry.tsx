import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { MobileEntry as MobileEntryState, WelcomeVariant } from '../hooks/useMobileEntry';
import { osmChromeLayout } from '../layout/osmClientLayout';
import { type OsmFrame, osmCssRect, osmLeftColumnRight } from '../layout/osmFrame';
import { MOBILE } from '../resourcePack';
import { isAppleTouchDevice } from '../util/mobileDetection';
import { StoneGlyph } from './MobileMenu';
import { useSpriteCssUrls, useSpriteFill, useSpritePixels } from './useSpriteCss';
import './MobileEntry.css';

/** How long a sheet takes to leave; matches `mobile-entry-sheet-out` in the CSS. */
const EXIT_MS = 180;

/**
 * Keeps a sheet mounted through its exit animation, holding the last content it showed so it
 * does not change mid-fade.
 */
function usePresence<T>(value: T | null): { readonly shown: T | null; readonly leaving: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (value !== null) {
      setShown(value);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return { shown: value ?? shown, leaving: value === null && shown !== null && leaving };
}

/**
 * A sheet is an invitation, not a wall: a tap anywhere else, or Escape, puts it away, and the
 * tap still reaches what it landed on (the camera drag, a tab stone).
 */
function useDismissOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      dismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, active]);
}

/**
 * The entry stones' tones, each read from the pixel of the mobile client's own stone
 * (popout_stone.png, 52x40) it was picked from, as the sheet's fill is. The stylesheet falls back to vanilla's values until the sprite decodes.
 */
const STONE_TONES: readonly (readonly [name: string, x: number, y: number])[] = [
  ['outline', 26, 0],
  ['body', 26, 20],
  ['lit', 26, 1],
  ['lit-inner', 26, 2],
  ['shade', 26, 38],
  ['shade-inner', 26, 37],
  ['side', 1, 20],
  // The darker inner edge beside the side rim, which a pressed stone takes as its body.
  ['pressed', 2, 20],
];
const STONE_POINTS = STONE_TONES.map(([, x, y]) => [x, y] as const);

/** The sheet's border pieces, in its `background-image` layer order; the preloader warms them. */
export function entryFrameStylesheetSprites(): readonly string[] {
  return [
    MOBILE.railTopLeft,
    MOBILE.railTopRight,
    MOBILE.railBottomLeft,
    MOBILE.railBottomRight,
    MOBILE.railTop,
    MOBILE.railBottom,
    MOBILE.railLeft,
    MOBILE.railRight,
  ];
}

/**
 * The mobile client's dark 9-slice (the tab rail's frame), drawn as the sheet's border, its
 * middle's color as the body's fill, and the stones' tones, all read from the sprites.
 */
function useFrameStyle(): React.CSSProperties {
  const urls = useSpriteCssUrls(entryFrameStylesheetSprites());
  const fill = useSpriteFill(MOBILE.railMiddle);
  const stone = useSpritePixels(MOBILE.popoutStone, STONE_POINTS);
  const style: Record<string, string> = {
    backgroundImage: urls.map((url) => (url ? `url("${url}")` : 'none')).join(', '),
  };
  if (fill) style['--mobile-entry-fill'] = fill;
  STONE_TONES.forEach(([name], i) => {
    const colour = stone[i];
    if (colour) style[`--mobile-entry-stone-${name}`] = colour;
  });
  return style as React.CSSProperties;
}

/**
 * Landscape: the welcome sheet sits in the open game area between the left column and the side
 * panel beside its expanded rail, so the native chrome on both sides stays whole. Measured from
 * the gameframe as it is drawn, at its real scale, inward from the frame's edges (the stylesheet
 * adds the safe area outside them).
 */
export function landscapeReserves(frame: OsmFrame | null | undefined): React.CSSProperties {
  if (!frame) return {};
  const panel = osmCssRect(frame, osmChromeLayout(frame.size, false).sidePanel);
  const frameRight = frame.origin.x + frame.size.width * frame.scale;
  return {
    '--mobile-entry-reserve-left': `${osmLeftColumnRight(frame) - frame.origin.x}px`,
    '--mobile-entry-reserve-right': `${Math.max(0, frameRight - panel.x)}px`,
  } as React.CSSProperties;
}

/** The iOS Share glyph, so the instruction matches the button the player is looking for. */
function ShareGlyph() {
  return (
    <svg className="mobile-entry-share-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.5v8.5M5 4.5l3-3 3 3" />
      <path d="M5.5 7H3.5v7.5h9V7h-2" />
    </svg>
  );
}

/** A phone that turns from upright to sideways: the one authored motion of the flow. */
function RotateGlyph() {
  return (
    <svg className="mobile-entry-rotate-glyph" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="mobile-entry-rotate-arrow" d="M51 14a24 24 0 0 1 6 20M57 34l-4.5-3.2M57 34l2.6-4.9" />
      <g className="mobile-entry-rotate-phone">
        <rect x="21" y="14" width="22" height="36" rx="3" />
        <rect className="mobile-entry-rotate-screen" x="24" y="18" width="16" height="26" />
        <path d="M30 46.5h4" />
      </g>
    </svg>
  );
}

const TOUCH_BASICS = 'Drag to turn, pinch to zoom, hold for menus.';

/**
 * What an iPhone or iPad player should know before they meet one of the issues themselves: they
 * are ours, not theirs, and someone is on them.
 *
 * `isAppleTouchDevice`, not the Device setting: the issues are WebKit's on this hardware whatever
 * layout the player picked, which is the same reason `BrowserSuggestions` reads the hardware.
 *
 * An aside rather than an alarm. It is ruled off below the sheet's own copy in the muted step,
 * carries no mark and nothing to press, and leaves with the sheet it sits in, so there is no
 * dismissal to remember and nothing left over the game.
 */
function IosNote({ className }: { className?: string }) {
  if (!isAppleTouchDevice()) return null;
  return (
    <p className={className ? `mobile-entry-note ${className}` : 'mobile-entry-note'}>
      We know about some iPhone and iPad issues and are working on fixes. If something looks wrong, that's likely why.
    </p>
  );
}

function Sheet({
  labelledBy,
  kind,
  leaving,
  sheetRef,
  layerStyle,
  children,
}: {
  labelledBy: string;
  kind: 'welcome' | 'rotate';
  leaving: boolean;
  sheetRef: React.RefObject<HTMLElement | null>;
  layerStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const frameStyle = useFrameStyle();
  return (
    <div
      className={`mobile-entry-layer mobile-entry-layer--${kind}${leaving ? ' mobile-entry-layer--leaving' : ''}`}
      style={layerStyle}
    >
      <div className="mobile-entry-scrim" aria-hidden="true" />
      <section
        ref={sheetRef}
        className={`mobile-entry-sheet mobile-entry-sheet--${kind}`}
        aria-labelledby={labelledBy}
        style={frameStyle}
        inert={leaving}
      >
        <div className="mobile-entry-sheet__body">{children}</div>
      </section>
    </div>
  );
}

function WelcomeSheet({
  variant,
  frame,
  leaving,
  onPlayFullscreen,
  onDismiss,
}: {
  variant: WelcomeVariant;
  frame: OsmFrame | null | undefined;
  leaving: boolean;
  onPlayFullscreen: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDismissOutside(ref, !leaving, onDismiss);

  const title =
    variant === 'fullscreen'
      ? 'Hide the browser bars'
      : variant === 'home-screen'
        ? 'Full screen on iPhone'
        : 'Playing on touch';

  return (
    <Sheet labelledBy={titleId} kind="welcome" leaving={leaving} sheetRef={ref} layerStyle={landscapeReserves(frame)}>
      <h2 className="mobile-entry-title" id={titleId}>
        {title}
      </h2>
      {variant === 'fullscreen' && (
        <p className="mobile-entry-text">
          Full screen holds the game in landscape, like the OSRS mobile client. The button at the top left switches back
          any time.
        </p>
      )}
      {variant === 'home-screen' && (
        <p className="mobile-entry-text">
          Safari only goes full screen from the Home Screen. Tap{' '}
          <span className="mobile-entry-nowrap">
            Share <ShareGlyph />,
          </span>{' '}
          then Add to Home Screen, and open Scim.GG from there.
        </p>
      )}
      <p className="mobile-entry-text mobile-entry-text--quiet">{TOUCH_BASICS}</p>
      <IosNote />
      <div className="mobile-entry-actions">
        {variant === 'fullscreen' ? (
          <>
            <button type="button" className="mobile-entry-stone mobile-entry-stone--primary" onClick={onPlayFullscreen}>
              {/* The glyph the full-screen stone at the top left wears, so the offer and the switch match. */}
              <StoneGlyph name="fullscreenEnter" className="mobile-entry-stone__glyph" />
              Play full screen
            </button>
            <button type="button" className="mobile-entry-stone" onClick={onDismiss}>
              Not now
            </button>
          </>
        ) : (
          <button type="button" className="mobile-entry-stone mobile-entry-stone--primary" onClick={onDismiss}>
            {variant === 'home-screen' ? 'Got it' : 'Play'}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function RotateSheet({
  canLockLandscape,
  leaving,
  onGoFullscreen,
  onLookAround,
}: {
  canLockLandscape: boolean;
  leaving: boolean;
  onGoFullscreen: () => void;
  onLookAround: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDismissOutside(ref, !leaving, onLookAround);

  return (
    <Sheet labelledBy={titleId} kind="rotate" leaving={leaving} sheetRef={ref}>
      {/* Paint order is load-bearing: the glyph animates forever, and Chrome promotes whatever
          paints after an animating layer into its own layer, which costs that text its LCD
          antialiasing. So the copy and the buttons come first and the grid puts the glyph left. */}
      <div className="mobile-entry-rotate">
        <h2 className="mobile-entry-title mobile-entry-rotate__title" id={titleId}>
          Best played in landscape
        </h2>
        {/* A recommendation, not a rule: portrait works, and landscape is the mobile client's own
            shape rather than a limit of this app. */}
        <p className="mobile-entry-text mobile-entry-rotate__text">
          Scim.GG on mobile matches the OSRS mobile client, which is built for landscape. Turn your phone sideways for
          the best experience.
        </p>
        <IosNote className="mobile-entry-rotate__note" />
        <div className="mobile-entry-actions mobile-entry-rotate__actions">
          {canLockLandscape && (
            <button type="button" className="mobile-entry-stone mobile-entry-stone--primary" onClick={onGoFullscreen}>
              <StoneGlyph name="fullscreenEnter" className="mobile-entry-stone__glyph" />
              Go full screen
            </button>
          )}
          <button
            type="button"
            className={`mobile-entry-stone${canLockLandscape ? '' : ' mobile-entry-stone--primary'}`}
            onClick={onLookAround}
          >
            Look around
          </button>
        </div>
        <RotateGlyph />
      </div>
    </Sheet>
  );
}

/**
 * The mobile entry flow's two sheets (see useMobileEntry). Both sit over the live game rather
 * than in front of it, and neither pauses anything. `frame` is the Mobile layout's gameframe, which
 * the landscape welcome keeps clear of; without one it keeps to a fixed native-size reserve.
 */
export const MobileEntry: React.FC<{ entry: MobileEntryState; frame?: OsmFrame | null }> = ({ entry, frame }) => {
  const welcome = usePresence(entry.welcome);
  const rotate = usePresence(entry.rotateInvite);
  return (
    <>
      {welcome.shown && (
        <WelcomeSheet
          variant={welcome.shown}
          frame={frame}
          leaving={welcome.leaving}
          onPlayFullscreen={entry.playFullscreen}
          onDismiss={entry.dismissWelcome}
        />
      )}
      {rotate.shown && (
        <RotateSheet
          canLockLandscape={rotate.shown.canLockLandscape}
          leaving={rotate.leaving}
          onGoFullscreen={entry.playFullscreen}
          onLookAround={entry.lookAround}
        />
      )}
    </>
  );
};
