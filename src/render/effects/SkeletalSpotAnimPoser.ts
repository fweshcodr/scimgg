import type { SkeletalSpotAnimModel, SpotAnimModelLoader } from '../../rs/model/SpotAnimModelLoader';
import type { SkeletalSeq } from '../../rs/model/skeletal/SkeletalSeq';
import { createSpotAnimMeshParts, type SpotAnimMeshPart } from './spotAnimMeshParts';

/**
 * Poses one skeletal spotanim on demand instead of baking its frames.
 *
 * The frame-based spotanim path bakes every frame of a sequence into GPU-ready meshes up front,
 * which a skeletal sequence cannot afford: it has no frame list, only a duration in client ticks,
 * and Yama's despawn alone would be 180 poses of a 1536-face model — roughly 33 MB for one effect.
 * NPCs already solve this by keeping a live model and re-posing it per frame; this is the same
 * trade for spotanims, sized down to one live model per spotanim id.
 */
export class SkeletalSpotAnimPoser {
  private lastFrame: number | null = null;
  private lastParts: SpotAnimMeshPart[] = [];

  constructor(
    private readonly loader: SpotAnimModelLoader,
    private readonly data: SkeletalSpotAnimModel,
    private readonly skeletalSeq: SkeletalSeq,
  ) {}

  /** Duration in CLIENT ticks, matching how `frameLengths` are counted elsewhere. */
  get durationClientTicks(): number {
    return Math.max(1, this.data.seqType.skeletalEnd - this.data.seqType.skeletalStart);
  }

  /**
   * Frame this spotanim shows at `progress` through its lifetime, clamped to the last frame.
   *
   * A one-shot skeletal clip holds its final pose rather than wrapping, the same rule
   * `NpcAnimationController.sampleSkeletalFrame` applies to a death animation.
   */
  frameAt(progress: number): number {
    const duration = this.durationClientTicks;
    const elapsed = Math.floor(Math.max(0, Math.min(1, progress)) * duration);
    return this.data.seqType.skeletalStart + Math.min(elapsed, duration - 1);
  }

  /**
   * Mesh parts for `frame`, rebuilt only when the frame changes.
   *
   * Every rebuild allocates fresh buffers rather than refilling the last set: a command already
   * queued this frame still points at the arrays it was given, so two instances of the same
   * spotanim sitting on different frames must not end up sharing one posed mesh.
   */
  partsFor(frame: number): SpotAnimMeshPart[] {
    if (this.lastFrame === frame) {
      return this.lastParts;
    }

    const mesh = this.loader.poseSkeletalSpotAnimMesh(this.data, this.skeletalSeq, frame);
    const parts = createSpotAnimMeshParts(`spotanim-${this.data.spotAnimId}-skeletal`, mesh, true);

    this.lastFrame = frame;
    this.lastParts = parts;
    return parts;
  }
}
