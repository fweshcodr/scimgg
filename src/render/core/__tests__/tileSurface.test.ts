import { describe, expect, it } from 'vitest';
import { createClassicTileSurface, sampleClassicTileSurface } from '../tileSurface';

describe('classic tile surface', () => {
  it('keeps paint faces in SE-NE-NW then SW-SE-NW order', () => {
    const surface = createClassicTileSurface(0, 0, [0, 0, 128, 0]);

    expect(surface.faces).toEqual([
      { isOverlay: false, a: 1, b: 2, c: 3 },
      { isOverlay: false, a: 0, b: 1, c: 3 },
    ]);
    expect(sampleClassicTileSurface(surface, 64, 64)).toBe(0);
  });

  it.each([
    [0, 64, 96, 384, 32, 64, 256],
    [1, 96, 64, 192, 64, 96, 384],
    [2, 64, 32, 64, 96, 64, 192],
    [3, 32, 64, 256, 64, 32, 64],
  ])('rotates edge-derived interior vertices for rotation %s', (rotation, xA, yA, heightA, xB, yB, heightB) => {
    const surface = createClassicTileSurface(10, rotation, [0, 128, 256, 512]);

    expect(surface.vertices.slice(4).map(({ x, y, height }) => [x, y, height])).toEqual([
      [xA, yA, heightA],
      [xB, yB, heightB],
    ]);
    expect(sampleClassicTileSurface(surface, xA, yA)).toBe(heightA);
    expect(sampleClassicTileSurface(surface, xB, yB)).toBe(heightB);
  });

  it.each([
    [0, 32, 32, 0],
    [1, 32, 96, 512],
    [2, 96, 96, 256],
    [3, 96, 32, 128],
  ])('keeps corner-derived interior heights for rotation %s', (rotation, x, y, height) => {
    const surface = createClassicTileSurface(12, rotation, [0, 128, 256, 512]);

    expect(surface.vertices[4]).toMatchObject({ x, y, height });
    expect(sampleClassicTileSurface(surface, x, y)).toBe(height);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('covers the whole tile for shape %s', (shape) => {
    for (let rotation = 0; rotation < 4; rotation++) {
      const surface = createClassicTileSurface(shape, rotation, [-63, -127, 255, -511]);

      for (let x = 0; x <= 128; x += 8) {
        for (let y = 0; y <= 128; y += 8) {
          expect(sampleClassicTileSurface(surface, x, y)).toBeTypeOf('number');
        }
      }
    }
  });

  it('selects the first containing face when faces overlap', () => {
    const surface = createClassicTileSurface(0, 0, [0, 0, 0, 0]);
    const overlapping = {
      vertices: [...surface.vertices, ...surface.vertices.map((vertex) => ({ ...vertex, height: 128 }))],
      faces: [
        ...surface.faces,
        ...surface.faces.map(({ isOverlay, a, b, c }) => ({ isOverlay, a: a + 4, b: b + 4, c: c + 4 })),
      ],
    };

    expect(sampleClassicTileSurface(overlapping, 64, 64)).toBe(0);
  });

  it('returns no sample outside all faces', () => {
    const surface = createClassicTileSurface(0, 0, [0, 0, 0, 0]);

    expect(sampleClassicTileSurface(surface, -1, 64)).toBeUndefined();
  });

  it('returns integer zero when a negative fraction truncates to zero', () => {
    const surface = createClassicTileSurface(0, 0, [0, 0, -1, 0]);

    expect(sampleClassicTileSurface(surface, 96, 96)).toBe(0);
  });

  it('keeps a boundary point inside before rounding interpolation weights', () => {
    const surface = createClassicTileSurface(0, 0, [128, 128, 128, 128]);

    expect(sampleClassicTileSurface(surface, 128, 0.0256)).toBe(128);
  });
});
