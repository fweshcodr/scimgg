import { describe, expect, it } from 'vitest';
import { COSINE, SINE } from '../../MathConstants';
import { ModelData } from '../ModelData';
import { SeqBase } from '../seq/SeqBase';
import { SeqFrame } from '../seq/SeqFrame';
import { SeqTransformType } from '../seq/SeqTransformType';

describe('ModelData.decode, format 3', () => {
  /**
   * One textured triangle in the format-3 layout (RuneLite ModelLoader.decodeType3): body blocks,
   * then the trailer (a flag byte, then a byte saying whether per-face depth offsets follow, then
   * one per face), then the 26-byte header ending 0xff 0xfd.
   */
  function texturedTriangle(faceOffsets: number[] | null): Int8Array {
    const body = [
      [0], // texture render type: simple
      [0, 1, 2], // vertex flags: origin, +x, +y
      [1], // face strip type: three explicit indices
      [64, 65, 65], // face indices 0, 1, 2 (smart deltas)
      [0, 1], // face texture 0 (stored +1)
      [0], // texture coord: none
      [0x12, 0x34], // face color
      [74], // vertex x delta 10
      [74], // vertex y delta 10
      [0, 0, 0, 1, 0, 2], // simple texture mapping
      [0], // trailer flag: no extra block
      faceOffsets ? [1, ...faceOffsets] : [0],
    ].flat();
    // vc, fc, tc, renderTypes, priority, alphas, faceSkins, textures, vertexSkins, maya,
    // x, y, z, face-index bytes, texture-coord bytes, vertex-skin bytes, then the 0xff 0xfd marker.
    const header = [0, 3, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0, 1, 0, 0, 0xff, 0xfd];
    return Int8Array.from([...body, ...header]);
  }

  it.each([
    ['with', [5]],
    ['without', null],
  ])('decodes a textured model %s trailing depth offsets, which it leaves unread', (_, offsets) => {
    const model = ModelData.decode(texturedTriangle(offsets));
    expect(Array.from(model.verticesX)).toEqual([0, 10, 10]);
    expect(Array.from(model.verticesY)).toEqual([0, 0, 10]);
    expect([model.indices1[0], model.indices2[0], model.indices3[0]]).toEqual([0, 1, 2]);
    expect(model.faceTextures?.[0]).toBe(0);
    expect(model.faceColors[0]).toBe(0x1234);
    // The trailer is not a per-textured-face bias: reading it as one overran short models.
    expect(model.faceBias).toBeUndefined();
  });
});

describe('ModelData.animateInterleaved', () => {
  it('applies an implicit origin reset even when its transform is masked out', () => {
    const model = new ModelData();
    model.verticesCount = 2;
    model.usedVertexCount = 2;
    model.verticesX = new Int32Array([10, 20]);
    model.verticesY = new Int32Array([0, 0]);
    model.verticesZ = new Int32Array([0, 0]);
    model.vertexLabels = [new Int32Array([0]), new Int32Array([1])];
    const base = new SeqBase(
      1,
      3,
      [SeqTransformType.ORIGIN, SeqTransformType.TRANSLATE, SeqTransformType.ROTATE],
      [true, true, true],
      new Uint16Array([0, 0, 0]),
      [[0], [0], [1]],
    );
    const primary = new SeqFrame(1, base, 2, [1, 2], [0, 0], [0, 0], [0, 64], [0, -1], false);
    const secondary = new SeqFrame(1, base, 0, [], [], [], [], [], false);

    model.animateInterleaved(primary, secondary, [1, 9999999]);

    expect([...model.verticesX]).toEqual([10, 10]);
    expect([...model.verticesY]).toEqual([0, -10]);
  });
});

describe('ModelData.computeLitColors', () => {
  /**
   * Preset normals so each term's dot product and denominator are exact. With light (0, 0, 2) and
   * contrast 256, lightIntensity is 2: smooth vertices divide by 2 * magnitude, flat faces by 3.
   */
  function litModel() {
    const model = new ModelData();
    model.faceCount = 4;
    model.indices1 = new Int32Array([0, 0, 0, 0]);
    model.indices2 = new Int32Array([1, 0, 1, 0]);
    model.indices3 = new Int32Array([2, 0, 2, 0]);
    model.faceColors = new Uint16Array([9176, 9176, 0, 0]);
    model.faceRenderTypes = new Int8Array([0, 1, 0, 1]);
    model.faceTextures = new Int16Array([-1, -1, 5, 5]);
    // x, y, z and the summed count per vertex.
    model.normals = Int32Array.from([
      ...[0, 0, -390, 430], // -780 / 860 = -0.91: contributes 0
      ...[0, 0, 1000, 430], // 2000 / 860 = +2.33: contributes 2
      ...[0, 0, -650, 430], // -1300 / 860 = -1.51: contributes -1
    ]);
    model.faceNormals = Int16Array.from([...[0, 0, 0], ...[0, 0, -1], ...[0, 0, 0], ...[0, 0, -1]]);
    return model.computeLitColors(64, 256, 0, 0, 2);
  }

  const packed = (brightness: number) => (brightness << 17) | ModelData.adjustLightness(9176, brightness);

  it('truncates the directional term toward zero before adding ambient on smooth untextured faces', () => {
    const { faceColors1, faceColors2, faceColors3 } = litModel();
    expect(packed(64)).toBe((64 << 17) | 9132);
    expect([faceColors1[0], faceColors2[0], faceColors3[0]]).toEqual([packed(64), packed(66), packed(63)]);
  });

  it('truncates the flat untextured face term before adding ambient', () => {
    const { faceColors1, faceColors3 } = litModel();
    // -2 / 3 contributes 0, not -1.
    expect([faceColors1[1], faceColors3[1]]).toEqual([packed(64), -1]);
  });

  it('uses the same truncation for textured smooth and flat faces', () => {
    const { faceColors1, faceColors2, faceColors3 } = litModel();
    expect([faceColors1[2], faceColors2[2], faceColors3[2]]).toEqual([64, 66, 63]);
    expect([faceColors1[3], faceColors3[3]]).toEqual([64, -1]);
  });
});

describe('ModelData.mirror', () => {
  it('negates model-space Z and reverses every face winding', () => {
    const model = new ModelData();
    model.verticesCount = 4;
    model.faceCount = 2;
    model.verticesX = new Int32Array([11, 22, 33, 44]);
    model.verticesY = new Int32Array([1, 2, 3, 4]);
    model.verticesZ = new Int32Array([-5, 0, 7, 13]);
    model.indices1 = new Int32Array([0, 1]);
    model.indices2 = new Int32Array([1, 2]);
    model.indices3 = new Int32Array([2, 3]);

    model.mirror();

    expect(Array.from(model.verticesX)).toEqual([11, 22, 33, 44]);
    expect(Array.from(model.verticesZ)).toEqual([5, 0, -7, -13]);
    expect(Array.from(model.indices1)).toEqual([2, 3]);
    expect(Array.from(model.indices2)).toEqual([1, 2]);
    expect(Array.from(model.indices3)).toEqual([0, 1]);
  });
});

/**
 * Reference `ModelData.applyTransform` written with for-of loops instead of indexed ones, with
 * the static animation origin passed in as `origin`.
 */
function referenceApplyTransform(
  model: ModelData,
  origin: { x: number; y: number; z: number },
  type: SeqTransformType,
  labels: number[],
  tx: number,
  ty: number,
  tz: number,
): void {
  if (!model.vertexLabels) {
    return;
  }

  switch (type) {
    case SeqTransformType.ORIGIN: {
      origin.x = 0;
      origin.y = 0;
      origin.z = 0;
      let groupVertexCount = 0;

      for (const label of labels) {
        if (label < model.vertexLabels.length) {
          for (const v of model.vertexLabels[label]) {
            origin.x += model.verticesX[v];
            origin.y += model.verticesY[v];
            origin.z += model.verticesZ[v];
            groupVertexCount++;
          }
        }
      }

      if (groupVertexCount > 0) {
        origin.x = tx + ((origin.x / groupVertexCount) | 0);
        origin.y = ty + ((origin.y / groupVertexCount) | 0);
        origin.z = tz + ((origin.z / groupVertexCount) | 0);
      } else {
        origin.x = tx;
        origin.y = ty;
        origin.z = tz;
      }
      break;
    }
    case SeqTransformType.TRANSLATE: {
      for (const label of labels) {
        if (label < model.vertexLabels.length) {
          for (const v of model.vertexLabels[label]) {
            model.verticesX[v] += tx;
            model.verticesY[v] += ty;
            model.verticesZ[v] += tz;
          }
        }
      }
      break;
    }
    case SeqTransformType.ROTATE: {
      for (const label of labels) {
        if (label < model.vertexLabels.length) {
          for (const v of model.vertexLabels[label]) {
            model.verticesX[v] -= origin.x;
            model.verticesY[v] -= origin.y;
            model.verticesZ[v] -= origin.z;

            const angleX = (tx & 0xff) * 8;
            const angleY = (ty & 0xff) * 8;
            const angleZ = (tz & 0xff) * 8;

            if (angleZ !== 0) {
              const sin = SINE[angleZ];
              const cos = COSINE[angleZ];
              const temp = (sin * model.verticesY[v] + cos * model.verticesX[v]) >> 16;
              model.verticesY[v] = (cos * model.verticesY[v] - sin * model.verticesX[v]) >> 16;
              model.verticesX[v] = temp;
            }

            if (angleX !== 0) {
              const sin = SINE[angleX];
              const cos = COSINE[angleX];
              const temp = (cos * model.verticesY[v] - sin * model.verticesZ[v]) >> 16;
              model.verticesZ[v] = (sin * model.verticesY[v] + cos * model.verticesZ[v]) >> 16;
              model.verticesY[v] = temp;
            }

            if (angleY !== 0) {
              const sin = SINE[angleY];
              const cos = COSINE[angleY];
              const temp = (sin * model.verticesZ[v] + cos * model.verticesX[v]) >> 16;
              model.verticesZ[v] = (cos * model.verticesZ[v] - sin * model.verticesX[v]) >> 16;
              model.verticesX[v] = temp;
            }

            model.verticesX[v] += origin.x;
            model.verticesY[v] += origin.y;
            model.verticesZ[v] += origin.z;
          }
        }
      }
      break;
    }
    case SeqTransformType.SCALE: {
      for (const label of labels) {
        if (label < model.vertexLabels.length) {
          for (const v of model.vertexLabels[label]) {
            model.verticesX[v] -= origin.x;
            model.verticesY[v] -= origin.y;
            model.verticesZ[v] -= origin.z;

            model.verticesX[v] = ((tx * model.verticesX[v]) / 128) | 0;
            model.verticesY[v] = ((ty * model.verticesY[v]) / 128) | 0;
            model.verticesZ[v] = ((tz * model.verticesZ[v]) / 128) | 0;

            model.verticesX[v] += origin.x;
            model.verticesY[v] += origin.y;
            model.verticesZ[v] += origin.z;
          }
        }
      }
      break;
    }
    case SeqTransformType.ALPHA: {
      if (model.faceLabels && model.faceAlphas) {
        for (const label of labels) {
          if (label < model.faceLabels.length) {
            for (const f of model.faceLabels[label]) {
              const currentAlpha = model.faceAlphas[f];
              if (ModelData['isFaceAlphaShadingSentinel'](currentAlpha)) {
                continue;
              }
              const newAlpha = ModelData['clampAnimatedFaceAlpha']((currentAlpha & 0xff) + tx * 8);
              model.faceAlphas[f] = newAlpha;
            }
          }
        }
      }
      break;
    }
  }
}

describe('ModelData.applyTransform', () => {
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

  function randomModel(next: () => number): ModelData {
    const model = new ModelData();
    const vertexCount = 20 + Math.floor(next() * 200);
    const faceCount = 10 + Math.floor(next() * 100);
    model.verticesCount = vertexCount;
    model.usedVertexCount = vertexCount;
    model.verticesX = Int32Array.from({ length: vertexCount }, () => Math.round((next() - 0.5) * 4000));
    model.verticesY = Int32Array.from({ length: vertexCount }, () => Math.round((next() - 0.5) * 4000));
    model.verticesZ = Int32Array.from({ length: vertexCount }, () => Math.round((next() - 0.5) * 4000));
    model.faceCount = faceCount;
    // Includes both shading sentinels, which alpha transforms must leave alone.
    model.faceAlphas = Int8Array.from({ length: faceCount }, () => Math.floor(next() * 256) - 128);
    model.vertexSkins = Int32Array.from({ length: vertexCount }, () => Math.floor(next() * 12) - 1);
    model.faceSkins = Int32Array.from({ length: faceCount }, () => Math.floor(next() * 8) - 1);
    model.computeAnimationTables();
    return model;
  }

  function clone(model: ModelData): ModelData {
    const copy = new ModelData();
    Object.assign(copy, model);
    copy.verticesX = model.verticesX.slice();
    copy.verticesY = model.verticesY.slice();
    copy.verticesZ = model.verticesZ.slice();
    copy.faceAlphas = model.faceAlphas.slice();
    return copy;
  }

  const types = [
    SeqTransformType.ORIGIN,
    SeqTransformType.TRANSLATE,
    SeqTransformType.ROTATE,
    SeqTransformType.SCALE,
    SeqTransformType.ALPHA,
    SeqTransformType.TYPE_6,
  ];

  it('poses several models in turn exactly as the for-of implementation did', () => {
    const next = random(7);
    const models = [randomModel(next), randomModel(next), randomModel(next)];
    const live = models.map(clone);
    const origin = { x: 0, y: 0, z: 0 };
    ModelData['resetAnimateOrigin']();

    // One shared origin across models, as frames of different models posed in the same frame share it.
    for (let step = 0; step < 600; step++) {
      const index = Math.floor(next() * models.length);
      const type = types[Math.floor(next() * types.length)];
      // Labels past the model's skin count are skipped; both implementations must agree on that.
      const labels = Array.from({ length: 1 + Math.floor(next() * 4) }, () => Math.floor(next() * 14));
      const tx = Math.floor(next() * 512) - 256;
      const ty = Math.floor(next() * 512) - 256;
      const tz = Math.floor(next() * 512) - 256;

      referenceApplyTransform(models[index], origin, type, labels, tx, ty, tz);
      live[index]['applyTransform'](type, labels, tx, ty, tz);

      expect([ModelData['animateOriginX'], ModelData['animateOriginY'], ModelData['animateOriginZ']]).toEqual([
        origin.x,
        origin.y,
        origin.z,
      ]);
      expect(live[index].verticesX).toEqual(models[index].verticesX);
      expect(live[index].verticesY).toEqual(models[index].verticesY);
      expect(live[index].verticesZ).toEqual(models[index].verticesZ);
      expect(live[index].faceAlphas).toEqual(models[index].faceAlphas);
    }
  });
});
