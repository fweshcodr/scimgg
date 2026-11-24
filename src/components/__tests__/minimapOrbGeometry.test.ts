import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPACT_ORBS_POSITION } from '../../hooks/usePersistedSettings';
import { FIXED_MINIMAP_ORB_FRAME_ORIGINS } from '../../layout/osrsClientLayout';
import { COMPACT_ORB_IDS, COMPACT_ORBS_LAYOUTS } from '../../types/compactOrbs';
import {
  COMPACT_ORBS_GEOMETRY,
  DESKTOP_ORB_FRAME,
  FIXED_ORBS_GEOMETRY,
  MOBILE_ORB_FRAME,
  MOBILE_ORBS_GEOMETRY,
  ORB_CENTER_X,
  ORB_CENTER_Y,
  ORB_CIRCLE_LEFT,
  ORB_CIRCLE_SIZE,
  ORB_CIRCLE_TOP,
  ORB_FRAME_HEIGHT,
  ORB_FRAME_WIDTH,
} from '../minimapOrbGeometry';

/** Frame boxes of a layout, in block-local pixels. */
function frameBoxes(layout: (typeof COMPACT_ORBS_LAYOUTS)[number]) {
  return COMPACT_ORBS_GEOMETRY[layout].centers.map((c) => ({
    left: c.x - ORB_CENTER_X,
    top: c.y - ORB_CENTER_Y,
    right: c.x - ORB_CENTER_X + ORB_FRAME_WIDTH,
    bottom: c.y - ORB_CENTER_Y + ORB_FRAME_HEIGHT,
  }));
}

describe('orb frame metrics', () => {
  it('centers the circle inside the frame', () => {
    expect(ORB_CENTER_X).toBe(ORB_CIRCLE_LEFT + ORB_CIRCLE_SIZE / 2);
    expect(ORB_CENTER_Y).toBe(ORB_CIRCLE_TOP + ORB_CIRCLE_SIZE / 2);
  });

  it('keeps the circle inside the frame', () => {
    expect(ORB_CIRCLE_LEFT + ORB_CIRCLE_SIZE).toBeLessThanOrEqual(ORB_FRAME_WIDTH);
    expect(ORB_CIRCLE_TOP + ORB_CIRCLE_SIZE).toBeLessThanOrEqual(ORB_FRAME_HEIGHT);
  });
});

describe('COMPACT_ORBS_GEOMETRY', () => {
  it('covers every layout', () => {
    expect(Object.keys(COMPACT_ORBS_GEOMETRY).sort()).toEqual([...COMPACT_ORBS_LAYOUTS].sort());
  });

  it.each(COMPACT_ORBS_LAYOUTS)('%s has one center per orb', (layout) => {
    expect(COMPACT_ORBS_GEOMETRY[layout].centers).toHaveLength(COMPACT_ORB_IDS.length);
  });

  it.each(COMPACT_ORBS_LAYOUTS)('%s keeps every orb frame inside the declared box', (layout) => {
    const { width, height, centers } = COMPACT_ORBS_GEOMETRY[layout];
    for (const { x, y } of centers) {
      const left = x - ORB_CENTER_X;
      const top = y - ORB_CENTER_Y;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + ORB_FRAME_WIDTH).toBeLessThanOrEqual(width);
      expect(top + ORB_FRAME_HEIGHT).toBeLessThanOrEqual(height);
    }
  });

  it.each(COMPACT_ORBS_LAYOUTS)('%s never overlaps two orb frames', (layout) => {
    const { centers } = COMPACT_ORBS_GEOMETRY[layout];
    for (let a = 0; a < centers.length; a++) {
      for (let b = a + 1; b < centers.length; b++) {
        const overlapsX = Math.abs(centers[a].x - centers[b].x) < ORB_FRAME_WIDTH;
        const overlapsY = Math.abs(centers[a].y - centers[b].y) < ORB_FRAME_HEIGHT;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('arranges vertical as a single column, top to bottom', () => {
    const { centers } = COMPACT_ORBS_GEOMETRY.vertical;
    expect(new Set(centers.map((c) => c.x)).size).toBe(1);
    expect(centers.map((c) => c.y)).toEqual([...centers.map((c) => c.y)].sort((a, b) => a - b));
  });

  it('arranges horizontal as a 2x2 filled column-major', () => {
    const { centers } = COMPACT_ORBS_GEOMETRY.horizontal;
    expect(centers[0].x).toBe(centers[1].x);
    expect(centers[2].x).toBe(centers[3].x);
    expect(centers[2].x).toBeGreaterThan(centers[0].x);
    expect(centers[1].y).toBeGreaterThan(centers[0].y);
    expect(centers[0].y).toBe(centers[2].y);
  });

  it('arranges horizontal-wide as a single row, left to right', () => {
    const { centers } = COMPACT_ORBS_GEOMETRY['horizontal-wide'];
    expect(new Set(centers.map((c) => c.y)).size).toBe(1);
    expect(centers.map((c) => c.x)).toEqual([...centers.map((c) => c.x)].sort((a, b) => a - b));
  });

  /**
   * Baking a 60px transparent band above the orbs to dodge
   * the floating top-right nav would make the panel claim far more room than
   * it draws (the wide layout would be 64% empty) and leak the dead area into
   * the alt-drag box, the snap outline and the viewport clamp. The nav is
   * dodged with an exclusion rect, so the box must stay flush on every side.
   */
  it.each(COMPACT_ORBS_LAYOUTS)('%s box is exactly the union of its orb frames, padded on no side', (layout) => {
    const { width, height } = COMPACT_ORBS_GEOMETRY[layout];
    const boxes = frameBoxes(layout);

    expect(Math.min(...boxes.map((b) => b.left))).toBe(0);
    expect(Math.min(...boxes.map((b) => b.top))).toBe(0);
    expect(Math.max(...boxes.map((b) => b.right))).toBe(width);
    expect(Math.max(...boxes.map((b) => b.bottom))).toBe(height);
  });

  it.each(COMPACT_ORBS_LAYOUTS)('%s draws over every pixel of its box', (layout) => {
    const { width, height } = COMPACT_ORBS_GEOMETRY[layout];
    const drawn = frameBoxes(layout).reduce((sum, b) => sum + (b.right - b.left) * (b.bottom - b.top), 0);
    expect(drawn).toBe(width * height);
  });
});

describe('DEFAULT_COMPACT_ORBS_POSITION', () => {
  /**
   * The block reserves no clearance band, so its default placement is
   * what keeps it out from under the floating top-right nav (Plugins toggle,
   * measured at y 24-53 desktop / y 8-43 mobile). Every layout anchors by its
   * top edge, so one offset covers all three.
   */
  const NAV_STRIP_BOTTOM = 53;

  it('anchors to the top-right corner, like the vanilla minimap', () => {
    expect(DEFAULT_COMPACT_ORBS_POSITION.anchorX).toBe('right');
    expect(DEFAULT_COMPACT_ORBS_POSITION.anchorY).toBe('top');
  });

  it.each(COMPACT_ORBS_LAYOUTS)('opens a %s block clear of the nav strip', (layout) => {
    const blockTop = DEFAULT_COMPACT_ORBS_POSITION.y;
    const blockBottom = blockTop + COMPACT_ORBS_GEOMETRY[layout].height;

    expect(blockTop).toBeGreaterThanOrEqual(NAV_STRIP_BOTTOM);
    expect(blockBottom).toBeGreaterThan(blockTop);
  });
});

describe('FIXED_ORBS_GEOMETRY', () => {
  const ORDER = ['hitpoints', 'prayer', 'run', 'special'] as const;

  it('centers each orb on its cache-authored frame origin', () => {
    ORDER.forEach((orb, slot) => {
      const origin = FIXED_MINIMAP_ORB_FRAME_ORIGINS[orb];
      expect(FIXED_ORBS_GEOMETRY.centers[slot]).toEqual({
        x: origin.x + ORB_CENTER_X,
        y: origin.y + ORB_CENTER_Y,
      });
    });
  });

  it('bounds all four frames', () => {
    for (const orb of ORDER) {
      const origin = FIXED_MINIMAP_ORB_FRAME_ORIGINS[orb];
      expect(origin.x + ORB_FRAME_WIDTH).toBeLessThanOrEqual(FIXED_ORBS_GEOMETRY.width);
      expect(origin.y + ORB_FRAME_HEIGHT).toBeLessThanOrEqual(FIXED_ORBS_GEOMETRY.height);
    }
  });

  it('bends the lower two orbs around the minimap rather than stacking at one pitch', () => {
    const xs = ORDER.map((orb) => FIXED_MINIMAP_ORB_FRAME_ORIGINS[orb].x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });
});

describe('mobile orbs (group 897 orbs_osm)', () => {
  it('centers each orb where 897 puts its 26x26 fill: frame origin + (35, 4)', () => {
    // 897:3/14/22/30 frame origins and 897:7/18/26/34 fills, local to 601:37 ORBS.
    expect(MOBILE_ORBS_GEOMETRY.centers).toEqual([
      { x: 3 + 35 + 13, y: 35 + 4 + 13 },
      { x: 0 + 35 + 13, y: 71 + 4 + 13 },
      { x: 10 + 35 + 13, y: 107 + 4 + 13 },
      { x: 38 + 35 + 13, y: 139 + 4 + 13 },
    ]);
  });

  it('uses the wider 65x34 frame and leaves the desktop frame as it was', () => {
    expect(MOBILE_ORB_FRAME).toMatchObject({ width: 65, height: 34, circleLeft: 35, circleTop: 4 });
    expect(DESKTOP_ORB_FRAME).toEqual({ width: 57, height: 34, circleLeft: 27, circleTop: 4, textCentreY: 21 });
  });

  it("moves the number by the difference between the two groups' number boxes", () => {
    // 160:10 is centered at y 22.5 and 897:6 at y 19, so mobile draws 3.5 rows higher.
    expect(MOBILE_ORB_FRAME.textCentreY).toBe(DESKTOP_ORB_FRAME.textCentreY - 3.5);
  });
});
