export function getAnimFrameIndex(progress: number, frameLengths: number[] | undefined, totalDuration: number): number {
  if (!frameLengths || frameLengths.length === 0 || totalDuration === 0) return 0;

  const animProgress = progress * totalDuration;
  let accumulated = 0;

  for (let i = 0; i < frameLengths.length; i++) {
    accumulated += frameLengths[i];
    if (animProgress < accumulated) {
      return i;
    }
  }
  return frameLengths.length - 1;
}

export function getTerrainHeight(terrainHeights: Int32Array[] | null, x: number, y: number): number {
  if (!terrainHeights) return 0;
  const clampedX = Math.max(0, Math.min(terrainHeights.length - 1, Math.floor(x)));
  const column = terrainHeights[clampedX];
  if (!column) return 0;
  const clampedY = Math.max(0, Math.min(column.length - 1, Math.floor(y)));
  return column[clampedY] ?? 0;
}

/**
 * This interpolation keeps elevation smooth between tiles instead of snapping to a corner.
 */
export function getTerrainHeightInterpolated(terrainHeights: Int32Array[] | null, x: number, y: number): number {
  if (!terrainHeights) return 0;

  const tileX = Math.max(0, Math.min(63, Math.floor(x)));
  const tileY = Math.max(0, Math.min(63, Math.floor(y)));
  const fracX = Math.max(0, Math.min(1, x - tileX));
  const fracY = Math.max(0, Math.min(1, y - tileY));

  const hSW = terrainHeights[tileX]?.[tileY] ?? 0;
  const hSE = terrainHeights[tileX + 1]?.[tileY] ?? 0;
  const hNW = terrainHeights[tileX]?.[tileY + 1] ?? 0;
  const hNE = terrainHeights[tileX + 1]?.[tileY + 1] ?? 0;

  const hS = hSW + (hSE - hSW) * fracX;
  const hN = hNW + (hNE - hNW) * fracX;
  return hS + (hN - hS) * fracY;
}

export function getLocCenterHeight(
  terrainHeights: Int32Array[] | null,
  localX: number,
  localY: number,
  sizeX: number,
  sizeY: number,
): number {
  if (!terrainHeights) return 0;

  const h1 = getTerrainHeight(terrainHeights, localX, localY);
  const h2 = getTerrainHeight(terrainHeights, localX + sizeX, localY);
  const h3 = getTerrainHeight(terrainHeights, localX + sizeX, localY + sizeY);
  const h4 = getTerrainHeight(terrainHeights, localX, localY + sizeY);

  const avgHeight = (h1 + h2 + h3 + h4) / 4;
  return -avgHeight / 128;
}
