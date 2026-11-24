import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeqType } from '../../../rs/config/seqtype/SeqType';
import { SpotAnimType } from '../../../rs/config/spotanimtype/SpotAnimType';
import { ModelData } from '../../../rs/model/ModelData';
import { type SpotAnimMeshData, SpotAnimModelLoader } from '../../../rs/model/SpotAnimModelLoader';
import { collectGarbage, collectGarbageUntilCleared } from '../../../test/helpers/collectGarbage';
import { ResidentMeshEmbedder } from '../../../test/helpers/residentMeshDraws';
import { spotAnimPartArrays } from '../../../test/helpers/spotAnimResidentParts';
import { perfFlags } from '../../../util/PerfFlags';
import {
  isResidentMesh3DCommand,
  type NpcMesh3DCommand,
  type RenderCommand,
  type RenderQueue,
  type ResidentMesh3DCommand,
} from '../../core/commands';
import {
  ImmutableMeshSource,
  instanceAtlasBoundBytes,
  type MeshUploadData,
  positionBounds,
  RetiredMeshSourceError,
} from '../../core/meshSource';
import { SpotAnimRenderer } from '../SpotAnimRenderer';
import {
  createSpotAnimMeshParts,
  hasOnlyRepeatedCornerTriangles,
  type SpotAnimMeshPart,
  spotAnimOpaqueUploads,
  spotAnimTransparentFaceMap,
  withResidentOpaqueParts,
} from '../spotAnimMeshParts';
import type { SpotAnimSpawnRequest, SpotAnimStyle, SpotAnimTransform } from '../spotAnimTypes';

const TRANSPARENT_SPOTANIM_ID = 9001;
const OPAQUE_SPOTANIM_ID = 9002;

const NEAR_FACE = [200, 0, 100, 200, 100, 100, 300, 0, 100] as const;
const FAR_FACE = [0, 0, 200, 0, 100, 200, 100, 0, 200] as const;

const initialSkipSort = perfFlags.skipTransparentSort;
/**
 * Opaque baked parts draw from GPU-resident sources. {@link renderEmbedded} turns those draws back
 * into the embedded-array commands they replaced, materializing each source once as the renderer
 * uploads it, so the assertions here read arrays either way.
 */
let embedder = new ResidentMeshEmbedder();
afterEach(() => {
  perfFlags.skipTransparentSort = initialSkipSort;
  vi.restoreAllMocks();
  embedder = new ResidentMeshEmbedder();
});

/** A part's arrays: its own, or those its resident source uploads. */
function partArrays(part: SpotAnimMeshPart | MeshAttributes): MeshAttributes {
  return 'resident' in part && part.resident
    ? spotAnimPartArrays(embedder, part)
    : { ...part, positions: part.positions ?? expect.fail('part has no arrays') };
}

function priorityFixture(
  faces: readonly { depth: number; priority: number; alpha?: number; reverse?: boolean }[],
  baked = false,
  configureModel: (model: ModelData) => void = () => {},
) {
  const model = new ModelData();
  model.verticesCount = model.usedVertexCount = faces.length * 3;
  model.faceCount = faces.length;
  model.verticesX = new Int32Array(faces.flatMap(() => [0, 0, 100]));
  model.verticesY = new Int32Array(faces.flatMap(() => [0, 100, 0]));
  model.verticesZ = new Int32Array(faces.flatMap(({ depth }) => [depth, depth, depth]));
  model.indices1 = new Int32Array(faces.map((_, index) => index * 3));
  model.indices2 = new Int32Array(faces.map(({ reverse }, index) => index * 3 + (reverse ? 2 : 1)));
  model.indices3 = new Int32Array(faces.map(({ reverse }, index) => index * 3 + (reverse ? 1 : 2)));
  model.faceColors = new Uint16Array(faces.map((_, index) => 1000 + index * 100));
  model.faceAlphas = new Int8Array(faces.map(({ alpha }) => alpha ?? 64));
  model.faceRenderPriorities = new Int8Array(faces.map(({ priority }) => priority));
  configureModel(model);
  const type = new SpotAnimType(9004, {
    name: 'test',
    game: 'oldschool',
    environment: 'live',
    revision: 232,
    timestamp: '2024-01-01T00:00:00.000Z',
    size: 0,
  });
  type.modelId = 1;
  const sequence = new SeqType(1, type.cacheInfo);
  sequence.frameIds = [0, 1];
  sequence.frameLengths = [1, 1];
  type.sequenceId = baked ? 1 : -1;
  const loader = new SpotAnimModelLoader(
    { load: () => type, getCount: () => 1, clearCache: () => {} },
    { getModel: () => model },
    { load: () => sequence, getCount: () => 1, clearCache: () => {} },
    { load: () => undefined, clearCache: () => {} },
  );
  const renderer = new SpotAnimRenderer();
  renderer.loadById(loader, 9004);
  renderer.setSorterProjection({
    cameraX: 0,
    cameraY: 0,
    cameraZ: -1000,
    yawSin: 0,
    yawCos: 1,
    pitchSin: 0,
    pitchCos: 1,
  });
  return { renderer, loader, model, sequence };
}

function spawnPriorityFixture(renderer: SpotAnimRenderer, style?: SpotAnimStyle, transform?: SpotAnimTransform) {
  return renderer.spawn({
    spotAnimId: 9004,
    lifecycle: { kind: 'manual' },
    transform: { kind: 'static', value: transform ?? { position: [0, 0, 0] } },
    style,
  });
}

it('exposes the live spotanim count without rendering or retaining cleared instances', () => {
  const { renderer } = priorityFixture([{ depth: 100, priority: 0 }]);
  expect(renderer.getActiveInstanceCount()).toBe(0);
  const first = spawnPriorityFixture(renderer);
  spawnPriorityFixture(renderer);
  expect(renderer.getActiveInstanceCount()).toBe(2);
  renderer.despawn(first);
  expect(renderer.getActiveInstanceCount()).toBe(1);
  renderer.clearActiveInstances();
  expect(renderer.getActiveInstanceCount()).toBe(0);
  spawnPriorityFixture(renderer);
  renderer.dispose();
  expect(renderer.getActiveInstanceCount()).toBe(0);
});

function faceDepths(command: NpcMesh3DCommand): number[] {
  return Array.from(command.positions).filter((_, index) => index % 9 === 2);
}

type MeshAttributes = Pick<
  NpcMesh3DCommand,
  'positions' | 'perVertexHslColors' | 'perVertexAlphas' | 'perVertexFaceBias'
>;

/** Every attribute a spotanim draws with. Normals are not among them: scene-base reads none. */
function meshBuffers(command: MeshAttributes | SpotAnimMeshPart): Float32Array[] {
  const { positions, perVertexHslColors, perVertexAlphas, perVertexFaceBias } = partArrays(command);
  if (!perVertexHslColors || !perVertexAlphas || !perVertexFaceBias) expect.fail('Expected all four mesh attributes');
  return [positions, perVertexHslColors, perVertexAlphas, perVertexFaceBias];
}

function expectPermutation(
  command: MeshAttributes,
  source: MeshAttributes | SpotAnimMeshPart,
  faces: readonly number[],
): void {
  meshBuffers(command).forEach((buffer, attribute) => {
    const input = meshBuffers(source)[attribute];
    const stride = attribute === 0 ? 9 : 3;
    expect(buffer).toHaveLength(faces.length * stride);
    expect(Array.from(buffer)).toEqual(
      faces.flatMap((face) => Array.from(input.slice(face * stride, (face + 1) * stride))),
    );
    expect(buffer.buffer).not.toBe(input.buffer);
  });
}

describe('createSpotAnimMeshParts zero-alpha parts', () => {
  const mesh: SpotAnimMeshData = {
    positions: new Float32Array([...NEAR_FACE, ...FAR_FACE, ...NEAR_FACE]),
    hslColors: Float32Array.from({ length: 9 }, (_, vertex) => 100 + vertex),
    alphas: new Float32Array([1, 1, 1, 0, 0, 0, 0, 0, 0]),
    faceBias: Float32Array.from({ length: 9 }, (_, vertex) => vertex),
    modelFaceIndices: new Uint32Array([0, 1, 2]),
  };

  it('omits an all-zero transparent part while leaving every opaque attribute unchanged', () => {
    const parts = createSpotAnimMeshParts('mixed', mesh);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      meshId: 'mixed-opaque',
      positions: mesh.positions.slice(0, 9),
      perVertexHslColors: mesh.hslColors.slice(0, 3),
      perVertexAlphas: mesh.alphas.slice(0, 3),
      perVertexFaceBias: mesh.faceBias?.slice(0, 3),
      depth: 'readwrite',
      blend: undefined,
      transparentSort: undefined,
    });
    expect(createSpotAnimMeshParts('invisible', { ...mesh, alphas: new Float32Array(9) })).toEqual([]);
  });

  it.each([
    0.5,
    1e-30,
    -0.5,
    Number.NaN,
  ])('retains the entire transparent soup with a nonzero/unknown alpha %s', (alpha) => {
    const alphas = mesh.alphas.slice();
    // Not the first vertex: every vertex must be checked, not just each triangle's first alpha.
    alphas[8] = alpha;
    const parts = createSpotAnimMeshParts('mixed', { ...mesh, alphas });
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({
      positions: mesh.positions.slice(9),
      perVertexHslColors: mesh.hslColors.slice(3),
      perVertexAlphas: alphas.slice(3),
      perVertexFaceBias: mesh.faceBias?.slice(3),
      depth: 'read',
      blend: 'normal',
    });
    expect(parts[1].transparentSort?.model.faceCount).toBe(2);
  });

  it.each([0, 1, 3])('does not treat absent alpha samples as zero with %i samples', (sampleCount) => {
    const parts = createSpotAnimMeshParts('missing-samples', { ...mesh, alphas: new Float32Array(sampleCount) });
    expect(parts).toHaveLength(1);
    expect(parts[0].blend).toBe('normal');
    expect(parts[0].positions).toBe(mesh.positions);
  });
});

describe('SpotAnimRenderer normal-depth contract', () => {
  it('filters hidden sort faces without modifying cached metadata', () => {
    const { renderer } = priorityFixture([
      { depth: 300, priority: 5 },
      { depth: 200, priority: 3 },
      { depth: 100, priority: 0 },
    ]);
    const source = renderer['meshCache'].get(9004)?.static[0];
    const model = source?.transparentSort?.model;
    if (!source || !model) expect.fail('Expected transparent sort metadata');
    model.faceColors3[1] = -2;
    const metadata = {
      priorities: model.faceRenderPriorities?.slice() ?? null,
      alphas: model.faceAlphas?.slice(),
      colors: Array.from({ length: model.faceCount }, (_, f) => model.faceColors3[f]),
    };
    spawnPriorityFixture(renderer, { requireTransparentSort: true });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expectPermutation(getOnlyMeshCommand(queue), source, [0, 2]);
    expect(model.faceRenderPriorities).toEqual(metadata.priorities);
    expect(model.faceAlphas).toEqual(metadata.alphas);
    expect(Array.from({ length: model.faceCount }, (_, f) => model.faceColors3[f])).toEqual(metadata.colors);
  });

  it('keeps gold in front as the same geometry changes from mixed opaque to all transparent', () => {
    const { renderer, loader, model } = priorityFixture([
      { depth: 200, priority: 5, alpha: 16 },
      { depth: 100, priority: 3, alpha: 0 },
    ]);
    const frames = [0, 1, 64, 0].map((alpha) => {
      model.faceAlphas.set([16, alpha]);
      const mesh = loader.loadSpotAnimMesh(9004);
      if (!mesh) expect.fail('Expected alpha frame');
      return createSpotAnimMeshParts(`alpha-${alpha}`, mesh);
    });
    const entry = renderer['meshCache'].get(9004);
    if (!entry) expect.fail('Expected cache entry');
    entry.frames = frames;
    entry.frameLengths = [1, 1, 1, 1];

    for (const [index, alpha] of [0, 1, 64, 0].entries()) {
      renderer.upsert({
        instanceId: 'gold-black',
        spotAnimId: 9004,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        frameProgress: index / 4,
        style: { requireTransparentSort: true },
      });
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      let depth = Number.POSITIVE_INFINITY;
      let blackWeight = 0;
      let goldWeight = 0;
      const commands = queue.commands.filter(isNpcMeshCommand);
      expect(commands.map((command) => command.depth)).toEqual(alpha === 0 ? ['readwrite', 'read'] : ['read']);
      expect(commands.every((command) => command.cullFace === 'back')).toBe(true);
      for (const command of commands) {
        const alphas = command.perVertexAlphas;
        if (!alphas) expect.fail('Expected face alpha');
        for (const [face, faceDepth] of faceDepths(command).entries()) {
          if (faceDepth > depth) continue;
          const opacity = alphas[face * 3];
          blackWeight = (faceDepth === 200 ? opacity : 0) + blackWeight * (1 - opacity);
          goldWeight = (faceDepth === 100 ? opacity : 0) + goldWeight * (1 - opacity);
          if (command.depth === 'readwrite') depth = faceDepth;
        }
      }
      expect(blackWeight).toBeCloseTo((239 / 255) * (alpha / 255), 6);
      expect(goldWeight).toBeCloseTo(1 - alpha / 255, 6);
      expect(goldWeight).toBeGreaterThan(blackWeight);
      if (alpha > 0) expect(faceDepths(commands[0])).toEqual([200, 100]);
    }
    expect(frames[1][0].transparentSort?.model.faceRenderPriorities).toBeNull();
  });

  it.each([true, false])('ignores behind-camera opaque vertices with skip-sort=%s', (skipSort) => {
    perfFlags.skipTransparentSort = skipSort;
    const { renderer } = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: -1100, priority: 5, alpha: 0 },
    ]);
    spawnPriorityFixture(renderer);
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const transparent = queue.commands.filter(isNpcMeshCommand).find((command) => command.blend === 'normal');
    if (!transparent) expect.fail('Expected visible transparent triangle');
    expect(faceDepths(transparent)).toEqual([100]);
    const meta = renderer['meshCache'].get(9004)?.static.find((part) => part.transparentSort)?.transparentSort;
    expect(meta?.model.verticesCount).toBe(3);
    expect(meta?.triToModelFace).toEqual(new Uint32Array([0]));
  });

  it('checks emitted vertices rather than the origin on the visibility fast path', () => {
    perfFlags.skipTransparentSort = true;
    const { renderer } = priorityFixture([{ depth: 1200, priority: 0 }]);
    spawnPriorityFixture(renderer, undefined, { position: [0, -9, 0] });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expect(faceDepths(getOnlyMeshCommand(queue))).toEqual([1200]);
  });

  it('keeps nearer faces in front despite priorities 0/3/5 and the skip flag', () => {
    perfFlags.skipTransparentSort = true;
    const { renderer } = priorityFixture([
      { depth: 200, priority: 5 },
      { depth: 300, priority: 3 },
      { depth: 100, priority: 0 },
    ]);
    spawnPriorityFixture(renderer, { requireTransparentSort: true, cullFace: 'back' });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expect(faceDepths(getOnlyMeshCommand(queue))).toEqual([300, 200, 100]);
    expect(getOnlyMeshCommand(queue).animated).toBe(true);
    expect(getOnlyMeshCommand(queue).cullFace).toBe('back');
  });

  it.each([10, 11])('keeps nearer faces in front with priority %i and opaque contributors', (priority) => {
    const { renderer } = priorityFixture([
      { depth: 200, priority },
      { depth: 100, priority: 0 },
      { depth: 400, priority: 1, alpha: 0 },
    ]);
    spawnPriorityFixture(renderer, { requireTransparentSort: true });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const transparent = queue.commands.filter(isNpcMeshCommand).find((command) => command.blend === 'normal');
    if (!transparent) expect.fail('Expected transparent mesh');
    expect(faceDepths(transparent)).toEqual([200, 100]);
    expect(transparent.depth).toBe('read');
    expect(
      queue.commands.filter(isNpcMeshCommand).find((command) => command.depth === 'readwrite')?.positions,
    ).toHaveLength(9);
  });

  describe.each([true, false])('culling with skip-sort=%s', (skipSort) => {
    describe.each([true, false])('projection available=%s', (hasProjection) => {
      it.each([false, true])('defaults opaque and transparent parts to back-cull (baked=%s)', (baked) => {
        perfFlags.skipTransparentSort = skipSort;
        const { renderer } = priorityFixture(
          [
            { depth: 100, priority: 0, alpha: 0 },
            { depth: 200, priority: 0 },
            { depth: 300, priority: 0, reverse: true },
          ],
          baked,
        );
        if (!hasProjection) renderer.setSorterProjection(null);
        spawnPriorityFixture(renderer);
        const queue = createQueue();

        renderEmbedded(renderer, queue);

        const commands = queue.commands.filter(isNpcMeshCommand);
        expect(commands.map((command) => [command.depth, command.cullFace])).toEqual([
          ['readwrite', 'back'],
          ['read', 'back'],
        ]);
        // The GPU culls unsorted geometry; the CPU sorter removes backfaces itself.
        expect(faceDepths(commands[1])).toEqual(!skipSort && hasProjection ? [200] : [200, 300]);
      });

      describe.each(['none', 'front'] as const)('explicit %s culling', (cullFace) => {
        it.each(['style', 'part', 'style-over-part'] as const)('honors the %s override in both passes', (owner) => {
          perfFlags.skipTransparentSort = skipSort;
          const { renderer } = priorityFixture([
            { depth: 50, priority: 0, alpha: 0 },
            { depth: 100, priority: 0 },
            { depth: 200, priority: 0, reverse: true },
          ]);
          if (!hasProjection) renderer.setSorterProjection(null);
          const parts = renderer['meshCache'].get(9004)?.static;
          if (!parts) expect.fail('Expected cached parts');
          if (owner !== 'style') {
            for (const part of parts)
              part.cullFace = owner === 'part' ? cullFace : cullFace === 'none' ? 'front' : 'none';
          }
          spawnPriorityFixture(renderer, owner === 'part' ? undefined : { cullFace });
          const queue = createQueue();

          renderEmbedded(renderer, queue);

          const commands = queue.commands.filter(isNpcMeshCommand);
          expect(commands.map((command) => [command.depth, command.cullFace])).toEqual([
            ['readwrite', cullFace],
            ['read', cullFace],
          ]);
          expect(faceDepths(commands[1])).toEqual(
            !skipSort && hasProjection ? (cullFace === 'front' ? [200] : [200, 100]) : [100, 200],
          );
        });
      });
    });
  });

  it('retains full-model sorting metadata after clearing and respawning instances', () => {
    const { renderer } = priorityFixture([
      { depth: 200, priority: 5 },
      { depth: 100, priority: 0 },
    ]);
    spawnPriorityFixture(renderer, { requireTransparentSort: true });
    renderer.clearActiveInstances();
    spawnPriorityFixture(renderer, { requireTransparentSort: true });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expect(faceDepths(getOnlyMeshCommand(queue))).toEqual([200, 100]);
  });

  it.each([
    { pitchRad: 2, yaw2048: 0.25, scale: 1.75, cameraYaw: 0.1, cameraPitch: 0.2 },
    { pitchRad: 0.8, yaw2048: 511.75, scale: 2.5, cameraYaw: 0.8, cameraPitch: -0.3 },
    { pitchRad: -1.5, yaw2048: 1023.6, scale: 0.6, cameraYaw: -0.4, cameraPitch: 0.5 },
  ])('sorts the exact emitted pitched/fractional-yaw/scaled geometry: $yaw2048', (pose) => {
    const { renderer, loader } = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: 200, priority: 0 },
      { depth: 300, priority: 0 },
    ]);
    const mesh = loader.loadSpotAnimMesh(9004);
    if (!mesh) expect.fail('Expected loaded mesh');
    const original = mesh.positions.slice();
    const camera = {
      cameraX: 200,
      cameraY: -300,
      cameraZ: -3000,
      yawSin: Math.sin(pose.cameraYaw),
      yawCos: Math.cos(pose.cameraYaw),
      pitchSin: Math.sin(pose.cameraPitch),
      pitchCos: Math.cos(pose.cameraPitch),
    };
    renderer.setSorterProjection(camera);
    spawnPriorityFixture(
      renderer,
      { requireTransparentSort: true, cullFace: 'none' },
      { ...pose, position: [1.3, 2.7, 0.8] },
    );
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    const matrix = command.modelMatrix;
    const depths = [0, 1, 2].map((face) => {
      let total = 0;
      for (let vertex = 0; vertex < 3; vertex++) {
        const offset = face * 9 + vertex * 3;
        const x = original[offset],
          y = original[offset + 1],
          z = original[offset + 2];
        const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        const horizontalDepth =
          (worldY * 128 - camera.cameraZ) * camera.yawCos - (worldX * 128 - camera.cameraX) * camera.yawSin;
        total += Math.trunc(horizontalDepth * camera.pitchCos + (-worldZ * 128 - camera.cameraY) * camera.pitchSin);
      }
      return { face, depth: Math.trunc(total / 3) };
    });
    depths.sort((left, right) => right.depth - left.depth);
    expect(faceDepths(command)).toEqual(depths.map(({ face }) => original[face * 9 + 2]));
    expect(mesh.positions).toEqual(original);
  });

  it.each([
    false,
    true,
  ])('keeps sorted instance arrays independent and cached geometry unchanged (baked=%s)', (baked) => {
    const { renderer } = priorityFixture(
      [
        { depth: 100, priority: 0 },
        { depth: 200, priority: 0 },
      ],
      baked,
    );
    const entry = renderer['meshCache'].get(9004);
    const cached = baked ? entry?.frames[0][0] : entry?.static[0];
    if (!cached) expect.fail('Expected cached mesh');
    const original = meshBuffers(cached).map((buffer) => buffer.slice());
    spawnPriorityFixture(renderer, { requireTransparentSort: true, cullFace: 'none' });
    spawnPriorityFixture(
      renderer,
      { requireTransparentSort: true, cullFace: 'none' },
      { position: [0, 0, 0], yaw2048: 1024 },
    );
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const [first, second] = queue.commands.filter(isNpcMeshCommand);
    expect(faceDepths(first)).toEqual([200, 100]);
    expect(faceDepths(second)).toEqual([100, 200]);
    expectPermutation(first, cached, [1, 0]);
    expectPermutation(second, cached, [0, 1]);
    meshBuffers(first).forEach((buffer, index) => {
      expect(buffer.buffer).not.toBe(meshBuffers(second)[index].buffer);
    });
    expect(meshBuffers(cached)).toEqual(original);
  });

  it('preserves fractional yaw rather than truncating it to the sorter angle table', () => {
    const { renderer } = priorityFixture(
      [
        { depth: 101, priority: 0 },
        { depth: 100, priority: 0 },
      ],
      false,
      (model) => model.verticesX.set([2000, 2000, 2100, -2000, -2000, -1900]),
    );
    spawnPriorityFixture(
      renderer,
      { requireTransparentSort: true, cullFace: 'none' },
      { position: [0, 0, 0], yaw2048: 0.75 },
    );
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expect(faceDepths(getOnlyMeshCommand(queue))).toEqual([100, 101]);
  });

  it.each([
    'none',
    'front',
  ] as const)('resets pooled %s culling and style before an ordinary opaque effect', (cullFace) => {
    const { renderer } = priorityFixture([{ depth: 100, priority: 0 }]);
    const flight = spawnPriorityFixture(renderer, {
      requireTransparentSort: true,
      cullFace,
      depthBias: 0.1,
      zIndex: 9,
    });
    renderEmbedded(renderer, createQueue());
    renderer.despawn(flight);
    renderer['meshCache'].set(OPAQUE_SPOTANIM_ID, {
      static: [createOpaquePart()],
      frames: [],
      frameLengths: [],
      frameStep: -1,
      heightOffset: 0,
    });
    spawnTestSpotAnim(renderer, OPAQUE_SPOTANIM_ID, false);
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    expect(command.cullFace).toBe('back');
    expect(command.animated).toBe(false);
    expect(command.depthBias).toBeUndefined();
    expect(command.zIndex).toBeUndefined();
    expect(command.blend).toBeUndefined();
    expect(command.depth).toBe('readwrite');
  });

  it('does not hide a sorted effect when projection is unavailable', () => {
    const { renderer } = priorityFixture([{ depth: 100, priority: 5, reverse: true }]);
    renderer.setSorterProjection(null);
    spawnPriorityFixture(renderer, { requireTransparentSort: true });
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    expect(faceDepths(getOnlyMeshCommand(queue))).toEqual([100]);
  });
});

function createQueue(): RenderQueue {
  return { replayPresentationReady: true, commands: [] };
}

/** Renders, then reads resident draws back as the arrays they upload (see {@link embedder}). */
function renderEmbedded(renderer: SpotAnimRenderer, queue: RenderQueue): void {
  renderer.render(queue);
  embedder.embedQueue(queue);
}

function createTransparentPart(): NpcMesh3DCommand {
  const positions = new Float32Array([...NEAR_FACE, ...FAR_FACE]);
  return {
    kind: 'mesh3d',
    meshId: 'test-spotanim-transparent',
    materialId: 'osrs-npc',
    modelMatrix: new Float32Array(16),
    positions,
    normals: new Float32Array(positions.length),
    perVertexHslColors: new Float32Array(positions.length / 3).fill(100),
    perVertexAlphas: new Float32Array(positions.length / 3).fill(0.5),
    perVertexFaceBias: new Float32Array(positions.length / 3),
    depth: 'read',
    blend: 'normal',
  };
}

function createOpaquePart(): NpcMesh3DCommand {
  return {
    ...createTransparentPart(),
    meshId: 'test-spotanim-opaque',
    depth: 'readwrite',
    blend: undefined,
  };
}

function isNpcMeshCommand(command: RenderCommand | undefined): command is NpcMesh3DCommand {
  return command?.kind === 'mesh3d' && 'positions' in command && command.positions instanceof Float32Array;
}

function getOnlyMeshCommand(queue: RenderQueue): NpcMesh3DCommand {
  expect(queue.commands).toHaveLength(1);
  const command = queue.commands[0];
  if (!isNpcMeshCommand(command)) {
    throw new Error('Expected one mesh3d command with embedded buffers');
  }
  return command;
}

function installTestMeshes(renderer: SpotAnimRenderer, transparentPart: NpcMesh3DCommand): void {
  renderer['meshCache'].set(TRANSPARENT_SPOTANIM_ID, {
    static: [transparentPart],
    frames: [],
    frameLengths: [],
    frameStep: -1,
    heightOffset: 0,
  });
  renderer['meshCache'].set(OPAQUE_SPOTANIM_ID, {
    static: [createOpaquePart()],
    frames: [],
    frameLengths: [],
    frameStep: -1,
    heightOffset: 0,
  });
  const model = {
    indices1: new Int32Array([0, 3]),
    indices2: new Int32Array([1, 4]),
    indices3: new Int32Array([2, 5]),
    faceColors3: new Int32Array([100, 101]),
    faceCount: 2,
    verticesCount: 6,
    priority: 0,
    faceRenderPriorities: null,
    faceAlphas: new Int8Array([127, 127]),
  };
  Object.assign(transparentPart, {
    transparentSort: { model, triToModelFace: new Uint32Array([0, 1]) },
  });
}

function createRenderer(): SpotAnimRenderer {
  const renderer = new SpotAnimRenderer();
  const transparentPart = createTransparentPart();
  installTestMeshes(renderer, transparentPart);
  renderer.setSorterProjection({
    cameraX: 0,
    cameraY: 0,
    cameraZ: -1000,
    yawSin: 0,
    yawCos: 1,
    pitchSin: 0,
    pitchCos: 1,
  });
  return renderer;
}

function spawnTestSpotAnim(renderer: SpotAnimRenderer, spotAnimId: number, requireTransparentSort: boolean): void {
  renderer.spawn({
    instanceId: `spotanim-${spotAnimId}-${requireTransparentSort}`,
    spotAnimId,
    transform: { kind: 'static', value: { position: [0, 0, 0] } },
    lifecycle: { kind: 'manual' },
    style: requireTransparentSort ? { requireTransparentSort: true } : undefined,
  });
}

describe('SpotAnimRenderer shared baked geometry', () => {
  const MIXED_FACES = [
    { depth: 300, priority: 0, alpha: 0 },
    { depth: 200, priority: 0 },
    { depth: 100, priority: 0 },
  ];

  function renderOnce(renderer: SpotAnimRenderer, frameProgress: number): NpcMesh3DCommand[] {
    renderer.upsert({
      instanceId: 'shared',
      spotAnimId: 9004,
      lifecycle: { kind: 'manual' },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      frameProgress,
      style: { requireTransparentSort: true },
    });
    const queue = createQueue();
    renderEmbedded(renderer, queue);
    return queue.commands.filter(isNpcMeshCommand);
  }

  function residentOpaque(entry: { frames: SpotAnimMeshPart[][] } | undefined, frame = 0) {
    const resident = entry?.frames[frame]?.find((part) => part.blend !== 'normal')?.resident;
    if (!resident) expect.fail('Expected a resident opaque part');
    return resident;
  }

  it.each([true, false])('keeps empty baked frames, timing, sounds and expiry with skip-sort=%s', (skipSort) => {
    perfFlags.skipTransparentSort = skipSort;
    const { renderer, loader, sequence } = priorityFixture([{ depth: 100, priority: 0 }]);
    const visible = loader.loadSpotAnimMesh(9004);
    if (!visible) expect.fail('Expected visible mesh');
    const invisible = { ...visible, alphas: new Float32Array(visible.alphas.length) };
    const frameLengths = [2, 3, 4];
    sequence.frameLengths = frameLengths;
    sequence.frameSounds = new Map([[2, [{ id: 10263, loops: 0, location: 0, retain: 0 }]]]);
    loader.clearCache();
    vi.spyOn(loader, 'loadAnimatedSpotAnim').mockReturnValue({
      spotAnimId: 9004,
      frames: [invisible, visible, invisible],
      frameLengths,
      seqType: sequence,
    });
    renderer.loadById(loader, 9004);
    const entry = renderer['meshCache'].get(9004);
    expect(entry?.frames.map((parts) => parts.length)).toEqual([0, 1, 0]);
    expect(renderer.getFrameLengths(9004)).toEqual(frameLengths);
    renderer.spawn({
      instanceId: 'alpha-transition',
      spotAnimId: 9004,
      lifecycle: { kind: 'oneShot', startTick: 0 },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
    });

    for (const [cycle, expectedFrame, visibleFrame] of [
      [0, 0, false],
      [3, 1, true],
      [6, 2, false],
      [8.99, 2, false],
    ] as const) {
      renderer.tick(0, cycle / 30);
      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands).toHaveLength(visibleFrame ? 1 : 0);
      if (visibleFrame) expect(getOnlyMeshCommand(queue).perVertexAlphas).toEqual(visible.alphas);
      const [state] = renderer.getFrameStates();
      expect(state.currentFrame).toBe(expectedFrame);
      expect(state.seqType).toBe(sequence);
      expect(renderer.getActiveInstanceCount()).toBe(1);
    }
    renderer.tick(0, 9 / 30);
    expect(renderer.getActiveInstanceCount()).toBe(0);
    expect(renderer.getFrameStates()).toEqual([]);
  });

  it('lets a restarted renderer reuse the first bake and its resident source', () => {
    const { renderer: first, loader } = priorityFixture(MIXED_FACES, true);
    const entry = first['meshCache'].get(9004);
    if (!entry) expect.fail('Expected baked entry');
    expect(entry.frames).toHaveLength(2);
    // Each frame: a resident opaque part with no arrays, then a transparent part that keeps them.
    for (const [opaque, transparent] of entry.frames) {
      expect(opaque.resident?.source).toBe(residentOpaque(entry).source);
      expect(opaque.positions).toBeUndefined();
      expect(opaque.perVertexHslColors).toBeUndefined();
      expect(transparent.resident).toBeUndefined();
      expect(transparent.positions).toBeInstanceOf(Float32Array);
    }
    const transparentArrays = entry.frames.map(([, transparent]) => meshBuffers(transparent));
    const snapshots = transparentArrays.map((buffers) => buffers.map((buffer) => buffer.slice()));
    renderOnce(first, 0.75);

    // An encounter restart disposes the old compositor's renderer and preloads into a new one.
    first.dispose();
    const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');
    const restarted = new SpotAnimRenderer();
    restarted.loadById(loader, 9004);
    restarted.setSorterProjection({
      cameraX: 0,
      cameraY: 0,
      cameraZ: -1000,
      yawSin: 0,
      yawCos: 1,
      pitchSin: 0,
      pitchCos: 1,
    });

    expect(bake).not.toHaveBeenCalled();
    expect(restarted['meshCache'].get(9004)).toBe(entry);
    restarted.upsert({
      instanceId: 'shared',
      spotAnimId: 9004,
      lifecycle: { kind: 'manual' },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      frameProgress: 0.75,
      style: { requireTransparentSort: true },
    });
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    restarted.render(queue);
    const [opaque, transparent] = queue.commands;
    if (!opaque || opaque.kind !== 'mesh3d' || !isResidentMesh3DCommand(opaque))
      expect.fail('Expected a resident draw');
    expect(opaque.meshId).toBe('spotanim-9004-frame-1-opaque');
    expect(opaque.meshSource).toBe(residentOpaque(entry, 1).source);
    expect(opaque.meshSourcePart).toBe(1);
    expect(opaque.modelMatrix).toEqual(isNpcMeshCommand(transparent) ? transparent.modelMatrix : undefined);
    // The full sort permutes into instance buffers and never writes into the cached arrays.
    transparentArrays.forEach((buffers, frame) => {
      buffers.forEach((buffer, index) => {
        expect(buffer).toEqual(snapshots[frame][index]);
      });
    });
  });

  it.skipIf(!collectGarbage)(
    'keeps no CPU copy of resident geometry once it is uploaded, and rebuilds it byte for byte',
    async () => {
      const { renderer, loader } = priorityFixture(MIXED_FACES, true);
      const source = residentOpaque(renderer['meshCache'].get(9004)).source;
      const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');

      // The renderer's first upload takes the bake made at load; nothing else keeps it.
      let uploaded: readonly MeshUploadData[] | null = source.materialize();
      expect(bake).not.toHaveBeenCalled();
      const snapshots = uploaded.map((part) => meshBuffers(part as MeshAttributes).map((buffer) => buffer.slice()));
      const released = uploaded.map((part) => new WeakRef(part.positions));
      uploaded = null;
      await collectGarbageUntilCleared(released);
      expect(released.map((ref) => ref.deref())).toEqual([undefined, undefined]);

      // After an eviction or a lost context the recipe rebakes the same arrays.
      const rebuilt = source.materialize();
      expect(bake).toHaveBeenCalledTimes(1);
      expect(rebuilt.map((part) => meshBuffers(part as MeshAttributes))).toEqual(snapshots);
      expect(renderer['meshCache'].get(9004)?.frames[0][0].resident?.source).toBe(source);
    },
  );

  it('keeps the bounds of every baked part for framing', () => {
    const { renderer } = priorityFixture(MIXED_FACES, true);
    const entry = renderer['meshCache'].get(9004);
    if (!entry) expect.fail('Expected baked entry');
    const positions = entry.frames.flat().flatMap((part) => Array.from(partArrays(part).positions));
    const axis = (offset: number) => positions.filter((_, index) => index % 3 === offset);
    expect(renderer.getBakedBounds(9004)).toEqual({
      minX: Math.min(...axis(0)),
      minY: Math.min(...axis(1)),
      minZ: Math.min(...axis(2)),
      maxX: Math.max(...axis(0)),
      maxY: Math.max(...axis(1)),
      maxZ: Math.max(...axis(2)),
    });
  });

  it('points draws of opted-in spotanims at their own arrays in one instancing atlas, never fully sorted ones', () => {
    const { renderer, loader } = priorityFixture(MIXED_FACES, true);
    const entry = renderer['meshCache'].get(9004);
    if (!entry) expect.fail('Expected baked entry');
    const draw = (requireTransparentSort: boolean) => {
      renderer.upsert({
        instanceId: 'shared',
        spotAnimId: 9004,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        frameProgress: 0.75,
        style: { requireTransparentSort },
      });
      const queue = createQueue();
      renderer.render(queue);
      return queue.commands.filter((command) => command.kind === 'mesh3d');
    };
    // Off by default, and the commands do not even carry the keys.
    expect(draw(false).filter((command) => 'instanceAtlas' in command || 'instanceAtlasPart' in command)).toEqual([]);

    renderer.setBatchableSpotAnimFamilies([[9004, 9005]]);
    // Not until every spotanim of the family is baked.
    expect(draw(false).map((command) => command.instanceAtlas)).toEqual([undefined, undefined]);
    expect(renderer.getResidentMeshSources()).toEqual([residentOpaque(entry).source]);
    renderer.setBatchableSpotAnimFamilies([[9004]]);
    const [opaque, transparent] = draw(false);
    const atlas = opaque?.instanceAtlas ?? expect.fail('Expected an atlas');
    expect(transparent?.instanceAtlas).toBe(atlas);
    expect(atlas.scope).toBe('loader');
    // Listed for upload ahead beside the resident sources, as an atlas.
    expect(atlas.use).toBe('instanceAtlas');
    expect(renderer.getResidentMeshSources()).toEqual([residentOpaque(entry).source, atlas]);
    // Every part of every frame, in order: frame 1 is parts 2 and 3.
    expect([opaque?.instanceAtlasPart, transparent?.instanceAtlasPart]).toEqual([2, 3]);
    const parts = atlas.materialize();
    expect(parts).toHaveLength(entry.frames.flat().length);
    for (const [index, part] of entry.frames.flat().entries()) {
      const own = partArrays(part);
      expect(parts[index]?.positions).toEqual(own.positions);
      expect(parts[index]?.perVertexHslColors).toEqual(own.perVertexHslColors);
      expect(parts[index]?.perVertexAlphas).toEqual(own.perVertexAlphas);
      expect(parts[index]?.perVertexFaceBias).toEqual(own.perVertexFaceBias);
    }
    // The same atlas every frame; a fully sorted transparent draw has permuted arrays and none.
    const sorted = draw(true);
    expect(sorted[0]?.instanceAtlas).toBe(atlas);
    expect(sorted[1]?.meshId).toMatch(/-sorted$/);
    expect(sorted[1]?.instanceAtlas).toBeUndefined();
    expect(sorted[1]?.instanceAtlasPart).toBeUndefined();

    // A cleared cache retires it with the bakes; the rebake gets a new one.
    loader.clearCache();
    expect(atlas.retired).toBe(true);
    renderer.loadById(loader, 9004);
    const [rebaked] = draw(false);
    expect(rebaked?.instanceAtlas).toBeDefined();
    expect(rebaked?.instanceAtlas).not.toBe(atlas);

    // Opting out drops it from the next frame, and retires it.
    const last = rebaked?.instanceAtlas;
    renderer.setBatchableSpotAnimFamilies([]);
    expect(draw(false).map((command) => command.instanceAtlas)).toEqual([undefined, undefined]);
    expect(last?.retired).toBe(true);
  });

  it('scopes resident sources to the loader and lists them for upload ahead, the same objects after a restart', () => {
    const { renderer: first, loader } = priorityFixture(MIXED_FACES, true);
    const source = residentOpaque(first['meshCache'].get(9004)).source;
    expect(source.scope).toBe('loader');
    expect(first.getResidentMeshSources()).toEqual([source]);
    // Preloaded but not yet uploaded: the load-time bake is still waiting to be handed over.
    expect(source.holdsFirstBuild).toBe(true);
    source.materialize();

    first.dispose();
    const restarted = new SpotAnimRenderer();
    restarted.loadById(loader, 9004);
    const [again] = restarted.getResidentMeshSources();
    expect(again).toBe(source);
    // Already handed over, so preparing it again would upload nothing and rebuild nothing.
    expect(again?.holdsFirstBuild).toBe(false);
  });

  it.skipIf(!collectGarbage)(
    'releases a departed scene’s effects at the next bake, retiring their uploads, and rebakes them on demand',
    async () => {
      const { renderer: departed, loader } = priorityFixture(MIXED_FACES, true);
      const source = residentOpaque(departed['meshCache'].get(9004)).source;
      const transparent = new WeakRef(
        departed['meshCache'].get(9004)?.frames[0][1].positions ?? expect.fail('Expected transparent arrays'),
      );
      departed.dispose();
      // Until something else bakes, a restarted scene may still take it back.
      expect(source.retired).toBe(false);

      // The next encounter's first bake lets it go, CPU arrays and GPU upload alike.
      const next = new SpotAnimRenderer();
      next.loadById(loader, 9005);
      expect(source.retired).toBe(true);
      expect(() => source.materialize()).toThrow(RetiredMeshSourceError);
      expect([...(SpotAnimRenderer['sharedBaked'].get(loader)?.entries.keys() ?? [])]).toEqual([9005]);
      await collectGarbageUntilCleared([transparent]);
      expect(transparent.deref()).toBeUndefined();

      const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');
      next.loadById(loader, 9004);
      expect(bake).toHaveBeenCalledTimes(1);
      const rebaked = residentOpaque(next['meshCache'].get(9004)).source;
      expect(rebaked).not.toBe(source);
      expect(rebaked.id).toBe(source.id);
      expect(rebaked.retired).toBe(false);
    },
  );

  it('keeps an effect a live renderer still holds through other bakes and disposals', () => {
    const { renderer: first, loader } = priorityFixture(MIXED_FACES, true);
    const second = new SpotAnimRenderer();
    second.loadById(loader, 9004);
    const entry = first['meshCache'].get(9004);
    expect(second['meshCache'].get(9004)).toBe(entry);
    const source = residentOpaque(entry).source;

    first.dispose();
    second.loadById(loader, 9005);
    expect(source.retired).toBe(false);
    const third = new SpotAnimRenderer();
    third.loadById(loader, 9004);
    expect(third['meshCache'].get(9004)).toBe(entry);

    // Released only once its last holder has gone and something else bakes.
    second.dispose();
    third.dispose();
    third.loadById(loader, 9006);
    expect(source.retired).toBe(true);
  });

  it.skipIf(!collectGarbage)('lets go of a renderer dropped without dispose once it is collected', async () => {
    const drop = () => {
      const { renderer, loader } = priorityFixture(MIXED_FACES, true);
      return {
        loader,
        source: residentOpaque(renderer['meshCache'].get(9004)).source,
        dropped: new WeakRef(renderer),
      };
    };
    const { loader, source, dropped } = drop();
    await collectGarbageUntilCleared([dropped]);

    new SpotAnimRenderer().loadById(loader, 9005);
    expect(source.retired).toBe(true);
  });

  it('makes a static effect resident too', () => {
    const { renderer } = priorityFixture([{ depth: 100, priority: 0, alpha: 0 }]);
    const [opaque] = renderer['meshCache'].get(9004)?.static ?? [];
    expect(opaque?.resident?.source.id).toBe('spotanim-9004');
    expect(opaque?.meshId).toBe('spotanim-9004-opaque');
    expect(opaque?.positions).toBeUndefined();
  });

  it('rebakes after the loader cache is cleared and releases every stale entry', () => {
    const { renderer: first, loader } = priorityFixture(MIXED_FACES, true);
    // The fixture's type loader answers every id, so a second id bakes the same effect.
    first.loadById(loader, 9005);
    const stale = [first['meshCache'].get(9004), first['meshCache'].get(9005)];
    if (!stale[0] || !stale[1]) expect.fail('Expected both ids baked');
    const stalePositions = partArrays(stale[0].frames[0][0]).positions;
    first.dispose();

    loader.clearCache();
    // The stale source retires with the clear: it can no longer upload or rebuild.
    expect(residentOpaque(stale[0]).source.retired).toBe(true);
    expect(() => residentOpaque(stale[0]).source.materialize()).toThrow(RetiredMeshSourceError);
    const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');
    const reloaded = new SpotAnimRenderer();
    reloaded.loadById(loader, 9004);

    expect(bake).toHaveBeenCalledTimes(1);
    const fresh = reloaded['meshCache'].get(9004);
    expect(fresh).not.toBe(stale[0]);
    expect(partArrays(fresh?.frames[0][0] ?? expect.fail('missing part')).positions).toEqual(stalePositions);
    // The rebaked source supersedes the stale one under the same id when the renderer draws it.
    expect(residentOpaque(fresh).source).not.toBe(residentOpaque(stale[0]).source);
    expect(residentOpaque(fresh).source.id).toBe(residentOpaque(stale[0]).source.id);
    // The first lookup after the clear drops the whole generation, including the id not asked for.
    const shared = SpotAnimRenderer['sharedBaked'].get(loader);
    expect(shared?.entries.size).toBe(1);
    expect(shared?.entries.get(9004)).toBe(fresh);

    reloaded.loadById(loader, 9005);
    expect(bake).toHaveBeenCalledTimes(2);
    expect(reloaded['meshCache'].get(9005)).not.toBe(stale[1]);
  });

  it('replaces a live renderer’s stale entry whole after a clear, never mixing generations', () => {
    let model: ModelData | undefined;
    const { renderer, loader } = priorityFixture(MIXED_FACES, true, (configured) => {
      model = configured;
    });
    const stale = renderer['meshCache'].get(9004);
    if (!stale || !model) expect.fail('Expected a baked entry');
    const staleSource = residentOpaque(stale).source;
    const opaqueX = (entry: typeof stale) =>
      Array.from(partArrays(entry.frames[0][0]).positions).filter((_, i) => i % 3 === 0);
    const transparentX = (entry: typeof stale) =>
      Array.from(partArrays(entry.frames[0][1]).positions).filter((_, i) => i % 3 === 0);
    const before = { opaque: opaqueX(stale), transparent: transparentX(stale), bounds: renderer.getBakedBounds(9004) };

    // Same layout, new geometry: every vertex moves 100 units along X.
    model.verticesX = model.verticesX.map((x) => x + 100);
    loader.clearCache();
    // Nothing may rebuild the old source against the new generation, e.g. after an eviction.
    expect(staleSource.retired).toBe(true);
    expect(() => staleSource.materialize()).toThrow(RetiredMeshSourceError);

    // The next read replaces the entry whole: opaque source, transparent arrays and bounds together.
    const bounds = renderer.getBakedBounds(9004);
    const fresh = renderer['meshCache'].get(9004);
    if (!fresh) expect.fail('Expected a fresh entry');
    expect(fresh).not.toBe(stale);
    expect(residentOpaque(fresh).source).not.toBe(staleSource);
    expect(residentOpaque(fresh).source.id).toBe(staleSource.id);
    expect(opaqueX(fresh)).toEqual(before.opaque.map((x) => x + 100));
    expect(transparentX(fresh)).toEqual(before.transparent.map((x) => x + 100));
    expect(bounds).toEqual({
      ...before.bounds,
      minX: (before.bounds?.minX ?? 0) + 100,
      maxX: (before.bounds?.maxX ?? 0) + 100,
    });
    // And its draws reference only the fresh source.
    renderOnce(renderer, 0);
    // A raw queue: `renderEmbedded` would read resident draws back as arrays.
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);
    const resident = queue.commands.filter(
      (command) => command.kind === 'mesh3d' && isResidentMesh3DCommand(command),
    ) as ResidentMesh3DCommand[];
    expect(resident.length).toBeGreaterThan(0);
    expect(resident.every((command) => command.meshSource === residentOpaque(fresh).source)).toBe(true);
  });

  it('rebinds every entry to a replacement loader, so nothing refers to the replaced one', () => {
    const { renderer, loader } = priorityFixture(MIXED_FACES, true);
    renderer.loadById(loader, 9005);
    const { loader: replacement } = priorityFixture(MIXED_FACES, true);
    const old = [9004, 9005].map((id) => renderer['meshCache'].get(id));
    expect(renderer.isBoundTo(loader)).toBe(true);

    // The same loader again changes nothing.
    renderer.loadById(loader, 9004);
    expect(renderer['meshCache'].get(9004)).toBe(old[0]);

    // Loading any one effect from the replacement rebinds them all at once.
    renderer.loadById(replacement, 9004);

    expect(renderer.isBoundTo(replacement)).toBe(true);
    for (const [index, id] of [9004, 9005].entries()) {
      const rebound = renderer['meshCache'].get(id);
      expect(rebound).not.toBe(old[index]);
      expect(rebound?.bakedFrom?.loader).toBe(replacement);
    }
    expect(renderer.getResidentMeshSources().map((source) => source.owner)).toEqual([replacement, replacement]);
  });

  it('bakes separately for a different loader', () => {
    const { renderer: first } = priorityFixture(MIXED_FACES, true);
    const { renderer: second } = priorityFixture(MIXED_FACES, true);

    expect(second['meshCache'].get(9004)).not.toBe(first['meshCache'].get(9004));
    expect(partArrays(second['meshCache'].get(9004)?.frames[0][0] ?? expect.fail('missing part')).positions).toEqual(
      partArrays(first['meshCache'].get(9004)?.frames[0][0] ?? expect.fail('missing part')).positions,
    );
  });

  it('builds transparent sort input from shared identity views instead of per-part copies', () => {
    const { renderer } = priorityFixture(MIXED_FACES, true);
    const [frame0, frame1] = renderer['meshCache'].get(9004)?.frames ?? [];
    const sort0 = frame0?.find((part) => part.blend === 'normal')?.transparentSort;
    const sort1 = frame1?.find((part) => part.blend === 'normal')?.transparentSort;
    if (!sort0 || !sort1) expect.fail('Expected transparent parts in both frames');

    expect(sort0.model).not.toHaveProperty('verticesX');
    // scene-base reads no normals, so no baked part keeps any.
    for (const part of [...frame0, ...frame1]) expect(part).not.toHaveProperty('normals');
    expect(Array.from(sort0.model.indices1 as Int32Array)).toEqual([0, 3]);
    expect(Array.from(sort0.model.indices3 as Int32Array)).toEqual([2, 5]);
    expect(Array.from(sort0.triToModelFace)).toEqual([0, 1]);
    expect(Array.from(sort0.model.faceAlphas ?? [])).toEqual([1, 1]);
    expect((sort0.model.indices1 as Int32Array).buffer).toBe((sort1.model.indices1 as Int32Array).buffer);
    expect(sort0.triToModelFace.buffer).toBe(sort1.triToModelFace.buffer);
    expect(sort0.model.faceColors3).not.toBe(sort1.model.faceColors3);
    expect(spotAnimTransparentFaceMap(sort0)).toBe(spotAnimTransparentFaceMap(sort0));
  });
});

describe('SpotAnimRenderer permutation workspace ownership', () => {
  it.each([false, true])('reuses all four buffers across repeated renders with upsert=%s', (upsert) => {
    const { renderer } = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: 200, priority: 0 },
    ]);
    const source = renderer['meshCache'].get(9004)?.static[0];
    if (!source) expect.fail('Expected source');
    const original = meshBuffers(source).map((buffer) => buffer.slice());
    const instanceId = spawnPriorityFixture(renderer, { requireTransparentSort: true, cullFace: 'none' });
    const firstQueue = createQueue();
    renderEmbedded(renderer, firstQueue);
    const first = meshBuffers(getOnlyMeshCommand(firstQueue));

    for (let frame = 0; frame < 4; frame++) {
      if (upsert)
        renderer.upsert({
          instanceId,
          spotAnimId: 9004,
          lifecycle: { kind: 'manual' },
          transform: { kind: 'static', value: { position: [0, 0, 0], yaw2048: frame % 2 ? 1024 : 0 } },
          style: { requireTransparentSort: true, cullFace: 'none' },
        });
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const command = getOnlyMeshCommand(queue);
      expectPermutation(command, source, upsert && frame % 2 ? [0, 1] : [1, 0]);
      meshBuffers(command).forEach((buffer, index) => {
        expect(buffer.buffer).toBe(first[index].buffer);
      });
    }
    expect(meshBuffers(source)).toEqual(original);
  });

  it('grows from source capacity even with zero visible faces and retains capacity through shorter frames', () => {
    const { renderer, loader, model } = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: 200, priority: 0 },
      { depth: 300, priority: 0 },
    ]);
    const entry = renderer['meshCache'].get(9004);
    if (!entry) expect.fail('Expected cache entry');
    const large = entry.static[0];
    model.faceAlphas.set([0, 0, 64]);
    const smallMesh = loader.loadSpotAnimMesh(9004);
    if (!smallMesh) expect.fail('Expected small mesh');
    const smallParts = createSpotAnimMeshParts('small', smallMesh);
    const small = smallParts.find((part) => part.blend === 'normal');
    if (!small) expect.fail('Expected small transparent part');
    entry.frames = [smallParts, [large]];
    entry.frameLengths = [1, 1];
    const originals = [small, large].map((part) => meshBuffers(part).map((buffer) => buffer.slice()));
    let previous: Float32Array[] = [];
    const steps = [
      { large: false, visible: true },
      { large: true, visible: false },
      { large: true, visible: true },
      { large: false, visible: true },
      { large: true, visible: false },
      { large: true, visible: true },
    ];

    for (const [stepIndex, step] of steps.entries()) {
      renderer.upsert({
        instanceId: 'resizing',
        spotAnimId: 9004,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        frameProgress: step.large ? 0.75 : 0,
        style: { requireTransparentSort: true, cullFace: step.visible ? 'back' : 'front' },
      });
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const command = queue.commands.filter(isNpcMeshCommand).find((part) => part.blend === 'normal');
      if (!command) expect.fail('Expected transparent command');
      expectPermutation(command, step.large ? large : small, step.visible ? (step.large ? [2, 1, 0] : [0]) : []);
      const buffers = meshBuffers(command);
      buffers.forEach((buffer, attribute) => {
        const capacity = (attribute === 0 ? 9 : 3) * (stepIndex === 0 ? 1 : 3) * Float32Array.BYTES_PER_ELEMENT;
        expect(buffer.buffer.byteLength).toBe(capacity);
        if (stepIndex === 1) expect(buffer.buffer).not.toBe(previous[attribute].buffer);
        if (stepIndex > 1) expect(buffer.buffer).toBe(previous[attribute].buffer);
      });
      previous = buffers;
    }
    expect([small, large].map(meshBuffers)).toEqual(originals);
  });

  it('sorts small, large and then another part through one input on the current projection scratch', () => {
    const { renderer, loader, model } = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: 200, priority: 0 },
      { depth: 300, priority: 0 },
    ]);
    const entry = renderer['meshCache'].get(9004);
    if (!entry) expect.fail('Expected cache entry');
    const large = entry.static[0];
    model.faceAlphas.set([0, 0, 64]);
    const smallMesh = loader.loadSpotAnimMesh(9004);
    if (!smallMesh) expect.fail('Expected small mesh');
    const other = createSpotAnimMeshParts('other', smallMesh).find((part) => part.blend === 'normal');
    if (!other) expect.fail('Expected another transparent part');
    entry.frames = [createSpotAnimMeshParts('small', smallMesh), [large], [other]];
    entry.frameLengths = [1, 1, 1];
    const transform = renderer['transformSortModel'].bind(renderer);
    const inputs: { input: object; scratch: Float64Array[] }[] = [];
    renderer['transformSortModel'] = (...args: Parameters<typeof transform>) => {
      const input = transform(...args);
      inputs.push({
        input,
        scratch: [renderer['sortVerticesX'], renderer['sortVerticesY'], renderer['sortVerticesZ']],
      });
      return input;
    };

    for (const frameProgress of [0, 0.5, 0.9]) {
      renderer.upsert({
        instanceId: 'resizing',
        spotAnimId: 9004,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        frameProgress,
        style: { requireTransparentSort: true, cullFace: 'back' },
      });
      renderEmbedded(renderer, createQueue());
    }

    expect(inputs).toHaveLength(3);
    // The large part grew the scratch; nothing still names the arrays the small part was sorted on.
    expect(inputs[1]?.scratch[0]).not.toBe(inputs[0]?.scratch[0]);
    expect(inputs.every(({ input }) => input === renderer['sortInput'])).toBe(true);
    const current = inputs[2]?.scratch;
    expect(renderer['sortInput']).toMatchObject({
      verticesX: current?.[0],
      verticesY: current?.[1],
      verticesZ: current?.[2],
      faceColors3: other.transparentSort?.model.faceColors3,
    });
  });

  it('replaces request style and group while retaining the same graphic workspace', () => {
    perfFlags.skipTransparentSort = false;
    const renderer = createRenderer();
    const request = {
      instanceId: 'replacement',
      spotAnimId: TRANSPARENT_SPOTANIM_ID,
      lifecycle: { kind: 'manual' },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
    } satisfies SpotAnimSpawnRequest;
    renderer.upsert({ ...request, groupId: 'old', style: { cullFace: 'none', zIndex: 9, depthBias: 0.1 } });
    const firstQueue = createQueue();
    renderEmbedded(renderer, firstQueue);
    const first = meshBuffers(getOnlyMeshCommand(firstQueue));

    renderer.upsert({ ...request, groupId: 'new' });
    renderer.despawnGroup('old');
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    expect(command.cullFace).toBe('back');
    expect(command.zIndex).toBeUndefined();
    expect(command.depthBias).toBeUndefined();
    meshBuffers(command).forEach((buffer, index) => {
      expect(buffer.buffer).toBe(first[index].buffer);
    });
    expect(renderer['groups'].get('new')).toEqual(new Set(['replacement']));
  });

  it('updates a live instance in place on upsert, keeping no part of the request it may reuse', () => {
    const renderer = createRenderer();
    const position: [number, number, number] = [3, 4, 0];
    const request = {
      instanceId: 'reused-request',
      spotAnimId: TRANSPARENT_SPOTANIM_ID,
      lifecycle: { kind: 'oneShot', startTick: 0, durationTicks: 5 },
      transform: { kind: 'dynamic', resolve: () => ({ position }) },
    } satisfies SpotAnimSpawnRequest;
    renderer.upsert(request);
    const record = renderer['activeInstances'].get('reused-request');
    renderEmbedded(renderer, createQueue());
    expect(record?.hasRenderCenter).toBe(true);

    // The caller rewrites its request for the next frame; the renderer holds its own lifecycle.
    request.lifecycle.startTick = 2;
    expect(record?.lifecycle).toEqual({ kind: 'oneShot', startTick: 0, durationTicks: 5 });
    renderer.upsert({ ...request, groupId: 'later' });

    expect(renderer['activeInstances'].get('reused-request')).toBe(record);
    expect(record?.lifecycle).toEqual({ kind: 'oneShot', startTick: 2, durationTicks: 5 });
    expect(record?.lifecycle).not.toBe(request.lifecycle);
    expect(renderer['groups'].get('later')).toEqual(new Set(['reused-request']));
    // As for a fresh spawn, a dynamic transform has no position until the instance is drawn again.
    expect(record?.hasRenderCenter).toBe(false);
    renderer.upsert({ ...request, lifecycle: { kind: 'manual' } });
    expect(record?.lifecycle).toEqual({ kind: 'manual' });
    expect(renderer['groups'].size).toBe(0);
  });

  it.each([
    'despawn',
    'group',
    'expiry',
    'clear',
    'graphic',
  ] as const)('starts a fresh workspace after %s without retaining historical instance buffers', (removal) => {
    const renderer = createRenderer();
    const request = {
      instanceId: 'reused-id',
      spotAnimId: TRANSPARENT_SPOTANIM_ID,
      groupId: 'effect',
      lifecycle: { kind: 'duration', startTick: 0, endTick: 1 },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      style: { requireTransparentSort: true },
    } satisfies SpotAnimSpawnRequest;
    renderer.upsert(request);
    const oldQueue = createQueue();
    renderEmbedded(renderer, oldQueue);
    const old = meshBuffers(getOnlyMeshCommand(oldQueue));
    switch (removal) {
      case 'despawn':
        renderer.despawn(request.instanceId);
        break;
      case 'group':
        renderer.despawnGroup('effect');
        break;
      case 'expiry':
        renderer.tick(1, 1);
        break;
      case 'clear':
        renderer.clearActiveInstances();
        break;
      case 'graphic':
        renderer.upsert({ ...request, spotAnimId: OPAQUE_SPOTANIM_ID });
        break;
    }

    renderer.upsert({ ...request, lifecycle: { kind: 'manual' } });
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    meshBuffers(command).forEach((buffer, index) => {
      expect(buffer.buffer).not.toBe(old[index].buffer);
      expect(buffer).toEqual(old[index]);
    });
  });

  it.each([
    'despawn',
    'group',
    'expiry',
  ] as const)('reuses surviving commands and trims the unused tail after %s', (removal) => {
    const renderer = createRenderer();
    spawnTestSpotAnim(renderer, TRANSPARENT_SPOTANIM_ID, true);
    renderer.spawn({
      instanceId: 'retiring',
      spotAnimId: TRANSPARENT_SPOTANIM_ID,
      groupId: 'retiring',
      lifecycle: { kind: 'duration', startTick: 0, endTick: 1 },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      style: { requireTransparentSort: true },
    });
    const firstQueue = createQueue();
    renderEmbedded(renderer, firstQueue);
    const first = firstQueue.commands[0];

    switch (removal) {
      case 'despawn':
        renderer.despawn('retiring');
        break;
      case 'group':
        renderer.despawnGroup('retiring');
        break;
      case 'expiry':
        renderer.tick(1, 1);
        break;
    }
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    expect(getOnlyMeshCommand(queue)).toBe(first);
    expect(renderer['commandPool']).toHaveLength(1);
    expect(firstQueue.commands).toHaveLength(2);
  });

  it('releases pooled buffer references on replay clear while preserving externally retained queues', () => {
    const renderer = createRenderer();
    spawnTestSpotAnim(renderer, TRANSPARENT_SPOTANIM_ID, true);
    const queue = createQueue();
    renderEmbedded(renderer, queue);
    const buffers = meshBuffers(getOnlyMeshCommand(queue));

    renderer.clearActiveInstances();

    expect(renderer['commandPool']).toHaveLength(0);
    expect(meshBuffers(getOnlyMeshCommand(queue))).toEqual(buffers);
  });
});

describe('SpotAnimRenderer transparent sorting', () => {
  it('marks full-sort commands animated so PicoGL uploads per-instance buffers', () => {
    const renderer = createRenderer();
    spawnTestSpotAnim(renderer, TRANSPARENT_SPOTANIM_ID, true);

    renderer.tick(0, 0);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    expect(command.meshId).toBe('test-spotanim-transparent-sorted');
    expect(command.animated).toBe(true);
    expect(Array.from(command.positions.slice(0, FAR_FACE.length))).toEqual([...FAR_FACE]);
  });

  it('resets pooled commands before reusing them for non-sorted spotanims', () => {
    const renderer = createRenderer();
    spawnTestSpotAnim(renderer, TRANSPARENT_SPOTANIM_ID, true);
    renderer.tick(0, 0);
    renderEmbedded(renderer, createQueue());
    renderer.despawn(`spotanim-${TRANSPARENT_SPOTANIM_ID}-true`);

    spawnTestSpotAnim(renderer, OPAQUE_SPOTANIM_ID, false);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    const command = getOnlyMeshCommand(queue);
    expect(command.meshId).toBe('test-spotanim-opaque');
    expect(command.animated).toBe(false);
  });

  it('applies the cached sequence height offset to the rendered model matrix', () => {
    const renderer = createRenderer();
    const cacheEntry = renderer['meshCache'].get(OPAQUE_SPOTANIM_ID);
    if (!cacheEntry) throw new Error('Expected opaque spotanim cache entry');
    Object.assign(cacheEntry, { heightOffset: 32 });
    spawnTestSpotAnim(renderer, OPAQUE_SPOTANIM_ID, false);

    const queue = createQueue();
    renderEmbedded(renderer, queue);

    expect(getOnlyMeshCommand(queue).modelMatrix[14]).toBeCloseTo(32 / 128);
  });

  it('renders the only animated frame when its progress indexes a missing later frame', () => {
    const renderer = createRenderer();
    const singleFramePart = { ...createOpaquePart(), meshId: 'test-spotanim-single-frame' };
    renderer['meshCache'].set(9003, {
      static: [],
      frames: [[singleFramePart]],
      frameLengths: [1, 1],
      frameStep: -1,
      heightOffset: 0,
    });
    renderer.spawn({
      instanceId: 'spotanim-single-frame',
      spotAnimId: 9003,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      lifecycle: { kind: 'manual' },
      frameProgress: 0.75,
    });

    const queue = createQueue();
    renderEmbedded(renderer, queue);

    expect(getOnlyMeshCommand(queue).meshId).toBe('test-spotanim-single-frame');
  });
});

describe('SpotAnimRenderer default duration', () => {
  it.each([
    { frameLengths: [], duration: 3 },
    { frameLengths: [0, 0], duration: 3 },
    { frameLengths: [15, 45], duration: 2 },
  ])('expires a one-shot using the cached duration or fallback: $frameLengths', ({ frameLengths, duration }) => {
    const renderer = createRenderer();
    const entry = renderer['meshCache'].get(OPAQUE_SPOTANIM_ID);
    if (!entry) expect.fail('Expected opaque spotanim cache entry');
    entry.frameLengths = frameLengths;
    renderer.spawn({
      instanceId: 'duration-test',
      spotAnimId: OPAQUE_SPOTANIM_ID,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      lifecycle: { kind: 'oneShot', startTick: 10 },
    });

    renderer.tick(10, 10 + duration - 0.001);
    const beforeExpiry = createQueue();
    renderEmbedded(renderer, beforeExpiry);
    renderer.tick(10 + duration, 10 + duration);
    const atExpiry = createQueue();
    renderEmbedded(renderer, atExpiry);

    expect(beforeExpiry.commands).toHaveLength(1);
    expect(atExpiry.commands).toEqual([]);
  });

  it('keeps the three-tick fallback when the cache entry is missing', () => {
    const renderer = new SpotAnimRenderer();
    renderer.spawn({
      instanceId: 'missing-cache',
      spotAnimId: 9999,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      lifecycle: { kind: 'oneShot', startTick: 10 },
    });

    renderer.tick(12, 12.999);
    expect(renderer['activeInstances'].has('missing-cache')).toBe(true);
    renderer.tick(13, 13);
    expect(renderer['activeInstances'].has('missing-cache')).toBe(false);
  });
});

describe('SpotAnimRenderer frame sounds', () => {
  const ANIMATED_SPOTANIM_ID = 9003;
  const SEQ_ID = 12099;

  function installAnimatedSpotAnim(renderer: SpotAnimRenderer): void {
    const frame = [createOpaquePart()];
    renderer['meshCache'].set(ANIMATED_SPOTANIM_ID, {
      static: [],
      frames: [frame, frame, frame, frame],
      frameLengths: [1, 1, 1, 1],
      frameStep: -1,
      heightOffset: 0,
      seqType: {
        id: SEQ_ID,
        frameSounds: new Map([[1, [{ id: 10263, loops: 0, location: 0, retain: 0 }]]]),
        isLooping: () => false,
      } as never,
    });
  }

  function spawnAt(renderer: SpotAnimRenderer, frameProgress: number): void {
    renderer.upsert({
      instanceId: 'attack-player-impact',
      spotAnimId: ANIMATED_SPOTANIM_ID,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      lifecycle: { kind: 'manual' },
      frameProgress,
    });
  }

  it('reports the same frame index the renderer is drawing', () => {
    const renderer = new SpotAnimRenderer();
    installAnimatedSpotAnim(renderer);

    for (const [progress, expected] of [
      [0, 0],
      [0.3, 1],
      [0.6, 2],
      [0.99, 3],
    ] as const) {
      spawnAt(renderer, progress);
      const [state] = renderer.getFrameStates();
      expect(state.currentFrame, `progress ${progress}`).toBe(expected);
      expect(state.seqId).toBe(SEQ_ID);
    }
  });

  it('namespaces the actor id so a controller instance id cannot collide with an npc', () => {
    const renderer = new SpotAnimRenderer();
    installAnimatedSpotAnim(renderer);
    spawnAt(renderer, 0);

    expect(renderer.getFrameStates()[0].actorId).toBe('spotanim:attack-player-impact');
  });

  it('reports nothing for a spotanim whose sequence carries no frame sounds', () => {
    const renderer = createRenderer();
    spawnTestSpotAnim(renderer, OPAQUE_SPOTANIM_ID, false);

    expect(renderer.getFrameStates()).toEqual([]);
  });
});

describe('SpotAnimRenderer view rejection', () => {
  const ID = 9005;
  /** Clip space is world space (w = 1): the view is the square x, y in [-1, 1]. */
  const WORLD_IS_CLIP = {
    viewMatrix: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    projectionMatrix: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  };
  const CULLABLE: SpotAnimStyle = { cullOutsideView: true };

  /** Two frames of the opaque test part; its model x 0..300 and z 100..200 put it at world x 0..2.3, y 0.8..1.6. */
  function install(renderer: SpotAnimRenderer, withBounds = true): void {
    const part = createOpaquePart();
    renderer['meshCache'].set(ID, {
      static: [],
      frames: [[part], [part]],
      frameLengths: [1, 1],
      frameStep: -1,
      heightOffset: 0,
      bounds: withBounds ? positionBounds(part.positions) : null,
      seqType: {
        id: 12100,
        frameSounds: new Map([[1, [{ id: 10263, loops: 0, location: 0, retain: 0 }]]]),
        isLooping: () => false,
      } as never,
    });
  }

  function spawnAt(
    renderer: SpotAnimRenderer,
    instanceId: string,
    position: [number, number, number],
    style?: SpotAnimStyle,
  ) {
    renderer.upsert({
      instanceId,
      spotAnimId: ID,
      transform: { kind: 'static', value: { position } },
      lifecycle: { kind: 'manual' },
      frameProgress: 0.75,
      style,
    });
  }

  function drawnPositions(renderer: SpotAnimRenderer): number[][] {
    const queue = createQueue();
    renderer.render(queue);
    return queue.commands.map((command) => Array.from((command as NpcMesh3DCommand).modelMatrix.slice(12, 14)));
  }

  it('leaves out only the draws of a styled instance its view excludes, and keeps the instance live', () => {
    const renderer = new SpotAnimRenderer();
    install(renderer);
    spawnAt(renderer, 'inside', [-1, -1, 0], CULLABLE);
    spawnAt(renderer, 'outside', [10, 0, 0], CULLABLE);
    spawnAt(renderer, 'unstyled', [10, 0, 0]);
    const states = () =>
      renderer.getFrameStates().map(({ actorId, currentFrame, position }) => [actorId, currentFrame, position]);

    expect(drawnPositions(renderer)).toEqual([
      [-1, -1],
      [10, 0],
      [10, 0],
    ]);
    const unculled = states();
    renderer.setViewRejection(WORLD_IS_CLIP);
    expect(drawnPositions(renderer)).toEqual([
      [-1, -1],
      [10, 0],
    ]);
    // The left-out instance keeps its timeline, frame sounds and render center.
    expect(renderer.getActiveInstanceCount()).toBe(3);
    expect(states()).toEqual(unculled);
    expect(states()).toContainEqual(['spotanim:outside', 1, [10, 0]]);

    renderer.setViewRejection(null);
    expect(drawnPositions(renderer)).toEqual([
      [-1, -1],
      [10, 0],
      [10, 0],
    ]);
  });

  it('draws a styled instance it cannot prove outside: no bounds, or a non-finite camera', () => {
    const renderer = new SpotAnimRenderer();
    install(renderer, false);
    spawnAt(renderer, 'outside', [10, 0, 0], CULLABLE);
    renderer.setViewRejection(WORLD_IS_CLIP);
    expect(drawnPositions(renderer)).toEqual([[10, 0]]);

    install(renderer);
    renderer.setViewRejection({ ...WORLD_IS_CLIP, viewMatrix: () => new Float32Array(16).fill(Number.NaN) });
    expect(drawnPositions(renderer)).toEqual([[10, 0]]);
  });

  it('forgets the view on dispose', () => {
    const renderer = new SpotAnimRenderer();
    renderer.setViewRejection(WORLD_IS_CLIP);
    renderer.dispose();
    install(renderer);
    spawnAt(renderer, 'outside', [10, 0, 0], CULLABLE);
    expect(drawnPositions(renderer)).toEqual([[10, 0]]);
  });

  it('leaves projectiles out while Hide projectiles is set, keeping them live and sounding where they fly', () => {
    const renderer = new SpotAnimRenderer();
    install(renderer);
    spawnAt(renderer, 'graphic', [-1, -1, 0]);
    renderer.upsert({
      instanceId: 'arrow',
      spotAnimId: ID,
      transform: { kind: 'static', value: { position: [10, 0, 0] } },
      lifecycle: { kind: 'manual' },
      frameProgress: 0.75,
      projectile: true,
    });

    renderer.setHideProjectiles(true);
    expect(drawnPositions(renderer)).toEqual([[-1, -1]]);
    expect(renderer.getActiveInstanceCount()).toBe(2);
    expect(renderer.getFrameStates().map(({ actorId, position }) => [actorId, position])).toContainEqual([
      'spotanim:arrow',
      [10, 0],
    ]);

    renderer.setHideProjectiles(false);
    expect(drawnPositions(renderer)).toEqual([
      [-1, -1],
      [10, 0],
    ]);
  });
});

describe('SpotAnimRenderer skeletal spotanims', () => {
  const SKELETAL_SPOTANIM_ID = 3284;
  const SKELETAL_ID = 36569088;
  const DURATION_CLIENT_TICKS = 180;

  /** A skeletal spotanim whose posed mesh differs per frame, so a frame change is observable. */
  function createLoader(poseMesh?: (frame: number) => SpotAnimMeshData) {
    const posedFrames: number[] = [];
    const loader = {
      isSkeletalOnly: (id: number) => id === SKELETAL_SPOTANIM_ID,
      loadSkeletalSpotAnimModel: (id: number) =>
        id === SKELETAL_SPOTANIM_ID
          ? {
              spotAnimId: id,
              seqType: {
                skeletalId: SKELETAL_ID,
                skeletalStart: 0,
                skeletalEnd: DURATION_CLIENT_TICKS,
                heightOffset: 0,
              },
            }
          : null,
      poseSkeletalSpotAnimMesh: (_data: unknown, _seq: unknown, frame: number) => {
        posedFrames.push(frame);
        if (poseMesh) return poseMesh(frame);
        return {
          positions: new Float32Array(NEAR_FACE),
          normals: new Float32Array(NEAR_FACE.length),
          hslColors: new Float32Array(NEAR_FACE.length / 3).fill(frame),
          alphas: new Float32Array(NEAR_FACE.length / 3).fill(1),
        };
      },
    };
    const animationSystem = { loadSkeletalSeq: (id: number) => (id === SKELETAL_ID ? { poseId: 0 } : undefined) };
    return { loader, animationSystem, posedFrames };
  }

  function loadedRenderer(poseMesh?: (frame: number) => SpotAnimMeshData) {
    const renderer = new SpotAnimRenderer();
    const { loader, animationSystem, posedFrames } = createLoader(poseMesh);
    renderer.setAnimationSystem(animationSystem as never);
    renderer.loadById(loader as never, SKELETAL_SPOTANIM_ID);
    return { renderer, loader, animationSystem, posedFrames };
  }

  function spawnDeath(renderer: SpotAnimRenderer, instanceId = 'yama-death-0'): void {
    renderer.spawn({
      instanceId,
      spotAnimId: SKELETAL_SPOTANIM_ID,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      lifecycle: { kind: 'oneShot', startTick: 0 },
    });
  }

  it('never leaves out a skeletal pose for the view: its bake bounds do not cover its poses', () => {
    const { renderer } = loadedRenderer();
    renderer.spawn({
      instanceId: 'far',
      spotAnimId: SKELETAL_SPOTANIM_ID,
      transform: { kind: 'static', value: { position: [50, 0, 0] } },
      lifecycle: { kind: 'oneShot', startTick: 0 },
      style: { cullOutsideView: true },
    });
    renderer.tick(0, 0);
    // Bounds that would place it far outside the view, were it not skeletal.
    const entry = renderer['meshCache'].get(SKELETAL_SPOTANIM_ID) ?? expect.fail('Expected skeletal entry');
    entry.bounds = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
    const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    renderer.setViewRejection({ viewMatrix: identity, projectionMatrix: identity });
    const queue = createQueue();
    renderEmbedded(renderer, queue);
    expect(queue.commands).toHaveLength(1);
  });

  it('renders a posed mesh instead of skipping the spotanim', () => {
    const { renderer, posedFrames } = loadedRenderer();
    expect(renderer.isLoaded(SKELETAL_SPOTANIM_ID)).toBe(true);

    spawnDeath(renderer);
    renderer.tick(0, 0);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    expect(queue.commands).toHaveLength(1);
    expect(posedFrames).toEqual([0]);
  });

  it.each([
    true,
    false,
  ])('replaces a visible skeletal pose with empty parts and can reappear, skip-sort=%s', (skipSort) => {
    perfFlags.skipTransparentSort = skipSort;
    const { renderer, posedFrames } = loadedRenderer((frame) => ({
      positions: new Float32Array(NEAR_FACE),
      hslColors: new Float32Array(3).fill(100),
      alphas: new Float32Array(3).fill(frame === 90 ? 0 : 0.5),
      faceBias: new Float32Array(3),
      modelFaceIndices: new Uint32Array([0]),
    }));
    renderer.setSorterProjection({
      cameraX: 0,
      cameraY: 0,
      cameraZ: -1000,
      yawSin: 0,
      yawCos: 1,
      pitchSin: 0,
      pitchCos: 1,
    });
    const poser = renderer['skeletalPosers'].get(SKELETAL_SPOTANIM_ID);
    if (!poser) expect.fail('Expected poser');
    spawnDeath(renderer);

    for (const tick of [0, 3, 3, 0, 3]) {
      renderer.tick(tick, tick);
      const queue = createQueue();
      renderEmbedded(renderer, queue);
      expect(queue.commands).toHaveLength(tick === 3 ? 0 : 1);
      expect(poser.partsFor(tick === 3 ? 90 : 0)).toHaveLength(tick === 3 ? 0 : 1);
      expect(renderer.getActiveInstanceCount()).toBe(1);
      expect(renderer['commandPool']).toHaveLength(tick === 3 ? 0 : 1);
    }
    // Consecutive renders of an empty pose use its cached empty result, not the previous visible pose.
    expect(posedFrames).toEqual([0, 90, 0, 90]);
  });

  it('sorts distinct skeletal poses using their current alpha without mutating earlier queued buffers', () => {
    const fixture = priorityFixture([
      { depth: 300, priority: 5 },
      { depth: 100, priority: 0 },
    ]);
    const { renderer } = loadedRenderer((frame) => {
      fixture.model.verticesZ.set(frame === 0 ? [300, 300, 300, 100, 100, 100] : [200, 200, 200, 400, 400, 400]);
      fixture.model.faceAlphas.set(frame === 0 ? [64, 64] : [0, 96]);
      const mesh = fixture.loader.loadSpotAnimMesh(9004);
      if (!mesh) expect.fail('Expected posed mesh');
      return mesh;
    });
    renderer.setSorterProjection({
      cameraX: 0,
      cameraY: 0,
      cameraZ: -1000,
      yawSin: 0,
      yawCos: 1,
      pitchSin: 0,
      pitchCos: 1,
    });
    for (const frameProgress of [0, 0.5]) {
      renderer.spawn({
        spotAnimId: SKELETAL_SPOTANIM_ID,
        frameProgress,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        style: { requireTransparentSort: true },
      });
    }
    const queue = createQueue();

    renderEmbedded(renderer, queue);

    const commands = queue.commands.filter(isNpcMeshCommand);
    expect(commands.map(faceDepths)).toEqual([[300, 100], [200], [400]]);
    expect(commands[0].perVertexAlphas?.[0]).toBeCloseTo(191 / 255);
    expect(commands[2].perVertexAlphas?.[0]).toBeCloseTo(159 / 255);
    expect(commands[0].positions.buffer).not.toBe(commands[2].positions.buffer);
    expect(commands.every((command) => command.animated)).toBe(true);
    expect(commands.every((command) => command.cullFace === 'back')).toBe(true);
  });

  it('reuses all four instance buffers across skeletal poses without changing posed source arrays', () => {
    const fixture = priorityFixture([
      { depth: 100, priority: 0 },
      { depth: 200, priority: 0 },
    ]);
    const { renderer } = loadedRenderer((frame) => {
      fixture.model.verticesZ.set(frame === 0 ? [100, 100, 100, 200, 200, 200] : [400, 400, 400, 300, 300, 300]);
      fixture.model.faceAlphas.set(frame === 0 ? [64, 96] : [32, 128]);
      const mesh = fixture.loader.loadSpotAnimMesh(9004);
      if (!mesh) expect.fail('Expected posed mesh');
      return mesh;
    });
    renderer.setSorterProjection({
      cameraX: 0,
      cameraY: 0,
      cameraZ: -1000,
      yawSin: 0,
      yawCos: 1,
      pitchSin: 0,
      pitchCos: 1,
    });
    const poser = renderer['skeletalPosers'].get(SKELETAL_SPOTANIM_ID);
    if (!poser) expect.fail('Expected poser');
    let first: Float32Array[] | undefined;

    for (const progress of [0, 0.5, 0, 0.5]) {
      const source = poser.partsFor(poser.frameAt(progress))[0];
      const original = meshBuffers(source).map((buffer) => buffer.slice());
      renderer.upsert({
        instanceId: 'skeletal-reuse',
        spotAnimId: SKELETAL_SPOTANIM_ID,
        frameProgress: progress,
        lifecycle: { kind: 'manual' },
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        style: { requireTransparentSort: true },
      });
      const queue = createQueue();
      renderEmbedded(renderer, queue);

      const command = getOnlyMeshCommand(queue);
      expectPermutation(command, source, progress === 0 ? [1, 0] : [0, 1]);
      const buffers = meshBuffers(command);
      const prior = first;
      if (prior)
        buffers.forEach((buffer, index) => {
          expect(buffer.buffer).toBe(prior[index].buffer);
        });
      first ??= buffers;
      expect(meshBuffers(source)).toEqual(original);
    }
  });

  it('marks posed commands animated so the per-frame buffers are re-uploaded', () => {
    const { renderer } = loadedRenderer();
    spawnDeath(renderer);
    renderer.tick(0, 0);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    // The meshId is stable across poses, so without this PicoGL would keep drawing frame 0.
    expect(getOnlyMeshCommand(queue).animated).toBe(true);
  });

  it('advances the posed frame across the sequence, then expires when the clip ends', () => {
    const { renderer, posedFrames } = loadedRenderer();
    spawnDeath(renderer);

    // DURATION_CLIENT_TICKS/30 = exactly 6 game ticks, so 5.99 is the last frame that renders.
    for (const tick of [0, 3, 5.99]) {
      renderer.tick(tick, tick);
      renderEmbedded(renderer, createQueue());
    }
    expect(posedFrames).toEqual([0, 90, DURATION_CLIENT_TICKS - 1]);

    // Publishing the skeletal duration as a frame length is what lets the shared lifecycle
    // expiry retire the instance on time instead of after its 3-tick default.
    renderer.tick(6, 6);
    const queue = createQueue();
    renderEmbedded(renderer, queue);
    expect(queue.commands).toEqual([]);
  });

  it('holds the spotanim unloaded until an animation system arrives, then prepares it', () => {
    const renderer = new SpotAnimRenderer();
    const { loader, animationSystem } = createLoader();

    // Scene load order is not guaranteed: the spotanim effect can run before the NPC one.
    renderer.loadById(loader as never, SKELETAL_SPOTANIM_ID);
    expect(renderer.isLoaded(SKELETAL_SPOTANIM_ID)).toBe(false);

    renderer.setAnimationSystem(animationSystem as never);
    expect(renderer.isLoaded(SKELETAL_SPOTANIM_ID)).toBe(true);
  });

  it('stays loaded but silent when the skeletal sequence is missing from the cache', () => {
    const renderer = new SpotAnimRenderer();
    const { loader } = createLoader();
    renderer.setAnimationSystem({ loadSkeletalSeq: () => undefined } as never);
    renderer.loadById(loader as never, SKELETAL_SPOTANIM_ID);

    expect(renderer.isLoaded(SKELETAL_SPOTANIM_ID)).toBe(true);
    spawnDeath(renderer);
    renderer.tick(0, 0);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    expect(queue.commands).toEqual([]);
  });

  it('gives two instances on different frames their own buffers', () => {
    const { renderer } = loadedRenderer();
    spawnDeath(renderer, 'death-a');
    renderer.spawn({
      instanceId: 'death-b',
      spotAnimId: SKELETAL_SPOTANIM_ID,
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      // Three game ticks behind, so this instance is mid-sequence while the other is on frame 0.
      lifecycle: { kind: 'oneShot', startTick: 3 },
    });

    renderer.tick(3, 3);
    const queue = createQueue();
    renderEmbedded(renderer, queue);

    // One live model is shared per spotanim id, so a rebuild that refilled buffers in place would
    // leave both queued commands showing whichever frame was posed last.
    expect(queue.commands).toHaveLength(2);
    const [first, second] = queue.commands;
    if (!isNpcMeshCommand(first) || !isNpcMeshCommand(second)) {
      throw new Error('Expected two mesh3d commands');
    }
    expect(first.perVertexHslColors).not.toBe(second.perVertexHslColors);
    // The fake colors each vertex with its frame index, so identical colors mean aliased buffers.
    expect(first.perVertexHslColors?.[0]).not.toBe(second.perVertexHslColors?.[0]);
  });

  it('publishes one frame length per client tick so the sequence is scrubbable', () => {
    const { renderer } = loadedRenderer();

    // The cache explorer preview derives its frame count from this; a single total reads as 1 frame.
    expect(renderer.getFrameLengths(SKELETAL_SPOTANIM_ID)).toHaveLength(DURATION_CLIENT_TICKS);
  });
  it('draws a posed part whose triangles repeat a corner even where zero-area parts are skipped', () => {
    const degenerate = [...NEAR_FACE.slice(0, 3), ...NEAR_FACE.slice(0, 3), ...NEAR_FACE.slice(6, 9)];
    const { renderer } = loadedRenderer(() => ({
      positions: new Float32Array(degenerate),
      hslColors: new Float32Array(3).fill(1),
      alphas: new Float32Array(3).fill(1),
      faceBias: new Float32Array(3),
      modelFaceIndices: new Uint32Array([0]),
    }));
    renderer.setZeroAreaPartSkip([SKELETAL_SPOTANIM_ID]);
    spawnDeath(renderer);
    const queue = createQueue();
    renderer.render(queue);
    // The certificate is a bake's, for scene-base geometry it never changes; a pose is neither.
    expect(queue.commands.filter((command) => command.kind === 'mesh3d')).toHaveLength(1);
  });
});

describe('repeated-corner certificate', () => {
  const A = [1, 2, 3];
  const B = [4, 5, 6];
  const C = [7, 8, 9];
  const soup = (...corners: number[][]) => new Float32Array(corners.flat());

  it.each([
    ['first two', [A, A, B]],
    ['last two', [B, A, A]],
    ['first and last', [A, B, A]],
  ])('certifies a triangle whose %s corners repeat', (_, corners) => {
    expect(hasOnlyRepeatedCornerTriangles(soup(...corners), undefined)).toBe(true);
    expect(hasOnlyRepeatedCornerTriangles(soup(...corners), new Float32Array(3))).toBe(true);
  });

  it('needs every triangle: one with three distinct corners is not certified', () => {
    expect(hasOnlyRepeatedCornerTriangles(soup(A, A, B, A, B, C), undefined)).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, B, C), undefined)).toBe(false);
  });

  it('compares the effective face bias exactly: absent is +0, -0 is not +0, a mismatch is not certified', () => {
    const positions = soup(A, A, B);
    expect(hasOnlyRepeatedCornerTriangles(positions, new Float32Array([2, 2, 7]))).toBe(true);
    expect(hasOnlyRepeatedCornerTriangles(positions, new Float32Array([2, 3, 2]))).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(positions, new Float32Array([-0, 0, 5]))).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, [1, 2, -0], B), undefined)).toBe(false);
  });

  it('vouches for nothing malformed or non-finite', () => {
    expect(hasOnlyRepeatedCornerTriangles(new Float32Array(0), undefined)).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, A), undefined)).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, A, B), new Float32Array(2))).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup([Number.NaN, 0, 0], [Number.NaN, 0, 0], B), undefined)).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, A, [Number.POSITIVE_INFINITY, 0, 0]), undefined)).toBe(false);
    expect(hasOnlyRepeatedCornerTriangles(soup(A, A, B), new Float32Array([0, 0, Number.NaN]))).toBe(false);
  });

  const mesh = (positions: number[]): SpotAnimMeshData => ({
    positions: new Float32Array(positions),
    hslColors: new Float32Array(positions.length / 3).fill(5),
    alphas: new Float32Array(positions.length / 3).fill(1),
    faceBias: new Float32Array(positions.length / 3),
    modelFaceIndices: Uint32Array.from({ length: positions.length / 9 }, (_, face) => face),
  });

  it('is set on baked parts only, and kept, with the same part numbering, when they become resident', () => {
    const flat = mesh([...A, ...A, ...B]);
    const parts = createSpotAnimMeshParts('flat', flat);
    expect(parts.map((part) => part.hasOnlyRepeatedCornerTriangles)).toEqual([true]);
    expect(createSpotAnimMeshParts('posed', flat, true)[0]).not.toHaveProperty('hasOnlyRepeatedCornerTriangles');
    expect(createSpotAnimMeshParts('solid', mesh([...A, ...B, ...C]))[0]).not.toHaveProperty(
      'hasOnlyRepeatedCornerTriangles',
    );
    const frames = [createSpotAnimMeshParts('solid', mesh([...A, ...B, ...C])), parts];
    const source = new ImmutableMeshSource('certified', spotAnimOpaqueUploads(frames), () => []);
    const resident = withResidentOpaqueParts(frames, source);
    // Kept parts are still numbered as the source's parts: the certificate removes nothing from it.
    expect(source.parts).toHaveLength(2);
    expect(
      resident.map((frame) => frame.map((part) => [part.resident?.part, part.hasOnlyRepeatedCornerTriangles])),
    ).toEqual([[[0, undefined]], [[1, true]]]);
  });
});

describe('SpotAnimRenderer batchable families', () => {
  /** `count` faces alternating opaque and transparent: two parts per frame of 1.5 × count corners each. */
  const faces = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      depth: 100 + index,
      priority: 0,
      alpha: index % 2 ? undefined : 0,
    }));
  /** Two frames × two parts of 1.5 × count corners: see {@link instanceAtlasBoundBytes}. */
  const boundOf = (count: number) => instanceAtlasBoundBytes([1, 1, 1, 1].map(() => 1.5 * count));

  function drawAtlases(renderer: SpotAnimRenderer, spotAnimId = 9004) {
    renderer.clearActiveInstances();
    renderer.upsert({
      instanceId: `draw-${spotAnimId}`,
      spotAnimId,
      lifecycle: { kind: 'manual' },
      transform: { kind: 'static', value: { position: [0, 0, 0] } },
      frameProgress: 0,
    });
    const queue = createQueue();
    renderer.render(queue);
    return queue.commands.filter((command) => command.kind === 'mesh3d').map((command) => command.instanceAtlas);
  }
  const atlasSources = (renderer: SpotAnimRenderer) =>
    renderer.getResidentMeshSources().filter((source) => source.use === 'instanceAtlas');

  it('admits families in order while their bounds fit one allowance, building nothing for the rest', () => {
    const { renderer, loader } = priorityFixture(faces(3000), true);
    renderer.loadById(loader, 9005);
    const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');
    renderer.setBatchableSpotAnimFamilies([[9004], [9005]]);
    // 2 × 648,000 bytes is over 1 MiB: the second family is left out before anything is baked for it.
    expect(boundOf(3000)).toBe(648_000);
    expect(bake.mock.calls).toEqual([[9004]]);
    const [first] = atlasSources(renderer);
    expect(first?.id).toBe('spotanim-atlas-9004');
    expect(drawAtlases(renderer, 9005)).toEqual([undefined, undefined]);
    expect(drawAtlases(renderer, 9004).every((atlas) => atlas === first)).toBe(true);

    // Removing the first family retires its atlas and leaves its share to the next.
    renderer.setBatchableSpotAnimFamilies([[9005]]);
    expect(first?.retired).toBe(true);
    const [second] = atlasSources(renderer);
    expect(second?.id).toBe('spotanim-atlas-9005');
    expect(drawAtlases(renderer, 9005).every((atlas) => atlas === second)).toBe(true);
    // Listed again ahead of it, it is admitted anew and the other is dropped, its atlas retired.
    renderer.setBatchableSpotAnimFamilies([[9004], [9005]]);
    expect(second?.retired).toBe(true);
    expect(atlasSources(renderer).map((source) => source.id)).toEqual(['spotanim-atlas-9004']);
    expect(drawAtlases(renderer, 9005)).toEqual([undefined, undefined]);
  });

  it('rejects a family whose bound alone is over the allowance without baking anything, and draws it singly', () => {
    const { renderer, loader } = priorityFixture(faces(6000), true);
    const bake = vi.spyOn(loader, 'loadAnimatedSpotAnim');
    renderer.setBatchableSpotAnimFamilies([[9004]]);
    expect(boundOf(6000)).toBeGreaterThan(1024 * 1024);
    const atlases = drawAtlases(renderer);
    // Drawn as without families: every part, none carrying an atlas.
    expect(atlases).toEqual([undefined, undefined]);
    expect(atlasSources(renderer)).toEqual([]);
    expect(bake).not.toHaveBeenCalled();
  });

  it('sorts ids, drops empty families, keeps a family listed again, and rejects a repeated id whole', () => {
    const { renderer, loader } = priorityFixture([{ depth: 100, priority: 0 }], true);
    renderer.loadById(loader, 9005);
    renderer.setBatchableSpotAnimFamilies([[9005, 9004], []]);
    // One family, its ids sorted: its atlas lists 9004's parts, then 9005's.
    const [atlas] = atlasSources(renderer);
    expect(atlas?.id).toBe('spotanim-atlas-9004-9005');
    expect(drawAtlases(renderer, 9004).every((drawn) => drawn === atlas)).toBe(true);
    renderer.setBatchableSpotAnimFamilies([[9004, 9005]]);
    expect(atlasSources(renderer)).toEqual([atlas]);
    expect(atlas?.retired).toBe(false);

    expect(() => renderer.setBatchableSpotAnimFamilies([[9006], [9004, 9006]])).toThrow(/9006/);
    expect(() => renderer.setBatchableSpotAnimFamilies([[9006, 9006]])).toThrow(/9006/);
    // Nothing changed: the same family, the same live atlas, and 9006 is in none.
    expect(atlasSources(renderer)).toEqual([atlas]);
    expect(drawAtlases(renderer, 9005).every((drawn) => drawn === atlas)).toBe(true);
    expect(atlas?.retired).toBe(false);
  });

  it('evaluates nothing again while the bakes stay the same, and retires every atlas on dispose', () => {
    const { renderer } = priorityFixture([{ depth: 100, priority: 0 }], true);
    renderer.setBatchableSpotAnimFamilies([[9004]]);
    drawAtlases(renderer);
    const bound = vi.spyOn(renderer as never, 'familyBoundBytes');
    const admit = vi.spyOn(renderer as never, 'admitBatchFamilies');
    for (let frame = 0; frame < 3; frame++) drawAtlases(renderer);
    expect(bound).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
    const [atlas] = atlasSources(renderer);
    renderer.dispose();
    expect(atlas?.retired).toBe(true);
  });
});

describe('SpotAnimRenderer zero-area part skip', () => {
  /** The opaque face repeats a corner; one of the two transparent faces does not. */
  function fixture() {
    return priorityFixture(
      [
        { depth: 300, priority: 0, alpha: 0 },
        { depth: 200, priority: 0 },
        { depth: 100, priority: 0 },
      ],
      true,
      (model) => {
        model.verticesY[1] = 0;
        model.verticesY[4] = 0;
      },
    );
  }

  function frame(renderer: SpotAnimRenderer) {
    renderer.upsert({
      instanceId: 'beam',
      spotAnimId: 9004,
      lifecycle: { kind: 'oneShot', startTick: 0 },
      transform: { kind: 'static', value: { position: [3, 4, 0] } },
      frameProgress: 0,
    });
    const queue = createQueue();
    renderer.render(queue);
    return { meshIds: queue.commands.map((command) => (command.kind === 'mesh3d' ? command.meshId : '')), renderer };
  }

  it('leaves out only the certified parts of the listed spotanims, and nothing else about the instance', () => {
    const full = fixture().renderer;
    const parts = full['meshCache'].get(9004)?.frames[0] ?? expect.fail('Expected baked frames');
    expect(parts.map((part) => [part.blend ?? 'opaque', part.hasOnlyRepeatedCornerTriangles])).toEqual([
      ['opaque', true],
      ['normal', undefined],
    ]);
    const drawn = frame(full);
    expect(drawn.meshIds).toEqual(['spotanim-9004-frame-0-opaque', 'spotanim-9004-frame-0-transparent']);

    const skipping = fixture().renderer;
    skipping.setZeroAreaPartSkip([9005]);
    expect(frame(skipping).meshIds).toEqual(drawn.meshIds);
    skipping.setZeroAreaPartSkip([9004]);
    const skipped = frame(skipping);
    expect(skipped.meshIds).toEqual(['spotanim-9004-frame-0-transparent']);
    expect(skipping.getActiveInstanceCount()).toBe(full.getActiveInstanceCount());
    expect(JSON.stringify(skipping.getFrameStates())).toBe(JSON.stringify(full.getFrameStates()));
    expect(skipping['activeInstances'].get('beam')?.renderCenter).toEqual(
      full['activeInstances'].get('beam')?.renderCenter,
    );
    // The resident source keeps every part: nothing was removed from what the renderer uploads.
    expect(skipping.getResidentMeshSources()[0]?.parts).toHaveLength(2);
  });
});
