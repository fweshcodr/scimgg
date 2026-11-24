import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isNarrowWindow, NARROW_WINDOW_WIDTH, protectedPlayArea, sceneInFrame } from '../chromeBreakpoints';

describe('the narrow window', () => {
  it('is one line, at 720', () => {
    expect(isNarrowWindow(720)).toBe(true);
    expect(isNarrowWindow(721)).toBe(false);
  });

  it('is the same line in every stylesheet that switches the chrome', () => {
    // CSS cannot import the constant, so the media queries that switch the nav, sidebars
    // and tutorial must spell the same number. EncounterTitleCard follows its scene's
    // container size instead; EncounterTitleCard.test.ts guards those separate boundaries.
    const src = join(__dirname, '..', '..');
    for (const file of [
      'App.css',
      'components/SettingsSidebar.css',
      'components/PluginsPanel.css',
      'tutorial/components/TutorialOverlay.css',
    ]) {
      const css = readFileSync(join(src, file), 'utf8');
      const widths = [...css.matchAll(/@media[^{]*\((max|min)-width:\s*(\d+)px\)/g)].map(([, kind, px]) =>
        kind === 'max' ? Number(px) : Number(px) - 1,
      );
      expect(widths.length, file).toBeGreaterThan(0);
      // TutorialOverlay also has a 420px phone-portrait rule for its own card.
      expect(
        widths.filter((width) => width !== 420),
        file,
      ).toEqual(widths.filter((width) => width !== 420).map(() => NARROW_WINDOW_WIDTH));
    }
  });
});

describe('the scene in its frame', () => {
  const fixedFrame = (x: number, y: number, scale: number) => ({ x, y, width: 765 * scale, height: 503 * scale });

  it("finds Fixed's scene inside its frame, and takes a resizable frame as the scene", () => {
    expect(sceneInFrame(fixedFrame(10, 20, 2), true, true)).toEqual({ x: 18, y: 28, width: 1024, height: 668 });
    expect(sceneInFrame(fixedFrame(0, 0, 1), true, false)).toEqual({ x: 4, y: 4, width: 512, height: 476 });
    const frame = { x: 0, y: 0, width: 1280, height: 760 };
    expect(sceneInFrame(frame, false, true)).toBe(frame);
  });
});

describe('the protected play area', () => {
  it('is a band 0.2 of the scene height either side of its center, from 0.3 down to the bottom', () => {
    expect(protectedPlayArea({ x: 0, y: 0, width: 1270, height: 747 })).toEqual({
      left: 635 - 0.2 * 747,
      top: 0.3 * 747,
      right: 635 + 0.2 * 747,
      bottom: 747,
    });
    // Fixed's scene sits inside its frame.
    expect(protectedPlayArea({ x: 4, y: 4, width: 512, height: 334 })).toEqual({
      left: 260 - 0.2 * 334,
      top: 4 + 0.3 * 334,
      right: 260 + 0.2 * 334,
      bottom: 338,
    });
  });
});
