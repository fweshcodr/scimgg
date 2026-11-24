import type { Projection } from '../../core/projection';
import type { Coordinate } from '../../types/simulation';
import type { Projection2D } from '../core/camera';
import type { TileCoord, Vec2 } from '../core/types';

export class ProjectionAdapter implements Projection2D {
  constructor(private readonly projection: Projection) {}

  tileToScreen(tile: TileCoord): Vec2 | null {
    const pos = this.projection.gridToScreen(tile.x, tile.y);
    return { x: pos.x, y: pos.y };
  }

  tileDeltaToScreen(delta: Vec2): Vec2 | null {
    const origin = this.projection.gridToScreen(0, 0);
    const offsetPos = this.projection.gridToScreen(delta.x, delta.y);
    return { x: offsetPos.x - origin.x, y: offsetPos.y - origin.y };
  }

  screenToTile(screenPx: Vec2): TileCoord | null {
    const coord: Coordinate | null = this.projection.screenToGrid(screenPx.x, screenPx.y);
    if (!coord) return null;
    return { x: coord[0], y: coord[1] };
  }

  tilePolygonScreen(tile: TileCoord): Vec2[] {
    return this.projection.getTileCorners(tile.x, tile.y);
  }
}

export function createProjectionAdapter(projection: Projection): Projection2D {
  return new ProjectionAdapter(projection);
}
