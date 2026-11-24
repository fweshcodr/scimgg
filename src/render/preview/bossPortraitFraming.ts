import {
  type OrbitCameraState,
  OSRS_DEFAULT_FOV_SCALE,
  OSRS_VIEWPORT_MAGIC,
  zoomToLensStrength,
} from '../projections/Projection3D';
import type { BossPortraitSubject } from './bossPortraitPoser';

/**
 * How a portrait frames its NPC, relative to the height of the stand cycle's first pose so it
 * holds for any model size.
 */
export interface BossPortraitFraming {
  /** Orbit yaw in degrees, as the scene camera's: 0 looks north, at the face of an NPC facing south. */
  readonly yaw: number;
  /** Degrees below the horizon, negative as the scene camera's. */
  readonly pitch: number;
  /**
   * Height of the head, as a fraction of the pose's height from its base (0) to its top (1). The
   * camera aims there, and orbits the middle of the model at that height.
   */
  readonly focusHeight: number;
  /** How much of the pose's height the container spans vertically at the aim point. */
  readonly span: number;
}

/** An encounter's live boss portrait: which NPC it draws, and how it is framed. */
export interface BossPortraitConfig extends BossPortraitSubject {
  readonly framing: BossPortraitFraming;
}

/** Tangent of half the vertical field of view at the client's default zoom, independent of aspect ratio. */
const HALF_FOV_TAN = OSRS_VIEWPORT_MAGIC / (2 * zoomToLensStrength(OSRS_DEFAULT_FOV_SCALE));

/** Half the depth of the slice at the focus height whose middle the camera orbits, as a fraction of the pose's height. */
const FOCUS_SLICE_HALF_DEPTH = 0.05;

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * The orbit camera that frames `points` (world-space x, y, z triples) as `framing` asks.
 *
 * It orbits the horizontal median of the points in a thin slice at the focus height, not the
 * middle of their box. A boss's box is set by wings, weapons and tails, and its head sits well
 * in front of the box's middle (Yama's by most of a tile); at yaw 0 that depth offset is hidden
 * along the line of sight, but any turn swings it sideways across the frame. The median ignores
 * the few far points of a weapon or wing in the slice, which a mean would follow.
 *
 * Neither its distance nor its pitch is held to the scene camera's limits: `createProjection3D`
 * takes them as given, and Projection3D clamps only through `updateCamera`, which a portrait
 * never calls.
 */
export function framePortraitCamera(points: Float32Array, framing: BossPortraitFraming): OrbitCameraState {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
    minZ = Math.min(minZ, points[i + 2]);
    maxZ = Math.max(maxZ, points[i + 2]);
  }
  if (points.length === 0) minX = maxX = minY = maxY = minZ = maxZ = 0;
  const height = Math.max(maxZ - minZ, 1 / 128);
  const focusZ = minZ + height * framing.focusHeight;

  const sliceX: number[] = [];
  const sliceY: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 2] - focusZ) > height * FOCUS_SLICE_HALF_DEPTH) continue;
    sliceX.push(points[i]);
    sliceY.push(points[i + 1]);
  }
  // A pose with nothing at the focus height (a gap between floating parts) orbits its box instead.
  const empty = sliceX.length === 0;

  return {
    yaw: framing.yaw,
    pitch: framing.pitch,
    distance: (height * framing.span) / (2 * HALF_FOV_TAN),
    fovScale: OSRS_DEFAULT_FOV_SCALE,
    targetX: empty ? (minX + maxX) / 2 : median(sliceX),
    targetY: empty ? (minY + maxY) / 2 : median(sliceY),
    targetZ: focusZ,
  };
}
