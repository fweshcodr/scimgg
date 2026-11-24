import type { Coordinate } from '../../types/simulation';
import type { NpcHitTestData } from './types';

const CLIENT_UNITS_PER_TILE = 128;

/**
 * Unsourced floor for horizontal clickbox half-extents. Do not apply it vertically: that
 * anchors airborne models to the ground. The floor and padding remain unmeasured.
 */
const AABB_MIN_HORIZONTAL_EXTENT = 32 / CLIENT_UNITS_PER_TILE;
const AABB_BOUNDING_MODEL_PADDING = 8 / CLIENT_UNITS_PER_TILE;

/**
 * Scratch buffers for the per-face hit test, which runs for every NPC on every hovered
 * frame. Safe to share: the test is synchronous and never re-entered, and every slot it
 * reads is written first in the same call.
 */
const SCRATCH_VM = new Float64Array(16);
const SCRATCH_MVP = new Float64Array(16);
let scratchScreenCoords = new Float64Array(0);
let scratchCameraDistances = new Float64Array(0);

export interface Ray3D {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/** A hovered/clicked NPC resolved to its sim/lobby identity. */
export interface PickedNpc {
  actorId: string;
  npcTypeId: number;
  position: Coordinate;
  /** Client-equivalent integer depth of the nearest hit face (nearer = smaller). */
  distance: number;
}

/**
 * Resolves a raw render-layer hit-test actorId (which may be the
 * `PRIMARY_NPC_ACTOR_ID` singleton) to the sim/lobby identity used for clicks.
 * Returns null when the id maps to no interactable NPC.
 */
export type NpcActorResolver = (
  rawActorId: string,
) => { actorId: string; npcTypeId: number; position: Coordinate } | null;

/**
 * OSRS-faithful screen-space hit test (narrowphase).
 *
 * TWO modes, exactly as the client has two:
 *
 * - **Per-face** (the default, every NPC larger than one tile). Follows RuneLite's
 *   `Perspective.calculate2DBounds`: projects
 *   the CURRENT (animated) model vertices via MVP, then for each visible face tests its
 *   screen-space bounding rect (expanded by 5px) against the mouse. No backface culling
 *   (OSRS tests all faces regardless of winding); textured (-2) faces and behind-camera
 *   (w<=0) vertices are skipped, exactly as OSRS does.
 * - **Bounding box** (`hitData.useBoundingBox`, set for size-1 NPCs). The clickbox is the
 *   projected AABB of the posed model, with no per-face test at all — see
 *   {@link screenNpcAabbHitDepth}.
 *
 * There is no idle-pose broadphase in either mode, so the clickbox always tracks the
 * animation exactly.
 */
export function screenNpcModelHitDepth(
  screenPx: { x: number; y: number },
  hitData: NpcHitTestData,
  viewMatrix: number[],
  projMatrix: number[],
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  if (hitData.useBoundingBox === true) {
    return screenNpcAabbHitDepth(screenPx, hitData, viewMatrix, projMatrix, viewportWidth, viewportHeight);
  }

  const {
    verticesX,
    verticesY,
    verticesZ,
    verticesCount,
    indices1,
    indices2,
    indices3,
    faceCount,
    faceColors3,
    modelMatrix: mm,
  } = hitData;

  // VM = view × model (column-major 4×4)
  const vm = SCRATCH_VM;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      vm[c * 4 + r] =
        viewMatrix[r] * mm[c * 4] +
        viewMatrix[4 + r] * mm[c * 4 + 1] +
        viewMatrix[8 + r] * mm[c * 4 + 2] +
        viewMatrix[12 + r] * mm[c * 4 + 3];
    }
  }
  const mvp = SCRATCH_MVP;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      mvp[c * 4 + r] =
        projMatrix[r] * vm[c * 4] +
        projMatrix[4 + r] * vm[c * 4 + 1] +
        projMatrix[8 + r] * vm[c * 4 + 2] +
        projMatrix[12 + r] * vm[c * 4 + 3];
    }
  }

  // Project all vertices to screen. Behind-camera vertices (w <= 0) get NaN.
  if (scratchCameraDistances.length < verticesCount) {
    scratchScreenCoords = new Float64Array(verticesCount * 2);
    scratchCameraDistances = new Float64Array(verticesCount);
  }
  const screenCoords = scratchScreenCoords;
  const cameraDistances = scratchCameraDistances;
  const halfW = viewportWidth * 0.5;
  const halfH = viewportHeight * 0.5;

  for (let i = 0; i < verticesCount; i++) {
    const vx = verticesX[i];
    const vy = verticesY[i];
    const vz = verticesZ[i];

    const w = mvp[3] * vx + mvp[7] * vy + mvp[11] * vz + mvp[15];
    if (w <= 0) {
      screenCoords[i * 2] = NaN;
      screenCoords[i * 2 + 1] = NaN;
      continue;
    }

    const invW = 1 / w;
    const cameraX = vm[0] * vx + vm[4] * vy + vm[8] * vz + vm[12];
    const cameraY = vm[1] * vx + vm[5] * vy + vm[9] * vz + vm[13];
    const cameraZ = vm[2] * vx + vm[6] * vy + vm[10] * vz + vm[14];
    const px = mvp[0] * vx + mvp[4] * vy + mvp[8] * vz + mvp[12];
    const py = mvp[1] * vx + mvp[5] * vy + mvp[9] * vz + mvp[13];

    const ndcX = px * invW;
    const ndcY = py * invW;

    screenCoords[i * 2] = (ndcX + 1) * halfW;
    screenCoords[i * 2 + 1] = (1 - ndcY) * halfH;
    cameraDistances[i] = cameraX * cameraX + cameraY * cameraY + cameraZ * cameraZ;
  }

  const EXPAND = 5;
  const mx = screenPx.x;
  const my = screenPx.y;
  let nearestDepth = Number.POSITIVE_INFINITY;

  for (let f = 0; f < faceCount; f++) {
    if (faceColors3 !== null && faceColors3[f] === -2) continue;

    const ia = indices1[f];
    const ib = indices2[f];
    const ic = indices3[f];

    const ax = screenCoords[ia * 2];
    const ay = screenCoords[ia * 2 + 1];
    const bx = screenCoords[ib * 2];
    const by = screenCoords[ib * 2 + 1];
    const cx = screenCoords[ic * 2];
    const cy = screenCoords[ic * 2 + 1];

    if (Number.isNaN(ax) || Number.isNaN(bx) || Number.isNaN(cx)) continue;

    let minX = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
    let minY = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
    let maxX = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
    let maxY = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;

    minX -= EXPAND;
    minY -= EXPAND;
    maxX += EXPAND;
    maxY += EXPAND;

    if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
      const faceDepth = (cameraDistances[ia] + cameraDistances[ib] + cameraDistances[ic]) / 3;
      nearestDepth = Math.min(nearestDepth, faceDepth);
    }
  }

  return nearestDepth === Number.POSITIVE_INFINITY
    ? null
    : Math.trunc(nearestDepth * CLIENT_UNITS_PER_TILE * CLIENT_UNITS_PER_TILE);
}

/** Quad faces of a box, as corner indices (bit0 = +X, bit1 = +Y, bit2 = +Z). */
const AABB_QUADS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 2, 6, 4],
  [1, 3, 7, 5],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 1, 3, 2],
  [4, 5, 7, 6],
];

/**
 * The size-1 NPC clickbox: the projected AABB of the posed model, with no per-face test.
 *
 * RuneLite establishes the AABB branch for `useBoundingBox()`, but not this project's
 * unsourced size-1 rule. The rule keeps Jal-MejJak hittable while its posed faces are below
 * its origin. Measure the box in world space after scale and rotation; leave its vertical
 * extent unchanged so genuinely underground geometry remains unhittable.
 */
function screenNpcAabbHitDepth(
  screenPx: { x: number; y: number },
  hitData: NpcHitTestData,
  viewMatrix: number[],
  projMatrix: number[],
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  const { verticesX, verticesY, verticesZ, verticesCount, modelMatrix: mm } = hitData;
  if (verticesCount === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < verticesCount; i++) {
    const vx = verticesX[i];
    const vy = verticesY[i];
    const vz = verticesZ[i];
    const wx = mm[0] * vx + mm[4] * vy + mm[8] * vz + mm[12];
    const wy = mm[1] * vx + mm[5] * vy + mm[9] * vz + mm[13];
    const wz = mm[2] * vx + mm[6] * vy + mm[10] * vz + mm[14];
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const extentX = Math.max((maxX - minX) / 2, AABB_MIN_HORIZONTAL_EXTENT) + AABB_BOUNDING_MODEL_PADDING;
  const extentY = Math.max((maxY - minY) / 2, AABB_MIN_HORIZONTAL_EXTENT) + AABB_BOUNDING_MODEL_PADDING;
  const extentZ = (maxZ - minZ) / 2;

  // VP = projection × view: the box corners are already in world space.
  const vp = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      vp[c * 4 + r] =
        projMatrix[r] * viewMatrix[c * 4] +
        projMatrix[4 + r] * viewMatrix[c * 4 + 1] +
        projMatrix[8 + r] * viewMatrix[c * 4 + 2] +
        projMatrix[12 + r] * viewMatrix[c * 4 + 3];
    }
  }

  const halfW = viewportWidth * 0.5;
  const halfH = viewportHeight * 0.5;
  const cornerScreenX = new Float64Array(8);
  const cornerScreenY = new Float64Array(8);
  let nearestDepth = Number.POSITIVE_INFINITY;
  for (let corner = 0; corner < 8; corner++) {
    const wx = centerX + ((corner & 1) === 0 ? -extentX : extentX);
    const wy = centerY + ((corner & 2) === 0 ? -extentY : extentY);
    const wz = centerZ + ((corner & 4) === 0 ? -extentZ : extentZ);
    const w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    if (w <= 0) {
      cornerScreenX[corner] = NaN;
      cornerScreenY[corner] = NaN;
      continue;
    }
    const invW = 1 / w;
    const ndcX = (vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12]) * invW;
    const ndcY = (vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13]) * invW;
    cornerScreenX[corner] = (ndcX + 1) * halfW;
    cornerScreenY[corner] = (1 - ndcY) * halfH;
    const cameraX = viewMatrix[0] * wx + viewMatrix[4] * wy + viewMatrix[8] * wz + viewMatrix[12];
    const cameraY = viewMatrix[1] * wx + viewMatrix[5] * wy + viewMatrix[9] * wz + viewMatrix[13];
    const cameraZ = viewMatrix[2] * wx + viewMatrix[6] * wy + viewMatrix[10] * wz + viewMatrix[14];
    const depth = cameraX * cameraX + cameraY * cameraY + cameraZ * cameraZ;
    if (depth < nearestDepth) nearestDepth = depth;
  }

  let inside = false;
  for (const [a, b, c, d] of AABB_QUADS) {
    if (
      triangleContains(screenPx, a, b, c, cornerScreenX, cornerScreenY) ||
      triangleContains(screenPx, a, c, d, cornerScreenX, cornerScreenY)
    ) {
      inside = true;
      break;
    }
  }
  if (!inside || nearestDepth === Number.POSITIVE_INFINITY) return null;
  return Math.trunc(nearestDepth * CLIENT_UNITS_PER_TILE * CLIENT_UNITS_PER_TILE);
}

function triangleContains(
  point: { x: number; y: number },
  a: number,
  b: number,
  c: number,
  screenX: Float64Array,
  screenY: Float64Array,
): boolean {
  const ax = screenX[a];
  const ay = screenY[a];
  const bx = screenX[b];
  const by = screenY[b];
  const cx = screenX[c];
  const cy = screenY[c];
  if (Number.isNaN(ax) || Number.isNaN(bx) || Number.isNaN(cx)) return false;
  const crossAB = (bx - ax) * (point.y - ay) - (by - ay) * (point.x - ax);
  const crossBC = (cx - bx) * (point.y - by) - (cy - by) * (point.x - bx);
  const crossCA = (ax - cx) * (point.y - cy) - (ay - cy) * (point.x - cx);
  return (crossAB >= 0 && crossBC >= 0 && crossCA >= 0) || (crossAB <= 0 && crossBC <= 0 && crossCA <= 0);
}

/**
 * Unified NPC pick used by hover, left-click, and right-click.
 *
 * Iterates every live NPC instance (`getAllNpcHitTestData()`), treating the boss
 * and adds identically — there is no primary-NPC singleton path and no idle-pose
 * broadphase. Runs the OSRS-faithful narrowphase on each animated pose and
 * returns EVERY hit resolved to its sim/lobby identity, nearest first by the
 * integer depth of the nearest hit face.
 *
 * Returning every hit is what lets the right-click menu list stacked NPCs the way
 * OSRS does: in game a right-click on a stack lists every actor whose clickbox
 * contains the cursor. Hover and left-click walk the same
 * list and act on the first NPC that owns a menu op.
 *
 * Exact integer-depth ties keep the `entries` order, which is the scene's
 * instance order (`Array.sort` is stable).
 * Duplicate identities (several hit-test entries resolving through the same actor,
 * e.g. the `primary-npc` singleton) collapse to their nearest hit.
 */
export function pickNpcsAtScreen(
  screenPx: { x: number; y: number },
  ray: Ray3D,
  entries: ReadonlyArray<{ actorId: string; hitTestData: NpcHitTestData }>,
  viewMatrix: number[],
  projMatrix: number[],
  viewportWidth: number,
  viewportHeight: number,
  resolveActor: NpcActorResolver,
): PickedNpc[] {
  const hits: PickedNpc[] = [];

  for (const { actorId, hitTestData } of entries) {
    const distance = screenNpcModelHitDepth(
      screenPx,
      hitTestData,
      viewMatrix,
      projMatrix,
      viewportWidth,
      viewportHeight,
    );
    if (distance === null) {
      continue;
    }

    const mm = hitTestData.modelMatrix;
    const relX = mm[12] - ray.origin.x;
    const relY = mm[13] - ray.origin.y;
    const relZ = mm[14] - ray.origin.z;
    // Signed distance along the ray to the NPC origin. Negative = behind camera.
    const originDistance = relX * ray.direction.x + relY * ray.direction.y + relZ * ray.direction.z;
    if (originDistance < 0) continue;

    const resolved = resolveActor(actorId);
    if (!resolved) continue;

    hits.push({
      actorId: resolved.actorId,
      npcTypeId: resolved.npcTypeId,
      position: resolved.position,
      distance,
    });
  }

  hits.sort((a, b) => a.distance - b.distance);

  // Dedupe after sorting so a repeated identity keeps its nearest hit.
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.actorId)) return false;
    seen.add(hit.actorId);
    return true;
  });
}
