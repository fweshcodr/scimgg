import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NpcModelData, NpcModelLoader } from '../../rs/model/NpcModelLoader';
import type { AnimationSystem } from '../core/animation';
import { createProjection3D } from '../projections/Projection3D';
import { framePortraitCamera } from './bossPortraitFraming';
import { createBossPortraitPoser } from './bossPortraitPoser';

// Each soup vertex is a model vertex as posed, so a test reads the pose straight off it.
vi.mock('../../rs/model/NpcModelLoader', () => ({
  modelDataToMesh: vi.fn((model: FakeModel) => ({
    positions: Float32Array.from(
      Array.from(model.verticesX, (x, i) => [x, model.verticesY[i], model.verticesZ[i]]).flat(),
    ),
    normals: new Float32Array(),
    hslColors: new Float32Array(),
    // As modelDataToMesh decodes them: face alpha 255 is fully transparent.
    alphas: Float32Array.from(model.verticesX, (_, i) => (255 - ((model.faceAlphas?.[i] ?? 0) & 0xff)) / 255),
    faceBias: new Float32Array(),
    modelFaceIndices: new Uint32Array(),
  })),
}));

interface FakeModel {
  verticesX: Int32Array;
  verticesY: Int32Array;
  verticesZ: Int32Array;
  faceAlphas: Int8Array | undefined;
  computeAnimationTables: () => void;
  /** Frame ids are offsets added to X, so the applied frame shows in the pose. */
  animate: (frame: { id: number }) => void;
  animateSkeletal: (seq: unknown, frame: number) => void;
  resize: (x: number, y: number, z: number) => void;
}

/** One vertex at (0, -256, 128): two tiles up and one tile north, before any pose. */
function fakeModel(): FakeModel {
  const model: FakeModel = {
    verticesX: Int32Array.of(0),
    verticesY: Int32Array.of(-256),
    verticesZ: Int32Array.of(128),
    faceAlphas: undefined,
    computeAnimationTables: vi.fn(),
    animate: vi.fn((frame) => {
      model.verticesX[0] += frame.id;
    }),
    animateSkeletal: vi.fn((_seq, frame) => {
      model.verticesX[0] += frame;
    }),
    resize: vi.fn((x) => {
      model.verticesX[0] = (model.verticesX[0] * x) / 128;
    }),
  };
  return model;
}

function loaders(
  seq: Record<string, unknown> | undefined,
  options: { widthScale?: number; npcIdle?: number } = {},
): { npcModelLoader: NpcModelLoader; animationSystem: AnimationSystem; model: FakeModel } {
  const model = fakeModel();
  const npcModelLoader = {
    loadNpcModelData: () =>
      ({
        mergedModel: model,
        litColors: null,
        widthScale: options.widthScale ?? 128,
        heightScale: 128,
      }) as unknown as NpcModelData,
    loadNpcType: () => ({ idleSeqId: options.npcIdle ?? 5 }),
  } as unknown as NpcModelLoader;
  const animationSystem = {
    isInitialized: () => true,
    loadSeqType: vi.fn(() => seq),
    loadSkeletalSeq: vi.fn(() => ({ skeletal: true })),
    loadFrame: vi.fn((id: number) => ({ id })),
  } as unknown as AnimationSystem;
  return { npcModelLoader, animationSystem, model };
}

const frameSeq = (frameIds: number[], frameLengths: number[]) => ({
  isSkeletalSeq: () => false,
  frameIds,
  frameLengths,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('createBossPortraitPoser', () => {
  it('plays frame seqs by their client-tick lengths, wrapping at the cycle end, from the rest pose each time', () => {
    const { npcModelLoader, animationSystem } = loaders(frameSeq([100, 200, 300], [2, 0, 3]));
    const poser = createBossPortraitPoser(npcModelLoader, animationSystem, { npcTypeId: 1 });
    if (!poser) throw new Error('no poser');

    // 2 + 1 (a zero length still shows its frame) + 3 ticks of 20ms.
    expect(poser.cycleMs).toBe(120);
    const xAt = (ms: number) => poser.poseAt(ms).positions[0];
    expect([xAt(0), xAt(39), xAt(40), xAt(60), xAt(119), xAt(120)]).toEqual([100, 100, 200, 300, 300, 100]);
    expect(animationSystem.loadSeqType).toHaveBeenCalledWith(5);
  });

  it('plays skeletal seqs from their start frame, and an override replaces the npc type idle', () => {
    const { npcModelLoader, animationSystem, model } = loaders({
      isSkeletalSeq: () => true,
      skeletalId: 9,
      skeletalStart: 10,
      skeletalEnd: 40,
    });
    const poser = createBossPortraitPoser(npcModelLoader, animationSystem, { npcTypeId: 1, idleSeqId: 77 });
    if (!poser) throw new Error('no poser');

    expect(animationSystem.loadSeqType).toHaveBeenCalledWith(77);
    expect(animationSystem.loadSkeletalSeq).toHaveBeenCalledWith(9);
    expect(poser.cycleMs).toBe(600);
    expect(poser.poseAt(100).positions[0]).toBe(15);
    expect(model.animateSkeletal).toHaveBeenLastCalledWith({ skeletal: true }, 15);
  });

  it('holds the rest pose with no stand seq, and gives the first pose in world tiles', () => {
    const { npcModelLoader, animationSystem } = loaders(undefined, { widthScale: 256 });
    const poser = createBossPortraitPoser(npcModelLoader, animationSystem, { npcTypeId: 1 });
    if (!poser) throw new Error('no poser');

    expect(poser.cycleMs).toBe(0);
    // Model -Y is up and +Z north; widthScale doubled X, which was 0.
    expect([...poser.points]).toEqual([0, 1, 2]);
    expect(poser.poseAt(5000).positions[1]).toBe(-256);
  });

  it('leaves fully transparent vertices out of the framing points', () => {
    const { npcModelLoader, animationSystem, model } = loaders(undefined);
    model.verticesX = Int32Array.of(0, 640);
    model.verticesY = Int32Array.of(-256, -256);
    model.verticesZ = Int32Array.of(128, 128);
    model.faceAlphas = Int8Array.of(0, -1);
    const poser = createBossPortraitPoser(npcModelLoader, animationSystem, { npcTypeId: 1 });
    if (!poser) throw new Error('no poser');

    expect([...poser.points]).toEqual([0, 1, 2]);
  });

  it('is null when the npc model does not load', () => {
    const { animationSystem } = loaders(undefined);
    const npcModelLoader = { loadNpcModelData: () => undefined } as unknown as NpcModelLoader;
    expect(createBossPortraitPoser(npcModelLoader, animationSystem, { npcTypeId: 1 })).toBeNull();
  });
});

describe('framePortraitCamera', () => {
  /** Where `framing` puts world point `[x, y, z]` in normalized device coordinates, at the portrait's size. */
  function projector(
    points: Float32Array,
    framing: Parameters<typeof framePortraitCamera>[1],
    width = 56,
    height = 56,
  ) {
    const projection = createProjection3D({ width, height, dpr: 2 }, framePortraitCamera(points, framing));
    const view = projection.viewMatrix();
    const proj = projection.projectionMatrix();
    const transform = (m: Float32Array, v: readonly number[]) =>
      [0, 1, 2, 3].map((row) => v.reduce((sum, value, column) => sum + m[column * 4 + row] * value, 0));
    return (point: readonly number[]): [number, number] => {
      const clip = transform(proj, transform(view, [...point, 1]));
      return [clip[0] / clip[3], clip[1] / clip[3]];
    };
  }

  /**
   * A boss shaped like the real ones: a head-and-body column a tile in front of its box's middle,
   * with wide wings behind it from shoulder height to above the head. The box's middle is empty air.
   */
  const HEAD = [0.4, -1, 3.5] as const;
  function wingedBoss(): Float32Array {
    const points: number[] = [];
    for (let z = 0; z <= 4; z += 0.125) {
      points.push(HEAD[0], HEAD[1], z);
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * 2 * Math.PI;
        points.push(HEAD[0] + 0.3 * Math.cos(angle), HEAD[1] + 0.3 * Math.sin(angle), z);
      }
    }
    for (let z = 2; z <= 5; z += 0.125) points.push(-3, 2, z, 3.5, 2.5, z);
    return Float32Array.from(points);
  }

  it.each([0, -30, 30, -45])('keeps a head in front of the box centered in the frame at yaw %i', (yaw) => {
    // The wings make the box 5 tall from z 0, so the head at 3.5 is focus height 0.7.
    const project = projector(wingedBoss(), { yaw, pitch: -12, focusHeight: 0.7, span: 0.6 });
    const [x, y] = project(HEAD);
    // Orbiting the box's middle instead put this head 0.86 of the way to the frame's right edge
    // at yaw -30, and 0.15 off even at yaw 0.
    expect(Math.abs(x)).toBeLessThan(0.02);
    expect(Math.abs(y)).toBeLessThan(0.02);
    // The head's own width stays inside the frame with margin.
    for (const dx of [-0.3, 0.3]) expect(Math.abs(project([HEAD[0] + dx, HEAD[1], HEAD[2]])[0])).toBeLessThan(0.5);
  });

  it('aims at the focus height and fits the span of the height to the square frame', () => {
    const project = projector(wingedBoss(), { yaw: 0, pitch: 0, focusHeight: 0.7, span: 0.5 });
    // Level with the camera, half the span (1.25 of the 5-tile height) above and below the aim
    // point lands on the frame edges.
    expect(project(HEAD)[1]).toBeCloseTo(0, 6);
    expect(project([HEAD[0], HEAD[1], HEAD[2] + 1.25])[1]).toBeCloseTo(1, 2);
    expect(project([HEAD[0], HEAD[1], HEAD[2] - 1.25])[1]).toBeCloseTo(-1, 2);
  });

  it("orbits the box's middle when nothing is at the focus height", () => {
    const points = Float32Array.of(-1, 2, -1, 3, 4, 5);
    const camera = framePortraitCamera(points, { yaw: 0, pitch: 0, focusHeight: 0.75, span: 0.5 });
    expect(camera).toMatchObject({ targetX: 1, targetY: 3, targetZ: 3.5 });
  });

  it.each([
    [88, 86],
    [68, 96],
    [120, 60],
  ])('preserves vertical framing without stretching at %i × %i', (width, height) => {
    const project = projector(wingedBoss(), { yaw: 0, pitch: 0, focusHeight: 0.7, span: 0.5 }, width, height);
    const center = project(HEAD);
    expect(center[0]).toBeCloseTo(0, 6);
    expect(center[1]).toBeCloseTo(0, 6);
    // Projection3D floors viewportZoom to raster pixels; allow less than one CSS pixel.
    expect((Math.abs(project([HEAD[0], HEAD[1], HEAD[2] + 1.25])[1] - 1) * height) / 2).toBeLessThan(1);
    const horizontalPixels = (project([HEAD[0] + 0.25, HEAD[1], HEAD[2]])[0] * width) / 2;
    const verticalPixels = (project([HEAD[0], HEAD[1], HEAD[2] + 0.25])[1] * height) / 2;
    expect(Math.abs(horizontalPixels)).toBeCloseTo(Math.abs(verticalPixels), 4);
  });
});
