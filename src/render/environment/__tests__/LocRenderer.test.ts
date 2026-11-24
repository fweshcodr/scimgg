import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocWithType } from '../../../cache/CacheManager';
import { setArenaBounds } from '../../../core/constants';
import {
  type AnimatedLocMeshData,
  type LitColors,
  type LocMesh,
  type LocMeshData,
  type LocModelLoader,
  locModelDataToMesh,
} from '../../../rs/config/loctype/LocModelLoader';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import type { LocType } from '../../../rs/config/loctype/LocType';
import type { SeqType } from '../../../rs/config/seqtype/SeqType';
import { ModelData } from '../../../rs/model/ModelData';
import type { SeqFrameLoader } from '../../../rs/model/seq/SeqFrameLoader';
import { VERTEX_NORMAL_STRIDE } from '../../../rs/model/VertexNormal';
import { collectGarbage, collectGarbageUntilCleared } from '../../../test/helpers/collectGarbage';
import { ResidentMeshEmbedder } from '../../../test/helpers/residentMeshDraws';
import type { MeshData } from '../../core/assets';
import { isResidentMesh3DCommand, type NpcMesh3DCommand, type RenderQueue } from '../../core/commands';
import { LocRenderer } from '../LocRenderer';

/**
 * Static scenery is drawn from a resident source; read back as the embedded-array commands it
 * replaced, materialized once per source as the renderer uploads it, and expanded from the indexed
 * form the finalizer now builds back into the triangle soup it indexes.
 */
const embedder = new ResidentMeshEmbedder(true);
function renderEmbedded(renderer: LocRenderer, queue: RenderQueue): void {
  renderer.renderLocs(queue);
  embedder.embedQueue(queue);
}

function model(): ModelData {
  const value = new ModelData();
  value.verticesCount = 3;
  value.usedVertexCount = 3;
  value.faceCount = 1;
  value.verticesX = new Int32Array([-64, 64, -64]);
  value.verticesY = new Int32Array([0, 0, -128]);
  value.verticesZ = new Int32Array([-64, -64, 64]);
  value.indices1 = new Int32Array([0]);
  value.indices2 = new Int32Array([1]);
  value.indices3 = new Int32Array([2]);
  value.faceColors = new Uint16Array([500]);
  return value;
}

function loc(overrides: Partial<LocType> = {}): LocWithType {
  return {
    location: { id: 1, localX: 63, localY: 63, level: 0, type: 10, rotation: 0 },
    locType: {
      sizeX: 1,
      sizeY: 1,
      seqId: -1,
      contouredGround: -1,
      mergeNormals: false,
      ambient: 0,
      contrast: 0,
      ...overrides,
    } as LocType,
    modelType: LocModelType.NORMAL,
    mapSquareOffset: { x: 0, y: 0 },
    terrainHeightPlanes: [],
    terrainContextOrigin: { x: 0, y: 0 },
  };
}

function loader(): LocModelLoader {
  return {
    getSeqFrameLoader: vi.fn(() => null),
    getLocModelData: vi.fn(() => model()),
    loadLocMesh: vi.fn(() => {
      const value = model();
      const lit = value.computeLitColors(64, 768, -50, -10, -50);
      return {
        locId: 1,
        mesh: { positions: new Float32Array([-64, 0, -64, 64, 0, -64, -64, -128, 64]) },
        hslColors: new Float32Array(lit.faceColors1),
        alphas: new Float32Array([1, 1, 1]),
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
    }),
    loadAnimatedLocMeshFrames: vi.fn(() => undefined),
    loadSeqType: vi.fn(() => undefined),
  } as unknown as LocModelLoader;
}

describe('LocRenderer parity loading', () => {
  it('samples east and north terrain through the explicit context origin', async () => {
    const renderer = new LocRenderer();
    const entry = loc();
    const heights = Array.from({ length: 77 }, () => new Int32Array(77));
    heights[69][69] = -128;
    heights[70][69] = -128;
    heights[69][70] = -128;
    heights[70][70] = -128;
    entry.terrainHeightPlanes = [heights];
    entry.terrainContextOrigin = { x: 6, y: 6 };

    await renderer.load(loader(), [entry], { bounds: null });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderEmbedded(renderer, queue);

    const command = queue.commands[0];
    expect(command?.kind).toBe('mesh3d');
    if (command?.kind === 'mesh3d' && 'positions' in command && command.positions instanceof Float32Array) {
      expect(command.positions[2]).toBeCloseTo(1);
    }
  });

  it('stages every static LOC as ModelData without triangle-soup conversion and reuses cached buffers', async () => {
    const renderer = new LocRenderer();
    const source = loader();
    const entries = [
      loc({ mergeNormals: true }),
      { ...loc({ mergeNormals: false }), location: { ...loc().location, id: 2, localX: 61 } },
      { ...loc({ mergeNormals: true, seqId: 42 }), location: { ...loc().location, id: 3, localX: 59 } },
    ];

    await renderer.load(source, entries, { bounds: null });
    const first: RenderQueue = { replayPresentationReady: true, commands: [] };
    const second: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.renderLocs(first);
    renderer.renderLocs(second);

    expect(source.getLocModelData).toHaveBeenCalledTimes(3);
    expect(source.loadLocMesh).not.toHaveBeenCalled();
    expect(first.commands.length).toBeGreaterThan(0);
    expect(second.commands[0]).toBe(first.commands[0]);
    const firstCommand = first.commands[0];
    expect(firstCommand?.kind === 'mesh3d' && isResidentMesh3DCommand(firstCommand)).toBe(true);
    // Handing the first build to the GPU does not stage anything again.
    embedder.embedQueue(first);
    expect(source.getLocModelData).toHaveBeenCalledTimes(3);
  });

  it('keeps merge-normal wall decorations out of normal merging while staging their ModelData', async () => {
    const renderer = new LocRenderer();
    const source = loader();
    const decoration = loc({ mergeNormals: true });
    decoration.location = { ...decoration.location, type: 8 };

    await renderer.load(source, [decoration], { bounds: null });

    expect(source.getLocModelData).toHaveBeenCalledTimes(2);
    expect(source.loadLocMesh).not.toHaveBeenCalled();
  });

  it('reuses transformed ordinary ModelData while emitting every placement', async () => {
    const renderer = new LocRenderer();
    const source = loader();
    const first = loc({ mergeNormals: false });
    const second = { ...loc({ mergeNormals: false }), location: { ...loc().location, localX: 61 } };

    await renderer.load(source, [first, second], { bounds: null });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderEmbedded(renderer, queue);

    expect(source.getLocModelData).toHaveBeenCalledTimes(1);
    const command = queue.commands[0];
    expect(
      command?.kind === 'mesh3d' && 'positions' in command && command.positions instanceof Float32Array
        ? command.positions.length
        : 0,
    ).toBe(18);
  });

  it('rebuilds its static scenery from the recipe alone, replaying animated fallbacks without loading frames', async () => {
    const renderer = new LocRenderer();
    const source = loader();
    const entries = [
      loc({ mergeNormals: true }),
      { ...loc({ mergeNormals: false }), location: { ...loc().location, id: 2, localX: 61 } },
      // No frames: drawn static at its sequence height, which the rebuild must reuse.
      { ...loc({ seqId: 42 }), location: { ...loc().location, id: 3, localX: 59 } },
    ];
    vi.mocked(source.loadSeqType).mockReturnValue({ heightOffset: 2 } as SeqType);
    renderer.setTerrainHeights([new Int32Array(104)]);
    await renderer.load(source, entries, { bounds: null });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.renderLocs(queue);
    const command = queue.commands[0];
    if (command?.kind !== 'mesh3d' || !isResidentMesh3DCommand(command)) throw new Error('Expected resident scenery');
    const meshSource = command.meshSource;
    const first = meshSource.materialize().map((part) => ({
      positions: Array.from(part.positions),
      colors: Array.from(part.perVertexHslColors ?? []),
    }));
    vi.mocked(source.loadAnimatedLocMeshFrames).mockClear();
    vi.mocked(source.loadSeqType).mockClear();

    const rebuilt = meshSource.materialize().map((part) => ({
      positions: Array.from(part.positions),
      colors: Array.from(part.perVertexHslColors ?? []),
    }));

    expect(first[0]?.positions).toHaveLength(27);
    expect(rebuilt).toEqual(first);
    expect(source.loadAnimatedLocMeshFrames).not.toHaveBeenCalled();
    expect(source.loadSeqType).not.toHaveBeenCalled();
  });

  it.skipIf(!collectGarbage)('keeps no CPU copy of the static scenery once the renderer has taken it', async () => {
    const renderer = new LocRenderer();
    await renderer.load(loader(), [loc({ mergeNormals: true }), loc({ mergeNormals: false })], { bounds: null });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.renderLocs(queue);
    const arrays = (() => {
      const command = queue.commands[0];
      if (command?.kind !== 'mesh3d' || !isResidentMesh3DCommand(command)) throw new Error('Expected resident scenery');
      // What the renderer's first upload takes.
      return command.meshSource
        .materialize()
        .flatMap((part) => Object.values(part))
        .map((array) => new WeakRef(array));
    })();

    await collectGarbageUntilCleared(arrays);

    expect(arrays.length).toBeGreaterThan(0);
    expect(arrays.map((array) => array.deref())).toEqual(arrays.map(() => undefined));
    // Still drawable: the scene keeps its commands and their source.
    const again: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.renderLocs(again);
    expect(again.commands).toEqual(queue.commands);
  });
});

const ARENA = { minX: 17, maxX: 44, minY: 0, maxY: 45, width: 28, height: 46 };

function isNpcMesh3DCommand(command: RenderQueue['commands'][number]): command is NpcMesh3DCommand {
  return command.kind === 'mesh3d' && 'positions' in command && command.positions instanceof Float32Array;
}

function expectMeshCommand(command: RenderQueue['commands'][number] | undefined): NpcMesh3DCommand {
  if (!command || !isNpcMesh3DCommand(command)) {
    throw new Error('Expected mesh3d render command');
  }
  return command;
}

function meshCommands(queue: RenderQueue): NpcMesh3DCommand[] {
  return queue.commands.filter(isNpcMesh3DCommand);
}

function makeMesh(vertCount = 3): { mesh: MeshData; hslColors: Float32Array; alphas: Float32Array } {
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3] = i * 10;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = i * 10;
  }
  const normals = new Float32Array(vertCount * 3);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  return {
    mesh: { positions, normals } as MeshData,
    hslColors: new Float32Array(vertCount).fill(100),
    alphas: new Float32Array(vertCount).fill(1),
  };
}

function makeMixedMesh(): { mesh: MeshData; hslColors: Float32Array; alphas: Float32Array } {
  const vertCount = 6;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const hslColors = new Float32Array(vertCount).fill(200);
  const alphas = new Float32Array(vertCount);
  alphas[0] = 1;
  alphas[1] = 1;
  alphas[2] = 1;
  alphas[3] = 0.5;
  alphas[4] = 0.5;
  alphas[5] = 0.5;
  return { mesh: { positions, normals }, hslColors, alphas };
}

function makeMixedFaceBias(): Float32Array {
  return new Float32Array([11, 11, 11, 22, 22, 22]);
}

function makeModelDataWithFaceBias(): ModelData {
  const model = new ModelData();
  model.verticesCount = 4;
  model.usedVertexCount = 4;
  model.faceCount = 2;
  model.verticesX = new Int32Array([0, 128, 0, 128]);
  model.verticesY = new Int32Array([0, 0, 0, 0]);
  model.verticesZ = new Int32Array([0, 0, 128, 128]);
  model.indices1 = new Int32Array([0, 1]);
  model.indices2 = new Int32Array([1, 3]);
  model.indices3 = new Int32Array([2, 2]);
  model.faceBias = new Int8Array([7, 19]);
  return model;
}

function makeLitColors(): LitColors {
  return {
    faceColors1: new Int32Array([100, 200]),
    faceColors2: new Int32Array([101, 201]),
    faceColors3: new Int32Array([102, 202]),
  };
}

function makeLocType(overrides: Partial<LocType> = {}): LocType {
  return {
    sizeX: 1,
    sizeY: 1,
    seqId: -1,
    contouredGround: -1,
    ambient: 0,
    contrast: 0,
    ...overrides,
  } as LocType;
}

function makeLocation(x: number, y: number, id = 1, level = 0, rotation = 0, type = 10) {
  return { id, localX: x, localY: y, level, type, rotation };
}

function makeLocWithType(
  x: number,
  y: number,
  locType?: Partial<LocType>,
  locId = 1,
  sourceType = 10,
  rotation = 0,
  level = 0,
): LocWithType {
  return {
    location: makeLocation(x, y, locId, level, rotation, sourceType),
    locType: makeLocType(locType),
    modelType: LocModelType.NORMAL,
    mapSquareOffset: { x: 0, y: 0 },
    terrainHeightPlanes: [],
    terrainContextOrigin: { x: 0, y: 0 },
  };
}

function makeLocMesh(sizeX = 1, sizeY = 1): LocMesh {
  const data = makeMesh(3);
  return {
    locId: 1,
    mesh: data.mesh,
    hslColors: data.hslColors,
    alphas: data.alphas,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    sizeX,
    sizeY,
  };
}

function modelDataFromLocMesh(locMesh: LocMesh): ModelData {
  const model = new ModelData();
  const vertexCount = locMesh.mesh.positions.length / 3;
  const faceCount = vertexCount / 3;
  model.verticesCount = vertexCount;
  model.usedVertexCount = vertexCount;
  model.faceCount = faceCount;
  model.verticesX = new Int32Array(vertexCount);
  model.verticesY = new Int32Array(vertexCount);
  model.verticesZ = new Int32Array(vertexCount);
  model.indices1 = new Int32Array(faceCount);
  model.indices2 = new Int32Array(faceCount);
  model.indices3 = new Int32Array(faceCount);
  model.faceColors = new Uint16Array(faceCount).fill(500);
  model.faceAlphas = new Int8Array(faceCount);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    model.verticesX[vertex] = locMesh.mesh.positions[vertex * 3];
    model.verticesY[vertex] = locMesh.mesh.positions[vertex * 3 + 1];
    model.verticesZ[vertex] = locMesh.mesh.positions[vertex * 3 + 2];
  }
  for (let face = 0; face < faceCount; face++) {
    model.indices1[face] = face * 3;
    model.indices2[face] = face * 3 + 1;
    model.indices3[face] = face * 3 + 2;
    model.faceAlphas[face] = Math.round((1 - (locMesh.alphas[face * 3] ?? 1)) * 255);
  }
  if (locMesh.faceBias) {
    model.faceBias = new Int8Array(faceCount);
    for (let face = 0; face < faceCount; face++) model.faceBias[face] = locMesh.faceBias[face * 3] ?? 0;
  }
  model.computeLitColors = () => {
    model.normals = new Float64Array(vertexCount * VERTEX_NORMAL_STRIDE);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const at = vertex * VERTEX_NORMAL_STRIDE;
      model.normals[at] = locMesh.mesh.normals?.[vertex * 3] ?? 0;
      model.normals[at + 1] = locMesh.mesh.normals?.[vertex * 3 + 1] ?? 0;
      model.normals[at + 2] = locMesh.mesh.normals?.[vertex * 3 + 2] ?? 0;
      model.normals[at + 3] = 1;
    }
    const faceColors1 = new Int32Array(faceCount);
    const faceColors2 = new Int32Array(faceCount);
    const faceColors3 = new Int32Array(faceCount);
    for (let face = 0; face < faceCount; face++) {
      faceColors1[face] = locMesh.hslColors[face * 3] ?? 0;
      faceColors2[face] = locMesh.hslColors[face * 3 + 1] ?? 0;
      faceColors3[face] = locMesh.hslColors[face * 3 + 2] ?? 0;
    }
    return { faceColors1, faceColors2, faceColors3 };
  };
  return model;
}

function makeAnimatedLocData(frameCount = 3): AnimatedLocMeshData {
  const frames: LocMeshData[] = [];
  for (let i = 0; i < frameCount; i++) {
    const m = makeMesh(3);
    frames.push({
      mesh: m.mesh,
      hslColors: m.hslColors,
      alphas: m.alphas,
      hasTransparency: false,
    });
  }
  return {
    frames,
    seqType: {
      frameIds: frames.map((_, i) => i),
      frameLengths: new Array(frameCount).fill(10),
      frameStep: 0,
      isSkeletalSeq: () => false,
      getSkeletalDuration: () => 0,
      getFrameLength: (_loader: SeqFrameLoader, _frame: number) => 10,
    } as unknown as SeqType,
  };
}

function createMockLoader(
  opts: {
    locMesh?: LocMesh | null;
    locMeshFn?: (
      id: number,
      type: LocModelType,
      rotation: number,
      x: number,
      y: number,
      z: number,
    ) => LocMesh | undefined;
    animatedFn?: (id: number, type: LocModelType, rotation: number, seqId: number) => AnimatedLocMeshData | undefined;
    seqTypeFn?: (seqId: number) => SeqType | undefined;
    locTypeFn?: (id: number) => LocType | undefined;
  } = {},
): LocModelLoader {
  const defaultMesh =
    opts.locMesh !== undefined
      ? opts.locMesh
      : (() => {
          return makeLocMesh();
        })();

  return {
    loadLocMesh: vi.fn(opts.locMeshFn ?? ((_id, _t, _r, _x, _y, _z) => defaultMesh ?? undefined)),
    getLocModelData: vi.fn((_locType, type, rotation) => {
      const source = opts.locMeshFn ? opts.locMeshFn(0, type, rotation, 0, 0, 0) : defaultMesh;
      return source ? modelDataFromLocMesh(source) : undefined;
    }),
    loadAnimatedLocMeshFrames: vi.fn(opts.animatedFn ?? (() => undefined)),
    loadSeqType: vi.fn(opts.seqTypeFn ?? (() => undefined)),
    loadLocType: vi.fn(opts.locTypeFn ?? (() => makeLocType())),
    getSeqFrameLoader: vi.fn(
      () =>
        ({
          load: vi.fn(() => undefined),
          clearCache: vi.fn(),
        }) as SeqFrameLoader,
    ),
  } as unknown as LocModelLoader;
}

function createQueue(): RenderQueue {
  return { replayPresentationReady: true, commands: [] };
}

function makeTerrainHeights(value = 0): Int32Array[] {
  const h: Int32Array[] = [];
  for (let x = 0; x <= 64; x++) {
    h[x] = new Int32Array(65).fill(value);
  }
  return h;
}

beforeEach(() => {
  setArenaBounds(ARENA);
});

describe('LocRenderer', () => {
  describe('locModelDataToMesh()', () => {
    it('preserves decoded faceBias as per-vertex LOC mesh data when source model provides it', () => {
      const meshData = locModelDataToMesh(makeModelDataWithFaceBias(), makeLitColors());

      expect(meshData).toHaveProperty('faceBias');
      expect(Array.from(meshData.faceBias ?? [])).toEqual([7, 7, 7, 19, 19, 19]);
    });
  });

  describe('isLoaded()', () => {
    it('should return false before load', () => {
      expect(new LocRenderer().isLoaded()).toBe(false);
    });

    it('should return true after successful load with static locs', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      expect(renderer.isLoaded()).toBe(true);
    });

    it('should return false when all locs are filtered out (out of bounds)', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(200, 200)]);
      expect(renderer.isLoaded()).toBe(false);
    });
  });

  describe('load()', () => {
    it('should load static locs and cache mesh commands', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      expect(renderer.isLoaded()).toBe(true);
      expect(loader.getLocModelData).toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should not reload if already loaded', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should not reload if currently loading', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const locs = [makeLocWithType(30, 30)];
      const p1 = renderer.load(loader, locs);
      const p2 = renderer.load(loader, locs);
      await Promise.all([p1, p2]);
      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should skip locs on non-zero level', async () => {
      const renderer = new LocRenderer();
      const loc: LocWithType = {
        location: makeLocation(30, 30, 1, 1),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainHeightPlanes: [],
        terrainContextOrigin: { x: 0, y: 0 },
      };
      const loader = createMockLoader();
      await renderer.load(loader, [loc]);
      expect(loader.getLocModelData).not.toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should skip locs outside arena bounds + margin', async () => {
      const renderer = new LocRenderer();
      const farLoc = makeLocWithType(100, 100);
      const loader = createMockLoader();
      await renderer.load(loader, [farLoc]);
      expect(loader.getLocModelData).not.toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should include locs within arena margin', async () => {
      const renderer = new LocRenderer();
      const marginLoc = makeLocWithType(13, 25);
      const loader = createMockLoader();
      await renderer.load(loader, [marginLoc]);
      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
    });

    it('should handle null mesh gracefully (skip loc)', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({ locMesh: null });
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      expect(renderer.isLoaded()).toBe(false);
    });

    it('should propagate errors from loader', async () => {
      const renderer = new LocRenderer();
      const loader = {
        getLocModelData: vi.fn(() => {
          throw new Error('cache corrupt');
        }),
        loadAnimatedLocMeshFrames: vi.fn(() => undefined),
        loadLocType: vi.fn(() => makeLocType()),
        getSeqFrameLoader: vi.fn(() => null),
      } as unknown as LocModelLoader;
      await expect(renderer.load(loader, [makeLocWithType(30, 30)])).rejects.toThrow('cache corrupt');
    });

    it('should load multiple static locs', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const locs = [
        makeLocWithType(30, 30, undefined, 1),
        makeLocWithType(32, 32, undefined, 2),
        makeLocWithType(34, 34, undefined, 3),
      ];
      await renderer.load(loader, locs);
      expect(renderer.isLoaded()).toBe(true);
      expect(loader.getLocModelData).toHaveBeenCalledTimes(3);
    });
  });

  describe('LocRenderOptions', () => {
    it('skips the excluded Ancestral Glyph while keeping the rest of the Inferno scenery', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const glyph = makeLocWithType(30, 51, { sizeX: 6, sizeY: 3, clipType: 1 }, 30338, 10, 3);
      const caveExit = makeLocWithType(29, 13, { sizeX: 5, sizeY: 4, clipType: 2 }, 30283);

      // When: only the glyph's loc id is excluded, as ZUK_RENDER_CONFIG declares.
      await renderer.load(loader, [glyph, caveExit], { bounds: null, excludedLocIds: [30338] });

      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(loader.getLocModelData).toHaveBeenCalledWith(caveExit.locType, LocModelType.NORMAL, 0);
    });

    it('skips cache locs whose IDs are excluded by the encounter', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const excludedLoc = makeLocWithType(29, 13, undefined, 30283);

      await renderer.load(loader, [excludedLoc], { excludedLocIds: [30283] });

      expect(loader.getLocModelData).not.toHaveBeenCalled();
      expect(renderer.isLoaded()).toBe(false);
    });

    it('renders locs outside the arena bounds when bounds: null is passed', async () => {
      // Default filter (arena bounds + margin 5) would reject (60, 60).
      // `{ bounds: null }` opts out so the full map square renders.
      const renderer = new LocRenderer();
      const farLoc = makeLocWithType(60, 60);
      const loader = createMockLoader();
      await renderer.load(loader, [farLoc], { bounds: null });
      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(renderer.isLoaded()).toBe(true);
    });

    it('still skips locs outside an explicit bounds window', async () => {
      const renderer = new LocRenderer();
      const insideLoc = makeLocWithType(10, 10);
      const outsideLoc = makeLocWithType(50, 50);
      const loader = createMockLoader();
      await renderer.load(loader, [insideLoc, outsideLoc], {
        bounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 },
        marginTiles: 0,
      });
      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(renderer.isLoaded()).toBe(true);
    });

    it('renders upper-level locs when levels include 1 and 2', async () => {
      const renderer = new LocRenderer();
      const loc0: LocWithType = {
        location: makeLocation(30, 30, 1, 0),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainHeightPlanes: [],
        terrainContextOrigin: { x: 0, y: 0 },
      };
      const loc1: LocWithType = {
        location: makeLocation(30, 30, 2, 1),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainHeightPlanes: [],
        terrainContextOrigin: { x: 0, y: 0 },
      };
      const loc2: LocWithType = {
        location: makeLocation(30, 30, 3, 2),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainHeightPlanes: [],
        terrainContextOrigin: { x: 0, y: 0 },
      };
      const loader = createMockLoader();
      await renderer.load(loader, [loc0, loc1, loc2], { levels: [0, 1, 2] });
      expect(loader.getLocModelData).toHaveBeenCalledTimes(3);
    });

    it('keeps upper-level locs skipped by default (level 0 only)', async () => {
      const renderer = new LocRenderer();
      const loc1: LocWithType = {
        location: makeLocation(30, 30, 1, 1),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainHeightPlanes: [],
        terrainContextOrigin: { x: 0, y: 0 },
      };
      const loader = createMockLoader();
      await renderer.load(loader, [loc1]);
      expect(loader.getLocModelData).not.toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });
  });

  describe('coordinate-bounded loc exclusion', () => {
    it('excludes only locs anchored inside the inclusive region and keeps those outside', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const insideMin = makeLocWithType(17, 17, undefined, 1);
      const insideMax = makeLocWithType(45, 45, undefined, 2);
      const outsideHigh = makeLocWithType(46, 46, undefined, 3);
      const outsideLow = makeLocWithType(16, 16, undefined, 4);

      await renderer.load(loader, [insideMin, insideMax, outsideHigh, outsideLow], {
        bounds: null,
        excludedRegions: [{ minX: 17, maxX: 45, minY: 17, maxY: 45 }],
      });

      expect(loader.getLocModelData).toHaveBeenCalledTimes(2);
    });

    it('keeps y=46 scenery just north of the inclusive exclusion region', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const edgeLoc = makeLocWithType(30, 46, undefined, 1);

      await renderer.load(loader, [edgeLoc], {
        bounds: null,
        excludedRegions: [{ minX: 17, maxX: 45, minY: 17, maxY: 45 }],
      });

      expect(loader.getLocModelData).toHaveBeenCalledTimes(1);
      expect(renderer.isLoaded()).toBe(true);
    });
  });

  describe('exact loc replacement', () => {
    const REPLACEMENT = {
      localX: 27,
      localY: 52,
      sourceLocId: 30333,
      targetLocId: 30340,
      targetRotation: 1,
    } as const;

    it('substitutes a matched loc with the target LocType id and rotation before model loading', async () => {
      const renderer = new LocRenderer();
      const loadedLocTypeIds: number[] = [];
      const replacementLocType = makeLocType({ sizeX: 2, sizeY: 3 });
      const loader = createMockLoader({
        locTypeFn: (id) => {
          loadedLocTypeIds.push(id);
          return replacementLocType;
        },
      });
      const source = makeLocWithType(27, 52, undefined, 30333, 10, 0);

      await renderer.load(loader, [source], { bounds: null, replacements: [REPLACEMENT] });

      expect(loadedLocTypeIds).toEqual([30340]);
      expect(loader.getLocModelData).toHaveBeenCalledWith(replacementLocType, LocModelType.NORMAL, 1);
    });

    it('does not replace a loc at the replacement coordinate whose source id differs', async () => {
      const renderer = new LocRenderer();
      const loadedLocTypeIds: number[] = [];
      const loader = createMockLoader({
        locTypeFn: (id) => {
          loadedLocTypeIds.push(id);
          return makeLocType();
        },
      });
      const other = makeLocWithType(27, 52, undefined, 99999, 10, 0);

      await renderer.load(loader, [other], { bounds: null, replacements: [REPLACEMENT] });

      expect(loadedLocTypeIds).not.toContain(30340);
      expect(loader.getLocModelData).toHaveBeenCalledWith(other.locType, LocModelType.NORMAL, 0);
    });

    it('does not replace a loc carrying the source id anchored at a different coordinate', async () => {
      const renderer = new LocRenderer();
      const loadedLocTypeIds: number[] = [];
      const loader = createMockLoader({
        locTypeFn: (id) => {
          loadedLocTypeIds.push(id);
          return makeLocType();
        },
      });
      const moved = makeLocWithType(40, 40, undefined, 30333, 10, 0);

      await renderer.load(loader, [moved], { bounds: null, replacements: [REPLACEMENT] });

      expect(loadedLocTypeIds).not.toContain(30340);
      expect(loader.getLocModelData).toHaveBeenCalledWith(moved.locType, LocModelType.NORMAL, 0);
    });
  });

  describe('static mesh merging', () => {
    it('should merge multiple locs into fewer commands (≤2 per merge)', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const locs = [
        makeLocWithType(30, 30, undefined, 1),
        makeLocWithType(32, 32, undefined, 2),
        makeLocWithType(34, 34, undefined, 3),
        makeLocWithType(36, 36, undefined, 4),
        makeLocWithType(38, 38, undefined, 5),
      ];
      await renderer.load(loader, locs);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBeLessThanOrEqual(2);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should reduce vertex count by combining meshes (total verts preserved)', async () => {
      const renderer = new LocRenderer();
      const vertCountPerLoc = 3;
      const locCount = 4;
      const loader = createMockLoader();
      const locs = Array.from({ length: locCount }, (_, i) => makeLocWithType(30 + i, 30, undefined, i + 1));
      await renderer.load(loader, locs);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      let totalVerts = 0;
      for (const cmd of queue.commands) {
        if (isNpcMesh3DCommand(cmd)) {
          totalVerts += cmd.positions.length / 3;
        }
      }
      expect(totalVerts).toBe(vertCountPerLoc * locCount);
    });

    it('should use identity matrix for merged mesh (transforms baked in)', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30), makeLocWithType(32, 32)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      for (const cmd of queue.commands) {
        const mat = expectMeshCommand(cmd).modelMatrix;
        expect(mat[0]).toBe(1);
        expect(mat[5]).toBe(1);
        expect(mat[10]).toBe(1);
        expect(mat[15]).toBe(1);
        expect(mat[1]).toBe(0);
        expect(mat[2]).toBe(0);
        expect(mat[4]).toBe(0);
        expect(mat[6]).toBe(0);
      }
    });

    it('should bake model matrix transforms into vertex positions', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBeGreaterThan(0);
      const cmd = expectMeshCommand(queue.commands[0]);
      const positions = cmd.positions;
      // vertex(0,0,0) → worldX = SCALE*0 + tx = 30.5
      expect(positions[0]).toBeCloseTo(30.5, 4);
      expect(positions[1]).toBeCloseTo(30.5, 4);
    });

    it('should split merged mesh into opaque and transparent commands', async () => {
      const renderer = new LocRenderer();
      const mixed = makeMixedMesh();
      const locMesh: LocMesh = {
        locId: 1,
        mesh: mixed.mesh,
        hslColors: mixed.hslColors,
        alphas: mixed.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBe(2);
      const meshIds = meshCommands(queue).map((command) => command.meshId);
      expect(meshIds).toContain('merged-static-locs-opaque');
      expect(meshIds).toContain('merged-static-locs-transparent');
    });

    it('preserves decoded faceBias on opaque and transparent static split commands', async () => {
      const renderer = new LocRenderer();
      const mixed = makeMixedMesh();
      const locMesh = {
        locId: 1,
        mesh: mixed.mesh,
        hslColors: mixed.hslColors,
        alphas: mixed.alphas,
        faceBias: makeMixedFaceBias(),
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      } satisfies LocMesh & { readonly faceBias: Float32Array };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const meshCommands = queue.commands.filter(isNpcMesh3DCommand);
      const opaque = meshCommands.find((command) => command.meshId === 'merged-static-locs-opaque');
      const transparent = meshCommands.find((command) => command.meshId === 'merged-static-locs-transparent');
      expect(Array.from(opaque?.perVertexFaceBias ?? [])).toEqual([11, 11, 11]);
      expect(Array.from(transparent?.perVertexFaceBias ?? [])).toEqual([22, 22, 22]);
    });

    it('should set transparent command properties (depth read, blend normal)', async () => {
      const renderer = new LocRenderer();
      const mixed = makeMixedMesh();
      const locMesh: LocMesh = {
        locId: 1,
        mesh: mixed.mesh,
        hslColors: mixed.hslColors,
        alphas: mixed.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const transparentCmd = meshCommands(queue).find((command) => command.meshId === 'merged-static-locs-transparent');
      expect(transparentCmd?.depth).toBe('read');
      expect(transparentCmd?.blend).toBe('normal');
    });

    it('should assign zIndex=1 (Z_LOC) to merged commands', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      for (const cmd of queue.commands) {
        expect(expectMeshCommand(cmd).zIndex).toBe(1);
      }
    });
  });

  describe('terrain contouring', () => {
    it('should not contour when contouredGround is -1', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(makeTerrainHeights(-256));

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: -1 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should skip contouring when terrain is flat (optimization)', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(makeTerrainHeights(-128));

      const m = makeMesh(3);
      m.mesh.positions[1] = -50;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: 0 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should adjust vertex heights when terrain is uneven (contouredGround=0)', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(0);
      heights[30][30] = -256;
      heights[31][30] = 0;
      heights[31][31] = 0;
      heights[30][31] = 0;
      renderer.setTerrainHeights(heights);

      const m = makeMesh(3);
      m.mesh.positions[0] = -64;
      m.mesh.positions[2] = -64;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: 0 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
      const cmd = expectMeshCommand(queue.commands[0]);
      expect(cmd.positions[2]).toBeCloseTo(2, 4);
    });

    it('contours static type 1 locs when uneven terrain has a zero midpoint average', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(0);
      heights[30][30] = -128;
      heights[31][30] = 128;
      heights[30][31] = -128;
      heights[31][31] = 128;
      renderer.setTerrainHeights(heights);
      const mesh = makeLocMesh();
      mesh.mesh.positions[0] = -64;
      mesh.mesh.positions[2] = -64;

      await renderer.load(createMockLoader({ locMesh: mesh }), [makeLocWithType(30, 30, { contouredGround: 0 })]);
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(expectMeshCommand(queue.commands[0]).positions[2]).toBeCloseTo(1);
    });

    it('should return original positions when no terrain heights set', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: 0 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should use bilinear interpolation for vertex heights', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(0);
      heights[30][30] = 0; // SW
      heights[31][30] = -256; // SE
      heights[30][31] = 0; // NW
      heights[31][31] = -256; // NE
      renderer.setTerrainHeights(heights);

      const m = makeMesh(3);
      m.mesh.positions[0] = -64;
      m.mesh.positions[1] = 0;
      m.mesh.positions[2] = 0;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: 0 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
      const cmd = expectMeshCommand(queue.commands[0]);
      expect(cmd.positions[2]).toBeCloseTo(0, 4);
    });

    it('should apply partial contouring when contouredGround > 0', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(0);
      heights[30][30] = -256;
      heights[31][30] = -128;
      heights[31][31] = -64;
      heights[30][31] = -192;
      renderer.setTerrainHeights(heights);

      const m = makeMesh(3);
      m.mesh.positions[0] = -64;
      m.mesh.positions[1] = -100;
      m.mesh.positions[2] = -64;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30, { contouredGround: 49152 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
      const cmd = expectMeshCommand(queue.commands[0]);
      expect(cmd.positions[2]).toBeCloseTo(2.03125, 4);
    });
  });

  describe('animated locs', () => {
    it('should load animated locs (seqId != -1)', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(3);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      const loc = makeLocWithType(30, 30, { seqId: 42 });
      await renderer.load(loader, [loc]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should apply the animated sequence height offset to the loc model matrix', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(1);
      animData.seqType.heightOffset = 32;
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(expectMeshCommand(queue.commands[0]).modelMatrix[14]).toBeCloseTo(32 / 128);
    });

    it('should fall back to static when animated data returns null', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({
        animatedFn: () => undefined,
      });
      const loc = makeLocWithType(30, 30, { seqId: 42 });
      await renderer.load(loader, [loc]);

      expect(loader.getLocModelData).toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should preserve a signed sequence height offset on the static animation fallback', async () => {
      const renderer = new LocRenderer();
      const seqType = makeAnimatedLocData(1).seqType;
      seqType.heightOffset = -16;
      const loader = createMockLoader({
        animatedFn: () => undefined,
        seqTypeFn: () => seqType,
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(expectMeshCommand(queue.commands[0]).positions[2]).toBeCloseTo(-16 / 128);
    });

    it('should fall back to static when animated data has zero frames', async () => {
      const renderer = new LocRenderer();
      const emptyAnim: AnimatedLocMeshData = {
        frames: [],
        seqType: { frameIds: [], frameLengths: [], frameStep: 0 } as unknown as SeqType,
      };
      const loader = createMockLoader({
        animatedFn: () => emptyAnim,
      });
      const loc = makeLocWithType(30, 30, { seqId: 42 });
      await renderer.load(loader, [loc]);

      expect(loader.getLocModelData).toHaveBeenCalled();
      expect(loader.loadLocMesh).not.toHaveBeenCalled();
    });

    it('should create frame meshes for each animation frame', async () => {
      const renderer = new LocRenderer();
      const frameCount = 5;
      const animData = makeAnimatedLocData(frameCount);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      const loc = makeLocWithType(30, 30, { seqId: 42 });
      await renderer.load(loader, [loc]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should select frame based on animation cycle', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(4);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue1 = createQueue();
      renderEmbedded(renderer, queue1);

      expect(queue1.commands.length).toBeGreaterThan(0);
      for (const cmd of queue1.commands) {
        expect(cmd.kind).toBe('mesh3d');
      }
    });

    it('should assign correct meshId with frame index for animated locs', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(2);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      if (queue.commands.length > 0) {
        expect(expectMeshCommand(queue.commands[0]).meshId).toMatch(/frame-\d+/);
      }
    });

    it('should apply contouring to animated frames when contouredGround >= 0', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(0);
      heights[30][30] = -256;
      heights[31][30] = 0;
      heights[31][31] = 0;
      heights[30][31] = 0;
      renderer.setTerrainHeights(heights);

      const animData = makeAnimatedLocData(2);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42, contouredGround: 0 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('bakes repeated un-contoured placements once and draws each with its own matrix', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({ animatedFn: () => makeAnimatedLocData(1) });
      const locs = [28, 30, 32].map((x) => makeLocWithType(x, 30, { seqId: 42 }, 7));

      await renderer.load(loader, locs);
      const queue = createQueue();
      renderEmbedded(renderer, queue);
      const commands = meshCommands(queue);

      expect(loader.loadAnimatedLocMeshFrames).toHaveBeenCalledOnce();
      expect(commands).toHaveLength(3);
      expect(new Set(commands.map((command) => command.meshId))).toEqual(
        new Set(['loc-anim:7:10:0:42-frame-0-opaque']),
      );
      expect(new Set(commands.map((command) => command.positions)).size).toBe(1);
      expect(commands.map((command) => command.modelMatrix[12])).toEqual([28.5, 30.5, 32.5]);
      // Phase stays per placement: one animation clock each.
      expect(renderer['animatedLocs'].size).toBe(3);
    });

    it('keeps distinct loader inputs and contoured placements apart', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({ animatedFn: () => makeAnimatedLocData(1) });
      await renderer.load(loader, [
        makeLocWithType(26, 30, { seqId: 42 }, 7, 10, 0),
        makeLocWithType(27, 30, { seqId: 42 }, 7, 10, 1),
        makeLocWithType(28, 30, { seqId: 43 }, 7),
        makeLocWithType(29, 30, { seqId: 42 }, 8),
        makeLocWithType(31, 30, { seqId: 42, contouredGround: 0 }, 9),
        makeLocWithType(33, 30, { seqId: 42, contouredGround: 0 }, 9),
      ]);
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(loader.loadAnimatedLocMeshFrames).toHaveBeenCalledTimes(6);
      expect(meshCommands(queue).map((command) => command.meshId)).toEqual([
        'loc-anim:7:10:0:42-frame-0-opaque',
        'loc-anim:7:10:1:42-frame-0-opaque',
        'loc-anim:7:10:0:43-frame-0-opaque',
        'loc-anim:8:10:0:42-frame-0-opaque',
        'loc-9-0-31-30-source-10-model-10-rotation-0-part-0-frame-0-opaque',
        'loc-9-0-33-30-source-10-model-10-rotation-0-part-0-frame-0-opaque',
      ]);
    });

    it('releases shared frames with the scene and bakes them afresh on the next load', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({ animatedFn: () => makeAnimatedLocData(1) });
      const locs = [28, 30].map((x) => makeLocWithType(x, 30, { seqId: 42 }, 7));
      await renderer.load(loader, locs);
      const firstQueue = createQueue();
      renderEmbedded(renderer, firstQueue);

      renderer.dispose();
      await renderer.load(loader, locs);
      const secondQueue = createQueue();
      renderEmbedded(renderer, secondQueue);

      expect(loader.loadAnimatedLocMeshFrames).toHaveBeenCalledTimes(2);
      expect(meshCommands(secondQueue).map((command) => command.meshId)).toEqual(
        meshCommands(firstQueue).map((command) => command.meshId),
      );
      expect(meshCommands(secondQueue)[0]?.positions === meshCommands(firstQueue)[0]?.positions).toBe(false);
    });

    it('should split animated frame meshes into opaque/transparent', async () => {
      const renderer = new LocRenderer();
      const mixedFrames: LocMeshData[] = [];
      for (let i = 0; i < 2; i++) {
        const m = makeMixedMesh();
        mixedFrames.push({
          mesh: m.mesh,
          hslColors: m.hslColors,
          alphas: m.alphas,
          hasTransparency: true,
        });
      }
      const animData: AnimatedLocMeshData = {
        frames: mixedFrames,
        seqType: {
          frameIds: [0, 1],
          frameLengths: [10, 10],
          frameStep: 0,
          isSkeletalSeq: () => false,
          getSkeletalDuration: () => 0,
          getFrameLength: () => 10,
        } as unknown as SeqType,
      };
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBe(2);
      const meshIds = meshCommands(queue).map((command) => command.meshId);
      expect(meshIds.some((id) => id.includes('opaque'))).toBe(true);
      expect(meshIds.some((id) => id.includes('transparent'))).toBe(true);
    });

    it('preserves decoded faceBias on opaque and transparent animated split commands', async () => {
      const renderer = new LocRenderer();
      const mixed = makeMixedMesh();
      const frame = {
        mesh: mixed.mesh,
        hslColors: mixed.hslColors,
        alphas: mixed.alphas,
        faceBias: makeMixedFaceBias(),
        hasTransparency: true,
      } satisfies LocMeshData & { readonly faceBias: Float32Array };
      const animData: AnimatedLocMeshData = {
        frames: [frame],
        seqType: {
          frameIds: [0],
          frameLengths: [10],
          frameStep: 0,
          isSkeletalSeq: () => false,
          getSkeletalDuration: () => 0,
          getFrameLength: () => 10,
        } as unknown as SeqType,
      };
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const meshCommands = queue.commands.filter(isNpcMesh3DCommand);
      const opaque = meshCommands.find((command) => command.meshId.includes('opaque'));
      const transparent = meshCommands.find((command) => command.meshId.includes('transparent'));
      expect(Array.from(opaque?.perVertexFaceBias ?? [])).toEqual([11, 11, 11]);
      expect(Array.from(transparent?.perVertexFaceBias ?? [])).toEqual([22, 22, 22]);
    });
  });

  describe('renderLocs()', () => {
    it('should not add commands when not loaded', () => {
      const renderer = new LocRenderer();
      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBe(0);
    });

    it('should add mesh3d commands when loaded', async () => {
      const renderer = new LocRenderer();
      await renderer.load(createMockLoader(), [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBeGreaterThan(0);
      for (const cmd of queue.commands) {
        expect(cmd.kind).toBe('mesh3d');
      }
    });

    it('should use materialId osrs-npc for all commands', async () => {
      const renderer = new LocRenderer();
      await renderer.load(createMockLoader(), [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      for (const cmd of queue.commands) {
        expect(expectMeshCommand(cmd).materialId).toBe('osrs-npc');
      }
    });

    it('should render both static and animated locs in same queue', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(2);
      let callCount = 0;
      const loader = createMockLoader({
        animatedFn: (_id, _type, _rot, _seqId) => {
          callCount++;
          return callCount === 1 ? animData : undefined;
        },
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });

      const locs = [makeLocWithType(30, 30, { seqId: 42 }, 1), makeLocWithType(32, 32, { seqId: -1 }, 2)];
      await renderer.load(loader, locs);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(queue.commands.length).toBeGreaterThan(0);
    });
  });

  describe('hidden LOC ids', () => {
    const drawn = (renderer: LocRenderer) => {
      const queue = createQueue();
      renderer.renderLocs(queue);
      embedder.embedQueue(queue);
      return meshCommands(queue).map((command) => [command.meshId, Array.from(command.positions)] as const);
    };
    const loaded = async (locs: LocWithType[], hidden?: ReadonlySet<number>, loader = createMockLoader()) => {
      const renderer = new LocRenderer();
      if (hidden) renderer.setHiddenLocIds(hidden);
      await renderer.load(loader, locs);
      return renderer;
    };
    const pillar = () => makeLocWithType(32, 32, undefined, 7);

    it('leaves a hidden id out of the merged scenery, which is otherwise the ordinary build', async () => {
      const both = drawn(await loaded([makeLocWithType(30, 30), pillar()]));
      const rest = drawn(await loaded([makeLocWithType(30, 30)]));

      expect(drawn(await loaded([makeLocWithType(30, 30), pillar()], new Set([7])))).toEqual(rest);
      // Hidden ids the scene does not have leave it as it is.
      expect(drawn(await loaded([makeLocWithType(30, 30), pillar()], new Set([99])))).toEqual(both);
      expect(both.map(([meshId]) => meshId)).toEqual(['merged-static-locs-opaque']);
    });

    it('rebuilds the merged scenery only when the hidden ids it holds change, and back to the ordinary build', async () => {
      const loader = createMockLoader();
      const renderer = await loaded([makeLocWithType(30, 30), pillar()], undefined, loader);
      const ordinary = drawn(renderer);
      const rest = drawn(await loaded([makeLocWithType(30, 30)]));
      const stagings = () => vi.mocked(loader.getLocModelData).mock.calls.length;
      const before = stagings();

      renderer.setHiddenLocIds(new Set([99]));
      expect(stagings()).toBe(before);
      renderer.setHiddenLocIds(new Set([7]));
      expect(drawn(renderer)).toEqual(rest);
      const afterHide = stagings();
      expect(afterHide).toBeGreaterThan(before);
      renderer.setHiddenLocIds(new Set([7, 99]));
      expect(stagings()).toBe(afterHide);
      renderer.setHiddenLocIds(new Set());
      expect(drawn(renderer)).toEqual(ordinary);
    });

    it('rebuilds a source without its hidden ids after an eviction', async () => {
      const renderer = await loaded([makeLocWithType(30, 30), pillar()], new Set([7]));
      const queue = createQueue();
      renderer.renderLocs(queue);
      const [command] = queue.commands;
      if (command?.kind !== 'mesh3d' || !isResidentMesh3DCommand(command)) throw new Error('Expected resident scenery');
      const [first] = command.meshSource.materialize();
      const [rebuilt] = command.meshSource.materialize();

      expect(first?.positions.length).toBeGreaterThan(0);
      expect(Array.from(rebuilt?.positions ?? [])).toEqual(Array.from(first?.positions ?? []));
    });

    it('reports where each placement of some ids stands, footprint turned with it, hidden or not', async () => {
      const renderer = await loaded([
        makeLocWithType(20, 21, { sizeX: 2, sizeY: 3 }, 7, 10, 1),
        makeLocWithType(30, 30, { sizeX: 2, sizeY: 3 }, 8),
        makeLocWithType(40, 41, { sizeX: 3, sizeY: 3 }, 9),
      ]);
      const ids = new Set([7, 9]);

      expect(renderer.getLocFootprints(ids)).toEqual([
        { locId: 7, level: 0, x: 20, y: 21, sizeX: 3, sizeY: 2 },
        { locId: 9, level: 0, x: 40, y: 41, sizeX: 3, sizeY: 3 },
      ]);
      expect(renderer.getLocFootprints(ids)).toBe(renderer.getLocFootprints(ids));
    });
  });

  describe('setTerrainHeights()', () => {
    it('should accept and use Int32Array heights', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(-256);
      renderer.setTerrainHeights(heights);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      if (queue.commands.length > 0) {
        const cmd = expectMeshCommand(queue.commands[0]);
        expect(cmd.positions).toBeDefined();
      }
    });

    it('should handle null terrain heights (default to z=0)', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      if (queue.commands.length > 0) {
        const cmd = expectMeshCommand(queue.commands[0]);
        // With null heights → center height = 0 → tz = 0
        // Vertex at (0,0,0) in model space → worldZ = tz = 0
        const zValue = cmd.positions[2]; // Z component of first vertex
        expect(zValue).toBeCloseTo(0, 4);
      }
    });
  });

  describe('setSpeedMultiplier()', () => {
    it('should affect animated loc cycle speed', async () => {
      const renderer = new LocRenderer();
      renderer.setSpeedMultiplier(2);

      const animData = makeAnimatedLocData(3);
      const loader = createMockLoader({
        animatedFn: () => animData,
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });
      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });
  });

  describe('model matrix', () => {
    it.each([
      [12, 30.5, 30.5],
      [10, 31, 32.5],
    ])('anchors source type %i with its canonical scene footprint', async (sourceType, expectedX, expectedY) => {
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      const loc = makeLocWithType(30, 30, { sizeX: 5, sizeY: 2 }, 1, sourceType, 1);

      await renderer.load(loader, [loc]);
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const command = expectMeshCommand(queue.commands[0]);
      expect(command.positions[0]).toBeCloseTo(expectedX);
      expect(command.positions[1]).toBeCloseTo(expectedY);
    });

    it.each([
      [
        2,
        [
          [2, 7],
          [2, 0],
        ],
      ],
      [
        8,
        [
          [4, 7],
          [4, 5],
        ],
      ],
    ] satisfies readonly (readonly [
      number,
      readonly (readonly [number, number])[],
    ])[])('loads every canonical model request for compound source type %i', async (sourceType, expectedRequests) => {
      const requests: [number, number][] = [];
      const renderer = new LocRenderer();
      const loader = createMockLoader({
        locMeshFn: (_id, modelType, rotation) => {
          requests.push([modelType, rotation]);
          return makeLocMesh();
        },
      });

      await renderer.load(loader, [makeLocWithType(30, 30, undefined, 1, sourceType, 3)]);

      expect(requests).toEqual(expectedRequests);
    });

    it('uses the same-tile boundary displacement in the wall-decoration matrix', async () => {
      const renderer = new LocRenderer();
      const loader = createMockLoader({
        locMeshFn: (_id, modelType) => (modelType === LocModelType.WALL_DECORATION_INSIDE ? makeLocMesh() : undefined),
      });
      const boundary = makeLocWithType(30, 30, { decorDisplacement: 32 }, 1, 0);
      const decoration = makeLocWithType(30, 30, undefined, 2, 5);

      await renderer.load(loader, [decoration, boundary]);
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const command = expectMeshCommand(queue.commands[0]);
      expect(command.positions[0]).toBeCloseTo(30.75);
      expect(command.positions[1]).toBeCloseTo(30.5);
    });

    it('lets compound parts animate or fall back to static independently', async () => {
      const renderer = new LocRenderer();
      const animated = makeAnimatedLocData(1);
      const loader = createMockLoader({
        animatedFn: (_id, _modelType, rotation) => (rotation === 7 ? animated : undefined),
        locMeshFn: (_id, _modelType, rotation) => (rotation === 0 ? makeLocMesh() : undefined),
        seqTypeFn: () => animated.seqType,
      });

      await renderer.load(loader, [makeLocWithType(30, 30, { seqId: 42 }, 1, 2, 3)]);
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(meshCommands(queue)).toHaveLength(2);
      // The animated part draws shared frames (keyed by loc, model type, rotation and sequence).
      expect(meshCommands(queue).some((command) => command.meshId.startsWith('loc-anim:'))).toBe(true);
      expect(meshCommands(queue).some((command) => command.meshId === 'merged-static-locs-opaque')).toBe(true);
    });

    it('uses identical placement matrices for animated and static-fallback parts', async () => {
      const boundary = makeLocWithType(30, 30, { decorDisplacement: 32 }, 1, 0);
      const decoration = makeLocWithType(30, 30, { seqId: 42 }, 2, 5);
      const seqType = makeAnimatedLocData(1).seqType;
      seqType.heightOffset = 32;

      const staticRenderer = new LocRenderer();
      const staticLoader = createMockLoader({
        animatedFn: () => undefined,
        locMeshFn: (_id, modelType) => (modelType === LocModelType.WALL_DECORATION_INSIDE ? makeLocMesh() : undefined),
        seqTypeFn: () => seqType,
      });
      await staticRenderer.load(staticLoader, [boundary, decoration]);
      const staticQueue = createQueue();
      renderEmbedded(staticRenderer, staticQueue);

      const animatedRenderer = new LocRenderer();
      const animatedData = makeAnimatedLocData(1);
      animatedData.seqType.heightOffset = 32;
      const animatedLoader = createMockLoader({
        animatedFn: (_id, modelType) => (modelType === LocModelType.WALL_DECORATION_INSIDE ? animatedData : undefined),
        locMeshFn: () => undefined,
      });
      await animatedRenderer.load(animatedLoader, [boundary, decoration]);
      const animatedQueue = createQueue();
      renderEmbedded(animatedRenderer, animatedQueue);

      const staticCommand = expectMeshCommand(staticQueue.commands[0]);
      const animatedCommand = expectMeshCommand(animatedQueue.commands[0]);
      expect(Array.from(staticCommand.positions.slice(0, 3))).toEqual(
        Array.from(animatedCommand.modelMatrix.slice(12, 15)),
      );
    });

    it('should compute correct translation for 1x1 loc', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const cmd = expectMeshCommand(queue.commands[0]);
      // First vertex (model 0,0,0) → world (30.5, 30.5, 0)
      expect(cmd.positions[0]).toBeCloseTo(30.5, 4);
      expect(cmd.positions[1]).toBeCloseTo(30.5, 4);
      expect(cmd.positions[2]).toBeCloseTo(0, 4);
    });

    it('should compute correct translation for multi-tile loc', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const m = makeMesh(3);
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 3,
        sizeY: 2,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30, { sizeX: 3, sizeY: 2 })]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      // For a 3x2 loc at (30,30), center = (30+1.5, 30+1, 0) = (31.5, 31, 0)
      const cmd = expectMeshCommand(queue.commands[0]);
      expect(cmd.positions[0]).toBeCloseTo(31.5, 4);
      expect(cmd.positions[1]).toBeCloseTo(31, 4);
    });

    it('uses the LOC plane terrain height without adding a synthetic level offset', async () => {
      const renderer = new LocRenderer();
      const loc1: LocWithType = {
        location: makeLocation(30, 30, 1, 1),
        locType: makeLocType(),
        modelType: LocModelType.NORMAL,
        mapSquareOffset: { x: 0, y: 0 },
        terrainContextOrigin: { x: 0, y: 0 },
        terrainHeightPlanes: [makeTerrainHeights(0), makeTerrainHeights(-320)],
      };
      const loader = createMockLoader();
      await renderer.load(loader, [loc1], { bounds: null, levels: [1] });

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      const cmd = queue.commands[0] as unknown as { positions: Float32Array };
      expect(cmd.positions[2]).toBeCloseTo(320 / 128, 4);
    });

    it('uses the LOC upper-plane terrain for contouring as well as placement', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(makeTerrainHeights(512));
      const upperPlane = makeTerrainHeights(0);
      upperPlane[30][30] = -128;
      upperPlane[31][30] = 128;
      upperPlane[30][31] = -128;
      upperPlane[31][31] = 128;
      const mesh = makeLocMesh();
      mesh.mesh.positions[0] = -64;
      mesh.mesh.positions[2] = -64;
      const loc = makeLocWithType(30, 30, { contouredGround: 0 }, 1, 10, 0, 1);
      loc.terrainHeightPlanes = [makeTerrainHeights(0), upperPlane];

      await renderer.load(createMockLoader({ locMesh: mesh }), [loc], { bounds: null, levels: [1] });
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      expect(expectMeshCommand(queue.commands[0]).positions[2]).toBeCloseTo(1);
    });

    it('should apply SCALE (1/128) to model coordinates', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const m = makeMesh(3);
      m.mesh.positions[0] = 128; // model X
      m.mesh.positions[1] = 0;
      m.mesh.positions[2] = 0;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const cmd = expectMeshCommand(queue.commands[0]);
      // worldX = SCALE * 128 + tx = 1 + 30.5 = 31.5
      expect(cmd.positions[0]).toBeCloseTo(31.5, 4);
    });

    it('should transform model Y to world -Z (height axis)', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const m = makeMesh(3);
      m.mesh.positions[0] = 0;
      m.mesh.positions[1] = -128; // model Y = -128 (one unit up in OSRS)
      m.mesh.positions[2] = 0;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const cmd = expectMeshCommand(queue.commands[0]);
      // worldZ = -SCALE * modelY + tz = -(-128/128) + 0 = 1
      expect(cmd.positions[2]).toBeCloseTo(1, 4);
    });

    it('should transform model Z to world Y (north-south)', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const m = makeMesh(3);
      m.mesh.positions[0] = 0;
      m.mesh.positions[1] = 0;
      m.mesh.positions[2] = 128; // model Z = 128
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const cmd = expectMeshCommand(queue.commands[0]);
      // worldY = SCALE * modelZ + ty = 128/128 + 30.5 = 31.5
      expect(cmd.positions[1]).toBeCloseTo(31.5, 4);
    });
  });

  describe('getLocCenterHeight integration', () => {
    it('should position loc at terrain center height', async () => {
      const renderer = new LocRenderer();
      const heights = makeTerrainHeights(-512);
      renderer.setTerrainHeights(heights);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      if (queue.commands.length > 0) {
        const cmd = expectMeshCommand(queue.commands[0]);
        // Heights are -512, center height = -(-512)/128 = 4.0
        expect(cmd.positions[2]).toBeCloseTo(4.0, 1);
      }
    });

    it('should default to z=0 with null terrain heights', async () => {
      const renderer = new LocRenderer();
      renderer.setTerrainHeights(null);

      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);

      if (queue.commands.length > 0) {
        const cmd = expectMeshCommand(queue.commands[0]);
        expect(cmd.positions[2]).toBeCloseTo(0, 4);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty locs array', async () => {
      const renderer = new LocRenderer();
      await renderer.load(createMockLoader(), []);
      expect(renderer.isLoaded()).toBe(false);
    });

    it('should handle render before load without errors', () => {
      const renderer = new LocRenderer();
      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBe(0);
    });

    it('should handle loc with default normals when mesh has no normals', async () => {
      const renderer = new LocRenderer();
      const m = makeMesh(3);
      m.mesh.normals = undefined;
      const locMesh: LocMesh = {
        locId: 1,
        mesh: m.mesh,
        hslColors: m.hslColors,
        alphas: m.alphas,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should handle loc with zero-vertex mesh', async () => {
      const renderer = new LocRenderer();
      const locMesh: LocMesh = {
        locId: 1,
        mesh: { positions: new Float32Array(0), normals: new Float32Array(0) },
        hslColors: new Float32Array(0),
        alphas: new Float32Array(0),
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        sizeX: 1,
        sizeY: 1,
      };
      const loader = createMockLoader({ locMesh });
      await renderer.load(loader, [makeLocWithType(30, 30)]);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
    });

    it('should handle mixing animated and static locs in same load', async () => {
      const renderer = new LocRenderer();
      const animData = makeAnimatedLocData(2);
      let animCallIndex = 0;
      const loader = createMockLoader({
        animatedFn: () => {
          animCallIndex++;
          return animCallIndex <= 1 ? animData : undefined;
        },
        locTypeFn: () => makeLocType({ sizeX: 1, sizeY: 1 }),
      });

      const locs = [
        makeLocWithType(30, 30, { seqId: 10 }, 1),
        makeLocWithType(32, 32, { seqId: -1 }, 2),
        makeLocWithType(34, 34, { seqId: -1 }, 3),
      ];
      await renderer.load(loader, locs);

      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands.length).toBeGreaterThan(0);
    });

    it('should handle arena bounds not set (null)', async () => {
      setArenaBounds(null as unknown as Parameters<typeof setArenaBounds>[0]);
      const renderer = new LocRenderer();
      const loader = createMockLoader();
      await renderer.load(loader, [makeLocWithType(30, 30)]);
      expect(renderer.isLoaded()).toBe(true);
    });
  });
});
