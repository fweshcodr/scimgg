import { describe, expect, it } from 'vitest';
import { clampDevicePixelRatio, MAX_DEVICE_PIXEL_RATIO } from '../useDevicePixelRatio';

describe('clampDevicePixelRatio', () => {
  it('passes through ratios at or below the backing-buffer ceiling', () => {
    expect(clampDevicePixelRatio(1)).toBe(1);
    expect(clampDevicePixelRatio(1.25)).toBe(1.25);
    expect(clampDevicePixelRatio(1.5)).toBe(1.5);
    expect(clampDevicePixelRatio(2)).toBe(2);
  });

  it('caps dense displays so pixel count cannot grow without bound', () => {
    expect(clampDevicePixelRatio(3)).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(clampDevicePixelRatio(4)).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it('honors an explicit ceiling for surfaces that want exact density', () => {
    expect(clampDevicePixelRatio(3, Number.POSITIVE_INFINITY)).toBe(3);
    expect(clampDevicePixelRatio(1.5, 1)).toBe(1);
  });

  it('falls back to 1 for the values a detached or hidden window reports', () => {
    expect(clampDevicePixelRatio(0)).toBe(1);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
    expect(clampDevicePixelRatio(-2)).toBe(1);
  });
});
