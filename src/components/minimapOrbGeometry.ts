import { OSM_ORB_FRAME, OSM_ORB_FRAME_ORIGINS } from '../layout/osmClientLayout';
import { FIXED_MINIMAP_ORB_FRAME_ORIGINS } from '../layout/osrsClientLayout';
import type { CompactOrbsLayout } from '../types/compactOrbs';

/**
 * Orb frame metrics — the single source of truth for the space one orb takes.
 *
 * `MinimapOrbs` draws against these, and the compact block geometry below is
 * derived from them, so re-cutting the orb art cannot silently clip a compact
 * panel or misalign a slot.
 *
 * The frame is the full sprite: a number tab on the left, then the round orb.
 */
export const ORB_FRAME_WIDTH = 57;
export const ORB_FRAME_HEIGHT = 34;
export const ORB_CIRCLE_SIZE = 26;
export const ORB_CIRCLE_LEFT = 27;
export const ORB_CIRCLE_TOP = 4;

/** Offset from the frame's top-left corner to the orb circle's center. */
export const ORB_CENTER_X = ORB_CIRCLE_LEFT + ORB_CIRCLE_SIZE / 2;
export const ORB_CENTER_Y = ORB_CIRCLE_TOP + ORB_CIRCLE_SIZE / 2;

interface CompactOrbsGeometry {
  readonly width: number;
  readonly height: number;
  /** Orb-circle centers, in slot order (slot 0 holds the first orb in the order). */
  readonly centers: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Builds a compact block of four orb frames tiled edge to edge, filled
 * column-major to match the RuneLite plugin's slot order (in the 2x2 layout,
 * slots 1-2 are the left column and slots 3-4 the right).
 *
 * Blocks are sized to exactly what they draw, so all three layouts hug their
 * anchor identically. The RuneLite plugin's containers are wider because they
 * reserve room for its compass, XP, world-map and logout buttons, none of which
 * this port ships; carrying that width over would float the orbs away from the
 * corner they anchor to.
 */
function compactBlock(columns: number, rows: number): CompactOrbsGeometry {
  const centers: { x: number; y: number }[] = [];
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      centers.push({
        x: column * ORB_FRAME_WIDTH + ORB_CENTER_X,
        y: row * ORB_FRAME_HEIGHT + ORB_CENTER_Y,
      });
    }
  }
  return {
    width: columns * ORB_FRAME_WIDTH,
    height: rows * ORB_FRAME_HEIGHT,
    centers,
  };
}

export const COMPACT_ORBS_GEOMETRY: Record<CompactOrbsLayout, CompactOrbsGeometry> = {
  vertical: compactBlock(1, 4),
  horizontal: compactBlock(2, 2),
  'horizontal-wide': compactBlock(4, 1),
};

/**
 * Fixed's four frame origins come directly from interface group 160 mounted in
 * group 548 component 25. The lower two curve right around the minimap, so a
 * single vertical pitch cannot reproduce the client.
 */
export const FIXED_ORBS_GEOMETRY: CompactOrbsGeometry = {
  width: FIXED_MINIMAP_ORB_FRAME_ORIGINS.special.x + ORB_FRAME_WIDTH,
  height: FIXED_MINIMAP_ORB_FRAME_ORIGINS.special.y + ORB_FRAME_HEIGHT,
  centers: [
    FIXED_MINIMAP_ORB_FRAME_ORIGINS.hitpoints,
    FIXED_MINIMAP_ORB_FRAME_ORIGINS.prayer,
    FIXED_MINIMAP_ORB_FRAME_ORIGINS.run,
    FIXED_MINIMAP_ORB_FRAME_ORIGINS.special,
  ].map((origin) => ({ x: origin.x + ORB_CENTER_X, y: origin.y + ORB_CENTER_Y })),
};

/**
 * Where one orb frame's pieces sit. The desktop frame (sprite 1071, group 160) and the
 * mobile one (TliButton01Orbinfo65x34, group 897) hold the same 26x26 orb, but the mobile
 * frame's number tab is eight columns wider.
 *
 * The number is centered across the tab, `0..circleLeft`, at `textCentreY`. On desktop those
 * are the values this component has always drawn at; mobile moves both by the difference
 * between the two groups' number boxes (160:10 at (4,16) 23x13; 897:6 at x=8, centered +2),
 * so the two frames keep the same relationship to their cache rects.
 */
export interface OrbFrameMetrics {
  readonly width: number;
  readonly height: number;
  readonly circleLeft: number;
  readonly circleTop: number;
  readonly textCentreY: number;
}

export const DESKTOP_ORB_FRAME: OrbFrameMetrics = {
  width: ORB_FRAME_WIDTH,
  height: ORB_FRAME_HEIGHT,
  circleLeft: ORB_CIRCLE_LEFT,
  circleTop: ORB_CIRCLE_TOP,
  textCentreY: 21,
};

const DESKTOP_TEXT_BOX_CENTRE_Y = 16 + 13 / 2;
const MOBILE_TEXT_BOX_CENTRE_Y =
  (OSM_ORB_FRAME.height - OSM_ORB_FRAME.textHeight) / 2 + OSM_ORB_FRAME.textCentreDy + OSM_ORB_FRAME.textHeight / 2;

export const MOBILE_ORB_FRAME: OrbFrameMetrics = {
  width: OSM_ORB_FRAME.width,
  height: OSM_ORB_FRAME.height,
  circleLeft: OSM_ORB_FRAME.circleLeft,
  circleTop: OSM_ORB_FRAME.circleTop,
  textCentreY: DESKTOP_ORB_FRAME.textCentreY + (MOBILE_TEXT_BOX_CENTRE_Y - DESKTOP_TEXT_BOX_CENTRE_Y),
};

/** Group 897's four frame origins, local to 601:37 ORBS. */
export const MOBILE_ORBS_GEOMETRY: CompactOrbsGeometry = {
  width: OSM_ORB_FRAME_ORIGINS.special.x + MOBILE_ORB_FRAME.width,
  height: OSM_ORB_FRAME_ORIGINS.special.y + MOBILE_ORB_FRAME.height,
  centers: [
    OSM_ORB_FRAME_ORIGINS.hitpoints,
    OSM_ORB_FRAME_ORIGINS.prayer,
    OSM_ORB_FRAME_ORIGINS.run,
    OSM_ORB_FRAME_ORIGINS.special,
  ].map((origin) => ({
    x: origin.x + MOBILE_ORB_FRAME.circleLeft + ORB_CIRCLE_SIZE / 2,
    y: origin.y + MOBILE_ORB_FRAME.circleTop + ORB_CIRCLE_SIZE / 2,
  })),
};
