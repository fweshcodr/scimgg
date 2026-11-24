import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocWithType } from '../../../cache/CacheManager';
import { SOL_MAP_X, SOL_MAP_Y } from '../../../encounters/solHeredit/constants';
import { SOL_HEREDIT_RENDER_CONFIG } from '../../../encounters/solHeredit/renderConfig';
import { LocModelLoader, locModelDataToMesh } from '../../../rs/config/loctype/LocModelLoader';
import type { LocModelType } from '../../../rs/config/loctype/LocModelType';
import { MapLoader, type MapSquareData } from '../../../rs/map/MapLoader';
import { createTerrainContext } from '../../../rs/map/mapSquareBlock';
import { ModelData } from '../../../rs/model/ModelData';
import { openRealCache, REAL_CACHE_TEST_TIMEOUT_MS, skipWithoutRealCache } from '../../../test/helpers/real-cache';
import { expandIndexedUpload } from '../../../test/helpers/residentMeshDraws';
import type { MeshUploadData } from '../../core/meshSource';
import { sharedModelTextureIndex } from '../../core/modelTextures';
import { indexTriangleSoup } from '../../core/soupIndexing';
import { splitTriangleSoupByAlpha } from '../../core/splitMeshByAlpha';
import { LocRenderer } from '../LocRenderer';
import { finalizeStaticLocModels, type StaticLocMesh3DCommand, type StaticLocRenderModel } from '../staticLocFinalizer';

/** What LocRenderer last staged for the finalizer, so a real scene can be checked against the reference. */
const lastStaged: StaticLocRenderModel[] = [];
vi.mock('../staticLocFinalizer', async (importOriginal) => {
  const original = await importOriginal<typeof import('../staticLocFinalizer')>();
  return {
    ...original,
    finalizeStaticLocModels: (staged: readonly StaticLocRenderModel[]) => {
      lastStaged.splice(0, lastStaged.length, ...staged);
      return original.finalizeStaticLocModels(staged);
    },
  };
});

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function makeModel(options: { readonly faceBias: boolean; readonly contour: boolean }): ModelData {
  const model = new ModelData();
  model.verticesCount = 6;
  model.usedVertexCount = 6;
  model.faceCount = 4;
  model.verticesX = new Int32Array([0, 128, 0, 128, 256, 256]);
  model.verticesY = new Int32Array([0, 0, -128, -128, 0, -128]);
  model.verticesZ = new Int32Array([0, 0, 128, 128, 0, 128]);
  if (options.contour) model.contourVerticesY = new Int32Array([-16, -8, -144, -136, -24, -152]);
  model.indices1 = new Int32Array([0, 1, 1, 4]);
  model.indices2 = new Int32Array([1, 3, 4, 5]);
  model.indices3 = new Int32Array([2, 2, 3, 3]);
  model.faceColors = new Uint16Array([500, 700, 900, 1100]);
  model.faceRenderTypes = new Int8Array([0, 1, 2, 0]);
  model.faceAlphas = new Int8Array([0, -128, 0, 0]);
  if (options.faceBias) model.faceBias = new Int8Array([-1, -128, 7, 42]);
  return model;
}

/** Per-model conversion, world transform and alpha split: the contract the merged batches are pinned to. */
function referenceSplit(staged: readonly StaticLocRenderModel[]): ReturnType<typeof splitTriangleSoupByAlpha> {
  const converted = staged.map((entry) => {
    const lit = entry.model.computeLitColors(entry.ambient, entry.contrast, -50, -10, -50);
    return { mesh: locModelDataToMesh(entry.model, lit), matrix: entry.modelMatrix };
  });
  const vertexCount = converted.reduce((sum, entry) => sum + entry.mesh.mesh.positions.length / 3, 0);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const hslColors = new Float32Array(vertexCount);
  const alphas = new Float32Array(vertexCount);
  const faceBias = converted.every((entry) => entry.mesh.faceBias) ? new Float32Array(vertexCount) : undefined;
  let offset = 0;
  for (const entry of converted) {
    const source = entry.mesh;
    const matrix = entry.matrix;
    const sourceNormals = source.mesh.normals ?? new Float32Array(source.mesh.positions.length);
    for (let vertex = 0; vertex < source.mesh.positions.length / 3; vertex++) {
      const sourceBase = vertex * 3;
      const targetBase = (offset + vertex) * 3;
      const x = source.mesh.positions[sourceBase];
      const y = source.mesh.positions[sourceBase + 1];
      const z = source.mesh.positions[sourceBase + 2];
      positions[targetBase] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      positions[targetBase + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      positions[targetBase + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      const nx = sourceNormals[sourceBase];
      const ny = sourceNormals[sourceBase + 1];
      const nz = sourceNormals[sourceBase + 2];
      normals[targetBase] = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
      normals[targetBase + 1] = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
      normals[targetBase + 2] = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
      hslColors[offset + vertex] = source.hslColors[vertex];
      alphas[offset + vertex] = source.alphas[vertex];
      if (faceBias && source.faceBias) faceBias[offset + vertex] = source.faceBias[vertex];
    }
    offset += source.mesh.positions.length / 3;
  }
  return splitTriangleSoupByAlpha({ positions, normals, hslColors, alphas, faceBias });
}

/** The reference split as the finalizer's [opaque, transparent] upload parts. */
function referenceUploads(split: ReturnType<typeof splitTriangleSoupByAlpha>): MeshUploadData[] {
  const parts: MeshUploadData[] = [];
  if (split.opaque) parts.push(upload(split.opaque));
  if (split.transparent) parts.push(upload(split.transparent, true));
  return parts;
}

/** The reference split carries normals and opaque alphas; scene-base reads neither, so the finalizer emits neither. */
function upload(
  mesh: {
    readonly positions: Float32Array;
    readonly hslColors: Float32Array;
    readonly alphas: Float32Array;
    readonly faceBias?: Float32Array;
  },
  transparent = false,
): MeshUploadData {
  return {
    positions: mesh.positions,
    perVertexHslColors: mesh.hslColors,
    ...(transparent ? { perVertexAlphas: mesh.alphas } : {}),
    ...(mesh.faceBias ? { perVertexFaceBias: mesh.faceBias } : {}),
  };
}

describe('finalizeStaticLocModels', () => {
  it('matches conversion, world transform, and alpha split for contoured smooth, flat, hidden, and mixed-alpha faces', () => {
    const staged: StaticLocRenderModel[] = [
      {
        model: makeModel({ faceBias: true, contour: true }),
        modelMatrix: new Float32Array([0, -1 / 128, 0, 0, 0, 0, -1 / 128, 0, 1 / 128, 0, 0, 0, 12.5, 18.25, 3, 1]),
        ambient: 64,
        contrast: 768,
      },
      {
        model: makeModel({ faceBias: false, contour: false }),
        modelMatrix: new Float32Array([1 / 128, 0, 0, 0, 0, 0, -1 / 128, 0, 0, 1 / 128, 0, 0, -4.5, 7.75, -2, 1]),
        ambient: 72,
        contrast: 800,
      },
    ];
    const expected = referenceUploads(referenceSplit(staged));

    const actual = finalizeStaticLocModels(staged);

    expect(actual).toEqual(expected);
    expect(actual[0]?.perVertexFaceBias).toBeUndefined();
    for (const entry of actual) expect(entry).not.toHaveProperty('normals');
    expect(actual[0]).not.toHaveProperty('perVertexAlphas');
    expect(actual[1]?.perVertexAlphas).toBeInstanceOf(Float32Array);
    expect(actual.reduce((count, entry) => count + entry.positions.length / 9, 0)).toBe(6);
  });

  it('matches signed face-bias conversion when every staged model supplies the attribute', () => {
    const staged: StaticLocRenderModel[] = [
      { model: makeModel({ faceBias: true, contour: false }), modelMatrix: IDENTITY, ambient: 64, contrast: 768 },
    ];
    const expected = referenceUploads(referenceSplit(staged));

    const actual = finalizeStaticLocModels(staged);

    expect(actual).toEqual(expected);
    expect(Array.from(actual[0]?.perVertexFaceBias ?? [])).toContain(0);
    expect(Array.from(actual[1]?.perVertexFaceBias ?? [])).toContain(128);
  });

  describe('texture attributes', () => {
    afterEach(() => {
      sharedModelTextureIndex.setMapper(null);
    });

    function makeFlatModel(faceTextures: Int16Array | undefined): ModelData {
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
      model.faceColors = new Uint16Array([500, 700]);
      model.faceRenderTypes = new Int8Array([0, 0]);
      model.faceAlphas = new Int8Array([0, 0]);
      if (faceTextures) model.faceTextures = faceTextures;
      return model;
    }

    it('omits texture attributes when no staged model is textured', () => {
      sharedModelTextureIndex.setMapper(() => 7);
      const staged: StaticLocRenderModel[] = [
        { model: makeFlatModel(undefined), modelMatrix: IDENTITY, ambient: 64, contrast: 768 },
      ];

      const actual = finalizeStaticLocModels(staged);

      expect(actual[0]?.uvs).toBeUndefined();
      expect(actual[0]?.perVertexTextureIds).toBeUndefined();
    });

    it('assigns layer 0 to untextured models batched alongside a textured one', () => {
      sharedModelTextureIndex.setMapper((textureId) => (textureId === 40 ? 7 : 0));
      // The batch allocates uv buffers because *some* model is textured, so the
      // untextured model's faces must still be written as layer 0, not left stale.
      const staged: StaticLocRenderModel[] = [
        { model: makeFlatModel(new Int16Array([40, -1])), modelMatrix: IDENTITY, ambient: 64, contrast: 768 },
        { model: makeFlatModel(undefined), modelMatrix: IDENTITY, ambient: 64, contrast: 768 },
      ];

      const actual = finalizeStaticLocModels(staged).map(expandIndexedUpload);

      // Both models are fully opaque, so everything lands in one command: model A
      // face 0 (textured), model A face 1, then both of model B's faces.
      expect(Array.from(actual[0]?.perVertexTextureIds ?? [])).toEqual([7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(Array.from((actual[0]?.uvs ?? []).slice(0, 6))).toEqual([0, 0, 1, 0, 0, 1]);
      expect(Array.from((actual[0]?.uvs ?? []).slice(6))).toEqual(new Array(18).fill(0));
    });
  });
});

/**
 * Null when `indexed` is exactly what the renderer's own indexing makes of the soup it expands to:
 * the attributes it uploads (face bias only when not all +0, as the renderer decides), the distinct
 * vertices and the indices, bit for bit; otherwise what differs.
 */
function rendererIndexingDifference(indexed: MeshUploadData): string | null {
  if (!indexed.indices) return 'not indexed';
  const soup = expandIndexedUpload(indexed);
  const faceBias = soup.perVertexFaceBias;
  const uploaded = (
    [
      ['positions', 3],
      ['perVertexHslColors', 1],
      ['perVertexAlphas', 1],
      ['perVertexFaceBias', faceBias?.some((value) => value !== 0 || 1 / value < 0) ? 1 : 0],
      ['uvs', 2],
      ['perVertexTextureIds', 1],
    ] as const
  ).filter(([attribute, size]) => size > 0 && soup[attribute] !== undefined);
  const expected = indexTriangleSoup(
    uploaded.map(([attribute, size]) => ({ data: soup[attribute] as Float32Array, size })),
    soup.positions.length / 3,
  );
  if (!expected) return 'the renderer would not index it';
  if (expected.indices.constructor !== indexed.indices.constructor) return 'index type';
  if (byteDifference(expected.indices, indexed.indices).first !== -1) return 'indices';
  for (const [index, [attribute]] of uploaded.entries()) {
    if (byteDifference(expected.attributes[index], indexed[attribute] as Float32Array).first !== -1) return attribute;
  }
  return null;
}

/** Byte length and first differing byte (-1 if none); a plain toEqual diff of 20 MiB arrays exhausts the heap. */
function byteDifference(actual: ArrayBufferView | undefined, expected: ArrayBufferView | undefined) {
  const a = actual ? new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength) : new Uint8Array(0);
  const b = expected ? new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength) : new Uint8Array(0);
  let first = a.length === b.length ? -1 : Math.min(a.length, b.length);
  for (let i = 0; first === -1 && i < a.length; i++) if (a[i] !== b[i]) first = i;
  return { bytes: [a.length, b.length], first, defined: [actual !== undefined, expected !== undefined] };
}

it.skipIf(skipWithoutRealCache())(
  "keeps every attribute scene-base reads byte-identical for Sol Heredit's real static scenery",
  async () => {
    const { cache, info } = await openRealCache([0, 1, 2, 5, 7]);
    const config = cache.getIndex(2);
    const maps = new MapLoader(cache.getIndex(5));
    const squares = new Map<string, MapSquareData>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const square = await maps.loadMapSquare(SOL_MAP_X + dx, SOL_MAP_Y + dy);
        if (square) squares.set(`${SOL_MAP_X + dx},${SOL_MAP_Y + dy}`, square);
      }
    }
    const terrain = squares.get(`${SOL_MAP_X},${SOL_MAP_Y}`);
    // Public map archive key: archive.openrs2.org/caches/2437/keys.json, mapsquare 7216.
    const placed = await maps.loadLocations(SOL_MAP_X, SOL_MAP_Y, [-614154723, 1856813096, 1740380664, -1655073354]);
    if (!terrain || !placed) throw new Error('Expected cached Colosseum map square');
    const locTypes = new LocModelLoader(
      info,
      config.getArchive(6),
      cache.getIndex(7),
      config.getArchive(12),
      cache.getIndex(0),
      cache.getIndex(1),
    );
    const context = createTerrainContext(terrain, (mapX, mapY) => squares.get(`${mapX},${mapY}`));
    const entries: LocWithType[] = placed.locations.map((location) => ({
      location,
      locType: locTypes.loadLocType(location.id)!,
      modelType: location.type as LocModelType,
      mapSquareOffset: { x: 0, y: 0 },
      terrainHeightPlanes: context.tileHeights,
      terrainContextOrigin: { x: context.coreOriginX, y: context.coreOriginY },
    }));

    const renderer = new LocRenderer();
    await renderer.load(locTypes, entries, SOL_HEREDIT_RENDER_CONFIG.locRender);
    const queue = { commands: [] as StaticLocMesh3DCommand[] };
    renderer.renderLocs(queue as never);
    const commands = queue.commands.filter((command) => command.meshId.startsWith('merged-static-locs'));
    const source = commands[0]?.meshSource;
    if (!source) throw new Error('Expected resident static scenery');
    const split = referenceSplit(lastStaged);
    const reference = referenceUploads(split);

    expect(lastStaged.length).toBeGreaterThan(3000);
    expect(commands.map((command) => command.meshId)).toEqual([
      'merged-static-locs-opaque',
      'merged-static-locs-transparent',
    ]);
    expect(commands.map((command) => command.meshSourcePart)).toEqual([0, 1]);
    // The first build, as the renderer's first upload takes it, then a rebuild from the recipe, as
    // after an eviction or a lost context: both are the reference, byte for byte.
    for (const indexedBuild of [source.materialize(), source.materialize()]) {
      expect(indexedBuild).toHaveLength(reference.length);
      // Built indexed, exactly as the renderer would have indexed the soup: same vertices, same
      // indices, same index type, byte for byte.
      for (const indexed of indexedBuild) expect(rendererIndexingDifference(indexed)).toBeNull();
      const build = indexedBuild.map(expandIndexedUpload);
      for (const [index, part] of build.entries()) {
        const expected = reference[index]!;
        expect(part).not.toHaveProperty('normals');
        for (const attribute of ['positions', 'perVertexHslColors', 'perVertexAlphas', 'perVertexFaceBias'] as const) {
          const difference = byteDifference(part[attribute], expected[attribute]);
          expect({ attribute, first: difference.first, defined: difference.defined }).toEqual({
            attribute,
            first: -1,
            defined: [expected[attribute] !== undefined, expected[attribute] !== undefined],
          });
        }
      }
    }
    // The opaque batch's dropped alphas were all exactly 1, the constant the renderer binds instead.
    const opaqueAlphas = Array.from(split.opaque?.alphas ?? []);
    expect(opaqueAlphas.length).toBeGreaterThan(0);
    expect(opaqueAlphas.findIndex((alpha) => alpha !== 1)).toBe(-1);
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);
