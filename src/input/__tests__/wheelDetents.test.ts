import { describe, expect, it } from 'vitest';
import { makeWheelDetentReader } from '../wheelDetents';

/** A WheelEvent-shaped object; jsdom's constructor drops `wheelDeltaY`. */
function wheel(deltaY: number, wheelDeltaY?: number, deltaMode = 0) {
  return { deltaY, deltaMode, wheelDeltaY } as unknown as WheelEvent;
}

describe('makeWheelDetentReader', () => {
  it('reads a detented notch as exactly one, whatever deltaY the platform scales it to', () => {
    const read = makeWheelDetentReader();
    for (const deltaY of [53, 100, 125, 150]) expect(read(wheel(deltaY, -120))).toBe(1);
    expect(read(wheel(-100, 120))).toBe(-1);
  });

  it('counts notches the browser coalesced into one event', () => {
    expect(makeWheelDetentReader()(wheel(-300, 360))).toBe(-3);
  });

  it('accumulates a surface to whole notches, without losing one to float error', () => {
    const read = makeWheelDetentReader();
    // Chromium reports a trackpad as -deltaY * 3: each of these is a tenth of a notch.
    let total = 0;
    for (let i = 0; i < 10; i++) total += read(wheel(-4, 12));
    expect(total).toBe(-1);
  });

  it('drops a leftover fraction when the direction reverses', () => {
    const read = makeWheelDetentReader();
    for (let i = 0; i < 9; i++) read(wheel(-4, 12));
    expect(read(wheel(4, -12))).toBe(0);
    let total = 0;
    for (let i = 0; i < 9; i++) total += read(wheel(4, -12));
    expect(total).toBe(1);
  });

  it('reads line-mode mice (Firefox) as detented', () => {
    expect(makeWheelDetentReader()(wheel(3, undefined, 1))).toBe(1);
  });
});
