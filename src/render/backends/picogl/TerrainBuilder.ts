import PicoGL, { type App, type VertexArray, type VertexBuffer } from 'picogl';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../../../rs/config/flotype/FloTypeLoader';
import type { MapSquareData } from '../../../rs/map/MapLoader';
import {
  adjustOverlayLight,
  adjustUnderlayLight,
  INVALID_HSL_COLOR,
  mixHsl,
  packHsl,
} from '../../../rs/util/ColorUtil';
import { profiler } from '../../../util/Profiler';
import {
  MAX_VERTICES_PER_TILE,
  type TerrainMesh,
  type TerrainVertex,
  TILE_SIZE,
  VERTEX_STRIDE,
} from '../../core/terrain';
import { createClassicTileSurface } from '../../core/tileSurface';

export type { TerrainMesh, TerrainVertex };
export { TILE_SIZE, VERTEX_STRIDE };

export interface TerrainBuildOptions {
  overlayLoader?: OverlayTypeLoader;
  underlayLoader?: UnderlayTypeLoader;
  smoothTerrain?: boolean;
  coordinateOrigin?: { readonly x: number; readonly y: number };
}

export interface TerrainGLMesh {
  vertexArray: VertexArray;
  vertexBuffer: VertexBuffer;
  vertexCount: number;
}

const BLEND_RADIUS = 5;

function prefixRectangleSum(
  prefix: Int32Array,
  stride: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  return (
    prefix[maxX * stride + maxY] -
    prefix[minX * stride + maxY] -
    prefix[maxX * stride + minY] +
    prefix[minX * stride + minY]
  );
}

export class TerrainBuilder {
  buildMesh(
    mapData: MapSquareData,
    level: number,
    startX: number,
    startY: number,
    width: number,
    height: number,
    options?: TerrainBuildOptions,
  ): TerrainMesh {
    profiler.start('TerrainBuilder.buildMesh');
    const tileCount = width * height;
    const maxVertexCount = tileCount * MAX_VERTICES_PER_TILE;
    const vertices = new Float32Array(maxVertexCount * VERTEX_STRIDE);

    profiler.start('TerrainBuilder.blendUnderlays');
    const blendedUnderlayHsl = this.blendUnderlays(
      mapData,
      level,
      startX,
      startY,
      width,
      height,
      options?.underlayLoader,
    );
    profiler.end('TerrainBuilder.blendUnderlays');

    profiler.start('TerrainBuilder.calculateTileLights');
    const tileLights = this.calculateTileLights(mapData, level, startX, startY, width, height);
    profiler.end('TerrainBuilder.calculateTileLights');

    let offset = 0;

    profiler.start('TerrainBuilder.buildTiles');
    for (let localY = startY; localY < startY + height; localY++) {
      for (let localX = startX; localX < startX + width; localX++) {
        offset = this.buildTile(
          mapData,
          level,
          localX,
          localY,
          vertices,
          offset,
          blendedUnderlayHsl,
          tileLights,
          startX,
          startY,
          options,
        );
      }
    }
    profiler.end('TerrainBuilder.buildTiles');

    const actualVertexCount = offset / VERTEX_STRIDE;
    profiler.end('TerrainBuilder.buildMesh');
    return {
      vertices: vertices.subarray(0, offset),
      vertexCount: actualVertexCount,
      stride: VERTEX_STRIDE,
    };
  }

  /**
   * Blend underlay colors from neighboring tiles (matches rs-map-viewer SceneBuilder.blendUnderlays)
   */
  private blendUnderlays(
    mapData: MapSquareData,
    level: number,
    startX: number,
    startY: number,
    width: number,
    height: number,
    underlayLoader?: UnderlayTypeLoader,
  ): Int32Array[][] {
    const { tileUnderlays } = mapData;
    const totalWidth = width + 1; // Need +1 for corner vertices
    const totalHeight = height + 1;

    const colors: Int32Array[][] = new Array(totalWidth);
    for (let i = 0; i < totalWidth; i++) {
      colors[i] = new Array(totalHeight);
      for (let j = 0; j < totalHeight; j++) {
        colors[i][j] = new Int32Array(1).fill(-1);
      }
    }

    if (!underlayLoader) {
      return colors;
    }

    const blendDiameter = BLEND_RADIUS * 2 + 1;
    const sampleWidth = totalWidth + BLEND_RADIUS * 2;
    const sampleHeight = totalHeight + BLEND_RADIUS * 2;
    const prefixStride = sampleHeight + 1;
    const prefixSize = (sampleWidth + 1) * prefixStride;
    const huePrefix = new Int32Array(prefixSize);
    const saturationPrefix = new Int32Array(prefixSize);
    const lightnessPrefix = new Int32Array(prefixSize);
    const multiplierPrefix = new Int32Array(prefixSize);
    const countPrefix = new Int32Array(prefixSize);

    for (let sampleX = 0; sampleX < sampleWidth; sampleX++) {
      for (let sampleY = 0; sampleY < sampleHeight; sampleY++) {
        const tileX = startX + sampleX - BLEND_RADIUS;
        const tileY = startY + sampleY - BLEND_RADIUS;
        const underlayId = tileUnderlays[level]?.[tileX]?.[tileY] ?? 0;
        const underlay = underlayId > 0 ? underlayLoader.load(underlayId - 1) : undefined;
        const index = (sampleX + 1) * prefixStride + sampleY + 1;
        const west = sampleX * prefixStride + sampleY + 1;
        const south = (sampleX + 1) * prefixStride + sampleY;
        const southwest = sampleX * prefixStride + sampleY;
        huePrefix[index] = (underlay?.hue ?? 0) + huePrefix[west] + huePrefix[south] - huePrefix[southwest];
        saturationPrefix[index] =
          (underlay?.saturation ?? 0) + saturationPrefix[west] + saturationPrefix[south] - saturationPrefix[southwest];
        lightnessPrefix[index] =
          (underlay?.lightness ?? 0) + lightnessPrefix[west] + lightnessPrefix[south] - lightnessPrefix[southwest];
        multiplierPrefix[index] =
          (underlay?.hueMultiplier ?? 0) +
          multiplierPrefix[west] +
          multiplierPrefix[south] -
          multiplierPrefix[southwest];
        countPrefix[index] = (underlay ? 1 : 0) + countPrefix[west] + countPrefix[south] - countPrefix[southwest];
      }
    }

    for (let xi = 0; xi < totalWidth; xi++) {
      for (let yi = 0; yi < totalHeight; yi++) {
        const underlayId = tileUnderlays[level]?.[startX + xi]?.[startY + yi] ?? 0;
        if (underlayId === 0) continue;
        const maxX = xi + blendDiameter;
        const maxY = yi + blendDiameter;
        const multiplier = prefixRectangleSum(multiplierPrefix, prefixStride, xi, yi, maxX, maxY);
        const count = prefixRectangleSum(countPrefix, prefixStride, xi, yi, maxX, maxY);
        if (multiplier <= 0 || count <= 0) continue;
        const hue = prefixRectangleSum(huePrefix, prefixStride, xi, yi, maxX, maxY);
        const saturation = prefixRectangleSum(saturationPrefix, prefixStride, xi, yi, maxX, maxY);
        const lightness = prefixRectangleSum(lightnessPrefix, prefixStride, xi, yi, maxX, maxY);
        colors[xi][yi][0] = packHsl(
          Math.floor((hue * 256) / multiplier),
          Math.floor(saturation / count),
          Math.floor(lightness / count),
        );
      }
    }

    return colors;
  }

  private calculateTileLights(
    mapData: MapSquareData,
    level: number,
    startX: number,
    startY: number,
    width: number,
    height: number,
  ): number[][] {
    const LIGHT_DIR_X = -50;
    const LIGHT_DIR_Y = -10;
    const LIGHT_DIR_Z = -50;
    const LIGHT_INTENSITY_BASE = 96;
    const LIGHT_INTENSITY_FACTOR = 768;
    const HEIGHT_SCALE = 65536;

    const lightMagnitude =
      Math.sqrt(LIGHT_DIR_X * LIGHT_DIR_X + LIGHT_DIR_Y * LIGHT_DIR_Y + LIGHT_DIR_Z * LIGHT_DIR_Z) | 0;
    const lightIntensity = (lightMagnitude * LIGHT_INTENSITY_FACTOR) >> 8;

    const totalWidth = width + 1;
    const totalHeight = height + 1;
    const lights: number[][] = new Array(totalWidth);

    const { tileLightOcclusions } = mapData;

    for (let i = 0; i < totalWidth; i++) {
      lights[i] = new Array(totalHeight);
      for (let j = 0; j < totalHeight; j++) {
        const x = startX + i;
        const y = startY + j;

        const heightPlane = mapData.tileHeights[level];
        const hasNormalSamples = x > 0 && x + 1 < heightPlane.length && y > 0 && y + 1 < heightPlane[x].length;
        if (hasNormalSamples) {
          const heightDeltaX = mapData.tileHeights[level][x + 1][y] - mapData.tileHeights[level][x - 1][y];
          const heightDeltaY = mapData.tileHeights[level][x][y + 1] - mapData.tileHeights[level][x][y - 1];

          const tileNormalLength =
            Math.sqrt(heightDeltaY * heightDeltaY + heightDeltaX * heightDeltaX + HEIGHT_SCALE) | 0;

          const normalizedTileNormalX = ((heightDeltaX << 8) / tileNormalLength) | 0;
          const normalizedTileNormalY = (HEIGHT_SCALE / tileNormalLength) | 0;
          const normalizedTileNormalZ = ((heightDeltaY << 8) / tileNormalLength) | 0;

          const dot =
            normalizedTileNormalX * LIGHT_DIR_X +
            normalizedTileNormalY * LIGHT_DIR_Y +
            normalizedTileNormalZ * LIGHT_DIR_Z;

          const sunLight = (dot / lightIntensity + LIGHT_INTENSITY_BASE) | 0;

          // Calculate light occlusion from neighboring tiles (matches rs-map-viewer Scene.calculateTileLights)
          const lightOcclusion =
            (tileLightOcclusions[level][x - 1]?.[y] >> 2) + // West: 25%
            (tileLightOcclusions[level][x]?.[y - 1] >> 2) + // South: 25%
            (tileLightOcclusions[level][x + 1]?.[y] >> 3) + // East: 12.5%
            (tileLightOcclusions[level][x]?.[y + 1] >> 3) + // North: 12.5%
            (tileLightOcclusions[level][x]?.[y] >> 1); // Center: 50%

          lights[i][j] = sunLight - lightOcclusion;
        } else {
          lights[i][j] = LIGHT_INTENSITY_BASE;
        }
      }
    }

    return lights;
  }

  private buildTile(
    mapData: MapSquareData,
    level: number,
    localX: number,
    localY: number,
    vertices: Float32Array,
    offset: number,
    blendedUnderlayHsl: Int32Array[][],
    tileLights: number[][],
    startX: number,
    startY: number,
    options?: TerrainBuildOptions,
  ): number {
    const { tileHeights, tileOverlays, tileShapes, tileRotations, tileUnderlays } = mapData;

    const underlayId = tileUnderlays[level][localX][localY] - 1;
    const overlayId = tileOverlays[level][localX][localY] - 1;

    if (underlayId === -1 && overlayId === -1) {
      return offset;
    }

    const heightSW = tileHeights[level][localX][localY];
    const heightSE = tileHeights[level][localX + 1][localY];
    const heightNE = tileHeights[level][localX + 1][localY + 1];
    const heightNW = tileHeights[level][localX][localY + 1];

    const coordinateOriginX = options?.coordinateOrigin?.x ?? 0;
    const coordinateOriginY = options?.coordinateOrigin?.y ?? 0;
    const worldX = (localX - coordinateOriginX) * TILE_SIZE;
    const worldZ = (localY - coordinateOriginY) * TILE_SIZE;

    const relX = localX - startX;
    const relY = localY - startY;
    const lightSW = tileLights[relX]?.[relY] ?? 96;
    const lightSE = tileLights[relX + 1]?.[relY] ?? 96;
    const lightNE = tileLights[relX + 1]?.[relY + 1] ?? 96;
    const lightNW = tileLights[relX]?.[relY + 1] ?? 96;

    const smoothTerrain = options?.smoothTerrain ?? false;

    let blendedHslSW = -1;
    let blendedHslSE = -1;
    let blendedHslNE = -1;
    let blendedHslNW = -1;
    if (underlayId !== -1) {
      blendedHslSW = blendedUnderlayHsl[relX]?.[relY]?.[0] ?? -1;
      blendedHslSE = blendedUnderlayHsl[relX + 1]?.[relY]?.[0] ?? -1;
      blendedHslNE = blendedUnderlayHsl[relX + 1]?.[relY + 1]?.[0] ?? -1;
      blendedHslNW = blendedUnderlayHsl[relX]?.[relY + 1]?.[0] ?? -1;
      // When smooth terrain is off, all corners use SW color (flat shading)
      // Matches rs-map-viewer SceneBuilder behavior with smoothUnderlays=false
      if (blendedHslSE === -1 || !smoothTerrain) blendedHslSE = blendedHslSW;
      if (blendedHslNE === -1 || !smoothTerrain) blendedHslNE = blendedHslSW;
      if (blendedHslNW === -1 || !smoothTerrain) blendedHslNW = blendedHslSW;
    }

    const underlayHslSW = adjustUnderlayLight(blendedHslSW, lightSW);
    const underlayHslSE = adjustUnderlayLight(blendedHslSE, lightSE);
    const underlayHslNE = adjustUnderlayLight(blendedHslNE, lightNE);
    const underlayHslNW = adjustUnderlayLight(blendedHslNW, lightNW);

    let shape: number;
    let rotation: number;
    let textureId = -1;
    let overlayHsl = -2;

    if (overlayId === -1) {
      shape = 0;
      rotation = 0;
    } else {
      shape = tileShapes[level][localX][localY] + 1;
      rotation = tileRotations[level][localX][localY];

      if (options?.overlayLoader) {
        const overlay = options.overlayLoader.load(overlayId);

        if (overlay.texture >= 0) {
          textureId = overlay.texture;
          overlayHsl = -1;
        } else if (overlay.color === 0xff00ff) {
          overlayHsl = -2;
        } else {
          overlayHsl = packHsl(overlay.hue, overlay.saturation, overlay.lightness);
        }
      }
    }

    const overlayHslSW = adjustOverlayLight(overlayHsl, lightSW);
    const overlayHslSE = adjustOverlayLight(overlayHsl, lightSE);
    const overlayHslNE = adjustOverlayLight(overlayHsl, lightNE);
    const overlayHslNW = adjustOverlayLight(overlayHsl, lightNW);

    const tileXCoord = localX - coordinateOriginX + 1;
    const tileYCoord = localY - coordinateOriginY + 1;

    const surface = createClassicTileSurface(shape, rotation, [heightSW, heightSE, heightNE, heightNW]);
    const underlayCorners = [underlayHslSW, underlayHslSE, underlayHslNE, underlayHslNW];
    const overlayCorners = [overlayHslSW, overlayHslSE, overlayHslNE, overlayHslNW];
    const underlayHsls = surface.vertices.map(({ cornerA, cornerB }) =>
      cornerA === cornerB ? underlayCorners[cornerA] : mixHsl(underlayCorners[cornerA], underlayCorners[cornerB]),
    );
    const overlayHsls = surface.vertices.map(({ cornerA, cornerB }) =>
      cornerA === cornerB ? overlayCorners[cornerA] : (overlayCorners[cornerA] + overlayCorners[cornerB]) >> 1,
    );

    for (const { isOverlay, a, b, c } of surface.faces) {
      let hslA: number, hslB: number, hslC: number;
      let faceTextureId: number;

      if (isOverlay) {
        hslA = overlayHsls[a];
        hslB = overlayHsls[b];
        hslC = overlayHsls[c];
        faceTextureId = textureId;
      } else {
        hslA = underlayHsls[a];
        hslB = underlayHsls[b];
        hslC = underlayHsls[c];
        faceTextureId = -1;
      }

      if (hslA === INVALID_HSL_COLOR && faceTextureId === -1) {
        continue;
      }

      const ax = worldX + surface.vertices[a].x,
        ay = surface.vertices[a].height,
        az = worldZ + surface.vertices[a].y;
      const bx = worldX + surface.vertices[b].x,
        by = surface.vertices[b].height,
        bz = worldZ + surface.vertices[b].y;
      const cx = worldX + surface.vertices[c].x,
        cy = surface.vertices[c].height,
        cz = worldZ + surface.vertices[c].y;

      const u0 = (ax - worldX) / TILE_SIZE;
      const v0 = (az - worldZ) / TILE_SIZE;
      const u1 = (bx - worldX) / TILE_SIZE;
      const v1 = (bz - worldZ) / TILE_SIZE;
      const u2 = (cx - worldX) / TILE_SIZE;
      const v2 = (cz - worldZ) / TILE_SIZE;

      let normalA: { x: number; y: number; z: number };
      let normalB: { x: number; y: number; z: number };
      let normalC: { x: number; y: number; z: number };
      if (smoothTerrain) {
        const tileXA = localX + u0;
        const tileYA = localY + v0;
        const tileXB = localX + u1;
        const tileYB = localY + v1;
        const tileXC = localX + u2;
        const tileYC = localY + v2;
        normalA = this.computeSmoothNormal(mapData, level, Math.round(tileXA), Math.round(tileYA));
        normalB = this.computeSmoothNormal(mapData, level, Math.round(tileXB), Math.round(tileYB));
        normalC = this.computeSmoothNormal(mapData, level, Math.round(tileXC), Math.round(tileYC));
      } else {
        const faceNormal = this.computeFaceNormal(
          { x: ax, y: ay, z: az },
          { x: bx, y: by, z: bz },
          { x: cx, y: cy, z: cz },
        );
        normalA = normalB = normalC = faceNormal;
      }

      offset = this.writeVertex(
        vertices,
        offset,
        ax,
        ay,
        az,
        normalA.x,
        normalA.y,
        normalA.z,
        u0,
        v0,
        faceTextureId,
        hslA,
        tileXCoord,
        tileYCoord,
      );
      offset = this.writeVertex(
        vertices,
        offset,
        bx,
        by,
        bz,
        normalB.x,
        normalB.y,
        normalB.z,
        u1,
        v1,
        faceTextureId,
        hslB,
        tileXCoord,
        tileYCoord,
      );
      offset = this.writeVertex(
        vertices,
        offset,
        cx,
        cy,
        cz,
        normalC.x,
        normalC.y,
        normalC.z,
        u2,
        v2,
        faceTextureId,
        hslC,
        tileXCoord,
        tileYCoord,
      );
    }

    return offset;
  }

  private computeSmoothNormal(
    mapData: MapSquareData,
    level: number,
    localX: number,
    localY: number,
  ): { x: number; y: number; z: number } {
    const { tileHeights } = mapData;

    const x = Math.max(1, Math.min(tileHeights[level].length - 2, localX));
    const y = Math.max(1, Math.min(tileHeights[level][x].length - 2, localY));

    const heightDeltaX = tileHeights[level][x + 1]?.[y] - tileHeights[level][x - 1]?.[y] || 0;
    const heightDeltaY = tileHeights[level][x]?.[y + 1] - tileHeights[level][x]?.[y - 1] || 0;

    const nx = -heightDeltaX;
    const ny = 2 * TILE_SIZE;
    const nz = -heightDeltaY;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) {
      return { x: 0, y: 1, z: 0 };
    }

    return {
      x: nx / len,
      y: ny / len,
      z: nz / len,
    };
  }

  private computeFaceNormal(
    v0: { x: number; y: number; z: number },
    v1: { x: number; y: number; z: number },
    v2: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number } {
    const e1x = v1.x - v0.x;
    const e1y = v1.y - v0.y;
    const e1z = v1.z - v0.z;

    const e2x = v2.x - v0.x;
    const e2y = v2.y - v0.y;
    const e2z = v2.z - v0.z;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) {
      return { x: 0, y: 1, z: 0 };
    }

    return {
      x: nx / len,
      y: ny / len,
      z: nz / len,
    };
  }

  private writeVertex(
    vertices: Float32Array,
    offset: number,
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    textureId: number,
    hslColor: number,
    tileX: number,
    tileY: number,
  ): number {
    vertices[offset++] = x;
    vertices[offset++] = y;
    vertices[offset++] = z;
    vertices[offset++] = nx;
    vertices[offset++] = ny;
    vertices[offset++] = nz;
    vertices[offset++] = u;
    vertices[offset++] = v;
    vertices[offset++] = textureId;
    vertices[offset++] = hslColor;
    vertices[offset++] = tileX;
    vertices[offset++] = tileY;
    return offset;
  }

  interpolateHeight(
    mapData: MapSquareData,
    level: number,
    localX: number,
    localY: number,
    fracX: number,
    fracY: number,
  ): number {
    const { tileHeights } = mapData;

    const heightSW = tileHeights[level][localX][localY];
    const heightSE = tileHeights[level][localX + 1][localY];
    const heightNE = tileHeights[level][localX + 1][localY + 1];
    const heightNW = tileHeights[level][localX][localY + 1];

    const heightS = heightSW + (heightSE - heightSW) * fracX;
    const heightN = heightNW + (heightNE - heightNW) * fracX;
    return heightS + (heightN - heightS) * fracY;
  }

  uploadToGPU(app: App, mesh: TerrainMesh): TerrainGLMesh {
    const vertexBuffer = app.createInterleavedBuffer(mesh.stride * 4, mesh.vertices);

    const vertexArray = app
      .createVertexArray()
      .vertexAttributeBuffer(0, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 3,
        stride: mesh.stride * 4,
        offset: 0,
      })
      .vertexAttributeBuffer(1, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 3,
        stride: mesh.stride * 4,
        offset: 3 * 4,
      })
      .vertexAttributeBuffer(2, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 2,
        stride: mesh.stride * 4,
        offset: 6 * 4,
      })
      .vertexAttributeBuffer(3, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 1,
        stride: mesh.stride * 4,
        offset: 8 * 4,
      })
      .vertexAttributeBuffer(4, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 1,
        stride: mesh.stride * 4,
        offset: 9 * 4,
      })
      .vertexAttributeBuffer(5, vertexBuffer, {
        type: PicoGL.FLOAT,
        size: 2,
        stride: mesh.stride * 4,
        offset: 10 * 4,
      });

    return {
      vertexArray,
      vertexBuffer,
      vertexCount: mesh.vertexCount,
    };
  }

  disposeGLMesh(mesh: TerrainGLMesh): void {
    mesh.vertexArray.delete();
    mesh.vertexBuffer.delete();
  }
}

export function createTerrainBuilder(): TerrainBuilder {
  return new TerrainBuilder();
}
