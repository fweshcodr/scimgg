import { describe, expect, it } from 'vitest';
import { ZUK_INTRO_CUTSCENE, zukIntroAddTick, zukIntroCutsceneFrame } from '../introCutscene';

const C = 40;
/** A presentation tick `cycles` client cycles (20 ms) after `offset` ticks from C. */
const at = (offset: number, cycles = 0) => C + offset + cycles / 30;

describe('zukIntroCutsceneFrame', () => {
  it('shows nothing outside C-12..C, before wave 68 clears, or on a run started on wave 69', () => {
    expect(zukIntroCutsceneFrame(null, 100)).toBeNull();
    expect(zukIntroCutsceneFrame(C, at(-12, -1))).toBeNull();
    expect(zukIntroCutsceneFrame(C, at(0))).toBeNull();
    expect(zukIntroCutsceneFrame(C, at(5))).toBeNull();
    // A wave-69 start opens at C = 0 and never shows an earlier tick.
    for (let tick = 0; tick < 3; tick += 0.25) expect(zukIntroCutsceneFrame(0, tick)).toBeNull();
  });

  it('fades to black over 15 cycles from C-12, holds, and fades back over 50 cycles from C-8', () => {
    const fade = (offset: number, cycles = 0) => zukIntroCutsceneFrame(C, at(offset, cycles))?.fadeOpacity;
    expect(fade(-12)).toBe(0);
    expect(fade(-12, 7.5)).toBeCloseTo(0.5);
    expect(fade(-12, 15)).toBe(1);
    expect(fade(-10)).toBe(1);
    expect(fade(-8, -1)).toBe(1);
    expect(fade(-8)).toBe(1);
    expect(fade(-8, 25)).toBeCloseTo(0.5);
    expect(fade(-8, 50)).toBeCloseTo(0, 9);
    expect(fade(-8, 51)).toBe(0);
    expect(fade(-1)).toBe(0);
  });

  it('cuts to the captured view at C-9 and holds it, shaking, until C', () => {
    expect(zukIntroCutsceneFrame(C, at(-10))?.camera).toBeNull();
    const { eye, lookAt } = ZUK_INTRO_CUTSCENE.camera;
    for (const tick of [at(-9), at(-5, 13), at(-1, 29)]) {
      const camera = zukIntroCutsceneFrame(C, tick)?.camera;
      expect(camera).toMatchObject({ eye: { tile: [35, 35], height: 1000 }, lookAt: { tile: [28, 56], height: 140 } });
      expect(camera?.eye).toBe(eye);
      expect(camera?.lookAt).toBe(lookAt);
      camera?.shake.forEach((offset, axis) => {
        expect(Math.abs(offset)).toBeLessThanOrEqual(ZUK_INTRO_CUTSCENE.shake.random[axis]);
      });
    }
  });

  it('draws the same shake for the same client cycle, so a replay seek lands on it', () => {
    const shakes = Array.from({ length: 60 }, (_, cycle) => zukIntroCutsceneFrame(C, at(-6, cycle))?.camera?.shake);
    expect(shakes).toEqual(
      Array.from({ length: 60 }, (_, cycle) => zukIntroCutsceneFrame(C, at(-6, cycle))?.camera?.shake),
    );
    // It moves: not one fixed offset for the whole hold.
    expect(new Set(shakes.map((shake) => JSON.stringify(shake))).size).toBeGreaterThan(1);
  });
});

describe('zukIntroAddTick', () => {
  it('is C-8 after the intro and C on a run started on wave 69', () => {
    expect(zukIntroAddTick(C)).toBe(C - 8);
    expect(zukIntroAddTick(0)).toBe(0);
  });
});
