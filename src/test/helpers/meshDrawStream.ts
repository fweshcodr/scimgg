import { createHash } from 'node:crypto';
import type { NpcMesh3DCommand, RenderCommand } from '../../render/core/commands';

export interface DrawRecord {
  readonly frame: number;
  readonly meshId: string;
  /** Part, render state, matrix and vertex digests; mesh id spelling excluded. */
  readonly line: string;
}

/** Attributes left out of the digest, for changes to them that a dedicated test covers instead. */
export interface DrawDigestOptions {
  readonly omitNormals?: boolean;
  readonly omitAlphas?: (meshId: string) => boolean;
}

type TypedArray = Float32Array | Float64Array | Uint16Array | Uint32Array;

/**
 * Records mesh draws, in order, as comparable lines. `vertices: 'gpu'` reports the vertex data a
 * mesh-id keyed GPU cache holds, i.e. what the first command with that id uploaded since the last
 * context restore (how `PicoGLRenderer` caches static meshes); `'own'` reports each command's own
 * arrays, i.e. what was baked for that draw. Ids are reduced to their `frame-N-part` suffix so two
 * renderers that spell ids differently can be compared draw for draw.
 */
export class MeshDrawRecorder {
  readonly records: DrawRecord[] = [];
  private readonly resident = new Map<string, NpcMesh3DCommand>();
  private frameIndex = 0;

  constructor(
    private readonly vertices: 'gpu' | 'own',
    private readonly digest: DrawDigestOptions = {},
  ) {}

  frame(commands: readonly RenderCommand[]): void {
    for (const command of commands) {
      if (command.kind !== 'mesh3d' || !('positions' in command)) continue;
      const mesh = command as NpcMesh3DCommand;
      const uploaded = this.resident.get(mesh.meshId) ?? mesh;
      this.resident.set(mesh.meshId, uploaded);
      this.records.push({
        frame: this.frameIndex,
        meshId: mesh.meshId,
        line: describeDraw(mesh, this.vertices === 'gpu' ? uploaded : mesh, this.digest),
      });
    }
    this.frameIndex++;
  }

  /** WebGL context loss and restore, or VAO eviction: every mesh is rebuilt from its next command. */
  contextRestore(): void {
    this.resident.clear();
  }
}

function describeDraw(command: NpcMesh3DCommand, vertices: NpcMesh3DCommand, options: DrawDigestOptions): string {
  const scalars = {
    part: command.meshId.replace(/^.*-frame-/, 'frame-'),
    materialId: command.materialId,
    depth: command.depth,
    blend: command.blend,
    cullFace: command.cullFace,
    zIndex: command.zIndex,
    depthBias: command.depthBias,
    shaderId: command.shaderId,
    transparentOrder: command.transparentOrder,
    animated: command.animated,
    uniforms: command.uniforms,
  };
  const indexed = vertices as NpcMesh3DCommand & { indices?: Uint16Array | Uint32Array };
  const arrays: Record<string, TypedArray | undefined> = {
    matrix: command.modelMatrix,
    positions: vertices.positions,
    ...(options.omitNormals ? {} : { normals: vertices.normals }),
    hsl: vertices.perVertexHslColors,
    ...(options.omitAlphas?.(command.meshId) ? {} : { alphas: vertices.perVertexAlphas }),
    faceBias: vertices.perVertexFaceBias,
    colors: vertices.colors,
    uvs: vertices.uvs,
    textureIds: vertices.perVertexTextureIds,
    indices: indexed.indices,
    world: worldPositions(command.modelMatrix, vertices.positions),
  };
  const digests = Object.entries(arrays).map(([key, array]) => `${key}=${array ? digest(array) : '-'}`);
  return `${JSON.stringify(scalars)} ${digests.join(' ')}`;
}

function worldPositions(m: Float32Array, positions: Float32Array): Float64Array {
  const world = new Float64Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    world[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    world[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    world[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return world;
}

function digest(array: TypedArray): string {
  const hash = createHash('sha1');
  hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  return `${array.length}:${hash.digest('hex').slice(0, 16)}`;
}

/** Compares draw streams line by line and returns the first divergence, or null when identical. */
export function firstDrawDifference(
  actual: readonly DrawRecord[],
  expected: readonly DrawRecord[],
): { index: number; actual?: DrawRecord; expected?: DrawRecord } | null {
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index++) {
    if (actual[index]?.line !== expected[index]?.line || actual[index]?.frame !== expected[index]?.frame) {
      return { index, actual: actual[index], expected: expected[index] };
    }
  }
  return null;
}

/**
 * One scenario as a pinned revision drew it. `frames` holds `"<draws>:<hash>"` per drawn frame,
 * hashing that frame's draw lines with each command's own vertices. `gpuStale` lists the draws whose
 * GPU-cached vertices (see {@link MeshDrawRecorder}) were not their own bake on that revision, with
 * the pinned revision's mesh id and the hash of the line the GPU actually drew.
 */
export interface ScenarioGolden {
  readonly frames: readonly string[];
  readonly gpuStale: readonly (readonly [frame: number, draw: number, meshId: string, gpuLine: string])[];
}

export interface DrawGoldenFile {
  readonly about: string;
  readonly regenerate: string;
  readonly cache: { readonly file: string; readonly sha256: string };
  readonly digest: string;
  readonly scenarios: Readonly<Record<string, ScenarioGolden>>;
}

export function hashLine(line: string): string {
  return createHash('sha1').update(line).digest('hex').slice(0, 16);
}

function byFrame(records: readonly DrawRecord[]): DrawRecord[][] {
  const frames: DrawRecord[][] = [];
  for (const record of records) {
    const frame = frames[record.frame] ?? [];
    frames[record.frame] = frame;
    frame.push(record);
  }
  return Array.from(frames, (frame) => frame ?? []);
}

export function frameDigests(own: readonly DrawRecord[]): string[] {
  return byFrame(own).map((frame) => `${frame.length}:${hashLine(frame.map((draw) => draw.line).join('\n'))}`);
}

export function buildScenarioGolden(own: readonly DrawRecord[], gpu: readonly DrawRecord[]): ScenarioGolden {
  if (own.length !== gpu.length) throw new Error('own and gpu streams must cover the same draws');
  const gpuStale: [number, number, string, string][] = [];
  const drawInFrame = new Map<number, number>();
  for (const [index, draw] of gpu.entries()) {
    const position = drawInFrame.get(draw.frame) ?? 0;
    drawInFrame.set(draw.frame, position + 1);
    if (draw.line !== own[index]?.line) gpuStale.push([draw.frame, position, draw.meshId, hashLine(draw.line)]);
  }
  return { frames: frameDigests(own), gpuStale };
}

export interface GoldenComparison {
  /** Frames whose own-vertex draws differ from the golden, as `"<frame>: <golden> != <actual>"`. */
  readonly ownMismatches: string[];
  /** GPU draws that differ from the golden and are not an allowed fix. */
  readonly gpuMismatches: string[];
  /** Golden stale draws the current build now draws from their own bake, as `isAllowedFix` allowed. */
  readonly fixed: (readonly [frame: number, draw: number, meshId: string])[];
}

/**
 * Compares a build's streams with a golden. Own vertices must match frame for frame. On the GPU,
 * a draw the golden recorded as stale must still draw the same stale line, unless `isAllowedFix`
 * accepts it, in which case it must now draw its own (golden-matching) bake; every other GPU draw
 * must draw its own bake, as it did on the pinned revision.
 */
export function compareWithGolden(
  golden: ScenarioGolden,
  own: readonly DrawRecord[],
  gpu: readonly DrawRecord[],
  isAllowedFix: (goldenMeshId: string, current: DrawRecord) => boolean,
): GoldenComparison {
  const actualFrames = frameDigests(own);
  const ownMismatches: string[] = [];
  const frameCount = Math.max(actualFrames.length, golden.frames.length);
  for (let frame = 0; frame < frameCount; frame++) {
    if (actualFrames[frame] !== golden.frames[frame]) {
      ownMismatches.push(`${frame}: ${golden.frames[frame]} != ${actualFrames[frame]}`);
    }
  }
  const stale = new Map(golden.gpuStale.map((entry) => [`${entry[0]}:${entry[1]}`, entry]));
  const gpuMismatches: string[] = [];
  const fixed: [number, number, string][] = [];
  const drawInFrame = new Map<number, number>();
  for (const [index, draw] of gpu.entries()) {
    const position = drawInFrame.get(draw.frame) ?? 0;
    drawInFrame.set(draw.frame, position + 1);
    const ownLine = own[index]?.line;
    const entry = stale.get(`${draw.frame}:${position}`);
    if (!entry) {
      if (draw.line !== ownLine) gpuMismatches.push(`${draw.frame}:${position} ${draw.meshId} drew a stale GPU mesh`);
    } else if (isAllowedFix(entry[2], draw)) {
      if (draw.line === ownLine) fixed.push([draw.frame, position, entry[2]]);
      else gpuMismatches.push(`${draw.frame}:${position} ${draw.meshId} is an allowed fix but not its own bake`);
    } else if (hashLine(draw.line) !== entry[3]) {
      gpuMismatches.push(`${draw.frame}:${position} ${draw.meshId} no longer draws the pinned stale mesh`);
    }
  }
  return { ownMismatches, gpuMismatches, fixed };
}
