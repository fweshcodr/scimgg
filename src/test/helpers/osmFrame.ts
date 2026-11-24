import { OSM_INTERFACE_SCALING_DEFAULT, osmChromeScale } from '../../layout/osmClientLayout';
import {
  type FrameInsets,
  type OsmFrame,
  osmFrame,
  osmFramePlaced,
  type ReplayFramePlacement,
} from '../../layout/osmFrame';
import type { Size } from '../../layout/osrsClientLayout';
import { fitReplayWorkspace } from '../../layout/replayWorkspaceLayout';

const NO_INSETS: FrameInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface OsmFrameScaleOptions {
  readonly interfaceScaling?: number;
  readonly devicePixelRatio?: number;
}

/**
 * The Mobile gameframe App draws for a viewport and its safe area at the default Interface
 * scaling on a DPR 3 screen. Where the safe area's 894x503 logical minimum binds (every phone
 * at 400%), the pixel ratio only matters to rounding. `options` overrides either input.
 */
export function defaultOsmFrame(
  viewport: Size,
  insets: FrameInsets = NO_INSETS,
  { interfaceScaling = OSM_INTERFACE_SCALING_DEFAULT, devicePixelRatio = 3 }: OsmFrameScaleOptions = {},
): OsmFrame {
  const scale = osmChromeScale({ interfaceScaling, devicePixelRatio, viewport, safeAreaInsets: insets });
  return osmFrame(viewport, insets, scale);
}

/** A screen the Mobile layout runs on: its CSS viewport, safe area and pixel ratio. */
export interface MobileScreen {
  readonly viewport: Size;
  readonly insets: FrameInsets;
  readonly devicePixelRatio: number;
}

export const MOBILE_SCREENS = {
  /** iPhone 15 upright: notch and home indicator. */
  iPhone15Upright: {
    viewport: { width: 390, height: 844 },
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
    devicePixelRatio: 3,
  },
  /** iPhone 15 held landscape: notch on one side, home indicator below. */
  iPhone15Landscape: {
    viewport: { width: 844, height: 390 },
    insets: { top: 0, right: 47, bottom: 21, left: 47 },
    devicePixelRatio: 3,
  },
  /** iPhone SE (first generation) upright, in Safari. */
  iPhoneSeUpright: { viewport: { width: 320, height: 568 }, insets: NO_INSETS, devicePixelRatio: 2 },
  /** iPad mini (6th generation) upright, in Safari. */
  iPadMiniUpright: { viewport: { width: 744, height: 1133 }, insets: NO_INSETS, devicePixelRatio: 2 },
  /** iPad Air held landscape: status bar and home indicator. */
  iPadAirLandscape: {
    viewport: { width: 1180, height: 820 },
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
    devicePixelRatio: 2,
  },
  /** A 1920x1080 desktop browser with the Mobile layout forced. */
  desktop1080: { viewport: { width: 1920, height: 1080 }, insets: NO_INSETS, devicePixelRatio: 1 },
} as const satisfies Record<string, MobileScreen>;

/** The live gameframe on `screen` at the default Interface scaling. */
export function liveOsmFrame(screen: MobileScreen): OsmFrame {
  return defaultOsmFrame(screen.viewport, screen.insets, { devicePixelRatio: screen.devicePixelRatio });
}

/**
 * A recording made on `recorder` at the default setting, played back in a `window`-sized viewer:
 * the recorder's own frame (Grid's, frame-local), the fit App gives it, and that frame as the
 * window draws it (`osmFramePlaced`, where the tool window is laid out).
 */
export function replayedOsmFrame(
  recorder: MobileScreen,
  window: Size,
): { readonly recorded: OsmFrame; readonly placement: ReplayFramePlacement; readonly placed: OsmFrame } {
  const recorded = liveOsmFrame(recorder);
  const fit = fitReplayWorkspace({ frame: recorder.viewport }, window.width, window.height).frame;
  const placement = { scale: fit.scale, offsetX: fit.offsetX, offsetY: fit.offsetY };
  return { recorded, placement, placed: osmFramePlaced(recorder.viewport, recorder.insets, recorded.scale, placement) };
}
