import { describe, expect, it } from 'vitest';
import {
  type FaceSortInput,
  type FaceSortResult,
  type SorterProjection,
  sortModelFaces,
  sortTransparentFacesOnly,
} from '../FacePrioritySorter';
import { referenceSortModelFaces, referenceSortTransparentFacesOnly } from './referenceFacePrioritySorter';

type Triangle = [[number, number, number], [number, number, number], [number, number, number]];

function createSimpleInput(overrides: Partial<FaceSortInput> = {}): FaceSortInput {
  const base: FaceSortInput = {
    verticesX: [0, 0, 100],
    verticesY: [0, 100, 0],
    verticesZ: [0, 0, 0],
    verticesCount: 3,
    indices1: [0],
    indices2: [1],
    indices3: [2],
    faceCount: 1,
    faceRenderPriorities: null,
    priority: 0,
    faceAlphas: null,
    faceColors3: [100],
  };

  return {
    ...base,
    ...overrides,
  };
}

function createProjection(overrides: Partial<SorterProjection> = {}): SorterProjection {
  const base: SorterProjection = {
    cameraX: 0,
    cameraY: 0,
    cameraZ: -1000,
    yawSin: 0,
    yawCos: 1,
    pitchSin: 0,
    pitchCos: 1,
    orientation: 0,
    modelX: 0,
    modelY: 0,
    modelZ: 0,
  };

  return {
    ...base,
    ...overrides,
  };
}

function createInputFromFaces(faces: Triangle[], overrides: Partial<FaceSortInput> = {}): FaceSortInput {
  const verticesX: number[] = [];
  const verticesY: number[] = [];
  const verticesZ: number[] = [];
  const indices1: number[] = [];
  const indices2: number[] = [];
  const indices3: number[] = [];
  const faceColors3: number[] = [];

  for (let i = 0; i < faces.length; i++) {
    const baseVertex = verticesX.length;
    const [a, b, c] = faces[i];

    verticesX.push(a[0], b[0], c[0]);
    verticesY.push(a[1], b[1], c[1]);
    verticesZ.push(a[2], b[2], c[2]);

    indices1.push(baseVertex);
    indices2.push(baseVertex + 1);
    indices3.push(baseVertex + 2);
    faceColors3.push(100 + i);
  }

  const base: FaceSortInput = {
    verticesX,
    verticesY,
    verticesZ,
    verticesCount: verticesX.length,
    indices1,
    indices2,
    indices3,
    faceCount: faces.length,
    faceRenderPriorities: null,
    priority: 0,
    faceAlphas: null,
    faceColors3,
  };

  return {
    ...base,
    ...overrides,
  };
}

function flattenResult(result: FaceSortResult): number[] {
  return [...result.opaqueFaces, ...result.transparentFaces];
}

describe('FacePrioritySorter', () => {
  it.each([
    { cullFace: 'back', expected: [0] },
    { cullFace: 'front', expected: [1] },
    { cullFace: 'none', expected: [0, 1] },
  ] as const)('honors explicit $cullFace culling before full-model sorting', ({ cullFace, expected }) => {
    const input = createInputFromFaces([
      [
        [0, 0, 0],
        [0, 100, 0],
        [100, 0, 0],
      ],
      [
        [0, 0, 0],
        [100, 0, 0],
        [0, 100, 0],
      ],
    ]);

    const result = sortModelFaces(input, createProjection(), cullFace);

    expect(result.opaqueFaces).toEqual(expected);
  });

  describe('sortTransparentFacesOnly', () => {
    it('returns only front-facing transparent faces in sorted order', () => {
      const input = createInputFromFaces([
        [
          [0, 0, 200],
          [0, 100, 200],
          [100, 0, 200],
        ],
        [
          [200, 0, 100],
          [200, 100, 100],
          [300, 0, 100],
        ],
      ]);

      const result = sortTransparentFacesOnly([0, 1], input, createProjection());
      expect(result).toEqual([0, 1]);
    });

    it('excludes back-facing transparent faces', () => {
      const input = createSimpleInput({ indices2: [2], indices3: [1] });

      const result = sortTransparentFacesOnly([0], input, createProjection());
      expect(result).toEqual([]);
    });

    it('returns empty when any vertex is behind near plane', () => {
      const input = createSimpleInput({
        verticesX: [0, 0, 100],
        verticesY: [0, 100, 0],
        verticesZ: [-960, 0, 0],
      });

      const result = sortTransparentFacesOnly([0], input, createProjection());
      expect(result).toEqual([]);
    });
  });

  describe('Basic edge cases', () => {
    it('returns empty result for empty input', () => {
      const input = createSimpleInput({
        verticesX: [],
        verticesY: [],
        verticesZ: [],
        verticesCount: 0,
        indices1: [],
        indices2: [],
        indices3: [],
        faceCount: 0,
        faceColors3: [],
      });

      const result = sortModelFaces(input, null);
      expect(result).toEqual({ opaqueFaces: [], transparentFaces: [] });
    });

    it('keeps one visible face in opaque list when projection is null', () => {
      const result = sortModelFaces(createSimpleInput(), null);
      expect(result.opaqueFaces).toEqual([0]);
      expect(result.transparentFaces).toEqual([]);
    });

    it('places single transparent face in transparent list', () => {
      const input = createSimpleInput({
        faceAlphas: new Int8Array([64]),
      });

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([]);
      expect(result.transparentFaces).toEqual([0]);
    });

    it('skips face with faceColors3 = -2', () => {
      const input = createSimpleInput({ faceColors3: [-2] });
      const result = sortModelFaces(input, null);
      expect(result).toEqual({ opaqueFaces: [], transparentFaces: [] });
    });
  });

  describe('Backface culling (with projection)', () => {
    it('includes a front-facing triangle', () => {
      const result = sortModelFaces(createSimpleInput(), createProjection());
      expect(result.opaqueFaces).toEqual([0]);
    });

    it('excludes a back-facing triangle', () => {
      const input = createSimpleInput({ indices2: [2], indices3: [1] });
      const result = sortModelFaces(input, createProjection());
      expect(flattenResult(result)).toEqual([]);
    });

    it('excludes a degenerate triangle with zero area', () => {
      const input = createSimpleInput({
        verticesX: [0, 10, 20],
        verticesY: [0, 0, 0],
        verticesZ: [0, 0, 0],
      });

      const result = sortModelFaces(input, createProjection());
      expect(flattenResult(result)).toEqual([]);
    });
  });

  describe('Depth sorting (with projection)', () => {
    it('renders farther face first', () => {
      const input = createInputFromFaces([
        [
          [0, 0, 200],
          [0, 100, 200],
          [100, 0, 200],
        ],
        [
          [200, 0, 100],
          [200, 100, 100],
          [300, 0, 100],
        ],
      ]);

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([0, 1]);
    });

    it('keeps all faces from same depth bucket', () => {
      const input = createInputFromFaces([
        [
          [0, 0, 100],
          [0, 100, 100],
          [100, 0, 100],
        ],
        [
          [200, 0, 100],
          [200, 100, 100],
          [300, 0, 100],
        ],
        [
          [400, 0, 100],
          [400, 100, 100],
          [500, 0, 100],
        ],
      ]);

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([0, 1, 2]);
    });
  });

  describe('Priority interleaving', () => {
    it('orders faceRenderPriorities 0-9 by ascending priority', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
          [
            [600, 0, 0],
            [600, 100, 0],
            [700, 0, 0],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([3, 1, 0, 2]),
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([2, 1, 3, 0]);
    });

    it('clamps priorities to 0..11 before ordering', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([-5, 12, 9]),
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([1, 0, 2]);
    });

    it('interleaves priority 10 faces at avg12 boundary', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 3],
            [0, 100, 3],
            [100, 0, 3],
          ],
          [
            [200, 0, 1],
            [200, 100, 1],
            [300, 0, 1],
          ],
          [
            [400, 0, 3],
            [400, 100, 3],
            [500, 0, 3],
          ],
          [
            [600, 0, 2],
            [600, 100, 2],
            [700, 0, 2],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([10, 0, 1, 2]),
        },
      );

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([0, 1, 2, 3]);
    });

    it('draws priority 11 dynamic faces after priority 10 dynamic faces', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 3],
            [0, 100, 3],
            [100, 0, 3],
          ],
          [
            [200, 0, 2],
            [200, 100, 2],
            [300, 0, 2],
          ],
          [
            [400, 0, 1],
            [400, 100, 1],
            [500, 0, 1],
          ],
          [
            [600, 0, 1],
            [600, 100, 1],
            [700, 0, 1],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([10, 11, 0, 1]),
        },
      );

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([0, 1, 2, 3]);
    });

    it('uses uniform input.priority when faceRenderPriorities is null', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
        ],
        {
          faceRenderPriorities: null,
          priority: 7,
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([0, 1, 2]);
    });

    it('separates transparent and opaque while preserving order', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([0, 1, 2]),
          faceAlphas: new Int8Array([0, 32, 0]),
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([0, 2]);
      expect(result.transparentFaces).toEqual([1]);
    });
  });

  describe('RuneLite parity', () => {
    it('uses Math.trunc for avgDistance instead of rounding', () => {
      const input = createInputFromFaces([
        [
          [0, 0, 0],
          [0, 100, 1],
          [100, 0, 1],
        ],
        [
          [200, 0, 1],
          [200, 100, 1],
          [300, 0, 1],
        ],
      ]);

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([1, 0]);
    });

    it('returns empty when diameter is 6000 or more', () => {
      const input = createSimpleInput({
        verticesX: [0, 0, 100],
        verticesY: [0, 100, 0],
        verticesZ: [0, 0, 5999],
      });

      const result = sortModelFaces(input, createProjection());
      expect(result).toEqual({ opaqueFaces: [], transparentFaces: [] });
    });

    it('still sorts when diameter is exactly 5999', () => {
      const input = createSimpleInput({
        verticesX: [0, 0, 100],
        verticesY: [0, 100, 0],
        verticesZ: [0, 0, 5998],
      });

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces).toEqual([0]);
    });

    it('uses truncation for avg12 integer division with odd sums', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 2],
            [0, 100, 2],
            [100, 0, 2],
          ],
          [
            [200, 0, 1],
            [200, 100, 1],
            [300, 0, 1],
          ],
          [
            [400, 0, 2],
            [400, 100, 2],
            [500, 0, 2],
          ],
          [
            [600, 0, 1],
            [600, 100, 1],
            [700, 0, 1],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([10, 0, 1, 2]),
        },
      );

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces[0]).toBe(0);
    });

    it('uses truncation for avg34 integer division with odd sums', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 2],
            [0, 100, 2],
            [100, 0, 2],
          ],
          [
            [200, 0, 2],
            [200, 100, 2],
            [300, 0, 2],
          ],
          [
            [400, 0, 2],
            [400, 100, 2],
            [500, 0, 2],
          ],
          [
            [600, 0, 1],
            [600, 100, 1],
            [700, 0, 1],
          ],
          [
            [800, 0, 2],
            [800, 100, 2],
            [900, 0, 2],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([10, 1, 2, 4, 3]),
        },
      );

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces.indexOf(0)).toBeLessThan(result.opaqueFaces.indexOf(4));
    });

    it('uses truncation for avg68 integer division with odd sums', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 2],
            [0, 100, 2],
            [100, 0, 2],
          ],
          [
            [200, 0, 2],
            [200, 100, 2],
            [300, 0, 2],
          ],
          [
            [400, 0, 2],
            [400, 100, 2],
            [500, 0, 2],
          ],
          [
            [600, 0, 2],
            [600, 100, 2],
            [700, 0, 2],
          ],
          [
            [800, 0, 2],
            [800, 100, 2],
            [900, 0, 2],
          ],
          [
            [1000, 0, 2],
            [1000, 100, 2],
            [1100, 0, 2],
          ],
          [
            [1200, 0, 1],
            [1200, 100, 1],
            [1300, 0, 1],
          ],
        ],
        {
          faceRenderPriorities: new Int8Array([10, 1, 2, 3, 4, 6, 8]),
        },
      );

      const result = sortModelFaces(input, createProjection());
      expect(result.opaqueFaces.indexOf(0)).toBeLessThan(result.opaqueFaces.indexOf(5));
    });
  });

  describe('Near-plane clipping', () => {
    it('returns empty when any vertex depth is below 50', () => {
      const input = createSimpleInput({
        verticesX: [0, 0, 100],
        verticesY: [0, 100, 0],
        verticesZ: [-960, 0, 0],
      });

      const result = sortModelFaces(input, createProjection());
      expect(result).toEqual({ opaqueFaces: [], transparentFaces: [] });
    });
  });

  describe('No-projection path', () => {
    it('uses face index order when projection is null', () => {
      const input = createInputFromFaces([
        [
          [0, 0, 0],
          [0, 100, 0],
          [100, 0, 0],
        ],
        [
          [200, 0, 0],
          [200, 100, 0],
          [300, 0, 0],
        ],
        [
          [400, 0, 0],
          [400, 100, 0],
          [500, 0, 0],
        ],
      ]);

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([0, 1, 2]);
    });

    it('still separates opaque and transparent faces', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
        ],
        {
          faceAlphas: new Int8Array([0, 12, 99]),
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([0]);
      expect(result.transparentFaces).toEqual([1, 2]);
    });

    it('skips invisible faces even without projection', () => {
      const input = createInputFromFaces(
        [
          [
            [0, 0, 0],
            [0, 100, 0],
            [100, 0, 0],
          ],
          [
            [200, 0, 0],
            [200, 100, 0],
            [300, 0, 0],
          ],
          [
            [400, 0, 0],
            [400, 100, 0],
            [500, 0, 0],
          ],
        ],
        {
          faceColors3: [101, -2, 103],
        },
      );

      const result = sortModelFaces(input, null);
      expect(result.opaqueFaces).toEqual([0, 2]);
      expect(result.transparentFaces).toEqual([]);
    });
  });

  describe('Orientation rotation', () => {
    it('applies orientation before projection (512 rotates by 90 degrees)', () => {
      const input = createSimpleInput({
        verticesX: [0, 100, 0],
        verticesY: [0, 100, 0],
        verticesZ: [0, 0, 100],
      });

      const noRotation = sortModelFaces(input, createProjection({ orientation: 0 }));
      const rotated = sortModelFaces(input, createProjection({ orientation: 512 }));

      expect(flattenResult(noRotation)).toEqual([]);
      expect(rotated.opaqueFaces).toEqual([0]);
    });
  });
});

describe('FacePrioritySorter scratch reuse', () => {
  function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A model whose faces span every priority, alpha and hidden-face case the sorter branches on. */
  function randomModel(next: () => number, faceCount: number, withPriorities: boolean): FaceSortInput {
    const verticesCount = faceCount * 3;
    const verticesX = new Int32Array(verticesCount);
    const verticesY = new Int32Array(verticesCount);
    const verticesZ = new Int32Array(verticesCount);
    for (let v = 0; v < verticesCount; v++) {
      verticesX[v] = Math.round((next() - 0.5) * 800);
      verticesY[v] = Math.round((next() - 0.5) * 800);
      verticesZ[v] = Math.round((next() - 0.5) * 800);
    }
    const indices1 = new Int32Array(faceCount);
    const indices2 = new Int32Array(faceCount);
    const indices3 = new Int32Array(faceCount);
    const faceColors3 = new Int32Array(faceCount);
    const faceAlphas = new Int8Array(faceCount);
    const faceRenderPriorities = new Int8Array(faceCount);
    for (let f = 0; f < faceCount; f++) {
      indices1[f] = Math.floor(next() * verticesCount);
      indices2[f] = Math.floor(next() * verticesCount);
      indices3[f] = Math.floor(next() * verticesCount);
      faceColors3[f] = next() < 0.05 ? -2 : 100;
      faceAlphas[f] = next() < 0.4 ? Math.floor(next() * 200) - 100 : 0;
      faceRenderPriorities[f] = Math.floor(next() * 12);
    }
    return {
      verticesX,
      verticesY,
      verticesZ,
      verticesCount,
      indices1,
      indices2,
      indices3,
      faceCount,
      faceRenderPriorities: withPriorities ? faceRenderPriorities : null,
      priority: Math.floor(next() * 12),
      faceAlphas: next() < 0.8 ? faceAlphas : null,
      faceColors3,
    };
  }

  function randomProjection(next: () => number): SorterProjection {
    const yaw = next() * Math.PI * 2;
    const pitch = 0.2 + next() * 0.8;
    return createProjection({
      cameraZ: -3000 - next() * 2000,
      yawSin: Math.sin(yaw),
      yawCos: Math.cos(yaw),
      pitchSin: Math.sin(pitch),
      pitchCos: Math.cos(pitch),
      orientation: Math.floor(next() * 2048),
      modelX: Math.round((next() - 0.5) * 400),
      modelZ: Math.round((next() - 0.5) * 400),
    });
  }

  const copy = (result: FaceSortResult) => ({
    opaqueFaces: [...result.opaqueFaces],
    transparentFaces: [...result.transparentFaces],
  });

  // Large and small models interleave so every call starts from scratch arrays still holding a
  // longer earlier result: a read past the current counts would surface those stale faces.
  const sizes = [1500, 3, 700, 40, 1, 1200, 0, 90, 2, 400];

  it('sorts every model as the clear-and-push sorter did', () => {
    const next = random(1);
    let sorted = 0;
    for (let round = 0; round < 40; round++) {
      const faceCount = sizes[round % sizes.length];
      const input = randomModel(next, faceCount, next() < 0.6);
      const projection = next() < 0.15 ? null : randomProjection(next);
      const cullFace = (['back', 'front', 'none'] as const)[Math.floor(next() * 3)];

      const expected = copy(referenceSortModelFaces(input, projection, cullFace));
      expect(copy(sortModelFaces(input, projection, cullFace))).toEqual(expected);
      sorted += expected.opaqueFaces.length + expected.transparentFaces.length;
    }
    expect(sorted).toBeGreaterThan(5000);
  });

  it('keeps a result intact through the next call, as callers holding two results rely on', () => {
    const next = random(2);
    for (let round = 0; round < 20; round++) {
      const first = randomModel(next, sizes[round % sizes.length], true);
      const second = randomModel(next, sizes[(round + 3) % sizes.length], next() < 0.5);
      const projection = randomProjection(next);

      const expectedFirst = copy(referenceSortModelFaces(first, projection));
      const expectedSecond = copy(referenceSortModelFaces(second, projection));
      const firstResult = sortModelFaces(first, projection);
      const secondResult = sortModelFaces(second, projection);

      expect(copy(firstResult)).toEqual(expectedFirst);
      expect(copy(secondResult)).toEqual(expectedSecond);
    }
  });

  it('sorts transparent subsets as the allocating sorter did', () => {
    const next = random(3);
    let sorted = 0;
    for (let round = 0; round < 40; round++) {
      const faceCount = sizes[round % sizes.length];
      const input = randomModel(next, faceCount, next() < 0.6);
      const subset = Uint32Array.from({ length: faceCount }, (_, face) => face).filter(() => next() < 0.5);
      const projection = randomProjection(next);

      const expected = [...referenceSortTransparentFacesOnly(subset, input, projection)];
      expect([...sortTransparentFacesOnly(subset, input, projection)]).toEqual(expected);
      sorted += expected.length;
      // Interleaving full sorts must not disturb the shared priority buckets either way.
      const full = copy(referenceSortModelFaces(input, projection));
      expect(copy(sortModelFaces(input, projection))).toEqual(full);
    }
    expect(sorted).toBeGreaterThan(1000);
  });
});
