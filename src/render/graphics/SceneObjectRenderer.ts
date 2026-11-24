import type { LocMesh, LocMeshData } from '../../rs/config/loctype/LocModelLoader';
import type { LocModelType } from '../../rs/config/loctype/LocModelType';
import { resolveLocTransform } from '../../rs/config/loctype/LocType';
import type { SeqType } from '../../rs/config/seqtype/SeqType';
import { CLIENT_TICK_MS, GAME_TICK_MS } from '../core/animation';
import type { NpcMesh3DCommand, RenderQueue } from '../core/commands';
import {
  type BakeLocFrameGeometryInput,
  bakeLocFrameGeometry,
  type LocFrameGeometry,
  locFrameGeometryKey,
  placeLocFrameGeometry,
} from '../environment/locMeshBaker';
import {
  buildLocModelMatrix,
  DEFAULT_BOUNDARY_DISPLACEMENT,
  normalizeCardinalRotation,
  resolveLocPlacement,
} from '../environment/locPlacement';
import { resolveSceneObjectPolicy, type SceneObjectSpec } from './sceneObjectTypes';

const CLIENT_TICKS_PER_GAME_TICK = GAME_TICK_MS / CLIENT_TICK_MS;
const NO_LOC_IDS: ReadonlySet<number> = new Set();

/** The tiles a scene object's LOC stands on: its spec's id and anchor, and its turned footprint. */
export interface SceneObjectLocFootprint {
  readonly locId: number;
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export interface SceneObjectLocData {
  readonly kind: 'loc';
  readonly locId: number;
  readonly modelType: LocModelType;
  readonly rotation: number;
  readonly seqId: number;
  readonly localX: number;
  readonly localY: number;
  readonly level?: number;
  readonly sizeX?: number;
  readonly sizeY?: number;
  readonly contouredGround?: number;
  /**
   * Game tick the sequence started on, when the encounter's recorded state knows it. Without it the
   * animation starts on the tick the renderer first sees the spec (or re-anchors to after a seek), so
   * a seek into the middle of a sequence would restart it from frame 0. Timeline state, not geometry:
   * it is not part of the bake key.
   */
  readonly animationStartTick?: number;
  /**
   * Value of the varbit or varp a transform loc (`LocType.transforms`) reads, choosing the loc it
   * shows; the encounter supplies it from its state. Defaults to 0, an unset var. The spec's loc
   * keeps its own footprint; the loc it shows supplies the model and its seq and ground contouring.
   */
  readonly transformValue?: number;
}

export interface SceneObjectLocModelLoader {
  loadLocMesh?(
    locId: number,
    modelType: LocModelType,
    rotation: number,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): LocMesh | undefined;
  loadAnimatedLocMeshFrames(
    locId: number,
    modelType: LocModelType,
    rotation: number,
    seqId: number,
  ): { readonly frames: readonly LocMeshData[]; readonly seqType?: SeqType } | undefined;
  loadSeqType?(seqId: number): SeqType | undefined;
  loadLocType?(locId: number): SceneObjectLocType | undefined;
}

interface SceneObjectLocType {
  readonly sizeX?: number;
  readonly sizeY?: number;
  readonly contouredGround?: number;
  readonly seqId?: number;
  readonly transforms?: readonly number[];
}

/** What a loc spec draws: the loc its transform selects (-1 for nothing), placed on the spec loc's footprint. */
interface ResolvedSceneObjectLoc {
  readonly drawnLocId: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly contouredGround: number;
  readonly seqId: number;
}

interface CachedSceneObject {
  /** The latest synced spec. */
  spec: SceneObjectSpec<SceneObjectLocData>;
  readonly bakeKey: string;
  /** The `terrainRevision` {@link bakeKey} was built under. */
  readonly bakeTerrainRevision: number;
  readonly frameCommands: readonly (readonly NpcMesh3DCommand[])[];
  readonly seqType?: SeqType;
  /** Absent for contoured geometry, which is baked per placement. */
  readonly geometryKey?: string;
  startTick: number;
  /** The `sync` call that last found the object live. */
  liveSync: number;
  /**
   * `frameCommands` with the spec's policy applied, built when each frame is first drawn and drawn
   * again while the policy inputs (see {@link policyInputsMatch}) are unchanged, as LOC frame
   * commands are, instead of copying every command and its matrix each frame.
   */
  readonly policy: PolicyFrames;
}

interface PolicyFrames {
  /** The spec the frames were built for, and a copy of its model matrix, which could be edited in place. */
  spec: SceneObjectSpec<SceneObjectLocData>;
  specMatrix: Float32Array;
  readonly frames: (readonly NpcMesh3DCommand[] | undefined)[];
  /** The last placement matrix combined with the spec's, and the result its commands share. */
  placementMatrix: Float32Array | null;
  modelMatrix: Float32Array | null;
}

type SceneObjectBake = Pick<CachedSceneObject, 'frameCommands' | 'seqType' | 'geometryKey'>;

interface SceneObjectGeometry {
  readonly frames: LocFrameGeometry;
  readonly seqType?: SeqType;
}

export class SceneObjectRenderer {
  private readonly objects = new Map<string, CachedSceneObject>();
  /**
   * Un-contoured geometry shared by placements with the same loader inputs. Entries are released
   * once no live object references them, so the cache never outgrows the scene.
   */
  private readonly sharedGeometry = new Map<string, SceneObjectGeometry>();
  private geometryReleasePending = false;
  private terrainHeights: Int32Array[] | null = null;
  private terrainRevision = 0;
  private syncs = 0;
  /** Set by {@link resetTimeline}; re-anchors animation phase on the next sync. */
  private reanchorOnNextSync = false;

  constructor(private readonly locModelLoader: SceneObjectLocModelLoader) {}

  setTerrainHeights(heights: Int32Array[] | null): void {
    if (this.terrainHeights !== heights) {
      this.terrainHeights = heights;
      this.terrainRevision++;
    }
  }

  clear(): void {
    this.objects.clear();
    this.sharedGeometry.clear();
    this.geometryReleasePending = false;
  }

  /**
   * Replay timeline discontinuity within the SAME scene (rewind / forward jump).
   *
   * Only the animation phase is timeline state — the baked frame meshes are
   * deterministic geometry keyed by `bakeKey`, and `sync()` already re-validates
   * that key and drops anything no longer live. Calling `clear()` here instead
   * threw that geometry away and forced a full re-bake of every scene object on
   * the next frame, which measured at 205ms p99 / 374ms worst and consumed 89%
   * of the frame while scrubbing a Yama replay.
   */
  resetTimeline(): void {
    this.reanchorOnNextSync = true;
  }

  /** Runs every frame, so an unchanged object is updated in place without allocating. */
  sync(specs: readonly SceneObjectSpec<SceneObjectLocData>[], currentTick: number): void {
    const sync = ++this.syncs;
    for (const spec of specs) {
      if (!isLifecycleActive(spec, currentTick)) {
        continue;
      }

      const cached = this.objects.get(spec.id);
      // The key is built from the read-only spec, its LOC type and the terrain revision alone.
      const bakeKey =
        cached?.spec === spec && cached.bakeTerrainRevision === this.terrainRevision
          ? cached.bakeKey
          : this.buildBakeKey(spec);
      const explicitStartTick = spec.data?.animationStartTick;
      if (cached?.bakeKey === bakeKey) {
        cached.spec = spec;
        cached.startTick = explicitStartTick ?? (this.reanchorOnNextSync ? currentTick : cached.startTick);
        cached.liveSync = sync;
        continue;
      }

      if (cached) {
        this.geometryReleasePending = true;
      }
      const baked = this.bakeSpec(spec);
      if (baked.frameCommands.length > 0) {
        this.objects.set(spec.id, {
          spec,
          bakeKey,
          bakeTerrainRevision: this.terrainRevision,
          startTick: explicitStartTick ?? currentTick,
          liveSync: sync,
          policy: {
            spec,
            specMatrix: Float32Array.from(spec.modelMatrix),
            frames: [],
            placementMatrix: null,
            modelMatrix: null,
          },
          ...baked,
        });
      } else {
        this.objects.delete(spec.id);
      }
    }

    // forEach, not for-of: a Map iterator's results are allocated wherever it is not optimized away.
    this.objects.forEach((object, id) => {
      if (object.liveSync !== sync) {
        this.objects.delete(id);
        this.geometryReleasePending = true;
      }
    });
    this.releaseUnreferencedGeometry();
    this.reanchorOnNextSync = false;
  }

  /**
   * `hiddenLocIds` leaves out the objects whose LOC is one of them. They stay synced, so showing
   * them again needs no re-bake and keeps their animation phase.
   */
  render(
    queue: RenderQueue,
    currentTick: number,
    interpolatedTick: number,
    hiddenLocIds: ReadonlySet<number> = NO_LOC_IDS,
  ): void {
    this.objects.forEach((object, id) => {
      if (!isLifecycleActive(object.spec, currentTick)) {
        this.objects.delete(id);
        // Released by the next sync, which runs before every render.
        this.geometryReleasePending = true;
        return;
      }
      if (hiddenLocIds.size > 0 && object.spec.data && hiddenLocIds.has(object.spec.data.locId)) return;

      const frameIndex = resolveFrameIndex(object, interpolatedTick);
      const frame = object.frameCommands[frameIndex];
      if (!frame) {
        return;
      }
      // Uniform values may be arrays edited in place, so commands carrying them are copied every frame.
      if (object.spec.style?.uniforms !== undefined) {
        for (const command of frame) {
          queue.commands.push(applySpecPolicy(command, object.spec, specModelMatrix(object.spec, command.modelMatrix)));
        }
        return;
      }
      const commands = policyFrame(object, frameIndex, frame);
      for (let index = 0; index < commands.length; index++) {
        queue.commands.push(commands[index]);
      }
    });
  }

  /** The tiles each synced object of one of `locIds` stands on, footprint turned with it. */
  getLocFootprints(locIds: ReadonlySet<number>): SceneObjectLocFootprint[] {
    const footprints: SceneObjectLocFootprint[] = [];
    this.objects.forEach(({ spec }) => {
      const loc = spec.data;
      if (!loc || !locIds.has(loc.locId)) return;
      const { sizeX, sizeY } = this.resolveLoc(loc);
      const { sceneFootprint } = resolveLocPlacement({
        type: loc.modelType,
        rotation: normalizeCardinalRotation(loc.rotation),
        sizeX,
        sizeY,
        boundaryDisplacement: DEFAULT_BOUNDARY_DISPLACEMENT,
      });
      footprints.push({
        locId: loc.locId,
        x: loc.localX,
        y: loc.localY,
        sizeX: sceneFootprint.sizeX,
        sizeY: sceneFootprint.sizeY,
      });
    });
    return footprints;
  }

  private bakeSpec(spec: SceneObjectSpec<SceneObjectLocData>): SceneObjectBake {
    const loc = spec.data;
    if (!loc) {
      return EMPTY_BAKE;
    }

    const { drawnLocId, sizeX, sizeY, contouredGround, seqId } = this.resolveLoc(loc);
    if (drawnLocId < 0) {
      return EMPTY_BAKE;
    }
    const placement = resolveLocPlacement({
      type: loc.modelType,
      rotation: normalizeCardinalRotation(loc.rotation),
      sizeX,
      sizeY,
      boundaryDisplacement: DEFAULT_BOUNDARY_DISPLACEMENT,
    });
    const opacity = resolveOpacity(spec);

    // Contoured vertices are bent to the terrain under this placement, so they stay per placement
    // under the spec's own mesh id.
    const contour =
      contouredGround >= 0
        ? {
            terrainHeights: this.terrainHeights,
            terrainLocalX: loc.localX,
            terrainLocalY: loc.localY,
            footprint: placement.terrainFootprint,
            contouredGround,
          }
        : undefined;
    const geometryKey = contour ? undefined : sharedGeometryKey(loc, drawnLocId, seqId, opacity);
    let geometry = geometryKey ? this.sharedGeometry.get(geometryKey) : undefined;
    if (!geometry) {
      geometry = this.loadGeometry(
        loc,
        drawnLocId,
        seqId,
        geometryKey ?? withOpacityKey(spec.meshId, opacity),
        contour,
        opacity,
      );
      if (!geometry) {
        return EMPTY_BAKE;
      }
      if (geometryKey) {
        this.sharedGeometry.set(geometryKey, geometry);
      }
    }

    const policy = resolveSceneObjectPolicy(spec);
    return {
      frameCommands: placeLocFrameGeometry(geometry.frames, {
        modelMatrix: buildLocModelMatrix({
          placement,
          localX: loc.localX,
          localY: loc.localY,
          terrainLocalX: loc.localX,
          terrainLocalY: loc.localY,
          terrainHeights: this.terrainHeights,
          animationHeightOffset: geometry.seqType?.heightOffset ?? 0,
        }),
        zIndex: spec.style?.zIndex ?? 0,
        ...(policy.depthBias !== undefined ? { depthBias: policy.depthBias } : {}),
      }),
      ...(geometry.seqType ? { seqType: geometry.seqType } : {}),
      ...(geometryKey ? { geometryKey } : {}),
    };
  }

  private loadGeometry(
    loc: SceneObjectLocData,
    drawnLocId: number,
    seqId: number,
    locKey: string,
    contour: BakeLocFrameGeometryInput['contour'],
    opacity: number,
  ): SceneObjectGeometry | undefined {
    const bake = (frames: readonly LocMeshData[], seqType: SeqType | undefined): SceneObjectGeometry => ({
      frames: bakeLocFrameGeometry({
        frames,
        locKey,
        ...(contour ? { contour } : {}),
        ...(opacity !== 1 ? { alphaScale: opacity } : {}),
      }),
      ...(seqType ? { seqType } : {}),
    });

    let seqType: SeqType | undefined;
    if (seqId >= 0) {
      const animated = this.locModelLoader.loadAnimatedLocMeshFrames(drawnLocId, loc.modelType, loc.rotation, seqId);
      if (animated && animated.frames.length > 0) {
        return bake(animated.frames, animated.seqType);
      }
      // A sequence without loadable frames still draws the static model with its height offset.
      seqType = animated?.seqType ?? this.locModelLoader.loadSeqType?.(seqId);
      if (!seqType) {
        return undefined;
      }
    }
    const staticLocMesh = this.locModelLoader.loadLocMesh?.(
      drawnLocId,
      loc.modelType,
      loc.rotation,
      loc.localX,
      loc.localY,
      0,
    );
    return staticLocMesh ? bake([locMeshToFrame(staticLocMesh)], seqType) : undefined;
  }

  private releaseUnreferencedGeometry(): void {
    if (!this.geometryReleasePending) {
      return;
    }
    this.geometryReleasePending = false;
    const referenced = new Set<string>();
    for (const object of this.objects.values()) {
      if (object.geometryKey !== undefined) {
        referenced.add(object.geometryKey);
      }
    }
    for (const key of this.sharedGeometry.keys()) {
      if (!referenced.has(key)) {
        this.sharedGeometry.delete(key);
      }
    }
  }

  private resolveLoc(loc: SceneObjectLocData): ResolvedSceneObjectLoc {
    const locType = this.locModelLoader.loadLocType?.(loc.locId);
    const drawnLocId = resolveLocTransform(loc.locId, locType?.transforms, loc.transformValue ?? 0);
    const drawn = drawnLocId === loc.locId ? locType : this.locModelLoader.loadLocType?.(drawnLocId);
    return {
      drawnLocId,
      sizeX: loc.sizeX ?? locType?.sizeX ?? 1,
      sizeY: loc.sizeY ?? locType?.sizeY ?? 1,
      contouredGround: loc.contouredGround ?? drawn?.contouredGround ?? -1,
      seqId: resolveLocSeqId(loc.seqId, drawn?.seqId),
    };
  }

  private buildBakeKey(spec: SceneObjectSpec<SceneObjectLocData>): string {
    const loc = spec.data;
    if (!loc) {
      return `${spec.id}:missing-loc-data`;
    }

    const { drawnLocId, sizeX, sizeY, contouredGround, seqId } = this.resolveLoc(loc);
    const depthBias = resolveSceneObjectPolicy(spec).depthBias ?? 'none';
    return [
      loc.locId,
      drawnLocId,
      loc.modelType,
      loc.rotation,
      seqId,
      loc.localX,
      loc.localY,
      loc.level ?? 0,
      sizeX,
      sizeY,
      contouredGround,
      spec.meshId,
      spec.style?.zIndex ?? 0,
      depthBias,
      resolveOpacity(spec),
      this.terrainRevision,
    ].join(':');
  }
}

function resolveLocSeqId(specSeqId: number, locTypeSeqId: number | undefined): number {
  return specSeqId >= 0 ? specSeqId : (locTypeSeqId ?? -1);
}

function resolveOpacity(spec: Pick<SceneObjectSpec, 'style'>): number {
  return spec.style?.opacity ?? 1;
}

/**
 * Faded frames carry other alphas under otherwise equal inputs, and the GPU keeps meshes by id, so
 * opacity joins the mesh id prefix. Unfaded ids are unchanged.
 */
function withOpacityKey(key: string, opacity: number): string {
  return opacity === 1 ? key : `${key}:opacity-${opacity}`;
}

/** Also the shared frames' mesh id prefix, so one GPU mesh per frame part serves every placement. */
function sharedGeometryKey(loc: SceneObjectLocData, drawnLocId: number, seqId: number, opacity: number): string {
  return withOpacityKey(
    `scene-object-loc:${locFrameGeometryKey(drawnLocId, loc.modelType, loc.rotation, seqId)}`,
    opacity,
  );
}

const EMPTY_BAKE: SceneObjectBake = { frameCommands: [] };

function resolveFrameIndex(object: CachedSceneObject, interpolatedTick: number): number {
  const seqType = object.seqType;
  if (!seqType) {
    return 0;
  }

  // `frameLengths` counts CLIENT ticks (20ms), so elapsed game ticks have to be converted before
  // indexing them, or every sequence plays 30x slow and one under 30 client ticks never leaves
  // frame 0. `interpolatedTick` rather than the integer tick because at 30 client ticks per game
  // tick an integer one would jump 30 frames at a time and show roughly one frame in seven.
  const elapsedGameTicks = Math.max(0, interpolatedTick - object.startTick);
  const elapsedClientTicks = Math.floor(elapsedGameTicks * CLIENT_TICKS_PER_GAME_TICK);

  return resolveSeqFrameIndex(seqType, object.frameCommands.length, elapsedClientTicks);
}

function resolveSeqFrameIndex(
  seqType: Pick<SeqType, 'frameLengths' | 'frameStep'>,
  frameCount: number,
  elapsedTicks: number,
): number {
  if (frameCount <= 1) {
    return 0;
  }

  const totalDuration = sumFrameDurations(seqType, 0, frameCount);
  const loopFrameCount = seqType.frameStep > 0 ? Math.min(seqType.frameStep, frameCount) : 0;

  if (elapsedTicks < totalDuration || loopFrameCount === 0) {
    return findFrameByElapsed(seqType, 0, frameCount, Math.min(elapsedTicks, totalDuration - 1));
  }

  const loopStart = frameCount - loopFrameCount;
  const loopDuration = sumFrameDurations(seqType, loopStart, frameCount);
  const loopElapsed = (elapsedTicks - totalDuration) % loopDuration;
  return findFrameByElapsed(seqType, loopStart, frameCount, loopElapsed);
}

function frameDuration(seqType: Pick<SeqType, 'frameLengths'>, frame: number): number {
  return Math.max(1, seqType.frameLengths[frame] ?? 1);
}

function sumFrameDurations(seqType: Pick<SeqType, 'frameLengths'>, start: number, end: number): number {
  let total = 0;
  for (let frame = start; frame < end; frame++) {
    total += frameDuration(seqType, frame);
  }
  return total;
}

/** The frame in `[start, end)` showing `elapsedTicks` after `start` began. */
function findFrameByElapsed(
  seqType: Pick<SeqType, 'frameLengths'>,
  start: number,
  end: number,
  elapsedTicks: number,
): number {
  let remainingTicks = elapsedTicks;
  for (let frame = start; frame < end; frame++) {
    const duration = frameDuration(seqType, frame);
    if (remainingTicks < duration) {
      return frame;
    }
    remainingTicks -= duration;
  }
  return end - 1;
}

function locMeshToFrame(locMesh: LocMesh): LocMeshData {
  return {
    mesh: locMesh.mesh,
    hslColors: locMesh.hslColors,
    alphas: locMesh.alphas,
    ...(locMesh.faceBias ? { faceBias: locMesh.faceBias } : {}),
    ...(locMesh.uvs && locMesh.textureIds ? { uvs: locMesh.uvs, textureIds: locMesh.textureIds } : {}),
    hasTransparency: locMesh.alphas.some((alpha) => alpha < 1),
    ...(locMesh.modelHeight ? { modelHeight: locMesh.modelHeight } : {}),
  };
}

function isLifecycleActive(spec: Pick<SceneObjectSpec, 'lifecycle'>, currentTick: number): boolean {
  switch (spec.lifecycle.kind) {
    case 'sync':
      return true;
    case 'oneShot':
      return (
        currentTick >= spec.lifecycle.startTick && currentTick < spec.lifecycle.startTick + spec.lifecycle.durationTicks
      );
    case 'manual':
      return spec.lifecycle.expiresAtTick === undefined || currentTick < spec.lifecycle.expiresAtTick;
    default:
      return assertNever(spec.lifecycle);
  }
}

/**
 * `frame` with the spec's policy applied, reused while the policy inputs match the ones it was
 * built from. The commands are read-only, like every queued command; a frame's commands share one
 * model matrix when their placement matrix is the same.
 */
function policyFrame(
  object: CachedSceneObject,
  frameIndex: number,
  frame: readonly NpcMesh3DCommand[],
): readonly NpcMesh3DCommand[] {
  const policy = object.policy;
  const spec = object.spec;
  if (!policyInputsMatch(policy, spec)) {
    policy.frames.length = 0;
    if (policy.specMatrix.length === spec.modelMatrix.length) policy.specMatrix.set(spec.modelMatrix);
    else policy.specMatrix = Float32Array.from(spec.modelMatrix);
    policy.placementMatrix = null;
    policy.modelMatrix = null;
  }
  // Holding the latest spec rather than the first lets a replaced one be collected.
  policy.spec = spec;

  const cached = policy.frames[frameIndex];
  if (cached) {
    return cached;
  }
  const commands = frame.map((command) => {
    if (policy.placementMatrix !== command.modelMatrix || !policy.modelMatrix) {
      policy.placementMatrix = command.modelMatrix;
      policy.modelMatrix = specModelMatrix(spec, command.modelMatrix);
    }
    return applySpecPolicy(command, spec, policy.modelMatrix);
  });
  policy.frames[frameIndex] = commands;
  return commands;
}

/** Whether `spec` gives the same {@link applySpecPolicy} result as the spec the frames were built for. */
function policyInputsMatch(policy: PolicyFrames, spec: SceneObjectSpec<SceneObjectLocData>): boolean {
  const built = policy.spec;
  if (built !== spec) {
    if (built.materialId !== spec.materialId || built.classification !== spec.classification) {
      return false;
    }
    const a = built.style;
    const b = spec.style;
    if (
      a !== b &&
      !(
        Object.is(a?.zOffset, b?.zOffset) &&
        Object.is(a?.depthBias, b?.depthBias) &&
        a?.depth === b?.depth &&
        a?.blend === b?.blend &&
        a?.cullFace === b?.cullFace &&
        a?.shaderId === b?.shaderId
      )
    ) {
      return false;
    }
  }
  const matrix = spec.modelMatrix;
  const copy = policy.specMatrix;
  if (matrix.length !== copy.length) {
    return false;
  }
  for (let index = 0; index < matrix.length; index++) {
    if (!Object.is(matrix[index], copy[index])) {
      return false;
    }
  }
  return true;
}

function specModelMatrix(spec: SceneObjectSpec<SceneObjectLocData>, placementMatrix: Float32Array): Float32Array {
  const modelMatrix = multiplyModelMatrices(spec.modelMatrix, placementMatrix);
  modelMatrix[14] = (modelMatrix[14] ?? 0) + resolveSceneObjectPolicy(spec).zOffset;
  return modelMatrix;
}

function applySpecPolicy(
  command: NpcMesh3DCommand,
  spec: SceneObjectSpec<SceneObjectLocData>,
  modelMatrix: Float32Array,
): NpcMesh3DCommand {
  const policy = resolveSceneObjectPolicy(spec);
  return {
    ...command,
    materialId: spec.materialId,
    modelMatrix,
    ...(spec.style?.depth !== undefined ? { depth: spec.style.depth } : {}),
    ...(spec.style?.blend !== undefined ? { blend: spec.style.blend } : {}),
    ...(spec.style?.cullFace !== undefined ? { cullFace: spec.style.cullFace } : {}),
    ...(spec.style?.shaderId !== undefined ? { shaderId: spec.style.shaderId } : {}),
    ...(spec.style?.uniforms !== undefined ? { uniforms: copyUniforms(spec.style.uniforms) } : {}),
    ...(policy.depthBias !== undefined ? { depthBias: policy.depthBias } : {}),
  };
}

function multiplyModelMatrices(left: Float32Array, right: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      result[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return result;
}

function copyUniforms(
  uniforms: Readonly<Record<string, number | readonly number[] | Float32Array>>,
): Record<string, number | number[] | Float32Array> {
  const copied: Record<string, number | number[] | Float32Array> = {};
  for (const key in uniforms) {
    const value = uniforms[key];
    if (value === undefined) {
      continue;
    }
    copied[key] = isReadonlyNumberArray(value) ? [...value] : value;
  }
  return copied;
}

function isReadonlyNumberArray(value: number | readonly number[] | Float32Array): value is readonly number[] {
  return Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled scene object lifecycle: ${value}`);
}
