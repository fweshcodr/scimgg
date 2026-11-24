// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas2DRenderer } from './Canvas2DRenderer';

describe('Canvas2DRenderer', () => {
  let canvas: HTMLCanvasElement;
  let calls: string[];
  let scales: Array<[number, number]>;

  beforeEach(() => {
    calls = [];
    scales = [];
    canvas = document.createElement('canvas');
    const ctx = {
      resetTransform: () => calls.push('reset'),
      scale: (x: number, y: number) => {
        calls.push('scale');
        scales.push([x, y]);
      },
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) => {
      if (contextId === '2d') return ctx;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets the transform before scaling on resize', () => {
    const renderer = new Canvas2DRenderer();
    renderer.init(canvas);

    renderer.resize({ width: 301, height: 201, dpr: 1.5 });
    renderer.resize({ width: 301, height: 201, dpr: 1.5 });

    expect(calls).toEqual(['reset', 'scale', 'reset', 'scale']);
  });

  it('sizes a stretched canvas at its painted size and draws in layout pixels, then returns to normal', () => {
    const renderer = new Canvas2DRenderer();
    renderer.init(canvas);

    // Stretch to Window: laid out 512x334, drawn 1.25x wide and 1.5x tall at DPR 2.
    renderer.resize({ width: 512, height: 334, dpr: 2, paintScale: { x: 1.25, y: 1.5 } });
    expect([canvas.width, canvas.height]).toEqual([1280, 1002]);
    expect([canvas.style.width, canvas.style.height]).toEqual(['512px', '334px']);
    expect(scales.at(-1)).toEqual([2.5, 3]);

    renderer.resize({ width: 512, height: 334, dpr: 2 });
    expect([canvas.width, canvas.height]).toEqual([1024, 668]);
    expect([canvas.style.width, canvas.style.height]).toEqual(['512px', '334px']);
    expect(scales.at(-1)).toEqual([2, 2]);
    expect(calls).toEqual(['reset', 'scale', 'reset', 'scale']);
  });
});
