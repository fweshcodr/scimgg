import { describe, expect, it, vi } from 'vitest';
import { SeqType } from '../../config/seqtype/SeqType';
import type { SeqTypeLoader } from '../../config/seqtype/SeqTypeLoader';
import { SpotAnimID } from '../../config/spotanimtype/SpotAnimID';
import { SpotAnimType } from '../../config/spotanimtype/SpotAnimType';
import type { SpotAnimTypeLoader } from '../../config/spotanimtype/SpotAnimTypeLoader';
import { ModelData } from '../ModelData';
import type { ModelLoader } from '../ModelLoader';
import { SpotAnimModelLoader } from '../SpotAnimModelLoader';
import { SeqBase } from '../seq/SeqBase';
import { SeqFrame } from '../seq/SeqFrame';
import type { SeqFrameLoader } from '../seq/SeqFrameLoader';
import { SeqTransformType } from '../seq/SeqTransformType';

const TEST_CACHE_INFO = {
  name: 'test',
  game: 'oldschool' as const,
  environment: 'live',
  revision: 232,
  timestamp: '2024-01-01T00:00:00.000Z',
  size: 0,
};

const TEST_SPOTANIM_ID = 1234;

type SpotAnimLoaderFixture = {
  readonly spotAnimType: SpotAnimType;
  readonly model: ModelData;
  readonly seqType?: SeqType;
  readonly seqFrame?: SeqFrame;
  readonly withoutSeqFrameLoader?: boolean;
};

function buildTestModel(): ModelData {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.faceCount = 1;
  model.verticesX = new Int32Array([0, 128, 0]);
  model.verticesY = new Int32Array([0, 0, 0]);
  model.verticesZ = new Int32Array([0, 0, 128]);
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([0x03bf]);
  return model;
}

function buildTexturedTestModel(): ModelData {
  const model = buildTestModel();
  model.faceTextures = new Int16Array([12]);
  return model;
}

function buildSpotAnimType(id: number, modelId: number, contrast: number): SpotAnimType {
  const type = new SpotAnimType(id, TEST_CACHE_INFO);
  type.modelId = modelId;
  type.ambient = 0;
  type.contrast = contrast;
  type.widthScale = 128;
  type.heightScale = 128;
  return type;
}

function buildSeqType(id: number, frameId: number): SeqType {
  const seqType = new SeqType(id, TEST_CACHE_INFO);
  seqType.frameIds = [frameId];
  seqType.frameLengths = [1];
  return seqType;
}

function buildSeqFrame(): SeqFrame {
  const base = new SeqBase(1, 1, [SeqTransformType.TRANSLATE], [true], new Uint16Array([0]), [[0]]);
  return new SeqFrame(1, base, 1, [0], [0], [0], [0], [-1], false);
}

function buildLoader(fixture: SpotAnimLoaderFixture): SpotAnimModelLoader {
  const spotAnimTypeLoader: SpotAnimTypeLoader = {
    load: () => fixture.spotAnimType,
    getCount: () => 1,
    clearCache: () => {},
  };
  const modelLoader: ModelLoader = {
    getModel: () => fixture.model,
  };

  if (!fixture.seqType) {
    return new SpotAnimModelLoader(spotAnimTypeLoader, modelLoader);
  }

  const seqType = fixture.seqType;

  const seqTypeLoader: SeqTypeLoader = {
    load: () => seqType,
    getCount: () => 1,
    clearCache: () => {},
  };
  const seqFrameLoader: SeqFrameLoader = {
    load: () => fixture.seqFrame,
    clearCache: () => {},
  };

  return new SpotAnimModelLoader(
    spotAnimTypeLoader,
    modelLoader,
    seqTypeLoader,
    fixture.withoutSeqFrameLoader ? undefined : seqFrameLoader,
  );
}

function expectLoaded<T>(value: T | null): T {
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('Expected loader result');
  }
  return value;
}

describe('SpotAnimModelLoader lighting', () => {
  it('keeps a lighting-hidden face sortable when conversion emits it as black', () => {
    const model = buildTestModel();
    model.faceRenderTypes = new Int8Array([2]);
    model.faceAlphas = new Int8Array([64]);
    const loader = buildLoader({ spotAnimType: buildSpotAnimType(TEST_SPOTANIM_ID, 1000, 0), model });
    expect(expectLoaded(loader.loadSpotAnimModelData(TEST_SPOTANIM_ID)).litColors?.faceColors3[0]).toBe(-2);

    const mesh = expectLoaded(loader.loadSpotAnimMesh(TEST_SPOTANIM_ID));

    expect(mesh.hslColors).toEqual(new Float32Array([0, 0, 0]));
    expect(mesh.positions).toHaveLength(9);
    expect(mesh.modelFaceIndices).toEqual(new Uint32Array([0]));
  });

  it('emits sentinel faces with the signed source alpha converted to opacity', () => {
    const model = buildTestModel();
    model.faceAlphas = new Int8Array([-2]);
    model.faceRenderPriorities = new Int8Array([5]);
    const loader = buildLoader({ spotAnimType: buildSpotAnimType(TEST_SPOTANIM_ID, 1000, 0), model });

    const mesh = expectLoaded(loader.loadSpotAnimMesh(TEST_SPOTANIM_ID));

    expect(mesh.positions).toHaveLength(9);
    expect(mesh.hslColors[2]).not.toBe(-2);
    expect(model.faceAlphas).toEqual(new Int8Array([-2]));
    expect(model.faceRenderPriorities).toEqual(new Int8Array([5]));
    expect(mesh.alphas[0]).toBeCloseTo(1 / 255);
  });

  it('uses decoded contrast directly for wave wall spotanims', () => {
    const spotAnimId = SpotAnimID.VFX_SHADOW_WALL_01;
    const modelId = 1000;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    const model = buildTestModel();

    const baseCompute = model.computeLitColors.bind(model);
    let receivedContrast = -1;
    model.computeLitColors = ((ambient: number, contrast: number, lightX: number, lightY: number, lightZ: number) => {
      receivedContrast = contrast;
      return baseCompute(ambient, contrast, lightX, lightY, lightZ);
    }) as ModelData['computeLitColors'];

    const spotAnimTypeLoader = {
      load: (id: number) => (id === spotAnimId ? spotAnimType : undefined),
    };
    const modelLoader = {
      getModel: (id: number) => (id === modelId ? model : undefined),
    };

    const loader = new SpotAnimModelLoader(spotAnimTypeLoader as SpotAnimTypeLoader, modelLoader as ModelLoader);

    const loaded = loader.loadSpotAnimModelData(spotAnimId);
    expect(loaded).toBeDefined();
    expect(receivedContrast).toBe(900);
  });

  it('uses decoded contrast directly for non-wave spotanims', () => {
    const spotAnimId = SpotAnimID.VFX_NPC_YAMA_MAGIC_SHADOW_SPOTANIM01;
    const modelId = 1001;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    const model = buildTestModel();

    const baseCompute = model.computeLitColors.bind(model);
    let receivedContrast = -1;
    model.computeLitColors = ((ambient: number, contrast: number, lightX: number, lightY: number, lightZ: number) => {
      receivedContrast = contrast;
      return baseCompute(ambient, contrast, lightX, lightY, lightZ);
    }) as ModelData['computeLitColors'];

    const spotAnimTypeLoader = {
      load: (id: number) => (id === spotAnimId ? spotAnimType : undefined),
    };
    const modelLoader = {
      getModel: (id: number) => (id === modelId ? model : undefined),
    };

    const loader = new SpotAnimModelLoader(spotAnimTypeLoader as SpotAnimTypeLoader, modelLoader as ModelLoader);

    const loaded = loader.loadSpotAnimModelData(spotAnimId);
    expect(loaded).toBeDefined();
    expect(receivedContrast).toBe(900);
  });
});

describe('SpotAnimModelLoader unsupported animation fallback', () => {
  it('preserves skeletal sequence height metadata on the static mesh fallback', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const seqId = 998;
    const spotAnimType = buildSpotAnimType(spotAnimId, 1010, 50);
    spotAnimType.sequenceId = seqId;
    const seqType = buildSeqType(seqId, 500);
    seqType.frameIds = [];
    seqType.frameLengths = [];
    seqType.skeletalId = 123;
    seqType.heightOffset = -16;
    const loader = buildLoader({
      spotAnimType,
      model: buildTestModel(),
      seqType,
      withoutSeqFrameLoader: true,
    });

    const animated = expectLoaded(loader.loadAnimatedSpotAnim(spotAnimId));

    expect(animated.frames).toHaveLength(1);
    expect(animated.seqType).toBe(seqType);
    expect(animated.seqType.heightOffset).toBe(-16);
  });
});

describe('SpotAnimModelLoader.isSkeletalOnly', () => {
  function buildLoaderForSeq(configure: (seqType: SeqType) => void, seqId = 998): SpotAnimModelLoader {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1010, 50);
    spotAnimType.sequenceId = seqId;
    const seqType = buildSeqType(seqId, 500);
    configure(seqType);
    return buildLoader({ spotAnimType, model: buildTestModel(), seqType, withoutSeqFrameLoader: true });
  }

  it('classifies a skeletal sequence with no frameIds as unposeable', () => {
    const loader = buildLoaderForSeq((seqType) => {
      seqType.frameIds = [];
      seqType.frameLengths = [];
      seqType.skeletalId = 123;
    });

    expect(loader.isSkeletalOnly(TEST_SPOTANIM_ID)).toBe(true);
  });

  it('does not classify an ordinary frame-based sequence as skeletal', () => {
    const loader = buildLoaderForSeq(() => {});

    expect(loader.isSkeletalOnly(TEST_SPOTANIM_ID)).toBe(false);
  });

  it('does not classify a skeletal sequence that still carries frameIds as unposeable', () => {
    // frameIds are what `loadAnimatedSpotAnim` bakes. A skeletal id alongside them is not a
    // reason to drop the effect, because the bake still produces real posed frames.
    const loader = buildLoaderForSeq((seqType) => {
      seqType.skeletalId = 123;
    });

    expect(loader.isSkeletalOnly(TEST_SPOTANIM_ID)).toBe(false);
  });

  it('does not classify a spotanim with no sequence at all', () => {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1010, 50);
    const loader = buildLoader({ spotAnimType, model: buildTestModel() });

    expect(loader.isSkeletalOnly(TEST_SPOTANIM_ID)).toBe(false);
  });
});

describe('SpotAnimModelLoader scaling', () => {
  it('retains posed geometry and opacity independently in every baked frame', () => {
    const model = buildTestModel();
    model.vertexSkins = new Int32Array([0, 0, 0]);
    model.faceAlphas = new Int8Array([64]);
    model.faceRenderPriorities = new Int8Array([3]);
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1002, 0);
    spotAnimType.sequenceId = 999;
    spotAnimType.widthScale = 256;
    const seqType = buildSeqType(999, 500);
    seqType.frameIds = [500, 501];
    seqType.frameLengths = [1, 1];
    const base = new SeqBase(1, 1, [SeqTransformType.TRANSLATE], [true], new Uint16Array([0]), [[0]]);
    const seqFrame = new SeqFrame(1, base, 1, [0], [20], [0], [0], [-1], false);
    const loader = buildLoader({ spotAnimType, model, seqType, seqFrame });

    const { frames } = expectLoaded(loader.loadAnimatedSpotAnim(TEST_SPOTANIM_ID));

    expect(Array.from(frames[0].positions).filter((_, i) => i % 3 === 0)).toEqual([40, 296, 40]);
    expect(frames[0].alphas[0]).toBeCloseTo(191 / 255);
    expect(frames[0].positions).not.toBe(frames[1].positions);
    expect(frames[0].alphas).not.toBe(frames[1].alphas);
    expect(model.verticesX).toEqual(new Int32Array([0, 128, 0]));

    // The renderer owns the cached split form; the loader must not keep a second copy of the bake.
    const again = expectLoaded(loader.loadAnimatedSpotAnim(TEST_SPOTANIM_ID));
    expect(again.frames).not.toBe(frames);
    expect(again.frames[0].positions).not.toBe(frames[0].positions);
    expect(again.frames[0].positions).toEqual(frames[0].positions);
    expect(again.frames[1].alphas).toEqual(frames[1].alphas);
  });

  it('does not mutate the shared base model when loading a resized animated spotanim', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const modelId = 1002;
    const seqId = 999;
    const frameId = 500;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    spotAnimType.widthScale = 256;
    spotAnimType.heightScale = 256;
    spotAnimType.sequenceId = seqId;
    const model = buildTestModel();
    const originalVertexX = model.verticesX[1];
    const originalVertexZ = model.verticesZ[2];
    const loader = buildLoader({
      spotAnimType,
      model,
      seqType: buildSeqType(seqId, frameId),
    });

    const animated = expectLoaded(loader.loadAnimatedSpotAnim(spotAnimId));

    expect(animated.frames).toHaveLength(1);
    expect(model.verticesX[1]).toBe(originalVertexX);
    expect(model.verticesZ[2]).toBe(originalVertexZ);
  });

  it('applies per-frame animation before spotanim resize', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const modelId = 1003;
    const seqId = 1000;
    const frameId = 501;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    spotAnimType.widthScale = 200;
    spotAnimType.heightScale = 200;
    spotAnimType.sequenceId = seqId;
    const model = buildTestModel();
    const loader = buildLoader({
      spotAnimType,
      model,
      seqType: buildSeqType(seqId, frameId),
      seqFrame: buildSeqFrame(),
    });
    const callOrder: string[] = [];
    const animateSpy = vi.spyOn(ModelData.prototype, 'animate').mockImplementation(() => {
      callOrder.push('animate');
    });
    const resizeSpy = vi.spyOn(ModelData.prototype, 'resize').mockImplementation(() => {
      callOrder.push('resize');
    });

    try {
      expectLoaded(loader.loadAnimatedSpotAnim(spotAnimId));

      expect(callOrder).toEqual(['animate', 'resize']);
    } finally {
      animateSpy.mockRestore();
      resizeSpy.mockRestore();
    }
  });

  it('does not mutate the shared base model when loading a resized static spotanim', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const modelId = 1004;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    spotAnimType.widthScale = 256;
    spotAnimType.heightScale = 256;
    const model = buildTestModel();
    const originalVertexX = model.verticesX[1];
    const originalVertexZ = model.verticesZ[2];
    const loader = buildLoader({ spotAnimType, model });

    const loaded = expectLoaded(loader.loadSpotAnimModelData(spotAnimId));

    expect(loaded.model).not.toBe(model);
    expect(loaded.model.verticesX[1]).toBe(256);
    expect(loaded.model.verticesZ[2]).toBe(256);
    expect(model.verticesX[1]).toBe(originalVertexX);
    expect(model.verticesZ[2]).toBe(originalVertexZ);
  });

  it('does not mutate the shared base model when loading a recolored static spotanim', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const modelId = 1005;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    spotAnimType.recolorFrom = [0x03bf];
    spotAnimType.recolorTo = [0x1234];
    const model = buildTestModel();
    const originalColor = model.faceColors[0];
    const loader = buildLoader({ spotAnimType, model });

    const loaded = expectLoaded(loader.loadSpotAnimModelData(spotAnimId));

    expect(loaded.model).not.toBe(model);
    expect(loaded.model.faceColors[0]).toBe(0x1234);
    expect(model.faceColors[0]).toBe(originalColor);
  });

  it('does not mutate the shared base model when loading a recolored animated spotanim', () => {
    const spotAnimId = TEST_SPOTANIM_ID;
    const modelId = 1006;
    const seqId = 1001;
    const frameId = 502;
    const spotAnimType = buildSpotAnimType(spotAnimId, modelId, 50);
    spotAnimType.recolorFrom = [0x03bf];
    spotAnimType.recolorTo = [0x1234];
    spotAnimType.sequenceId = seqId;
    const model = buildTestModel();
    const originalColor = model.faceColors[0];
    const loader = buildLoader({
      spotAnimType,
      model,
      seqType: buildSeqType(seqId, frameId),
    });

    const animated = expectLoaded(loader.loadAnimatedSpotAnim(spotAnimId));

    expect(animated.frames).toHaveLength(1);
    expect(model.faceColors[0]).toBe(originalColor);
  });
});

describe('SpotAnimModelLoader orientation and retexture', () => {
  it.each([
    { orientation: 90, verticesX: [0, 0, 128], verticesZ: [0, -128, 0] },
    { orientation: 180, verticesX: [0, -128, 0], verticesZ: [0, 0, -128] },
    { orientation: 270, verticesX: [0, 0, -128], verticesZ: [0, 128, 0] },
  ])('rotates static spotanim models for orientation $orientation', ({ orientation, verticesX, verticesZ }) => {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1007, 50);
    spotAnimType.orientation = orientation;
    const model = buildTestModel();
    const loader = buildLoader({ spotAnimType, model });

    const loaded = expectLoaded(loader.loadSpotAnimModelData(TEST_SPOTANIM_ID));

    expect(loaded.model).not.toBe(model);
    expect(loaded.model.verticesX).toEqual(new Int32Array(verticesX));
    expect(loaded.model.verticesZ).toEqual(new Int32Array(verticesZ));
    expect(model.verticesX).toEqual(new Int32Array([0, 128, 0]));
    expect(model.verticesZ).toEqual(new Int32Array([0, 0, 128]));
  });

  it('applies retexture without mutating the shared static source model', () => {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1008, 50);
    spotAnimType.retextureFrom = [12];
    spotAnimType.retextureTo = [34];
    const model = buildTexturedTestModel();
    const loader = buildLoader({ spotAnimType, model });

    const loaded = expectLoaded(loader.loadSpotAnimModelData(TEST_SPOTANIM_ID));

    expect(loaded.model).not.toBe(model);
    expect(loaded.model.faceTextures).toEqual(new Int16Array([34]));
    expect(model.faceTextures).toEqual(new Int16Array([12]));
  });

  it('applies animated transforms in animation-resize-rotation-retexture order', () => {
    const seqId = 1002;
    const frameId = 503;
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1009, 50);
    spotAnimType.widthScale = 200;
    spotAnimType.orientation = 90;
    spotAnimType.retextureFrom = [12];
    spotAnimType.retextureTo = [56];
    spotAnimType.sequenceId = seqId;
    const model = buildTexturedTestModel();
    const loader = buildLoader({
      spotAnimType,
      model,
      seqType: buildSeqType(seqId, frameId),
      seqFrame: buildSeqFrame(),
    });
    const callOrder: string[] = [];
    const animateSpy = vi.spyOn(ModelData.prototype, 'animate').mockImplementation(() => {
      callOrder.push('animate');
    });
    const resizeSpy = vi.spyOn(ModelData.prototype, 'resize').mockImplementation(() => {
      callOrder.push('resize');
    });
    const rotateSpy = vi.spyOn(ModelData.prototype, 'rotate90').mockImplementation(() => {
      callOrder.push('rotate');
    });
    const retextureSpy = vi.spyOn(ModelData.prototype, 'retexture').mockImplementation(() => {
      callOrder.push('retexture');
    });

    try {
      expectLoaded(loader.loadAnimatedSpotAnim(TEST_SPOTANIM_ID));

      expect(callOrder).toEqual(['animate', 'resize', 'rotate', 'retexture']);
      expect(model.faceTextures).toEqual(new Int16Array([12]));
    } finally {
      animateSpy.mockRestore();
      resizeSpy.mockRestore();
      rotateSpy.mockRestore();
      retextureSpy.mockRestore();
    }
  });
});

describe('SpotAnimModelLoader skeletal posing', () => {
  const SKELETAL_SEQ_ID = 997;

  /** No `skeletalBase`, so `animateSkeletal` leaves the vertices alone and the scale is observable. */
  const INERT_SKELETAL_SEQ = { skeletalBase: undefined, hasAlphaTransform: false } as never;

  function buildSkeletalLoader(configure: (spotAnimType: SpotAnimType) => void = () => {}): SpotAnimModelLoader {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1011, 50);
    spotAnimType.sequenceId = SKELETAL_SEQ_ID;
    configure(spotAnimType);
    const seqType = buildSeqType(SKELETAL_SEQ_ID, 500);
    seqType.frameIds = [];
    seqType.frameLengths = [];
    seqType.skeletalId = 123;
    seqType.skeletalStart = 0;
    seqType.skeletalEnd = 180;
    return buildLoader({ spotAnimType, model: buildTestModel(), seqType, withoutSeqFrameLoader: true });
  }

  /**
   * A skeleton whose single bone translates along X by the frame number, and a model whose vertices
   * are all bound to it. Enough to prove a real curve reaches the geometry — `INERT_SKELETAL_SEQ`
   * only ever exercises the scale/orient half of the pose.
   */
  function buildDeformingSkeletalLoader(): { loader: SpotAnimModelLoader; restX: number[] } {
    const model = buildTestModel();
    model.faceAlphas = new Int8Array([0]);
    model.faceSkins = new Int32Array([0]);
    model.animMayaGroups = [new Int32Array([0]), new Int32Array([0]), new Int32Array([0])];
    model.animMayaScales = [new Int32Array([255]), new Int32Array([255]), new Int32Array([255])];
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1012, 50);
    spotAnimType.sequenceId = SKELETAL_SEQ_ID;
    const seqType = buildSeqType(SKELETAL_SEQ_ID, 500);
    seqType.frameIds = [];
    seqType.frameLengths = [];
    seqType.skeletalId = 123;
    seqType.skeletalStart = 0;
    seqType.skeletalEnd = 180;
    return {
      loader: buildLoader({ spotAnimType, model, seqType, withoutSeqFrameLoader: true }),
      restX: Array.from(model.verticesX),
    };
  }

  function deformingSkeletalSeq(hasAlphaTransform = false): never {
    let frameTranslation = 0;
    const finalMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return {
      poseId: 0,
      hasAlphaTransform,
      base: new SeqBase(1, 1, [SeqTransformType.ALPHA], [true], new Uint16Array([0]), [[0]]),
      curves: [[{ getValue: (frame: number) => frame / 255 }]],
      skeletalBase: {
        updateAnimMatrices: (_seq: unknown, frame: number) => {
          frameTranslation = frame;
        },
        getBone: () => ({
          getFinalMatrix: () => {
            finalMatrix[12] = frameTranslation;
            return finalMatrix;
          },
        }),
      },
    } as never;
  }

  it('retains each posed mesh when the live skeletal model advances', () => {
    const { loader, restX } = buildDeformingSkeletalLoader();
    const data = expectLoaded(loader.loadSkeletalSpotAnimModel(TEST_SPOTANIM_ID));
    const seq = deformingSkeletalSeq(true);
    const first = loader.poseSkeletalSpotAnimMesh(data, seq, 10);

    const second = loader.poseSkeletalSpotAnimMesh(data, seq, 50);

    expect(Array.from(first.positions).filter((_, i) => i % 3 === 0)).toEqual(restX.map((value) => value + 10));
    expect(Array.from(second.positions).filter((_, i) => i % 3 === 0)).toEqual(restX.map((value) => value + 50));
    expect(first.positions).not.toBe(second.positions);
    expect(first.alphas[0]).toBeCloseTo(245 / 255);
    expect(second.alphas[0]).toBeCloseTo(205 / 255);
  });

  it('returns null for a spotanim whose sequence is frame-based', () => {
    const spotAnimType = buildSpotAnimType(TEST_SPOTANIM_ID, 1011, 50);
    spotAnimType.sequenceId = SKELETAL_SEQ_ID;
    const loader = buildLoader({
      spotAnimType,
      model: buildTestModel(),
      seqType: buildSeqType(SKELETAL_SEQ_ID, 500),
    });

    expect(loader.loadSkeletalSpotAnimModel(TEST_SPOTANIM_ID)).toBeNull();
  });

  it('snapshots the rest pose so consecutive frames do not compound the transforms', () => {
    // Scale is the visible half of this: posing frame N on frame N-1's vertices would resize twice.
    const loader = buildSkeletalLoader((spotAnimType) => {
      spotAnimType.widthScale = 256;
      spotAnimType.heightScale = 256;
    });
    const data = expectLoaded(loader.loadSkeletalSpotAnimModel(TEST_SPOTANIM_ID));

    loader.poseSkeletalSpotAnimMesh(data, INERT_SKELETAL_SEQ, 0);
    const afterFirst = Array.from(data.model.verticesX);
    loader.poseSkeletalSpotAnimMesh(data, INERT_SKELETAL_SEQ, 90);

    expect(afterFirst).toEqual([0, 256, 0]);
    expect(Array.from(data.model.verticesX)).toEqual(afterFirst);
  });

  it('poses, then scales, then orients — the order the frame-based path uses', () => {
    const loader = buildSkeletalLoader((spotAnimType) => {
      spotAnimType.widthScale = 200;
      spotAnimType.heightScale = 200;
      spotAnimType.orientation = 90;
    });
    const data = expectLoaded(loader.loadSkeletalSpotAnimModel(TEST_SPOTANIM_ID));
    const callOrder: string[] = [];
    const skeletalSpy = vi.spyOn(ModelData.prototype, 'animateSkeletal').mockImplementation(() => {
      callOrder.push('animateSkeletal');
    });
    const resizeSpy = vi.spyOn(ModelData.prototype, 'resize').mockImplementation(() => {
      callOrder.push('resize');
    });
    const rotateSpy = vi.spyOn(ModelData.prototype, 'rotate90').mockImplementation(() => {
      callOrder.push('rotate');
    });

    try {
      loader.poseSkeletalSpotAnimMesh(data, INERT_SKELETAL_SEQ, 0);

      expect(callOrder).toEqual(['animateSkeletal', 'resize', 'rotate']);
    } finally {
      skeletalSpy.mockRestore();
      resizeSpy.mockRestore();
      rotateSpy.mockRestore();
    }
  });

  it('drives real skeletal curves into the posed geometry, and rewinds cleanly between frames', () => {
    const { loader, restX } = buildDeformingSkeletalLoader();
    const seq = deformingSkeletalSeq();
    const data = expectLoaded(loader.loadSkeletalSpotAnimModel(TEST_SPOTANIM_ID));

    const atFrame = (frame: number) => {
      loader.poseSkeletalSpotAnimMesh(data, seq, frame);
      return Array.from(data.model.verticesX);
    };

    expect(atFrame(0)).toEqual(restX);
    expect(atFrame(50)).toEqual(restX.map((x) => x + 50));
    expect(atFrame(120)).toEqual(restX.map((x) => x + 120));

    expect(atFrame(50)).toEqual(restX.map((x) => x + 50));
    expect(atFrame(0)).toEqual(restX);
  });
});
