import { describe, expect, it } from 'vitest';
import {
  autoOverlayScale,
  autoOverlayTarget,
  crispOverlayScales,
  crispScaleAtMost,
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  overlaySpacesForLayout,
  resolveAutoScales,
  scaleOverlayDefaultPosition,
} from '../overlayScale';

const approx = (values: readonly number[]) => values.map((value) => Math.round(value * 1e6) / 1e6);

describe('crispOverlayScales', () => {
  // Measured (docs in crispOverlayScales): 0% soft glyph pixels
  // where scale x DPR is whole, 26-51% at halves, 60-85% anywhere else.
  it.each([
    // 1.25 is the gentle first step where nothing sits within 7% of it.
    [1, [1, 1.25, 1.5, 2, 2.5, 3]],
    [1.25, [1, 1.2, 1.6, 2, 2.4, 2.8]],
    [1.5, [1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3]],
    [2, [1, 1.25, 1.5, 2, 2.5, 3]],
    [3, [1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3]],
  ])('at DPR %d is %j', (dpr, expected) => {
    expect(approx(crispOverlayScales(dpr))).toEqual(approx(expected));
  });

  it('treats an unmeasured ratio as 1', () => {
    expect(crispOverlayScales(Number.NaN)).toEqual(crispOverlayScales(1));
  });
});

describe('crispScaleAtMost', () => {
  it('rounds down, never into a step the space has no room for', () => {
    expect(crispScaleAtMost(1.24, 1)).toBe(1);
    expect(crispScaleAtMost(1.25, 1)).toBe(1.25);
    expect(crispScaleAtMost(1.8, 1)).toBe(1.5);
    expect(crispScaleAtMost(0.4, 1)).toBe(OVERLAY_SCALE_MIN);
    expect(crispScaleAtMost(9, 1)).toBe(OVERLAY_SCALE_MAX);
  });

  it('takes a pixel-exact size up to 7% above the target', () => {
    // A 4K display at 150%: 1440p's 1.25 is the sharp 4/3 there.
    expect(crispScaleAtMost(1.25, 1.5)).toBeCloseTo(4 / 3, 9);
    // At 125% the nearest sharp size above, 1.6, is too far: 1.2.
    expect(crispScaleAtMost(1.25, 1.25)).toBe(1.2);
  });

  it('lands on every ladder size exactly', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      for (const scale of crispOverlayScales(dpr)) expect(crispScaleAtMost(scale, dpr)).toBe(scale);
    }
  });
});

describe('autoOverlayScale', () => {
  /**
   * Every monitor class as a browser sees it: from maximized with every bar showing up to
   * full screen, in CSS pixels. Windows takes a 30-48px taskbar, 71-87px of browser bars, a
   * 32px bookmarks bar and a 40px translate or download bar; macOS a 25-38px menu bar and a
   * 70px dock. Each class must land wholly on one size, whatever bars it shows.
   */
  const usableHeights = (height: number, os: 'windows' | 'mac') => {
    const heights = new Set([height]);
    const system = os === 'windows' ? [30, 40, 48] : [25, 38, 95, 108];
    const browser = os === 'windows' ? [71, 87] : [80];
    for (const s of system)
      for (const b of browser)
        for (const bm of [0, 32]) for (const bar of [0, 40]) heights.add(height - s - b - bm - bar);
    return [...heights];
  };

  it.each([
    // Small and 1080p-class screens keep the 1x design; 1080p and 1200p overlap (1200p
    // maximized with every bar is shorter than 1080p full screen), so they share it.
    ['1366x768', 1366, 768, 1, 'windows', 1],
    ['1080p at 125%', 1536, 864, 1.25, 'windows', 1],
    ['1600x900', 1600, 900, 1, 'windows', 1],
    ['1680x1050', 1680, 1050, 1, 'windows', 1],
    ['1080p', 1920, 1080, 1, 'windows', 1],
    ['2560x1080 ultrawide', 2560, 1080, 1, 'windows', 1],
    ['1200p', 1920, 1200, 1, 'windows', 1],
    ['1440p at 125%', 2048, 1152, 1.25, 'windows', 1],
    ['4K at 200%', 1920, 1080, 2, 'windows', 1],
    ['MacBook Air 13 at 200%', 1440, 900, 2, 'mac', 1],
    ['MacBook Pro 14 at 200%', 1512, 982, 2, 'mac', 1],
    ['MacBook Pro 16 at 200%', 1728, 1117, 2, 'mac', 1],
    // 1440p-class takes the gentle step, the same physical size at every OS scaling.
    ['1440p', 2560, 1440, 1, 'windows', 1.25],
    ['3440x1440 ultrawide', 3440, 1440, 1, 'windows', 1.25],
    ['5120x1440 super-ultrawide', 5120, 1440, 1, 'windows', 1.25],
    ['1600p', 2560, 1600, 1, 'windows', 1.25],
    ['4K at 150%', 2560, 1440, 1.5, 'windows', 4 / 3],
    ['4K at 125%', 3072, 1728, 1.25, 'windows', 1.2],
    // 4K-class and 5K get 2; 8K 2.5.
    ['4K', 3840, 2160, 1, 'windows', 2],
    ['5K', 5120, 2880, 1, 'windows', 2],
    ['8K', 7680, 4320, 1, 'windows', 2.5],
  ] as const)('%s lands on one size however its bars vary', (_label, width, height, dpr, os, expected) => {
    const sizes = new Set(usableHeights(height, os).map((h) => autoOverlayScale({ width, height: h }, dpr)));
    expect([...sizes].map((size) => Math.round(size * 1e6) / 1e6)).toEqual([Math.round(expected * 1e6) / 1e6]);
  });

  it('puts the review’s measured 1440p and 4K windows on one size each', () => {
    // 1440p with a download bar, with bookmarks, bare; 4K with and without bookmarks.
    for (const height of [1240, 1277, 1307]) expect(autoOverlayScale({ width: 2560, height }, 1)).toBe(1.25);
    for (const height of [1997, 2027]) expect(autoOverlayScale({ width: 3840, height }, 1)).toBe(2);
  });

  it('switches only in the gaps between window ranges', () => {
    expect(autoOverlayTarget({ width: 4000, height: 1215 })).toBe(1);
    expect(autoOverlayTarget({ width: 4000, height: 1216 })).toBe(1.25);
    // Windows sized by hand between 1440p and 4K pass through 1.5.
    expect(autoOverlayTarget({ width: 4000, height: 1800 })).toBe(1.5);
    expect(autoOverlayTarget({ width: 4000, height: 1900 })).toBe(2);
    expect(autoOverlayTarget({ width: 8000, height: 3500 })).toBe(2.5);
  });

  it('keeps a space narrower than 4:3 from growing just because it is tall', () => {
    expect(autoOverlayScale({ width: 1600, height: 1440 }, 1)).toBe(1);
    expect(autoOverlayScale({ width: 1640, height: 1440 }, 1)).toBe(1.25);
  });

  it('degrades to 1 for an unmeasured scene', () => {
    expect(autoOverlayScale({ width: 0, height: 0 }, 1)).toBe(1);
    expect(autoOverlayScale({ width: Number.NaN, height: 1080 }, 1)).toBe(1);
  });
});

describe('overlaySpacesForLayout and resolveAutoScales', () => {
  const autoFor = (inputs: Parameters<typeof overlaySpacesForLayout>[0], dpr = 1) =>
    resolveAutoScales(overlaySpacesForLayout(inputs), dpr);

  it('gives both spaces the window when the frame fills it', () => {
    const window = { width: 1920, height: 970 };
    expect(overlaySpacesForLayout({ layout: 'modern', window })).toEqual({ window, gameView: window });
    expect(overlaySpacesForLayout({ layout: 'classic', window, resolution: null }).gameView).toBe(window);
  });

  // One curve applied to each space. Where the frame fills the window both sizes match; a
  // small frame in a big window keeps the overlays modest while the buttons around it grow.
  it.each([
    // Resizable layouts filling the window: one size.
    ['modern', 1920, 970, undefined, null, 1, 1],
    ['modern', 2560, 1300, undefined, null, 1.25, 1.25],
    ['classic', 2560, 1440, undefined, null, 1.25, 1.25],
    ['modern', 3840, 2020, undefined, null, 2, 2],
    // Fixed, fit to the window: the buttons follow the window, the overlays the 512x334 view.
    ['fixed', 1920, 970, undefined, null, 1, 1],
    ['fixed', 2560, 1300, undefined, null, 1.25, 1],
    ['fixed', 3840, 2020, undefined, null, 2, 1.25],
    // Fixed at 1x: a 512x334 scene however big the window.
    ['fixed', 3840, 2020, 1, null, 2, 1],
    // A set resolution: the overlays follow the frame.
    ['modern', 2560, 1300, undefined, { width: 1280, height: 720 }, 1.25, 1],
    ['modern', 3840, 2020, undefined, { width: 1920, height: 1080 }, 2, 1],
    ['classic', 3840, 2160, undefined, { width: 2560, height: 1440 }, 2, 1.25],
    // A set resolution bigger than the window is sized by what the window shows of it.
    ['modern', 1920, 1080, undefined, { width: 3840, height: 2160 }, 1, 1],
  ] as const)('%s at %ix%i (fixed scale %s, resolution %j): buttons %d, overlays %d', (layout, width, height, fixedLayoutScale, resolution, chrome, scene) => {
    expect(autoFor({ layout, window: { width, height }, fixedLayoutScale, resolution })).toEqual({ chrome, scene });
  });

  it("follows Fixed's explicit client multiple rather than the window for the game view", () => {
    const spaces = overlaySpacesForLayout({
      layout: 'fixed',
      window: { width: 3840, height: 2160 },
      fixedLayoutScale: 1,
    });
    expect(spaces.gameView).toEqual({ width: 512, height: 334 });
    expect(spaces.window).toEqual({ width: 3840, height: 2160 });
  });

  it('sizes the overlays from the frame as laid out under Stretch to Window, not as stretched', () => {
    const window = { width: 2560, height: 1440 };
    // Stretch is laid out at the smaller axis's multiple, the same as Fit.
    expect(overlaySpacesForLayout({ layout: 'fixed', window, fixedLayoutScale: 'stretch' })).toEqual(
      overlaySpacesForLayout({ layout: 'fixed', window, fixedLayoutScale: 'fit' }),
    );
    // Integer scaling lays it out at 2x (3x by 2x stretched): the overlays follow the 2x.
    expect(
      overlaySpacesForLayout({ layout: 'fixed', window, fixedLayoutScale: 'stretch', fixedIntegerScaling: true })
        .gameView,
    ).toEqual({ width: 1024, height: 668 });
  });

  it('keeps each size in its own hysteresis band', () => {
    const spaces = { window: { width: 4000, height: 1180 }, gameView: { width: 4000, height: 1180 } };
    // Both just under the 1.25 switch point (1216px): each keeps the 1.25 it had.
    expect(resolveAutoScales(spaces, 1, { chrome: 1.25, scene: 1.25 })).toEqual({ chrome: 1.25, scene: 1.25 });
    expect(resolveAutoScales(spaces, 1, { chrome: 1, scene: 1 })).toEqual({ chrome: 1, scene: 1 });
  });
});

describe('scaleOverlayDefaultPosition', () => {
  it('scales a 1x default offset with the overlay, so stacked defaults keep their gaps', () => {
    const flick = { x: 104, y: 88, anchorX: 'left', anchorY: 'top' } as const;
    const dps = { x: 104, y: 248, anchorX: 'left', anchorY: 'top' } as const;
    for (const scale of crispOverlayScales(1.5)) {
      const scaledFlick = scaleOverlayDefaultPosition(flick, scale);
      const scaledDps = scaleOverlayDefaultPosition(dps, scale);
      expect(scaledDps.y - (scaledFlick.y + 144 * scale)).toBeCloseTo(16 * scale, 10);
    }
  });

  it('returns the same default at 1x', () => {
    const position = { x: 235, y: 96, anchorX: 'right', anchorY: 'top' } as const;
    expect(scaleOverlayDefaultPosition(position, 1)).toBe(position);
  });
});

describe('autoOverlayScale hysteresis', () => {
  // DPR 1: 1.25 from 1216px; the 6% band holds it down to 1148px.
  const at = (height: number) => ({ width: 4000, height });

  it('grows as soon as the next size fits, where a fresh load would land', () => {
    expect(autoOverlayScale(at(1216), 1, 1)).toBe(1.25);
    expect(autoOverlayScale(at(1215), 1, 1)).toBe(1);
  });

  it('shrinks only once the space is clearly below the switch point', () => {
    expect(autoOverlayScale(at(1150), 1, 1.25)).toBe(1.25);
    expect(autoOverlayScale(at(1145), 1, 1.25)).toBe(1);
  });

  it('does not hold across more than a band', () => {
    expect(autoOverlayScale(at(900), 1, 2)).toBe(1);
  });

  it('changes at once when the size on screen is not on this display’s ladder', () => {
    // A move from a 150% monitor, where 4/3 is sharp, to a 100% one, where it is not.
    expect(autoOverlayScale(at(1300), 1, 4 / 3)).toBe(1.25);
    expect(autoOverlayScale(at(1150), 1, 4 / 3)).toBe(1);
  });
});
