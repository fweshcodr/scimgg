import { describe, expect, it } from 'vitest';
import { buildTransparentFaceMap, type TransparentFaceMap } from '../../core/splitMeshByAlpha';
import { NpcInstanceManager } from '../NpcInstanceManager';

/**
 * `resolveTransparentFaceMap` derives the transparent triangles' model-face
 * indices into a manager-level scratch buffer and reuses the previous map when
 * they are unchanged, so the `Map` inside `buildTransparentFaceMap` is not
 * rebuilt on every animated frame. Two things must hold: the returned map must
 * always describe the CURRENT indices, and the array it retains must never alias
 * the scratch buffer the next call overwrites.
 */
class TestNpcInstanceManager extends NpcInstanceManager {
  resolve(
    existing: TransparentFaceMap | null,
    transparentTriIndices: Uint32Array,
    modelFaceIndices: Uint32Array,
  ): TransparentFaceMap {
    return this.resolveTransparentFaceMap(existing, transparentTriIndices, modelFaceIndices);
  }
}

/** modelFaceIndices[tri] for a mesh whose face ids are offset from tri index. */
const MODEL_FACES = new Uint32Array([10, 11, 12, 13, 14, 15, 16, 17]);

describe('NpcInstanceManager.resolveTransparentFaceMap', () => {
  it('maps transparent triangle indices through to model face indices', () => {
    const manager = new TestNpcInstanceManager();
    const map = manager.resolve(null, new Uint32Array([1, 3, 5]), MODEL_FACES);

    expect(Array.from(map.triToModelFace)).toEqual([11, 13, 15]);
    expect(map.modelFaceToTri.get(11)).toBe(0);
    expect(map.modelFaceToTri.get(13)).toBe(1);
    expect(map.modelFaceToTri.get(15)).toBe(2);
  });

  it('matches buildTransparentFaceMap on the same derived indices', () => {
    const manager = new TestNpcInstanceManager();
    const tris = new Uint32Array([0, 2, 4, 6]);
    const map = manager.resolve(null, tris, MODEL_FACES);
    const reference = buildTransparentFaceMap(new Uint32Array([10, 12, 14, 16]));

    expect(Array.from(map.triToModelFace)).toEqual(Array.from(reference.triToModelFace));
    expect([...map.modelFaceToTri.entries()]).toEqual([...reference.modelFaceToTri.entries()]);
  });

  it('reuses the existing map when the derived indices are unchanged', () => {
    const manager = new TestNpcInstanceManager();
    const tris = new Uint32Array([1, 3, 5]);
    const first = manager.resolve(null, tris, MODEL_FACES);
    const second = manager.resolve(first, tris, MODEL_FACES);

    expect(second).toBe(first);
  });

  it('rebuilds when a transparent face changes', () => {
    const manager = new TestNpcInstanceManager();
    const first = manager.resolve(null, new Uint32Array([1, 3, 5]), MODEL_FACES);
    const second = manager.resolve(first, new Uint32Array([1, 4, 5]), MODEL_FACES);

    expect(second).not.toBe(first);
    expect(Array.from(second.triToModelFace)).toEqual([11, 14, 15]);
    expect(second.modelFaceToTri.get(14)).toBe(1);
    expect(second.modelFaceToTri.has(13)).toBe(false);
  });

  it('rebuilds when the transparent face count changes', () => {
    const manager = new TestNpcInstanceManager();
    const first = manager.resolve(null, new Uint32Array([1, 3, 5]), MODEL_FACES);
    const grown = manager.resolve(first, new Uint32Array([1, 3, 5, 7]), MODEL_FACES);
    expect(grown).not.toBe(first);
    expect(Array.from(grown.triToModelFace)).toEqual([11, 13, 15, 17]);

    const shrunk = manager.resolve(grown, new Uint32Array([1, 3]), MODEL_FACES);
    expect(shrunk).not.toBe(grown);
    expect(Array.from(shrunk.triToModelFace)).toEqual([11, 13]);
  });

  it('does not alias the scratch buffer, so a retained map survives later calls', () => {
    const manager = new TestNpcInstanceManager();
    const first = manager.resolve(null, new Uint32Array([1, 3, 5]), MODEL_FACES);
    const firstIndices = Array.from(first.triToModelFace);

    // A later call with different indices reuses the same scratch buffer.
    manager.resolve(null, new Uint32Array([0, 2, 4]), MODEL_FACES);

    expect(Array.from(first.triToModelFace)).toEqual(firstIndices);
  });

  it('reuses a grown scratch buffer without leaking stale trailing entries', () => {
    const manager = new TestNpcInstanceManager();
    // Grow the scratch to 4, then ask for 2 - the retained array must be exactly
    // 2 long, not a 4-long view with stale tail values.
    manager.resolve(null, new Uint32Array([1, 3, 5, 7]), MODEL_FACES);
    const shorter = manager.resolve(null, new Uint32Array([0, 2]), MODEL_FACES);

    expect(shorter.triToModelFace).toHaveLength(2);
    expect(Array.from(shorter.triToModelFace)).toEqual([10, 12]);
  });

  it('handles an empty transparent set', () => {
    const manager = new TestNpcInstanceManager();
    const map = manager.resolve(null, new Uint32Array(0), MODEL_FACES);

    expect(map.triToModelFace).toHaveLength(0);
    expect(map.modelFaceToTri.size).toBe(0);
  });
});
