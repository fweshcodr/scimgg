const MAX_DIAMETER = 6000;
const DYNAMIC_SENTINEL = -1000;

export interface FaceSortInput {
  verticesX: { [index: number]: number };
  verticesY: { [index: number]: number };
  verticesZ: { [index: number]: number };
  verticesCount: number;
  indices1: { [index: number]: number };
  indices2: { [index: number]: number };
  indices3: { [index: number]: number };
  faceCount: number;
  faceRenderPriorities: Int8Array | null;
  priority: number;
  faceAlphas: Int8Array | null;
  faceColors3: { [index: number]: number };
}

export interface FaceSortResult {
  opaqueFaces: number[];
  transparentFaces: number[];
}

/**
 * Camera state for face sorting projection.
 * Matches RuneLite's IntProjection.project() approach:
 * works in OSRS game-unit coordinates for proper depth bucket resolution.
 */
export interface SorterProjection {
  // Camera position in OSRS game units (128 per tile)
  cameraX: number;
  cameraY: number; // height axis (OSRS Y = height, negative = up)
  cameraZ: number;
  // Camera rotation trig values
  yawSin: number;
  yawCos: number;
  pitchSin: number;
  pitchCos: number;
  // Model orientation (OSRS angle: 0-2047, 0=south, 512=west, 1024=north, 1536=east)
  orientation: number;
  // Model world position in OSRS game units
  modelX: number;
  modelY: number; // height
  modelZ: number;
}

// Results are written by index and cut to length on return rather than cleared and pushed:
// clearing an array releases its backing store, so every call regrew it from empty.
let resultOpaqueCount = 0;
let resultTransparentCount = 0;

function appendFace(result: FaceSortResult, faceIndex: number, faceAlphas: Int8Array | null): void {
  if (faceAlphas && faceAlphas[faceIndex] !== 0) {
    result.transparentFaces[resultTransparentCount++] = faceIndex;
    return;
  }
  result.opaqueFaces[resultOpaqueCount++] = faceIndex;
}

function clampPriority(priority: number): number {
  if (priority < 0) {
    return 0;
  }
  if (priority > 11) {
    return 11;
  }
  return priority;
}

function getFacePriority(input: FaceSortInput, faceIndex: number): number {
  if (input.faceRenderPriorities != null) {
    return clampPriority(input.faceRenderPriorities[faceIndex]);
  }
  return clampPriority(input.priority);
}

const ORIENTATION_SIN_CACHE = new Float64Array(2048);
const ORIENTATION_COS_CACHE = new Float64Array(2048);
for (let i = 0; i < 2048; i++) {
  const angle = (i / 2048) * 2 * Math.PI;
  ORIENTATION_SIN_CACHE[i] = Math.sin(angle);
  ORIENTATION_COS_CACHE[i] = Math.cos(angle);
}

let scratchProjectedX = new Float64Array(256);
let scratchProjectedY = new Float64Array(256);
let scratchDistances = new Float64Array(256);
const scratchZsortHead = new Int32Array(MAX_DIAMETER);
const scratchZsortTail = new Int32Array(MAX_DIAMETER);
let scratchZsortNext = new Int32Array(256);
const scratchSortResults: [FaceSortResult, FaceSortResult] = [
  { opaqueFaces: [], transparentFaces: [] },
  { opaqueFaces: [], transparentFaces: [] },
];
let scratchSortResultIndex = 0;

// The priority buckets are never cleared: each is filled from index 0 and read only below its
// count in scratchNumOfPriority, so stale entries past the count are never seen.
const scratchNumOfPriority = new Int32Array(12);
const scratchLt10 = new Int32Array(12);
const scratchOrderedFaces: number[][] = Array.from({ length: 12 }, () => []);
const scratchEq10: number[] = [];
const scratchEq11: number[] = [];
const scratchTransparentOnly: number[] = [];

function ensureVertexScratchCapacity(verticesCount: number): void {
  if (verticesCount <= scratchProjectedX.length) {
    return;
  }
  scratchProjectedX = new Float64Array(verticesCount);
  scratchProjectedY = new Float64Array(verticesCount);
  scratchDistances = new Float64Array(verticesCount);
}

function ensureFaceScratchCapacity(faceCount: number): void {
  if (faceCount <= scratchZsortNext.length) {
    return;
  }
  scratchZsortNext = new Int32Array(faceCount);
}

function finishResult(result: FaceSortResult): FaceSortResult {
  result.opaqueFaces.length = resultOpaqueCount;
  result.transparentFaces.length = resultTransparentCount;
  return result;
}

/**
 * Sorts a model's faces into draw order. The result and its arrays are reused: they stay valid
 * through the next call and are overwritten by the one after, so copy them to keep them longer.
 */
export function sortModelFaces(
  input: FaceSortInput,
  projection: SorterProjection | null,
  cullFace: 'back' | 'front' | 'none' = 'back',
): FaceSortResult {
  scratchSortResultIndex ^= 1;
  const result = scratchSortResults[scratchSortResultIndex];
  resultOpaqueCount = 0;
  resultTransparentCount = 0;

  if (input.faceCount <= 0 || input.verticesCount <= 0) {
    return finishResult(result);
  }

  ensureVertexScratchCapacity(input.verticesCount);
  ensureFaceScratchCapacity(input.faceCount);

  const projectedX = scratchProjectedX;
  const projectedY = scratchProjectedY;
  const distances = scratchDistances;

  let originDepth = 0;
  let diameter = 0;
  let minDistance = 0;

  if (projection !== null) {
    const { cameraX, cameraY, cameraZ, yawSin, yawCos, pitchSin, pitchCos, orientation, modelX, modelY, modelZ } =
      projection;

    // Orientation rotation (same as RuneLite's FacePrioritySorter lines 128-133)
    let orientSin = 0;
    let orientCos = 1;
    if (orientation !== 0) {
      const orientIdx = orientation & 2047;
      orientSin = ORIENTATION_SIN_CACHE[orientIdx];
      orientCos = ORIENTATION_COS_CACHE[orientIdx];
    }

    {
      const odx = modelX - cameraX;
      const ody = modelY - cameraY;
      const odz = modelZ - cameraZ;
      const orz = odz * yawCos - odx * yawSin;
      originDepth = orz * pitchCos + ody * pitchSin;
    }
    const zero = Math.trunc(originDepth);

    minDistance = Number.POSITIVE_INFINITY;
    let maxDistance = Number.NEGATIVE_INFINITY;

    for (let v = 0; v < input.verticesCount; v++) {
      let vx = input.verticesX[v];
      const vy = input.verticesY[v];
      let vz = input.verticesZ[v];

      // Apply OSRS orientation rotation (around Y/height axis)
      if (orientation !== 0) {
        const x0 = vx;
        vx = vz * orientSin + x0 * orientCos;
        vz = vz * orientCos - x0 * orientSin;
      }

      // Translate to world position (in OSRS game units)
      const wx = vx + modelX;
      const wy = vy + modelY;
      const wz = vz + modelZ;

      const pdx = wx - cameraX;
      const pdy = wy - cameraY;
      const pdz = wz - cameraZ;
      const prx = pdx * yawCos + pdz * yawSin;
      const prz = pdz * yawCos - pdx * yawSin;
      const screenX = prx;
      const screenY = pdy * pitchCos - prz * pitchSin;
      const depth = prz * pitchCos + pdy * pitchSin;

      // Near-plane check (matches OSRS IntProjection: `if (p[2] < 50) return 0`)
      if (depth < 50) {
        // Model too close to camera — skip entirely (OSRS skips the model)
        return finishResult(result);
      }

      projectedX[v] = screenX / depth;
      projectedY[v] = screenY / depth;

      const distance = Math.trunc(depth) - zero;
      distances[v] = distance;

      if (distance < minDistance) {
        minDistance = distance;
      }
      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }

    diameter = maxDistance - minDistance + 1;

    if (diameter >= MAX_DIAMETER) {
      return finishResult(result);
    }
  } else {
    diameter = Math.max(input.faceCount, 1);
  }

  // Note: zsortNext is NOT fill'd here — only zsortHead/zsortTail need clearing.
  // Each face inserted into a bucket always sets zsortNext[face] = -1 (lines 296/300),
  // so stale values from a previous call are never read.
  const zsortHead = scratchZsortHead;
  const zsortTail = scratchZsortTail;
  const zsortNext = scratchZsortNext;
  zsortHead.fill(-1, 0, diameter);
  zsortTail.fill(-1, 0, diameter);

  let minFz = diameter;
  let maxFz = 0;

  for (let faceIndex = 0; faceIndex < input.faceCount; faceIndex++) {
    if (input.faceColors3[faceIndex] === -2) {
      continue;
    }

    const v1 = input.indices1[faceIndex];
    const v2 = input.indices2[faceIndex];
    const v3 = input.indices3[faceIndex];

    if (projection !== null) {
      const aX = projectedX[v1];
      const aY = projectedY[v1];
      const bX = projectedX[v2];
      const bY = projectedY[v2];
      const cX = projectedX[v3];
      const cY = projectedY[v3];

      // Backface cull: same cross product and sign as RuneLite (> 0 = front-facing)
      const faceArea = (aX - bX) * (cY - bY) - (cX - bX) * (aY - bY);
      if ((cullFace === 'back' && faceArea <= 0) || (cullFace === 'front' && faceArea >= 0)) {
        continue;
      }
    }

    let distanceBucket: number;
    if (projection !== null) {
      const avgDistance = Math.trunc((distances[v1] + distances[v2] + distances[v3]) / 3);
      distanceBucket = avgDistance - minDistance;
      // Clamp to valid range. Mathematically, avgDistance should
      // always be within [minDistance, maxDistance], but clamp defensively to
      // avoid dropping faces on floating-point edge cases.
      if (distanceBucket < 0) distanceBucket = 0;
      if (distanceBucket >= diameter) distanceBucket = diameter - 1;
    } else {
      distanceBucket = input.faceCount - 1 - faceIndex;
    }

    if (zsortTail[distanceBucket] === -1) {
      zsortHead[distanceBucket] = faceIndex;
      zsortTail[distanceBucket] = faceIndex;
      zsortNext[faceIndex] = -1;
    } else {
      const lastFace = zsortTail[distanceBucket];
      zsortNext[lastFace] = faceIndex;
      zsortNext[faceIndex] = -1;
      zsortTail[distanceBucket] = faceIndex;
    }

    if (distanceBucket < minFz) {
      minFz = distanceBucket;
    }
    if (distanceBucket > maxFz) {
      maxFz = distanceBucket;
    }
  }

  if (minFz > maxFz) {
    return finishResult(result);
  }

  const usePriorityInterleave = input.faceRenderPriorities != null || projection === null;
  if (!usePriorityInterleave) {
    for (let distance = maxFz; distance >= minFz; distance--) {
      for (let face = zsortHead[distance]; face !== -1; face = zsortNext[face]) {
        appendFace(result, face, input.faceAlphas);
      }
    }
    return finishResult(result);
  }

  const numOfPriority = scratchNumOfPriority;
  const lt10 = scratchLt10;
  numOfPriority.fill(0);
  lt10.fill(0);
  const orderedFaces = scratchOrderedFaces;
  const eq10 = scratchEq10;
  const eq11 = scratchEq11;

  for (let distance = maxFz; distance >= minFz; distance--) {
    for (let face = zsortHead[distance]; face !== -1; face = zsortNext[face]) {
      const priority = getFacePriority(input, face);
      const distIdx = numOfPriority[priority]++;
      orderedFaces[priority][distIdx] = face;

      if (priority < 10) {
        lt10[priority] += distance;
      } else if (priority === 10) {
        eq10[distIdx] = distance;
      } else {
        eq11[distIdx] = distance;
      }
    }
  }

  let avg12 = 0;
  if (numOfPriority[1] > 0 || numOfPriority[2] > 0) {
    avg12 = Math.trunc((lt10[1] + lt10[2]) / (numOfPriority[1] + numOfPriority[2]));
  }

  let avg34 = 0;
  if (numOfPriority[3] > 0 || numOfPriority[4] > 0) {
    avg34 = Math.trunc((lt10[3] + lt10[4]) / (numOfPriority[3] + numOfPriority[4]));
  }

  let avg68 = 0;
  if (numOfPriority[6] > 0 || numOfPriority[8] > 0) {
    avg68 = Math.trunc((lt10[6] + lt10[8]) / (numOfPriority[6] + numOfPriority[8]));
  }

  let drawnFaces = 0;
  let numDynFaces = numOfPriority[10];
  let dynFaces = orderedFaces[10];
  let dynFaceDistances = eq10;

  if (drawnFaces === numDynFaces) {
    drawnFaces = 0;
    numDynFaces = numOfPriority[11];
    dynFaces = orderedFaces[11];
    dynFaceDistances = eq11;
  }

  let currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;

  for (let priority = 0; priority < 10; priority++) {
    while (priority === 0 && currFaceDistance > avg12) {
      const face = dynFaces[drawnFaces++];
      appendFace(result, face, input.faceAlphas);

      if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
        drawnFaces = 0;
        numDynFaces = numOfPriority[11];
        dynFaces = orderedFaces[11];
        dynFaceDistances = eq11;
      }

      currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
    }

    while (priority === 3 && currFaceDistance > avg34) {
      const face = dynFaces[drawnFaces++];
      appendFace(result, face, input.faceAlphas);

      if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
        drawnFaces = 0;
        numDynFaces = numOfPriority[11];
        dynFaces = orderedFaces[11];
        dynFaceDistances = eq11;
      }

      currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
    }

    while (priority === 5 && currFaceDistance > avg68) {
      const face = dynFaces[drawnFaces++];
      appendFace(result, face, input.faceAlphas);

      if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
        drawnFaces = 0;
        numDynFaces = numOfPriority[11];
        dynFaces = orderedFaces[11];
        dynFaceDistances = eq11;
      }

      currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
    }

    const priorityFaces = orderedFaces[priority];
    for (let faceIndex = 0; faceIndex < numOfPriority[priority]; faceIndex++) {
      appendFace(result, priorityFaces[faceIndex], input.faceAlphas);
    }
  }

  while (currFaceDistance !== DYNAMIC_SENTINEL) {
    const face = dynFaces[drawnFaces++];
    appendFace(result, face, input.faceAlphas);

    if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
      drawnFaces = 0;
      numDynFaces = numOfPriority[11];
      dynFaces = orderedFaces[11];
      dynFaceDistances = eq11;
    }

    currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
  }

  return finishResult(result);
}

function finishTransparentOnly(count: number): number[] {
  scratchTransparentOnly.length = count;
  return scratchTransparentOnly;
}

/**
 * Sorts the given transparent faces into draw order. The returned array is reused by the next
 * call, so copy it to keep it.
 */
export function sortTransparentFacesOnly(
  transparentFaceIndices: number[] | Uint32Array,
  input: FaceSortInput,
  projection: SorterProjection,
): number[] {
  const numFaces = transparentFaceIndices.length;
  if (numFaces <= 0 || input.verticesCount <= 0) {
    return finishTransparentOnly(0);
  }

  ensureVertexScratchCapacity(input.verticesCount);
  ensureFaceScratchCapacity(input.faceCount);

  const { cameraX, cameraY, cameraZ, yawSin, yawCos, pitchSin, pitchCos, orientation, modelX, modelY, modelZ } =
    projection;

  let orientSin = 0;
  let orientCos = 1;
  if (orientation !== 0) {
    const orientIdx = orientation & 2047;
    orientSin = ORIENTATION_SIN_CACHE[orientIdx];
    orientCos = ORIENTATION_COS_CACHE[orientIdx];
  }

  let originDepth: number;
  {
    const odx = modelX - cameraX;
    const ody = modelY - cameraY;
    const odz = modelZ - cameraZ;
    const orz = odz * yawCos - odx * yawSin;
    originDepth = orz * pitchCos + ody * pitchSin;
  }
  const zero = Math.trunc(originDepth);

  const projectedX = scratchProjectedX;
  const projectedY = scratchProjectedY;
  const distances = scratchDistances;
  let minDistance = Number.POSITIVE_INFINITY;
  let maxDistance = Number.NEGATIVE_INFINITY;

  for (let v = 0; v < input.verticesCount; v++) {
    let vx = input.verticesX[v];
    const vy = input.verticesY[v];
    let vz = input.verticesZ[v];

    if (orientation !== 0) {
      const x0 = vx;
      vx = vz * orientSin + x0 * orientCos;
      vz = vz * orientCos - x0 * orientSin;
    }

    const wx = vx + modelX;
    const wy = vy + modelY;
    const wz = vz + modelZ;

    const pdx = wx - cameraX;
    const pdy = wy - cameraY;
    const pdz = wz - cameraZ;
    const prx = pdx * yawCos + pdz * yawSin;
    const prz = pdz * yawCos - pdx * yawSin;
    const screenX = prx;
    const screenY = pdy * pitchCos - prz * pitchSin;
    const depth = prz * pitchCos + pdy * pitchSin;

    if (depth < 50) {
      return finishTransparentOnly(0);
    }

    projectedX[v] = screenX / depth;
    projectedY[v] = screenY / depth;

    const distance = Math.trunc(depth) - zero;
    distances[v] = distance;

    if (distance < minDistance) minDistance = distance;
    if (distance > maxDistance) maxDistance = distance;
  }

  const diameter = maxDistance - minDistance + 1;
  if (diameter >= MAX_DIAMETER) {
    return finishTransparentOnly(0);
  }

  const zsortHead = scratchZsortHead;
  const zsortTail = scratchZsortTail;
  const zsortNext = scratchZsortNext;
  zsortHead.fill(-1, 0, diameter);
  zsortTail.fill(-1, 0, diameter);

  let minFz = diameter;
  let maxFz = 0;

  for (let i = 0; i < numFaces; i++) {
    const faceIndex = transparentFaceIndices[i];

    if (input.faceColors3[faceIndex] === -2) {
      continue;
    }

    const v1 = input.indices1[faceIndex];
    const v2 = input.indices2[faceIndex];
    const v3 = input.indices3[faceIndex];

    const aX = projectedX[v1];
    const aY = projectedY[v1];
    const bX = projectedX[v2];
    const bY = projectedY[v2];
    const cX = projectedX[v3];
    const cY = projectedY[v3];

    const faceArea = (aX - bX) * (cY - bY) - (cX - bX) * (aY - bY);
    if (faceArea <= 0) {
      continue;
    }

    const avgDistance = Math.trunc((distances[v1] + distances[v2] + distances[v3]) / 3);
    let distanceBucket = avgDistance - minDistance;
    if (distanceBucket < 0) distanceBucket = 0;
    if (distanceBucket >= diameter) distanceBucket = diameter - 1;

    if (zsortTail[distanceBucket] === -1) {
      zsortHead[distanceBucket] = faceIndex;
      zsortTail[distanceBucket] = faceIndex;
      zsortNext[faceIndex] = -1;
    } else {
      const lastFace = zsortTail[distanceBucket];
      zsortNext[lastFace] = faceIndex;
      zsortNext[faceIndex] = -1;
      zsortTail[distanceBucket] = faceIndex;
    }

    if (distanceBucket < minFz) minFz = distanceBucket;
    if (distanceBucket > maxFz) maxFz = distanceBucket;
  }

  if (minFz > maxFz) {
    return finishTransparentOnly(0);
  }

  // Priority interleaving (same as sortModelFaces)
  const usePriorityInterleave = input.faceRenderPriorities != null;
  const result = scratchTransparentOnly;
  let count = 0;

  if (!usePriorityInterleave) {
    // Simple back-to-front by depth bucket
    for (let distance = maxFz; distance >= minFz; distance--) {
      for (let face = zsortHead[distance]; face !== -1; face = zsortNext[face]) {
        result[count++] = face;
      }
    }
  } else {
    // Full priority interleaving (RuneLite algorithm)
    const numOfPriority = scratchNumOfPriority;
    const lt10 = scratchLt10;
    numOfPriority.fill(0);
    lt10.fill(0);
    const orderedFaces = scratchOrderedFaces;
    const eq10 = scratchEq10;
    const eq11 = scratchEq11;

    for (let distance = maxFz; distance >= minFz; distance--) {
      for (let face = zsortHead[distance]; face !== -1; face = zsortNext[face]) {
        const priority = getFacePriority(input, face);
        const distIdx = numOfPriority[priority]++;
        orderedFaces[priority][distIdx] = face;
        if (priority < 10) {
          lt10[priority] += distance;
        } else if (priority === 10) {
          eq10[distIdx] = distance;
        } else {
          eq11[distIdx] = distance;
        }
      }
    }

    let avg12 = 0;
    if (numOfPriority[1] > 0 || numOfPriority[2] > 0) {
      avg12 = Math.trunc((lt10[1] + lt10[2]) / (numOfPriority[1] + numOfPriority[2]));
    }
    let avg34 = 0;
    if (numOfPriority[3] > 0 || numOfPriority[4] > 0) {
      avg34 = Math.trunc((lt10[3] + lt10[4]) / (numOfPriority[3] + numOfPriority[4]));
    }
    let avg68 = 0;
    if (numOfPriority[6] > 0 || numOfPriority[8] > 0) {
      avg68 = Math.trunc((lt10[6] + lt10[8]) / (numOfPriority[6] + numOfPriority[8]));
    }

    let drawnFaces = 0;
    let numDynFaces = numOfPriority[10];
    let dynFaces = orderedFaces[10];
    let dynFaceDistances = eq10;

    if (drawnFaces === numDynFaces) {
      drawnFaces = 0;
      numDynFaces = numOfPriority[11];
      dynFaces = orderedFaces[11];
      dynFaceDistances = eq11;
    }

    let currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;

    for (let priority = 0; priority < 10; priority++) {
      while (priority === 0 && currFaceDistance > avg12) {
        result[count++] = dynFaces[drawnFaces++];
        if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
          drawnFaces = 0;
          numDynFaces = numOfPriority[11];
          dynFaces = orderedFaces[11];
          dynFaceDistances = eq11;
        }
        currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
      }
      while (priority === 3 && currFaceDistance > avg34) {
        result[count++] = dynFaces[drawnFaces++];
        if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
          drawnFaces = 0;
          numDynFaces = numOfPriority[11];
          dynFaces = orderedFaces[11];
          dynFaceDistances = eq11;
        }
        currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
      }
      while (priority === 5 && currFaceDistance > avg68) {
        result[count++] = dynFaces[drawnFaces++];
        if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
          drawnFaces = 0;
          numDynFaces = numOfPriority[11];
          dynFaces = orderedFaces[11];
          dynFaceDistances = eq11;
        }
        currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
      }
      const priorityFaces = orderedFaces[priority];
      for (let fi = 0; fi < numOfPriority[priority]; fi++) {
        result[count++] = priorityFaces[fi];
      }
    }

    while (currFaceDistance !== DYNAMIC_SENTINEL) {
      result[count++] = dynFaces[drawnFaces++];
      if (drawnFaces === numDynFaces && dynFaces !== orderedFaces[11]) {
        drawnFaces = 0;
        numDynFaces = numOfPriority[11];
        dynFaces = orderedFaces[11];
        dynFaceDistances = eq11;
      }
      currFaceDistance = drawnFaces < numDynFaces ? dynFaceDistances[drawnFaces] : DYNAMIC_SENTINEL;
    }
  }

  return finishTransparentOnly(count);
}
