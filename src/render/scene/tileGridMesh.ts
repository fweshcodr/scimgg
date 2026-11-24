import type { NpcMesh3DCommand } from '../core/commands';
import { GROUND_DECAL_DEPTH_BIAS } from '../graphics/sceneObjectTypes';

/** Inclusive tile range the grid covers; lines run along every edge of these tiles. */
export interface TileGridBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface TileGridMeshInput {
  readonly bounds: TileGridBounds;
  /** Ground world Z at an integer tile corner. */
  readonly cornerHeight: (x: number, y: number) => number;
  readonly hslColor: number;
  /** 0–1, uniform across the whole grid. */
  readonly opacity: number;
  /** Line thickness in world units; must be below one tile. */
  readonly lineWidth: number;
}

/** Lift above the ground, as the tile outlines use. */
const TILE_GRID_HEIGHT_OFFSET = 0.01;

/**
 * The meshId is the renderer's VAO cache key, so it carries every input that
 * changes the vertex buffers except the terrain, whose meshes are released at
 * each scene boundary.
 */
export function tileGridMeshId(bounds: TileGridBounds, hslColor: number, opacity: number, lineWidth: number): string {
  return `tile-grid-${bounds.minX}-${bounds.minY}-${bounds.maxX}-${bounds.maxY}-${hslColor}-${opacity}-${lineWidth}`;
}

/**
 * One translucent mesh with a line along every tile edge in `bounds`, following
 * the terrain corner heights.
 *
 * It is drawn as a depth-tested ground decal (`depth: 'read'`, blended), so it
 * lands in the renderer's transparent pass, ahead of the other translucent
 * draws: models and locs occlude it, translucent effects blend over it, and
 * every marker and outline, which draw in the later no-depth pass, sits on top
 * of it whatever order they were queued in.
 *
 * No two quads overlap, so a translucent grid has one alpha everywhere: the
 * east-west lines run unbroken (and reach half a line past the outer
 * north-south lines to fill the corners), and the north-south lines stop at the
 * edge of each east-west line they cross.
 */
export function buildTileGridMesh(input: TileGridMeshInput): NpcMesh3DCommand | null {
  const { bounds, cornerHeight, hslColor, opacity, lineWidth } = input;
  const x0 = bounds.minX;
  const x1 = bounds.maxX + 1;
  const y0 = bounds.minY;
  const y1 = bounds.maxY + 1;
  const tilesX = x1 - x0;
  const tilesY = y1 - y0;
  if (tilesX <= 0 || tilesY <= 0 || !(lineWidth > 0 && lineWidth < 1)) return null;

  const hw = lineWidth / 2;
  const h = (x: number, y: number) => cornerHeight(x, y) + TILE_GRID_HEIGHT_OFFSET;

  // East-west: a cap at each end plus one quad per tile. North-south: one quad per tile.
  const quadCount = (tilesY + 1) * (tilesX + 2) + (tilesX + 1) * tilesY;
  const vertexCount = quadCount * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  let v = 0;

  const vertex = (x: number, y: number, z: number) => {
    const i = v * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    normals[i + 2] = 1;
    v++;
  };
  // Corners in order around the quad: a and c are opposite.
  const quad = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
  ) => {
    vertex(ax, ay, az);
    vertex(bx, by, bz);
    vertex(cx, cy, cz);
    vertex(ax, ay, az);
    vertex(cx, cy, cz);
    vertex(dx, dy, dz);
  };
  const eastWest = (xa: number, xb: number, y: number, za: number, zb: number) =>
    quad(xa, y - hw, za, xb, y - hw, zb, xb, y + hw, zb, xa, y + hw, za);

  for (let y = y0; y <= y1; y++) {
    const west = h(x0, y);
    eastWest(x0 - hw, x0, y, west, west);
    for (let x = x0; x < x1; x++) {
      eastWest(x, x + 1, y, h(x, y), h(x + 1, y));
    }
    const east = h(x1, y);
    eastWest(x1, x1 + hw, y, east, east);
  }

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y < y1; y++) {
      const south = h(x, y);
      const north = h(x, y + 1);
      // Heights along the edge, where this segment meets the east-west lines.
      const za = south + (north - south) * hw;
      const zb = south + (north - south) * (1 - hw);
      const ya = y + hw;
      const yb = y + 1 - hw;
      quad(x - hw, ya, za, x + hw, ya, za, x + hw, yb, zb, x - hw, yb, zb);
    }
  }

  return {
    kind: 'mesh3d',
    meshId: tileGridMeshId(bounds, hslColor, opacity, lineWidth),
    materialId: 'tile-outline',
    cullFace: 'none',
    modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    positions,
    normals,
    perVertexHslColors: new Float32Array(vertexCount).fill(hslColor),
    perVertexAlphas: new Float32Array(vertexCount).fill(opacity),
    blend: 'normal',
    depth: 'read',
    depthBias: GROUND_DECAL_DEPTH_BIAS,
    // The origin is the scene corner, so a distance sort would place the grid by camera angle.
    transparentOrder: 'first',
  };
}
