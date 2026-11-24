import type { NpcMeshData, NpcModelLoader } from '../../rs/model/NpcModelLoader';
import { modelDataToMesh } from '../../rs/model/NpcModelLoader';
import type { SkeletalSeq } from '../../rs/model/skeletal/SkeletalSeq';
import type { TextureLayerResolver } from '../../rs/model/textureUv';
import { type AnimationSystem, CLIENT_TICK_MS } from '../core/animation';

/** OSRS model units per world tile, as every NPC model matrix scales them. */
const MODEL_UNITS_PER_TILE = 128;

/** The NPC a portrait draws, and the stand sequence it plays. */
export interface BossPortraitSubject {
  readonly npcTypeId: number;
  /** Plays instead of the NPC type's own stand sequence. */
  readonly idleSeqId?: number;
}

export interface BossPortraitPoser {
  /** One stand cycle in ms; 0 when the NPC has no stand sequence that loads, so only its rest pose. */
  readonly cycleMs: number;
  /**
   * The visible vertices of the cycle's first pose, which a still portrait shows, as world-space
   * x, y, z triples in tiles with the model's origin on the ground at (0, 0, 0). Fully transparent
   * faces are left out: some models carry invisible helper geometry that would skew the framing.
   */
  readonly points: Float32Array;
  /**
   * The model posed `ms` into its stand cycle, wrapping past its end. The arrays are rebuilt only
   * when the pose changes; a caller must not keep them across calls.
   */
  poseAt(ms: number): NpcMeshData;
}

type StandClip =
  | { readonly kind: 'frames'; readonly frameIds: readonly number[]; readonly frameTicks: readonly number[] }
  | { readonly kind: 'skeletal'; readonly seq: SkeletalSeq; readonly start: number; readonly ticks: number };

/** Frame lengths count client ticks; a missing, zero or non-finite length still shows its frame for one. */
function frameTicks(lengths: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const length = lengths[i];
    return Number.isFinite(length) ? Math.max(1, Math.floor(length)) : 1;
  });
}

function loadStandClip(animationSystem: AnimationSystem, seqId: number): StandClip | null {
  if (seqId < 0) return null;
  const seqType = animationSystem.loadSeqType(seqId);
  if (!seqType) return null;
  if (seqType.isSkeletalSeq()) {
    const seq = animationSystem.loadSkeletalSeq(seqType.skeletalId);
    if (!seq) return null;
    return {
      kind: 'skeletal',
      seq,
      start: seqType.skeletalStart,
      ticks: Math.max(1, seqType.skeletalEnd - seqType.skeletalStart),
    };
  }
  const frameIds = seqType.frameIds ?? [];
  if (frameIds.length === 0) return null;
  return { kind: 'frames', frameIds, frameTicks: frameTicks(seqType.frameLengths ?? [], frameIds.length) };
}

function clipTicks(clip: StandClip): number {
  return clip.kind === 'skeletal' ? clip.ticks : clip.frameTicks.reduce((total, ticks) => total + ticks, 0);
}

/**
 * Builds a poser for one NPC's stand cycle from cache loaders that are already loaded, or null
 * when the NPC's model does not load. Reads only what the loaders hold: it never fetches.
 *
 * The model is posed in place, as an NPC instance's is, and is this poser's own:
 * `loadNpcModelData` decodes a fresh copy, so no other renderer's NPC is touched.
 */
export function createBossPortraitPoser(
  npcModelLoader: NpcModelLoader,
  animationSystem: AnimationSystem,
  subject: BossPortraitSubject,
  resolveTextureLayer?: TextureLayerResolver,
): BossPortraitPoser | null {
  const modelData = npcModelLoader.loadNpcModelData(subject.npcTypeId);
  const model = modelData?.mergedModel;
  if (!modelData || !model) return null;
  const litColors = modelData.litColors ?? undefined;

  model.computeAnimationTables();
  const restX = new Int32Array(model.verticesX);
  const restY = new Int32Array(model.verticesY);
  const restZ = new Int32Array(model.verticesZ);
  const restAlphas = model.faceAlphas ? new Int8Array(model.faceAlphas) : null;
  const { widthScale, heightScale } = modelData;

  const seqId = subject.idleSeqId ?? npcModelLoader.loadNpcType(subject.npcTypeId)?.idleSeqId ?? -1;
  const clip = animationSystem.isInitialized() ? loadStandClip(animationSystem, seqId) : null;
  const totalTicks = clip ? clipTicks(clip) : 0;

  const applyTick = (tick: number): void => {
    model.verticesX.set(restX);
    model.verticesY.set(restY);
    model.verticesZ.set(restZ);
    if (restAlphas && model.faceAlphas) model.faceAlphas.set(restAlphas);
    if (clip?.kind === 'skeletal') {
      model.animateSkeletal(clip.seq, clip.start + tick);
    } else if (clip) {
      let remaining = tick;
      let index = 0;
      while (index < clip.frameIds.length - 1 && remaining >= clip.frameTicks[index]) {
        remaining -= clip.frameTicks[index];
        index++;
      }
      const frame = animationSystem.loadFrame(clip.frameIds[index]);
      if (frame) model.animate(frame);
    }
    if (widthScale !== 128 || heightScale !== 128) model.resize(widthScale, heightScale, widthScale);
  };

  let posedTick = -1;
  let mesh: NpcMeshData | null = null;
  const poseTick = (tick: number): NpcMeshData => {
    if (mesh && tick === posedTick) return mesh;
    applyTick(tick);
    mesh = modelDataToMesh(model, litColors, resolveTextureLayer ? { resolveTextureLayer } : undefined);
    posedTick = tick;
    return mesh;
  };

  const tickAt = (ms: number): number =>
    totalTicks > 0 ? Math.floor(Math.max(0, ms) / CLIENT_TICK_MS) % totalTicks : 0;

  return {
    cycleMs: totalTicks * CLIENT_TICK_MS,
    points: visibleWorldPoints(poseTick(0)),
    poseAt: (ms) => poseTick(tickAt(ms)),
  };
}

/**
 * Model space is Y-down with Z north; the world is Z-up with Y north (the axis remap every NPC
 * model matrix applies), so model -Y is world height.
 */
function visibleWorldPoints({ positions, alphas }: NpcMeshData): Float32Array {
  const points = new Float32Array(positions.length);
  let length = 0;
  for (let vertex = 0; vertex * 3 < positions.length; vertex++) {
    if (alphas[vertex] <= 0) continue;
    points[length++] = positions[vertex * 3] / MODEL_UNITS_PER_TILE;
    points[length++] = positions[vertex * 3 + 2] / MODEL_UNITS_PER_TILE;
    points[length++] = -positions[vertex * 3 + 1] / MODEL_UNITS_PER_TILE;
  }
  return points.slice(0, length);
}
