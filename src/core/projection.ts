import type { Coordinate } from '../types/simulation';

export interface ScreenPos {
  x: number;
  y: number;
}

export interface ProjectionConfig {
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
  rotation?: number; // 0, 90, 180, 270
}

export interface Projection {
  readonly name: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  gridToScreen(col: number, row: number): ScreenPos;
  screenToGrid(x: number, y: number): Coordinate | null;
  getTileCorners(col: number, row: number): ScreenPos[];
  getRenderOrder(): Coordinate[];
}

function applyRotation(
  col: number,
  row: number,
  rotation: number,
  gridWidth: number,
  gridHeight: number,
): [number, number] {
  const normRot = ((rotation % 360) + 360) % 360;
  switch (normRot) {
    case 90:
      return [gridHeight - 1 - row, col];
    case 180:
      return [gridWidth - 1 - col, gridHeight - 1 - row];
    case 270:
      return [row, gridWidth - 1 - col];
    default:
      return [col, row];
  }
}

function inverseRotation(
  sCol: number,
  sRow: number,
  rotation: number,
  gridWidth: number,
  gridHeight: number,
): [number, number] {
  const normRot = ((rotation % 360) + 360) % 360;
  switch (normRot) {
    case 90:
      return [sRow, gridHeight - 1 - sCol];
    case 180:
      return [gridWidth - 1 - sCol, gridHeight - 1 - sRow];
    case 270:
      return [gridWidth - 1 - sRow, sCol];
    default:
      return [sCol, sRow];
  }
}

export class TopDownProjection implements Projection {
  readonly name = 'top-down';
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  private readonly config: ProjectionConfig;
  private readonly screenTilesX: number;
  private readonly screenTilesY: number;

  constructor(config: ProjectionConfig) {
    this.config = config;
    const isRotated = (config.rotation ?? 0) % 180 !== 0;
    this.screenTilesX = isRotated ? config.gridHeight : config.gridWidth;
    this.screenTilesY = isRotated ? config.gridWidth : config.gridHeight;
    this.canvasWidth = this.screenTilesX * config.tileSize;
    this.canvasHeight = this.screenTilesY * config.tileSize;
  }

  gridToScreen(col: number, row: number): ScreenPos {
    const { tileSize, rotation = 0, gridWidth, gridHeight } = this.config;
    const [sx, sy] = applyRotation(col, row, rotation, gridWidth, gridHeight);
    // Flip Y so +Y (North) is at the top of the screen
    return {
      x: (sx + 0.5) * tileSize,
      y: (this.screenTilesY - 1 - sy + 0.5) * tileSize,
    };
  }

  screenToGrid(x: number, y: number): Coordinate | null {
    const { tileSize, rotation = 0, gridWidth, gridHeight } = this.config;
    const sCol = Math.floor(x / tileSize);
    const sRowFlipped = Math.floor(y / tileSize);
    const sRow = this.screenTilesY - 1 - sRowFlipped;

    if (sCol < 0 || sCol >= this.screenTilesX || sRow < 0 || sRow >= this.screenTilesY) {
      return null;
    }

    const [col, row] = inverseRotation(sCol, sRow, rotation, gridWidth, gridHeight);
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
      return null;
    }

    return [col, row];
  }

  getTileCorners(col: number, row: number): ScreenPos[] {
    const { tileSize, rotation = 0, gridWidth, gridHeight } = this.config;
    const [sx, sy] = applyRotation(col, row, rotation, gridWidth, gridHeight);
    const flippedY = this.screenTilesY - 1 - sy;
    const left = sx * tileSize;
    const top = flippedY * tileSize;
    return [
      { x: left, y: top },
      { x: left + tileSize, y: top },
      { x: left + tileSize, y: top + tileSize },
      { x: left, y: top + tileSize },
    ];
  }

  getRenderOrder(): Coordinate[] {
    const { gridWidth, gridHeight } = this.config;
    const coords: Coordinate[] = [];
    for (let row = 0; row < gridHeight; row++) {
      for (let col = 0; col < gridWidth; col++) {
        coords.push([col, row]);
      }
    }
    return coords;
  }
}

export class IsometricProjection implements Projection {
  readonly name = 'isometric';
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  private readonly config: ProjectionConfig;
  private readonly tileWidthHalf: number;
  private readonly tileHeightHalf: number;
  private readonly originX: number;
  private readonly originY: number;

  constructor(config: ProjectionConfig) {
    this.config = config;

    this.tileWidthHalf = config.tileSize;
    this.tileHeightHalf = config.tileSize / 2;

    const totalWidth = (config.gridWidth + config.gridHeight) * this.tileWidthHalf;
    const totalHeight = (config.gridWidth + config.gridHeight) * this.tileHeightHalf;

    this.canvasWidth = totalWidth + config.tileSize;
    this.canvasHeight = totalHeight + config.tileSize;

    this.originX = config.gridHeight * this.tileWidthHalf + this.tileWidthHalf / 2;
    this.originY = this.tileHeightHalf;
  }

  gridToScreen(col: number, row: number): ScreenPos {
    const { rotation = 0, gridWidth, gridHeight } = this.config;
    const [rCol, rRow] = applyRotation(col, row, rotation, gridWidth, gridHeight);

    return {
      x: this.originX + (rCol - rRow) * this.tileWidthHalf,
      y: this.originY + (rCol + rRow) * this.tileHeightHalf + this.tileHeightHalf,
    };
  }

  screenToGrid(x: number, y: number): Coordinate | null {
    const { rotation = 0, gridWidth, gridHeight } = this.config;

    const relX = x - this.originX;
    const relY = y - this.originY - this.tileHeightHalf;

    const colPlusRow = relY / this.tileHeightHalf;
    const colMinusRow = relX / this.tileWidthHalf;

    const sCol = Math.round((colPlusRow + colMinusRow) / 2);
    const sRow = Math.round((colPlusRow - colMinusRow) / 2);

    const effectiveWidth = rotation % 180 !== 0 ? gridHeight : gridWidth;
    const effectiveHeight = rotation % 180 !== 0 ? gridWidth : gridHeight;

    if (sCol < 0 || sCol >= effectiveWidth || sRow < 0 || sRow >= effectiveHeight) {
      return null;
    }

    const [col, row] = inverseRotation(sCol, sRow, rotation, gridWidth, gridHeight);
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
      return null;
    }

    return [col, row];
  }

  getTileCorners(col: number, row: number): ScreenPos[] {
    const { rotation = 0, gridWidth, gridHeight } = this.config;
    const [rCol, rRow] = applyRotation(col, row, rotation, gridWidth, gridHeight);

    const centerX = this.originX + (rCol - rRow) * this.tileWidthHalf;
    const centerY = this.originY + (rCol + rRow) * this.tileHeightHalf + this.tileHeightHalf;

    return [
      { x: centerX, y: centerY - this.tileHeightHalf },
      { x: centerX + this.tileWidthHalf, y: centerY },
      { x: centerX, y: centerY + this.tileHeightHalf },
      { x: centerX - this.tileWidthHalf, y: centerY },
    ];
  }

  getRenderOrder(): Coordinate[] {
    const { gridWidth, gridHeight } = this.config;
    const coords: Coordinate[] = [];

    for (let sum = 0; sum < gridWidth + gridHeight - 1; sum++) {
      for (let col = 0; col < gridWidth; col++) {
        const row = sum - col;
        if (row >= 0 && row < gridHeight) {
          coords.push([col, row]);
        }
      }
    }
    return coords;
  }
}

export type ProjectionType = 'top-down' | 'isometric' | '3d';

export function createProjection(type: ProjectionType, config: ProjectionConfig): Projection {
  switch (type) {
    case 'isometric':
      return new IsometricProjection(config);
    default:
      return new TopDownProjection(config);
  }
}
