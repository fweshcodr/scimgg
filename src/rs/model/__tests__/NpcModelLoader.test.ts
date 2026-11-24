import { describe, expect, it } from 'vitest';
import { readCacheZipFiles } from '../../../test/helpers/cacheZipFiles';
import {
  findProjectCacheZip,
  REAL_CACHE_TEST_TIMEOUT_MS,
  skipWithoutRealCache,
} from '../../../test/helpers/real-cache';
import { CacheSystem } from '../../cache/CacheSystem';
import { Bzip2 } from '../../compression/Bzip2';
import { NpcType } from '../../config/npctype/NpcType';
import { ArchiveNpcTypeLoader, type NpcTypeLoader } from '../../config/npctype/NpcTypeLoader';
import { ModelData } from '../ModelData';
import { IndexModelLoader, type ModelLoader } from '../ModelLoader';
import {
  modelDataToMesh,
  NpcModelLoader,
  YAMA_NPC_ID,
  YAMA_SIMULATOR_POSITION,
  YAMA_WORLD_POSITION,
} from '../NpcModelLoader';

describe('NpcModelLoader constants', () => {
  it('should have correct Yama NPC ID', () => {
    expect(YAMA_NPC_ID).toBe(14176);
  });

  it('should have correct Yama world position', () => {
    expect(YAMA_WORLD_POSITION.x).toBe(1504);
    expect(YAMA_WORLD_POSITION.y).toBe(10078);
    expect(YAMA_WORLD_POSITION.z).toBe(0);
  });

  it('should have correct Yama simulator position (derived from SW corner)', () => {
    expect(YAMA_SIMULATOR_POSITION.x).toBe(29);
    expect(YAMA_SIMULATOR_POSITION.y).toBe(28);
  });
});

describe('modelDataToMesh', () => {
  function createTestModel(): ModelData {
    const model = new ModelData();
    model.verticesCount = 3;
    model.usedVertexCount = 3;
    model.faceCount = 1;
    model.verticesX = new Int32Array([0, 100, 50]);
    model.verticesY = new Int32Array([0, 0, -100]);
    model.verticesZ = new Int32Array([0, 0, 100]);
    model.indices1 = new Int32Array([0]);
    model.indices2 = new Int32Array([1]);
    model.indices3 = new Int32Array([2]);
    model.faceColors = new Uint16Array([0x7f]);
    return model;
  }

  it('should convert ModelData to NpcMeshData with correct vertex count', () => {
    const model = createTestModel();
    const mesh = modelDataToMesh(model);

    expect(mesh.positions.length).toBe(9);
    expect(mesh.normals?.length).toBe(9);
    expect(mesh.hslColors?.length).toBe(3);
    expect(mesh.alphas?.length).toBe(3);
  });

  it('should convert positions correctly', () => {
    const model = createTestModel();
    const mesh = modelDataToMesh(model);

    expect(mesh.positions[0]).toBeCloseTo(0);
    expect(mesh.positions[1]).toBeCloseTo(0);
    expect(mesh.positions[2]).toBeCloseTo(0);

    expect(mesh.positions[3]).toBeCloseTo(100);
    expect(mesh.positions[4]).toBeCloseTo(0);
    expect(mesh.positions[5]).toBeCloseTo(0);

    expect(mesh.positions[6]).toBeCloseTo(50);
    expect(mesh.positions[7]).toBeCloseTo(-100);
    expect(mesh.positions[8]).toBeCloseTo(100);
  });

  it('should generate normals', () => {
    const model = createTestModel();
    const mesh = modelDataToMesh(model);

    expect(mesh.normals).toBeDefined();
    for (let i = 0; i < 9; i++) {
      expect(Number.isFinite(mesh.normals![i])).toBe(true);
    }
  });

  it('should store HSL colors for shader conversion', () => {
    const model = createTestModel();
    const mesh = modelDataToMesh(model);

    expect(mesh.hslColors).toBeDefined();
    for (let i = 0; i < 3; i++) {
      expect(mesh.hslColors![i]).toBeGreaterThanOrEqual(0);
      expect(mesh.hslColors![i]).toBeLessThanOrEqual(0xffff);
    }
  });

  it('should handle face alpha', () => {
    const model = createTestModel();
    model.faceAlphas = new Int8Array([127]);
    const mesh = modelDataToMesh(model);

    expect(mesh.alphas![0]).toBeCloseTo(0.5, 1);
  });

  it.each([
    { faceBias: -1, expected: 0 },
    { faceBias: -2, expected: 254 },
  ])('normalizes static NPC faceBias $faceBias to $expected', ({ faceBias, expected }) => {
    const model = createTestModel();
    model.faceBias = new Int8Array([faceBias]);

    const mesh = modelDataToMesh(model);

    expect(Array.from(mesh.faceBias)).toEqual([expected, expected, expected]);
  });

  it('should handle multiple faces', () => {
    const model = new ModelData();
    model.verticesCount = 4;
    model.usedVertexCount = 4;
    model.faceCount = 2;
    model.verticesX = new Int32Array([0, 100, 100, 0]);
    model.verticesY = new Int32Array([0, 0, 0, 0]);
    model.verticesZ = new Int32Array([0, 0, 100, 100]);
    model.indices1 = new Int32Array([0, 0]);
    model.indices2 = new Int32Array([1, 2]);
    model.indices3 = new Int32Array([2, 3]);
    model.faceColors = new Uint16Array([0x7f, 0xff]);

    const mesh = modelDataToMesh(model);

    expect(mesh.positions.length).toBe(18);
    expect(mesh.hslColors?.length).toBe(6);
  });
});

describe('HSL color storage', () => {
  it('should store grayscale HSL values', () => {
    const model = new ModelData();
    model.verticesCount = 3;
    model.usedVertexCount = 3;
    model.faceCount = 1;
    model.verticesX = new Int32Array([0, 1, 0]);
    model.verticesY = new Int32Array([0, 0, 1]);
    model.verticesZ = new Int32Array([0, 0, 0]);
    model.indices1 = new Int32Array([0]);
    model.indices2 = new Int32Array([1]);
    model.indices3 = new Int32Array([2]);
    model.faceColors = new Uint16Array([0x3f]);

    const mesh = modelDataToMesh(model);

    expect(mesh.hslColors![0]).toBe(0x3f);
    expect(mesh.hslColors![1]).toBe(0x3f);
    expect(mesh.hslColors![2]).toBe(0x3f);
  });

  it('should store full saturation HSL values', () => {
    const model = new ModelData();
    model.verticesCount = 3;
    model.usedVertexCount = 3;
    model.faceCount = 1;
    model.verticesX = new Int32Array([0, 1, 0]);
    model.verticesY = new Int32Array([0, 0, 1]);
    model.verticesZ = new Int32Array([0, 0, 0]);
    model.indices1 = new Int32Array([0]);
    model.indices2 = new Int32Array([1]);
    model.indices3 = new Int32Array([2]);
    model.faceColors = new Uint16Array([0x03bf]);

    const mesh = modelDataToMesh(model);

    expect(mesh.hslColors![0]).toBe(0x03bf);
    expect(mesh.hslColors![1]).toBe(0x03bf);
    expect(mesh.hslColors![2]).toBe(0x03bf);
  });
});

describe('NpcModelLoader lighting parity', () => {
  it('uses decoded npc contrast directly when computing lit colors', () => {
    const cacheInfo = {
      name: 'test',
      game: 'oldschool' as const,
      environment: 'live' as const,
      revision: 232,
      timestamp: '2024-01-01T00:00:00.000Z',
      size: 0,
    };

    const npcType = new NpcType(1, cacheInfo);
    npcType.name = 'test-npc';
    npcType.modelIds = [1000];
    npcType.ambient = 12;
    npcType.contrast = 50;

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

    const computeSpy = model.computeLitColors.bind(model);
    let receivedContrast = -1;
    model.computeLitColors = ((ambient: number, contrast: number, lightX: number, lightY: number, lightZ: number) => {
      receivedContrast = contrast;
      return computeSpy(ambient, contrast, lightX, lightY, lightZ);
    }) as ModelData['computeLitColors'];

    const npcTypeLoader = {
      load: (id: number) => (id === 1 ? npcType : undefined),
    };
    const modelLoader = {
      getModel: (id: number) => (id === 1000 ? model : undefined),
    };

    const loader = new NpcModelLoader(npcTypeLoader as NpcTypeLoader, modelLoader as ModelLoader);

    const loaded = loader.loadNpcModelData(1);
    expect(loaded).toBeDefined();
    expect(receivedContrast).toBe(900);
  });
});

describe('NpcModelLoader retexturing', () => {
  it('applies npcType retextureFrom/To to face textures', () => {
    const cacheInfo = {
      name: 'test',
      game: 'oldschool' as const,
      environment: 'live' as const,
      revision: 232,
      timestamp: '2024-01-01T00:00:00.000Z',
      size: 0,
    };

    const npcType = new NpcType(1, cacheInfo);
    npcType.name = 'test-npc';
    npcType.modelIds = [1000];
    npcType.retextureFrom = [40];
    npcType.retextureTo = [59];

    const model = new ModelData();
    model.verticesCount = 3;
    model.usedVertexCount = 3;
    model.faceCount = 2;
    model.verticesX = new Int32Array([0, 128, 0]);
    model.verticesY = new Int32Array([0, 0, 0]);
    model.verticesZ = new Int32Array([0, 0, 128]);
    model.indices1 = new Int32Array([0, 0]);
    model.indices2 = new Int32Array([1, 1]);
    model.indices3 = new Int32Array([2, 2]);
    model.faceColors = new Uint16Array([0x03bf, 0x03bf]);
    model.faceTextures = new Int16Array([40, 7]);

    const npcTypeLoader = {
      load: (id: number) => (id === 1 ? npcType : undefined),
    };
    const modelLoader = {
      getModel: (id: number) => (id === 1000 ? model : undefined),
    };

    const loader = new NpcModelLoader(npcTypeLoader as NpcTypeLoader, modelLoader as ModelLoader);
    const loaded = loader.loadNpcModelData(1);

    expect(loaded).toBeDefined();
    expect(Array.from(loaded?.mergedModel?.faceTextures ?? [])).toEqual([59, 7]);
  });
});

const cachePath = findProjectCacheZip('pinned') ?? '';

describe('NpcModelLoader real-cache lighting', () => {
  it.skipIf(skipWithoutRealCache('pinned'))(
    'lights solarflare (NPC 12826, model 51242) face 1 vertex 3 at brightness 64',
    async () => {
      await Bzip2.initWasm();
      const files = await readCacheZipFiles(cachePath);
      const cache = CacheSystem.fromMap('dat2', files, [2, 7]);
      const info = {
        name: 'osrs-test',
        game: 'oldschool',
        environment: 'live',
        revision: 232,
        timestamp: '',
        size: 0,
      } as const;
      const loader = new NpcModelLoader(
        new ArchiveNpcTypeLoader(info, cache.getIndex(2).getArchive(9)),
        new IndexModelLoader(cache.getIndex(7)),
      );

      const loaded = loader.loadNpcModelData(12826);
      expect(loaded?.modelIds).toEqual([51242]);
      expect(loaded?.lighting).toEqual({ ambient: 64, contrast: 850, lightX: -30, lightY: -50, lightZ: -30 });
      expect(loaded?.mergedModel?.faceColors[1]).toBe(9176);
      // The third vertex's directional term is -780 / 860: it truncates to 0, keeping brightness 64
      // (HSL 9132). Adding the fraction to ambient before truncating gave 63 (HSL 9131).
      expect(loaded?.litColors?.faceColors3[1]).toBe((64 << 17) | 9132);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );
});
