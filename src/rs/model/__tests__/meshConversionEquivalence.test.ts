import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEncounterRenderConfig } from '../../../render/scene/encounterRenderConfig';
import { skipWithoutRealCache } from '../../../test/helpers/real-cache';
import { locModelDataToMesh } from '../../config/loctype/LocModelLoader';
import type { LocModelType } from '../../config/loctype/LocModelType';
import { ModelData } from '../ModelData';
import { type ModelToMeshOptions, modelDataToMesh } from '../NpcModelLoader';
import type { TextureLayerResolver } from '../textureUv';
import { VERTEX_NORMAL_STRIDE } from '../VertexNormal';
import {
  ENCOUNTER_KINDS,
  ENCOUNTER_MAP_SQUARES,
  encounterNpcIds,
  encounterSpotAnimIds,
  openLocModelLoader,
  openNpcModelLoader,
  openSpotAnimModelLoader,
  visitSpotAnimModels,
} from './encounterModelFixtures';
import { legacyLocModelDataToMesh, legacyModelDataToMesh } from './legacyMeshConversion';

interface LitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

/** Maps some texture ids to layer 0 (untextured) and the rest to distinct layers. */
const resolveLayer: TextureLayerResolver = (id) => (id % 5 === 0 ? 0 : (id % 13) + 1);

/**
 * First difference between two conversion results, or null when they match exactly: the same keys
 * in the same order, the same typed-array types and lengths, and the same bytes (so NaN payloads,
 * -0 and float rounding all count).
 */
function firstDifference(actual: unknown, expected: unknown, path = 'mesh'): string | null {
  if (ArrayBuffer.isView(expected)) {
    if (!ArrayBuffer.isView(actual)) return `${path}: expected a typed array`;
    if (actual.constructor !== expected.constructor)
      return `${path}: ${actual.constructor.name} vs ${expected.constructor.name}`;
    if (actual.byteLength !== expected.byteLength)
      return `${path}: ${actual.byteLength} vs ${expected.byteLength} bytes`;
    const a = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
    const b = Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength);
    // A native compare first: this runs over every pose of every encounter model.
    if (a.equals(b)) return null;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `${path}: byte ${i} differs`;
    return null;
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) return `${path}: expected an object`;
    if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return `${path}: prototype differs`;
    const actualKeys = Object.keys(actual).join(',');
    const expectedKeys = Object.keys(expected).join(',');
    if (actualKeys !== expectedKeys) return `${path}: keys [${actualKeys}] vs [${expectedKeys}]`;
    for (const key of Object.keys(expected)) {
      const difference = firstDifference(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return Object.is(actual, expected) ? null : `${path}: ${String(actual)} vs ${String(expected)}`;
}

/** Every option combination the NPC, spotanim and model-preview callers use, plus a face order. */
function npcDifference(model: ModelData, litColors: LitColors | undefined, label: string): string | null {
  const reversed = Array.from({ length: model.faceCount }, (_, face) => model.faceCount - 1 - face);
  const variants: Array<(ModelToMeshOptions & { sortedFaceOrder?: number[] }) | undefined> = [
    undefined,
    { resolveTextureLayer: resolveLayer },
    { renderTexturedAsBlack: true },
    { renderTexturedAsBlack: true, resolveTextureLayer: resolveLayer, sortedFaceOrder: reversed },
  ];
  for (const [index, options] of variants.entries()) {
    for (const colors of litColors ? [litColors, undefined] : [undefined]) {
      const expected = legacyModelDataToMesh(model, colors, options);
      const difference = firstDifference(modelDataToMesh(model, colors, options), expected);
      if (difference) return `${label} variant ${index}${colors ? '' : ' unlit'}: ${difference}`;
      // Without render normals (spotanims) everything else is the same, byte for byte.
      const { normals: _normals, ...withoutNormals } = expected;
      const unlit = firstDifference(modelDataToMesh(model, colors, { ...options, normals: false }), withoutNormals);
      if (unlit) return `${label} variant ${index}${colors ? '' : ' unlit'} without normals: ${unlit}`;
    }
  }
  return null;
}

function locDifference(model: ModelData, litColors: LitColors, label: string): string | null {
  for (const resolver of [undefined, resolveLayer]) {
    const expected = legacyLocModelDataToMesh(model, litColors, resolver);
    const difference = firstDifference(locModelDataToMesh(model, litColors, resolver), expected);
    if (difference) return `${label}${resolver ? ' textured' : ''}: ${difference}`;
    // Without render normals (animated LOC frames) everything else is the same, byte for byte.
    const withoutNormals = { ...expected, mesh: { positions: expected.mesh.positions } };
    const unlit = firstDifference(locModelDataToMesh(model, litColors, resolver, { normals: false }), withoutNormals);
    if (unlit) return `${label}${resolver ? ' textured' : ''} without normals: ${unlit}`;
  }
  return null;
}

function triangleModel(faceCount: number): ModelData {
  const model = new ModelData();
  model.verticesCount = 5;
  model.usedVertexCount = 5;
  model.faceCount = faceCount;
  model.verticesX = new Int32Array([0, 128, 0, 128, -77]);
  model.verticesY = new Int32Array([0, -3, -128, -128, 51]);
  model.verticesZ = new Int32Array([0, 0, 128, 64, -9]);
  model.indices1 = new Int32Array(faceCount).map((_, face) => face % 3);
  model.indices2 = new Int32Array(faceCount).map((_, face) => (face % 3) + 1);
  model.indices3 = new Int32Array(faceCount).map((_, face) => (face % 3) + 2);
  model.faceColors = new Uint16Array(faceCount).map((_, face) => 900 + face * 37);
  return model;
}

function litColorsFor(faceCount: number, thirdColour: (face: number) => number): LitColors {
  return {
    faceColors1: new Int32Array(faceCount).map((_, face) => (face << 17) | (100 + face)),
    faceColors2: new Int32Array(faceCount).map((_, face) => 200 + face),
    faceColors3: new Int32Array(faceCount).map((_, face) => thirdColour(face)),
  };
}

describe('mesh conversion equivalence with the pre-allocation implementations', () => {
  it.each([
    ['zero faces', 0, () => 5],
    ['all hidden (textured, -2)', 6, () => -2],
    [
      'flat-shaded (-1) and hidden faces mixed',
      9,
      (face: number) => (face % 3 === 0 ? -1 : face % 3 === 1 ? -2 : 70_000),
    ],
  ])('matches on synthetic models: %s', (_label, faceCount, thirdColour) => {
    const lit = litColorsFor(faceCount, thirdColour);
    expect(npcDifference(triangleModel(faceCount), lit, 'npc')).toBeNull();
    expect(locDifference(triangleModel(faceCount), lit, 'loc')).toBeNull();
  });

  it('matches on alpha edge values, priorities, face bias and contoured Y', () => {
    const faceCount = 8;
    const model = triangleModel(faceCount);
    model.faceAlphas = new Int8Array([0, 1, -1, 127, -128, -2, 64, 0]);
    model.faceRenderPriorities = new Int8Array([0, 11, 3, 10, 0, 5, 1, 2]);
    model.faceBias = new Int8Array([-1, 0, -2, 127, -128, 5, -1, 1]);
    model.contourVerticesY = new Int32Array([-16, -8, -144, -136, 40]);
    const lit = litColorsFor(faceCount, (face) => (face === 3 ? -2 : face === 5 ? -1 : 300 + face));
    expect(npcDifference(model, lit, 'npc')).toBeNull();
    expect(locDifference(model, lit, 'loc')).toBeNull();

    const transparentOnlyOnHidden = triangleModel(2);
    transparentOnlyOnHidden.faceAlphas = new Int8Array([0, 100]);
    const hiddenTransparent = litColorsFor(2, (face) => (face === 1 ? -2 : 7));
    expect(locDifference(transparentOnlyOnHidden, hiddenTransparent, 'loc hidden alpha')).toBeNull();
    expect(locModelDataToMesh(transparentOnlyOnHidden, hiddenTransparent).hasTransparency).toBe(false);
  });

  it('matches on textured faces, degenerate texture triangles and missing normals', () => {
    const faceCount = 6;
    const model = triangleModel(faceCount);
    model.faceTextures = new Int16Array([-1, 10, 11, 12, 26, 40]);
    // Face 2 uses the collapsed (-1) mapping, 3 a real texture triangle, 4 a degenerate one, 5 is out of range.
    model.textureCoords = new Int8Array([-1, 0, -1, 0, 1, 9]);
    model.textureMappingP = new Int16Array([0, 0]);
    model.textureMappingM = new Int16Array([1, 1]);
    model.textureMappingN = new Int16Array([2, 1]);
    const lit = litColorsFor(faceCount, (face) => (face === 1 ? -2 : 500 + face));
    expect(npcDifference(model, lit, 'npc')).toBeNull();
    expect(locDifference(model, lit, 'loc')).toBeNull();

    // A model whose normals array is shorter than its vertices writes the +Y fallback.
    const sparse = triangleModel(3);
    sparse.calculateVertexNormals();
    sparse.normals = sparse.normals?.slice(0, 2 * VERTEX_NORMAL_STRIDE);
    expect(
      npcDifference(
        sparse,
        litColorsFor(3, () => 9),
        'npc sparse normals',
      ),
    ).toBeNull();
    expect(
      locDifference(
        sparse,
        litColorsFor(3, () => 9),
        'loc sparse normals',
      ),
    ).toBeNull();
  });

  it('matches out-of-range face orders, which read undefined colors and vertices', () => {
    const model = triangleModel(3);
    const lit = litColorsFor(3, () => 4);
    for (const colors of [lit, undefined]) {
      const options = { sortedFaceOrder: [2, 7, 0, 0, -1] };
      expect(
        firstDifference(modelDataToMesh(model, colors, options), legacyModelDataToMesh(model, colors, options)),
      ).toBeNull();
    }
  });
});

/**
 * The real models Sol Heredit, Yama and the Inferno build: their NPCs, their spotanims (static, frame-animated
 * and skeletal poses) and their map locs (static and animated frames), converted from exactly the
 * model and lit colors each loader hands its conversion, captured at `computeLitColors`.
 */
/**
 * The NPC and spotanim cases compare against a reference computed from the same input, so they run
 * on the pinned cache setup downloads. The map case reads map squares with the golden cache's XTEA
 * keys (`ENCOUNTER_MAP_SQUARES`), so it needs that cache.
 */
const noPinnedCache = skipWithoutRealCache('pinned');
const noGoldenCache = skipWithoutRealCache('golden');

describe('mesh conversion equivalence on the real Sol, Yama and Inferno models', () => {
  const captured: Array<{ model: ModelData; colors: LitColors }> = [];
  function captureLitColors(): void {
    const original = ModelData.prototype.computeLitColors;
    vi.spyOn(ModelData.prototype, 'computeLitColors').mockImplementation(function (this: ModelData, ...args) {
      const colors = original.apply(this, args);
      captured.push({ model: this, colors });
      return colors;
    });
  }
  afterEach(() => {
    vi.restoreAllMocks();
    captured.length = 0;
  });

  it.skipIf(noPinnedCache)(
    'NPC models',
    async () => {
      const loader = await openNpcModelLoader('pinned');
      const npcIds = encounterNpcIds();
      expect(npcIds.size).toBeGreaterThan(10);

      let faces = 0;
      for (const npcId of npcIds) {
        const data = loader.loadNpcModelData(npcId);
        expect(data?.mergedModel, `NPC ${npcId}`).toBeTruthy();
        const model = data!.mergedModel!;
        faces += model.faceCount;
        expect(npcDifference(model, data!.litColors ?? undefined, `NPC ${npcId}`)).toBeNull();
      }
      expect(faces).toBeGreaterThan(10_000);
    },
    120_000,
  );

  it.skipIf(noPinnedCache)(
    'spotanim models: static, frame-animated and every skeletal pose',
    async () => {
      const { loader, animation } = await openSpotAnimModelLoader('pinned');
      const ids = encounterSpotAnimIds();

      captureLitColors();
      let checked = 0;
      // The poser reuses one model, so each pose is checked before the next overwrites it.
      const skeletalPoses = visitSpotAnimModels(loader, animation, ids, (label) => {
        for (const { model, colors } of captured.splice(0)) {
          expect(npcDifference(model, colors, label)).toBeNull();
          checked++;
        }
      });
      expect(checked).toBeGreaterThan(ids.size);
      expect(skeletalPoses).toBeGreaterThan(0);
    },
    300_000,
  );

  it.skipIf(noGoldenCache)(
    'map loc models, static and animated',
    async () => {
      const { loader, maps } = await openLocModelLoader();
      expect(ENCOUNTER_KINDS.map((kind) => getEncounterRenderConfig(kind)?.terrainMapSquare)).toEqual(
        ENCOUNTER_MAP_SQUARES.map(({ x, y }) => ({ x, y })),
      );

      const placements = new Map<string, { id: number; type: LocModelType; rotation: number }>();
      for (const square of ENCOUNTER_MAP_SQUARES) {
        const placed = await maps.loadLocations(square.x, square.y, square.key);
        expect(placed?.locations.length, `map ${square.x}_${square.y}`).toBeGreaterThan(0);
        for (const { id, type, rotation } of placed!.locations) {
          placements.set(`${id}:${type}:${rotation}`, { id, type: type as LocModelType, rotation });
        }
      }

      captureLitColors();
      let checked = 0;
      let animatedFrames = 0;
      for (const { id, type, rotation } of placements.values()) {
        loader.loadLocMesh(id, type, rotation, 0, 0, 0);
        const seqId = loader.loadLocType(id)?.seqId ?? -1;
        if (seqId !== -1) {
          const before = captured.length;
          loader.loadAnimatedLocMeshFrames(id, type, rotation, seqId);
          animatedFrames += captured.length - before;
        }
        for (const { model, colors } of captured.splice(0)) {
          expect(locDifference(model, colors, `loc ${id} type ${type} rotation ${rotation}`)).toBeNull();
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(500);
      expect(animatedFrames).toBeGreaterThan(0);
    },
    300_000,
  );
});
