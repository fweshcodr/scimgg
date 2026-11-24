import { MAP_SQUARE_SIZE } from '../../rs/map/MapLoader';
import type { TerrainContext } from '../../rs/map/mapSquareBlock';
import { TILE_SIZE } from '../core/terrain';
import {
  type ClassicTileSurface,
  createClassicTileSurface,
  sampleClassicTileSurface,
  type TileCornerHeights,
} from '../core/tileSurface';

export type SceneSurfaceTerrainSquare = {
  readonly terrain: TerrainContext;
  readonly tileOffsetX: number;
  readonly tileOffsetY: number;
};

export type SceneSurfaceGroundDecoration = {
  readonly x: number;
  readonly y: number;
  readonly plane: number;
  readonly raise: number;
};

type CachedTile = {
  readonly heights: TileCornerHeights;
  readonly surface: ClassicTileSurface | undefined;
};

type CachedSquare = SceneSurfaceTerrainSquare & {
  readonly tiles: Map<number, CachedTile>;
};

export class SceneSurfaceHeightResolver {
  private squares: readonly CachedSquare[] = [];
  private readonly raises = new Map<string, number>();

  get hasTerrain(): boolean {
    return this.squares.length > 0;
  }

  setTerrain(squares: readonly SceneSurfaceTerrainSquare[]): void {
    this.squares = squares.map((square) => ({ ...square, tiles: new Map<number, CachedTile>() }));
  }

  setGroundDecorations(decorations: readonly SceneSurfaceGroundDecoration[]): void {
    this.raises.clear();
    for (const { x, y, plane, raise } of decorations) this.raises.set(`${plane},${x},${y}`, raise);
  }

  resolve(worldX: number, worldY: number, plane = 0): number {
    const localX = Math.trunc(worldX * TILE_SIZE);
    const localY = Math.trunc(worldY * TILE_SIZE);
    const tileX = Math.floor(localX / TILE_SIZE);
    const tileY = Math.floor(localY / TILE_SIZE);
    const square = this.squares.find(
      ({ tileOffsetX, tileOffsetY }) =>
        tileX >= tileOffsetX &&
        tileX < tileOffsetX + MAP_SQUARE_SIZE &&
        tileY >= tileOffsetY &&
        tileY < tileOffsetY + MAP_SQUARE_SIZE,
    );
    if (!square) return 0;
    const { terrain, tileOffsetX, tileOffsetY } = square;
    const coreX = tileX - tileOffsetX;
    const coreY = tileY - tileOffsetY;
    const contextX = coreX + terrain.coreOriginX;
    const contextY = coreY + terrain.coreOriginY;
    const bridge = ((terrain.tileRenderFlags[1]?.[contextX]?.[contextY] ?? 0) & 2) !== 0;
    const rawPlane = plane < 3 && bridge ? plane + 1 : plane;
    const hasSceneSlot = !bridge || plane < 3;
    const key = (rawPlane * MAP_SQUARE_SIZE + coreX) * MAP_SQUARE_SIZE + coreY;
    let tile = square.tiles.get(key);
    if (!tile) {
      const heightPlane = terrain.tileHeights[rawPlane];
      const heights: TileCornerHeights = [
        heightPlane[contextX][contextY],
        heightPlane[contextX + 1][contextY],
        heightPlane[contextX + 1][contextY + 1],
        heightPlane[contextX][contextY + 1],
      ];
      const overlay = terrain.tileOverlays[rawPlane][contextX][contextY];
      const underlay = terrain.tileUnderlays[rawPlane][contextX][contextY];
      const shape = overlay === 0 ? 0 : terrain.tileShapes[rawPlane][contextX][contextY] + 1;
      const rotation = overlay === 0 ? 0 : terrain.tileRotations[rawPlane][contextX][contextY];
      tile = {
        heights,
        surface: underlay === 0 && overlay === 0 ? undefined : createClassicTileSurface(shape, rotation, heights),
      };
      square.tiles.set(key, tile);
    }
    const fractionX = localX - tileX * TILE_SIZE;
    const fractionY = localY - tileY * TILE_SIZE;
    let height =
      hasSceneSlot && tile.surface ? sampleClassicTileSurface(tile.surface, fractionX, fractionY) : undefined;
    if (height === undefined) {
      const [southwest, southeast, northeast, northwest] = tile.heights;
      const south = (southwest * (TILE_SIZE - fractionX) + southeast * fractionX) >> 7;
      const north = (northwest * (TILE_SIZE - fractionX) + northeast * fractionX) >> 7;
      height = (south * (TILE_SIZE - fractionY) + north * fractionY) >> 7;
    }
    return height - (hasSceneSlot ? (this.raises.get(`${rawPlane},${tileX},${tileY}`) ?? 0) : 0);
  }

  clear(): void {
    this.squares = [];
    this.raises.clear();
  }
}
