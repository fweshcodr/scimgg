import { describe, expect, it } from 'vitest';
import { Archive } from '../../../cache/Archive';
import { LegacyCacheIndex } from '../../../cache/CacheIndex';
import type { CacheInfo } from '../../../cache/CacheInfo';
import { ModelData } from '../../../model/ModelData';
import type { ModelLoader } from '../../../model/ModelLoader';
import { SeqType } from '../../seqtype/SeqType';
import type { SeqTypeLoader } from '../../seqtype/SeqTypeLoader';
import { LocModelLoader } from '../LocModelLoader';
import { LocModelType } from '../LocModelType';
import { LocType } from '../LocType';
import type { LocTypeLoader } from '../LocTypeLoader';

const TEST_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'live',
  revision: 232,
  timestamp: '2024-01-01T00:00:00.000Z',
  size: 0,
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

function trianglePositions(model: ModelData): number[] {
  return [
    model.verticesX[0],
    model.verticesY[0],
    model.verticesZ[0],
    model.verticesX[1],
    model.verticesY[1],
    model.verticesZ[1],
    model.verticesX[2],
    model.verticesY[2],
    model.verticesZ[2],
  ];
}

function createTestLoader(model: ModelData = buildTestModel()): LocModelLoader {
  const loader = new LocModelLoader(
    TEST_CACHE_INFO,
    Archive.create(0, new Int8Array([0])),
    new LegacyCacheIndex(0, []),
  );
  loader['modelLoader'] = { getModel: () => model };
  return loader;
}

describe('LocModelLoader model selection and transforms', () => {
  it('returns undefined when a typed model list does not contain the requested type', () => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.WALL];
    const loader = createTestLoader();

    const model = loader.getLocModelData(locType, LocModelType.NORMAL, 0);

    expect(model).toBeUndefined();
  });

  it('returns undefined when any compound model component is missing', () => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000, 1001]];
    const loader = createTestLoader();
    loader['modelLoader'] = { getModel: (id) => (id === 1000 ? buildTestModel() : undefined) };

    const model = loader.getLocModelData(locType, LocModelType.NORMAL, 0);

    expect(model).toBeUndefined();
  });

  it.each([
    { type: LocModelType.NORMAL, expected: true },
    { type: LocModelType.WALL, expected: false },
  ])('returns $expected for untyped model list requested as type $type', ({ type, expected }) => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    const loader = createTestLoader();

    const model = loader.getLocModelData(locType, type, 0);

    expect(model !== undefined).toBe(expected);
  });

  it.each([
    { isRotated: false, rotation: 0, expectedMirrored: false },
    { isRotated: false, rotation: 4, expectedMirrored: false },
    { isRotated: true, rotation: 0, expectedMirrored: true },
    { isRotated: true, rotation: 4, expectedMirrored: true },
  ])('mirrors normal typed models from isRotated when isRotated=$isRotated and rotation=$rotation', ({
    isRotated,
    rotation,
    expectedMirrored,
  }) => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.NORMAL];
    locType.isRotated = isRotated;
    const loader = createTestLoader();

    const model = loader.getLocModelData(locType, LocModelType.NORMAL, rotation);

    expect(model?.verticesZ[2]).toBe(expectedMirrored ? -128 : 128);
  });

  it('mirrors only extended wall-corner requests when isRotated is false', () => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.WALL_CORNER];
    const loader = createTestLoader();

    const model = loader.getLocModelData(locType, LocModelType.WALL_CORNER, 4);

    expect(model?.verticesZ[2]).toBe(-128);
  });

  it('preserves the ordinary quarter-turn transform', () => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.NORMAL];
    const loader = createTestLoader();
    const expected = buildTestModel();
    expected.rotate90();

    const model = loader.getLocModelData(locType, LocModelType.NORMAL, 1);

    expect(Array.from(model?.verticesX ?? [])).toEqual(Array.from(expected.verticesX));
    expect(Array.from(model?.verticesZ ?? [])).toEqual(Array.from(expected.verticesZ));
  });

  it('applies the type-4 extended transform before the quarter turn', () => {
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.WALL_DECORATION_INSIDE];
    locType.isRotated = true;
    const loader = createTestLoader();
    const expected = buildTestModel();
    expected.mirror();
    expected.rotate(256);
    expected.translate(45, 0, -45);
    expected.rotate90();

    const model = loader.getLocModelData(locType, LocModelType.WALL_DECORATION_INSIDE, 5);

    expect(Array.from(model?.verticesX ?? [])).toEqual(Array.from(expected.verticesX));
    expect(Array.from(model?.verticesZ ?? [])).toEqual(Array.from(expected.verticesZ));
  });
});

describe('LocModelLoader animated loc fallback', () => {
  it('returns one static lit frame and preserves a SeqType with no frame IDs', () => {
    const locId = 1;
    const modelId = 1000;
    const seqId = 998;
    const locType = new LocType(locId, TEST_CACHE_INFO);
    locType.models = [[modelId]];
    locType.types = [LocModelType.NORMAL];

    const seqType = new SeqType(seqId, TEST_CACHE_INFO);
    seqType.frameIds = [];
    seqType.frameLengths = [];
    seqType.skeletalId = 123;
    seqType.heightOffset = -16;

    const locTypeLoader: LocTypeLoader = {
      load: () => locType,
      getCount: () => 1,
      clearCache: () => {},
    };
    const modelLoader: ModelLoader = {
      getModel: () => buildTestModel(),
    };
    const seqTypeLoader: SeqTypeLoader = {
      load: () => seqType,
      getCount: () => 1,
      clearCache: () => {},
    };
    const loader = new LocModelLoader(
      TEST_CACHE_INFO,
      Archive.create(0, new Int8Array([0])),
      new LegacyCacheIndex(0, []),
    );
    loader['locTypeLoader'] = locTypeLoader;
    loader['modelLoader'] = modelLoader;
    loader['seqTypeLoader'] = seqTypeLoader;

    const animated = loader.loadAnimatedLocMeshFrames(locId, LocModelType.NORMAL, 0, seqId);

    expect(animated).toBeDefined();
    if (!animated) {
      throw new Error('Expected animated loc fallback');
    }
    expect(animated.frames).toHaveLength(1);
    expect(animated.frames[0]?.mesh.positions).toHaveLength(9);
    expect(animated.seqType).toBe(seqType);
    expect(animated.seqType.heightOffset).toBe(-16);
  });

  it('applies the diagonal normal rotation to static and animation-fallback meshes', () => {
    const locId = 1;
    const seqId = 998;
    const locType = new LocType(locId, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.NORMAL];
    const seqType = new SeqType(seqId, TEST_CACHE_INFO);
    seqType.frameIds = [];
    seqType.frameLengths = [];
    const loader = createTestLoader();
    loader['locTypeLoader'] = {
      load: () => locType,
      getCount: () => 1,
      clearCache: () => {},
    };
    loader['seqTypeLoader'] = {
      load: () => seqType,
      getCount: () => 1,
      clearCache: () => {},
    };
    const expected = buildTestModel();
    expected.rotate(256);

    const staticMesh = loader.loadLocMesh(locId, LocModelType.NORMAL, 4, 0, 0, 0);
    const animated = loader.loadAnimatedLocMeshFrames(locId, LocModelType.NORMAL, 4, seqId);

    expect(Array.from(staticMesh?.mesh.positions ?? [])).toEqual(trianglePositions(expected));
    expect(Array.from(animated?.frames[0]?.mesh.positions ?? [])).toEqual(trianglePositions(expected));
  });
});

describe('LocModelLoader rotated footprint', () => {
  it.each([
    { rotation: 0, expected: [5, 2] },
    { rotation: 1, expected: [2, 5] },
    { rotation: 2, expected: [5, 2] },
    { rotation: 3, expected: [2, 5] },
  ])('returns $expected for rotation $rotation', ({ rotation, expected }) => {
    const locId = 1;
    const locType = new LocType(locId, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.NORMAL];
    locType.sizeX = 5;
    locType.sizeY = 2;

    const loader = new LocModelLoader(
      TEST_CACHE_INFO,
      Archive.create(0, new Int8Array([0])),
      new LegacyCacheIndex(0, []),
    );
    loader['locTypeLoader'] = {
      load: () => locType,
      getCount: () => 1,
      clearCache: () => {},
    };
    loader['modelLoader'] = { getModel: () => buildTestModel() };

    const mesh = loader.loadLocMesh(locId, LocModelType.NORMAL, rotation, 0, 0, 0);

    expect(mesh).toBeDefined();
    expect([mesh?.sizeX, mesh?.sizeY]).toEqual(expected);
  });

  it('threads positive model vertical height from calculated bounds into static meshes', () => {
    const source = buildTestModel();
    source.verticesY = new Int32Array([0, -128, -64]);
    const locType = new LocType(1, TEST_CACHE_INFO);
    locType.models = [[1000]];
    locType.types = [LocModelType.NORMAL];
    const loader = createTestLoader(source);
    loader['locTypeLoader'] = {
      load: () => locType,
      getCount: () => 1,
      clearCache: () => {},
    };

    const mesh = loader.loadLocMesh(1, LocModelType.NORMAL, 0, 0, 0, 0);

    expect(mesh?.modelHeight?.value).toBe(128);
  });
});
