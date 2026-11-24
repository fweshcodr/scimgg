import type { LocModelType } from '../../rs/config/loctype/LocModelType';
import { LocType } from '../../rs/config/loctype/LocType';

export const LOC_MAP_TYPES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
] as const;

export type LocMapType = (typeof LOC_MAP_TYPES)[number];
export type CardinalRotation = 0 | 1 | 2 | 3;
export type LocModelRotation = CardinalRotation | 4 | 5 | 6 | 7;
export type LocSceneAngle = 0 | 256;

const CARDINAL_ROTATIONS = [0, 1, 2, 3] as const;
export const DEFAULT_BOUNDARY_DISPLACEMENT = LocType.DEFAULT_DECOR_DISPLACEMENT;

export function parseLocMapType(value: number): LocMapType | null {
  return LOC_MAP_TYPES[value] ?? null;
}

export function parseCardinalRotation(value: number): CardinalRotation | null {
  return CARDINAL_ROTATIONS[value] ?? null;
}

export function normalizeCardinalRotation(value: number): CardinalRotation {
  const rotation = CARDINAL_ROTATIONS[value & 3];
  if (rotation === undefined) {
    throw new RangeError(`Unexpected LOC rotation: ${value}`);
  }
  return rotation;
}

export type LocFootprint = {
  readonly sizeX: number;
  readonly sizeY: number;
};

export type LocSceneOffset = {
  readonly x: number;
  readonly y: number;
};

export type LocModelRequest = {
  readonly modelType: LocModelType;
  readonly rotation: LocModelRotation;
};

export type LocPlacementDescriptor = {
  readonly modelRequests: readonly [LocModelRequest] | readonly [LocModelRequest, LocModelRequest];
  readonly terrainFootprint: LocFootprint;
  readonly sceneFootprint: LocFootprint;
  readonly sceneOffset: LocSceneOffset;
  readonly sceneAngle: LocSceneAngle;
};

export type ResolveLocPlacementInput = {
  readonly type: LocMapType;
  readonly rotation: CardinalRotation;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly boundaryDisplacement: number;
};

export type BoundaryLoc = {
  readonly location: {
    readonly level: number;
    readonly localX: number;
    readonly localY: number;
    readonly type: number;
  };
  readonly locType: {
    readonly decorDisplacement: number;
  };
};

export type BoundaryTile = {
  readonly level: number;
  readonly localX: number;
  readonly localY: number;
};

export type BoundaryDisplacementIndex = ReadonlyMap<number, ReadonlyMap<number, ReadonlyMap<number, number>>>;

export type SampleLocTerrainHeightInput = {
  readonly terrainHeights: readonly Int32Array[] | null;
  readonly localX: number;
  readonly localY: number;
  readonly footprint: LocFootprint;
};

export type BuildLocModelMatrixInput = {
  readonly placement: LocPlacementDescriptor;
  readonly localX: number;
  readonly localY: number;
  readonly terrainLocalX: number;
  readonly terrainLocalY: number;
  readonly terrainHeights: readonly Int32Array[] | null;
  readonly animationHeightOffset: number;
};

const SCALE = 1 / 128;
const ZERO_OFFSET = { x: 0, y: 0 } as const;
const SINGLE_TILE = { sizeX: 1, sizeY: 1 } as const;
const CARDINAL_X = [1, 0, -1, 0] as const;
const CARDINAL_Y = [0, -1, 0, 1] as const;
const DIAGONAL_X = [1, -1, -1, 1] as const;
const DIAGONAL_Y = [-1, -1, 1, 1] as const;

function assertNever(value: never): never {
  throw new RangeError(`Unexpected LOC value: ${value}`);
}

function nextRotation(rotation: CardinalRotation): CardinalRotation {
  switch (rotation) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 0;
    default:
      return assertNever(rotation);
  }
}

function oppositeRotation(rotation: CardinalRotation): CardinalRotation {
  switch (rotation) {
    case 0:
      return 2;
    case 1:
      return 3;
    case 2:
      return 0;
    case 3:
      return 1;
    default:
      return assertNever(rotation);
  }
}

function extendedRotation(rotation: CardinalRotation): 4 | 5 | 6 | 7 {
  switch (rotation) {
    case 0:
      return 4;
    case 1:
      return 5;
    case 2:
      return 6;
    case 3:
      return 7;
    default:
      return assertNever(rotation);
  }
}

function modelRequests(type: LocMapType, rotation: CardinalRotation): LocPlacementDescriptor['modelRequests'] {
  switch (type) {
    case 0:
      return [{ modelType: 0, rotation }];
    case 1:
      return [{ modelType: 1, rotation }];
    case 2:
      return [
        { modelType: 2, rotation: extendedRotation(rotation) },
        { modelType: 2, rotation: nextRotation(rotation) },
      ];
    case 3:
      return [{ modelType: 3, rotation }];
    case 4:
    case 5:
      return [{ modelType: 4, rotation }];
    case 6:
      return [{ modelType: 4, rotation: extendedRotation(rotation) }];
    case 7:
      return [{ modelType: 4, rotation: extendedRotation(oppositeRotation(rotation)) }];
    case 8:
      return [
        { modelType: 4, rotation: extendedRotation(rotation) },
        { modelType: 4, rotation: extendedRotation(oppositeRotation(rotation)) },
      ];
    case 9:
      return [{ modelType: 9, rotation }];
    case 10:
      return [{ modelType: 10, rotation }];
    case 11:
      return [{ modelType: 10, rotation: extendedRotation(rotation) }];
    case 12:
      return [{ modelType: 12, rotation }];
    case 13:
      return [{ modelType: 13, rotation }];
    case 14:
      return [{ modelType: 14, rotation }];
    case 15:
      return [{ modelType: 15, rotation }];
    case 16:
      return [{ modelType: 16, rotation }];
    case 17:
      return [{ modelType: 17, rotation }];
    case 18:
      return [{ modelType: 18, rotation }];
    case 19:
      return [{ modelType: 19, rotation }];
    case 20:
      return [{ modelType: 20, rotation }];
    case 21:
      return [{ modelType: 21, rotation }];
    case 22:
      return [{ modelType: 22, rotation }];
    default:
      return assertNever(type);
  }
}

export function resolveLocPlacement(input: ResolveLocPlacementInput): LocPlacementDescriptor {
  const terrainFootprint =
    (input.rotation & 1) === 0
      ? { sizeX: input.sizeX, sizeY: input.sizeY }
      : { sizeX: input.sizeY, sizeY: input.sizeX };
  const sceneFootprint = input.type === 10 || input.type === 11 ? terrainFootprint : SINGLE_TILE;
  let sceneOffset: LocSceneOffset = ZERO_OFFSET;

  if (input.type === 5) {
    sceneOffset = {
      x: input.boundaryDisplacement * CARDINAL_X[input.rotation],
      y: input.boundaryDisplacement * CARDINAL_Y[input.rotation],
    };
  } else if (input.type === 6 || input.type === 8) {
    const halfDisplacement = Math.trunc(input.boundaryDisplacement / 2);
    sceneOffset = {
      x: halfDisplacement * DIAGONAL_X[input.rotation],
      y: halfDisplacement * DIAGONAL_Y[input.rotation],
    };
  }

  return {
    modelRequests: modelRequests(input.type, input.rotation),
    terrainFootprint,
    sceneFootprint,
    sceneOffset,
    sceneAngle: 0,
  };
}

export function buildBoundaryDisplacementIndex(locs: readonly BoundaryLoc[]): BoundaryDisplacementIndex {
  const index = new Map<number, Map<number, Map<number, number>>>();
  for (const loc of locs) {
    if (loc.location.type < 0 || loc.location.type > 3) continue;
    let byX = index.get(loc.location.level);
    if (!byX) {
      byX = new Map();
      index.set(loc.location.level, byX);
    }
    let byY = byX.get(loc.location.localX);
    if (!byY) {
      byY = new Map();
      byX.set(loc.location.localX, byY);
    }
    byY.set(loc.location.localY, loc.locType.decorDisplacement);
  }
  return index;
}

export function resolveBoundaryDisplacement(index: BoundaryDisplacementIndex, tile: BoundaryTile): number {
  return index.get(tile.level)?.get(tile.localX)?.get(tile.localY) ?? DEFAULT_BOUNDARY_DISPLACEMENT;
}

/** Returns the midpoint-sampled terrain height under a loc's footprint, in raw OSRS units. */
export function sampleLocTerrainHeight(input: SampleLocTerrainHeightInput): number {
  const firstColumn = input.terrainHeights?.[0];
  if (!input.terrainHeights || !firstColumn) return 0;
  const maxX = input.terrainHeights.length - 1;
  const maxY = firstColumn.length - 1;
  const x0 = input.localX + input.footprint.sizeX <= maxX ? input.localX + (input.footprint.sizeX >> 1) : input.localX;
  const x1 =
    input.localX + input.footprint.sizeX <= maxX ? input.localX + ((input.footprint.sizeX + 1) >> 1) : input.localX + 1;
  const y0 = input.localY + input.footprint.sizeY <= maxY ? input.localY + (input.footprint.sizeY >> 1) : input.localY;
  const y1 =
    input.localY + input.footprint.sizeY <= maxY ? input.localY + ((input.footprint.sizeY + 1) >> 1) : input.localY + 1;
  const heights = input.terrainHeights;
  return (
    ((heights[x0]?.[y1] ?? 0) + (heights[x0]?.[y0] ?? 0) + (heights[x1]?.[y0] ?? 0) + (heights[x1]?.[y1] ?? 0)) >> 2
  );
}

/** Builds the OSRS model-space to simulator-world matrix for a resolved placement. */
export function buildLocModelMatrix(input: BuildLocModelMatrixInput): Float32Array {
  const terrainHeight = sampleLocTerrainHeight({
    terrainHeights: input.terrainHeights,
    localX: input.terrainLocalX,
    localY: input.terrainLocalY,
    footprint: input.placement.terrainFootprint,
  });
  const theta = (input.placement.sceneAngle / 2048) * 2 * Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const tx = input.localX + input.placement.sceneFootprint.sizeX * 0.5 + input.placement.sceneOffset.x * SCALE;
  const ty = input.localY + input.placement.sceneFootprint.sizeY * 0.5 + input.placement.sceneOffset.y * SCALE;
  const tz = (-terrainHeight + input.animationHeightOffset) * SCALE;
  return new Float32Array([
    SCALE * cos,
    -SCALE * sin,
    0,
    0,
    0,
    0,
    -SCALE,
    0,
    SCALE * sin,
    SCALE * cos,
    0,
    0,
    tx,
    ty,
    tz,
    1,
  ]);
}
