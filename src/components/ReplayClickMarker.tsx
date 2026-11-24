import {
  getReplayClickVisualState,
  getReplayHoldVisualState,
  getReplayTapVisualState,
  REPLAY_CLICK_PIXEL_SCALE,
  REPLAY_CLICK_SHEET_URLS,
  REPLAY_CLICK_SPRITE_FRAME_SIZE_PX,
} from './replayClickVisuals';
import type { ProjectedClick, ProjectedHold } from './replayCursorProjection';
import { type PixelDiscPaths, pixelDisc } from './replayTapDisc';
import { useSpriteCssUrls } from './useSpriteCss';

export interface ReplayClickMarkerProps {
  readonly click: ProjectedClick;
}

export function ReplayClickMarker({ click }: ReplayClickMarkerProps) {
  const visual = getReplayClickVisualState(click.type, click.elapsedMs, click.progress);
  const [sheetUrl] = useSpriteCssUrls(click.type === 'ui' ? [] : [REPLAY_CLICK_SHEET_URLS[click.type]]);
  const markerProps = {
    className: `replay-click-marker replay-click-marker--${click.type}`,
    'data-click-type': click.type,
    'data-occurrence': click.occurrence,
    'data-progress': click.progress.toFixed(4),
    'data-sprite-frame': visual.kind === 'world' ? visual.spriteFrame : undefined,
    'data-testid': `replay-click-marker-${click.type}`,
    'data-touch': click.touch ? 'true' : undefined,
    style: { transform: `translate3d(${click.x}px, ${click.y}px, 0)` },
  };

  // Beneath the click's own feedback, so it never covers the X.
  const tap = click.touch ? (
    <ReplayTapCue elapsedMs={click.elapsedMs} discs={visual.kind === 'world' ? WORLD_TAP_DISCS : UI_TAP_DISCS} />
  ) : null;

  switch (visual.kind) {
    case 'world':
      return (
        <div {...markerProps}>
          {tap}
          <span
            className="replay-click-sprite"
            data-testid="replay-click-sprite"
            style={{
              backgroundImage: sheetUrl ? `url("${sheetUrl}")` : 'none',
              backgroundPosition: `${-visual.spriteFrame * REPLAY_CLICK_SPRITE_FRAME_SIZE_PX}px 0`,
              opacity: visual.spriteOpacity,
              transform: `translate3d(-50%, -50%, 0) scale(${visual.spriteScale})`,
            }}
          />
        </div>
      );
    case 'ui':
      return (
        <div {...markerProps}>
          {tap}
          <span
            className="replay-click-ui-ring"
            data-testid="replay-click-ui-ring"
            style={{
              opacity: visual.ringOpacity,
              transform: `translate3d(-50%, -50%, 0) scale(${visual.ringScale})`,
            }}
          />
          <span
            className="replay-click-ui-core"
            data-testid="replay-click-ui-core"
            style={{
              opacity: visual.coreOpacity,
              transform: `translate3d(-50%, -50%, 0) scale(${visual.coreScale})`,
            }}
          />
        </div>
      );
    default:
      return assertNever(visual);
  }
}

/**
 * A fingertip on the X's pixel grid: a translucent pixel disc with a lighter rim, the way a
 * screen recording shows a tap, stepped on the X's frame clock rather than tweened. It sits
 * behind the X and adds no color of its own, so the X stays the loudest thing at the point.
 */
function ReplayTapCue({ elapsedMs, discs }: { readonly elapsedMs: number; readonly discs: TapDiscs }) {
  const tap = getReplayTapVisualState(elapsedMs);
  if (!tap) return null;
  return (
    <span className="replay-tap" data-testid="replay-tap" data-tap-frame={tap.frame} style={{ opacity: tap.opacity }}>
      <PixelDisc disc={discs.contact} className="replay-tap-disc replay-tap-disc--contact" />
      <PixelDisc disc={discs.spread} className="replay-tap-disc replay-tap-disc--spread" />
    </span>
  );
}

/**
 * A touch long-press, marked once its menu opens: the tap's spread pad, already pressed, with
 * a second ring inside it for the pressure of a held finger, steady and then lifted, never
 * growing as a tap does (see `getReplayHoldVisualState`).
 *
 * Only its top half is drawn, resting on the press point. The menu opens with its top edge on
 * that point and centered across it, and depending on whether the frame is scaled it paints
 * above or below this layer; drawn as a cap, the mark looks the same either way and stays off
 * the menu's rows, as a fingertip on the edge the menu grew from.
 */
export function ReplayHoldMarker({ hold }: { readonly hold: ProjectedHold }) {
  const visual = getReplayHoldVisualState(hold.elapsedMs);
  if (!visual) return null;
  const { diameter } = HOLD_PAD;
  return (
    <div
      className="replay-hold-marker"
      data-testid="replay-hold-marker"
      data-progress={hold.progress.toFixed(4)}
      style={{ transform: `translate3d(${hold.x}px, ${hold.y}px, 0)` }}
    >
      <svg
        className="replay-tap-disc replay-hold-cap"
        viewBox={`0 0 ${diameter} ${diameter / 2}`}
        width={diameter * REPLAY_CLICK_PIXEL_SCALE}
        height={(diameter / 2) * REPLAY_CLICK_PIXEL_SCALE}
        style={{ opacity: visual.opacity }}
        aria-hidden="true"
      >
        <path className="replay-tap-fill" d={HOLD_PAD.disc} />
        <path className="replay-tap-rim" d={HOLD_PAD.rim} />
        <path
          className="replay-tap-rim"
          d={HOLD_PRESSURE.rim}
          transform={`translate(${HOLD_PRESSURE_INSET} ${HOLD_PRESSURE_INSET})`}
        />
      </svg>
    </div>
  );
}

function PixelDisc({ disc, className }: { readonly disc: PixelDiscPaths; readonly className: string }) {
  const size = disc.diameter * REPLAY_CLICK_PIXEL_SCALE;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${disc.diameter} ${disc.diameter}`}
      width={size}
      height={size}
      aria-hidden="true"
    >
      {/* The fill runs under the rim, so the two never meet at an antialiased seam. */}
      <path className="replay-tap-fill" d={disc.disc} />
      <path className="replay-tap-rim" d={disc.rim} />
    </svg>
  );
}

type TapDiscs = { readonly contact: PixelDiscPaths; readonly spread: PixelDiscPaths };

/**
 * World: contact just wider than the X's small first frame (about 10 of its 16 pixels), spread
 * one pixel past the full X's 16-pixel box, so the X reads as pressed into a fingertip pad.
 * UI: a size smaller, so it stays beneath the interface marker rather than outgrowing it.
 */
const WORLD_TAP_DISCS: TapDiscs = { contact: pixelDisc(14), spread: pixelDisc(18) };
const UI_TAP_DISCS: TapDiscs = { contact: pixelDisc(12), spread: pixelDisc(16) };

/** The hold's pad is the world tap's spread pad, whatever the menu opened over. */
const HOLD_PAD = WORLD_TAP_DISCS.spread;
/** Its pressure ring: the rim of a disc three pixels in from the pad's edge all round. */
const HOLD_PRESSURE_INSET = 3;
const HOLD_PRESSURE = pixelDisc(HOLD_PAD.diameter - 2 * HOLD_PRESSURE_INSET);

function assertNever(value: never): never {
  throw new TypeError(`Unsupported replay click visual: ${String(value)}`);
}
