import { describe, expect, it } from 'vitest';
import { ModelData } from '../../../model/ModelData';
import { SeqBase } from '../../../model/seq/SeqBase';
import { SeqFrame } from '../../../model/seq/SeqFrame';
import { SeqTransformType } from '../../../model/seq/SeqTransformType';

/**
 * Loc models are pre-rotated by `getLocModelData` before the sequence frame is
 * applied, but a seq-frame TRANSLATE (and ROTATE) acts along the model's CURRENT
 * axes (see ModelData.applyTransform). So animating an already-rotated model
 * sends limbs the wrong way for loc rotations 1–3 — which distorts every
 * arena shield-combatant except the un-rotated north wall.
 *
 * The loader follows rs-map-viewer's LocModelLoader.transformModel: for a loc
 * rotation R the per-frame work must be `un-rotate → animate → re-rotate`, which
 * is equivalent to "animate in the model's base orientation, then apply R".
 */

/** All vertices use skin group 0 so they animate together. */
function makeModel(): ModelData {
  const m = new ModelData();
  m.verticesCount = 3;
  m.usedVertexCount = 3;
  m.verticesX = Int32Array.from([100, 0, 0]);
  m.verticesY = Int32Array.from([0, 50, 0]);
  m.verticesZ = Int32Array.from([0, 0, 100]);
  m.vertexSkins = Int32Array.from([0, 0, 0]);
  m.faceCount = 0;
  m.computeAnimationTables();
  return m;
}

/** A single +10 X TRANSLATE applied to skin group 0. */
function makeTranslateFrame(): SeqFrame {
  const base = new SeqBase(-1, 1, [SeqTransformType.TRANSLATE], [true], new Uint16Array([0]), [[0]]);
  return new SeqFrame(-1, base, 1, [0], [10], [0], [0], [-1], false, false);
}

function rotateLoc(m: ModelData, rotation: number): void {
  const rot = rotation & 3;
  if (rot === 1) m.rotate90();
  else if (rot === 2) m.rotate180();
  else if (rot === 3) m.rotate270();
}

function animateWithRotation(m: ModelData, frame: SeqFrame, rotation: number): void {
  const rot = rotation & 3;
  if (rot === 1) m.rotate270();
  else if (rot === 2) m.rotate180();
  else if (rot === 3) m.rotate90();

  m.animate(frame);

  if (rot === 1) m.rotate90();
  else if (rot === 2) m.rotate180();
  else if (rot === 3) m.rotate270();
}

function xyz(m: ModelData): number[][] {
  return [Array.from(m.verticesX), Array.from(m.verticesY), Array.from(m.verticesZ)];
}

describe('animated loc rotation order', () => {
  for (const rotation of [1, 2, 3]) {
    it(`rotation ${rotation}: un-rotate→animate→re-rotate equals animate-then-place`, () => {
      const expected = makeModel();
      expected.animate(makeTranslateFrame());
      rotateLoc(expected, rotation);

      const loaderFixed = makeModel();
      rotateLoc(loaderFixed, rotation);
      animateWithRotation(loaderFixed, makeTranslateFrame(), rotation);

      expect(xyz(loaderFixed)).toEqual(xyz(expected));
    });

    it(`rotation ${rotation}: rotate-then-animate does not match animate-then-place`, () => {
      const expected = makeModel();
      expected.animate(makeTranslateFrame());
      rotateLoc(expected, rotation);

      const buggy = makeModel();
      rotateLoc(buggy, rotation);
      buggy.animate(makeTranslateFrame());

      expect(xyz(buggy)).not.toEqual(xyz(expected));
    });
  }

  it('rotation 0 (north wall) is unaffected — no rotation applied', () => {
    const expected = makeModel();
    expected.animate(makeTranslateFrame());

    const loader = makeModel();
    rotateLoc(loader, 0);
    animateWithRotation(loader, makeTranslateFrame(), 0);

    expect(xyz(loader)).toEqual(xyz(expected));
  });
});
