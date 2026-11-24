import { mulberry32 } from '../../../core/rng';
import { packHsl } from '../../../rs/util/ColorUtil';
import type { EmbeddedMeshCommand, LobbyRenderContext } from './lobbyConstants';
import { ARENA_CENTER_X, ARENA_CENTER_Y } from './lobbyConstants';
import { createLobbyMeshBuilder } from './lobbyMeshBuilder';

type StarGenerator = (
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  x: number,
  y: number,
  z: number,
  size: number,
  centerX: number,
  centerY: number,
  zBase: number,
  rand: () => number,
) => void;

function createStar(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  x: number,
  y: number,
  z: number,
  size: number,
  centerX: number,
  centerY: number,
  zBase: number,
  colorCenter: number,
  colorEdge: number,
  alphaCenter: number,
  numPoints: number,
  rand: () => number,
): void {
  const nx = x - centerX;
  const ny = y - centerY;
  const nz = z - zBase;
  const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const nnx = nx / nLen;
  const nny = ny / nLen;
  const nnz = nz / nLen;

  let tx = 0;
  let ty = nnz;
  let tz = -nny;
  if (Math.abs(nnx) >= 0.9) {
    tx = -nnz;
    ty = 0;
    tz = nnx;
  }

  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  const bx = nny * tz - nnz * ty;
  const by = nnz * tx - nnx * tz;
  const bz = nnx * ty - nny * tx;
  const centerIdx = mesh.vIdx();

  mesh.addVertex(x, y, z, nnx, nny, nnz, colorCenter, alphaCenter);

  const baseRot = rand() * Math.PI * 2;
  for (let p = 0; p < numPoints; p++) {
    const angle = baseRot + (p / numPoints) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const px = x + size * (cosA * tx + sinA * bx);
    const py = y + size * (cosA * ty + sinA * by);
    const pz = z + size * (cosA * tz + sinA * bz);
    mesh.addVertex(px, py, pz, nnx, nny, nnz, colorEdge, 0);
  }

  for (let p = 0; p < numPoints; p++) {
    const next = (p + 1) % numPoints;
    mesh.indices.push(centerIdx, centerIdx + 1 + p, centerIdx + 1 + next);
  }
}

function buildLayer(
  id: string,
  numItems: number,
  radiusRange: [number, number],
  sizeRange: [number, number],
  animParams: [number, number, number, number],
  generator: StarGenerator,
  rand: () => number,
  baseZ: number,
): EmbeddedMeshCommand {
  const mesh = createLobbyMeshBuilder();
  const placedPoints: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < numItems; i++) {
    const radius = radiusRange[0] + rand() * (radiusRange[1] - radiusRange[0]);
    const size = sizeRange[0] + rand() * (sizeRange[1] - sizeRange[0]);
    let x = 0;
    let y = 0;
    let z = 0;

    for (let retry = 0; retry <= 5; retry++) {
      const theta = rand() * 2.0 * Math.PI;
      const phi = Math.acos(rand());
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      x = ARENA_CENTER_X + radius * sinPhi * Math.cos(theta);
      y = ARENA_CENTER_Y + radius * sinPhi * Math.sin(theta);
      z = baseZ + radius * cosPhi;

      let tooClose = false;
      const minDistSq = size * 8 * (size * 8);
      for (const point of placedPoints) {
        const dx = point.x - x;
        const dy = point.y - y;
        const dz = point.z - z;
        if (dx * dx + dy * dy + dz * dz < minDistSq) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose || retry === 5) {
        placedPoints.push({ x, y, z });
        generator(mesh, x, y, z, size, ARENA_CENTER_X, ARENA_CENTER_Y, baseZ, rand);
        break;
      }
    }
  }

  return mesh.toCommand(id, 0, {
    depth: 'read',
    shaderId: 'scene-effects',
    uniforms: { u_animParams: animParams },
  });
}

export function buildStarfieldMesh(ctx: LobbyRenderContext): EmbeddedMeshCommand[] {
  const { baseZ } = ctx;
  const rand = mulberry32(0xdeadbeef);

  const nebula = buildLayer(
    'starfield-nebula',
    150,
    [40, 95],
    [10, 35],
    [7.0, 0.4, 0.33, 0.0],
    (mesh, x, y, z, size, centerX, centerY, zBase, nextRand) => {
      const colorRoll = nextRand();
      let hue: number;
      let sat: number;
      let lum: number;
      let alphaCenter: number;

      if (colorRoll < 0.2) {
        hue = 0;
        sat = 16;
        lum = 6;
        alphaCenter = 0.17 + nextRand() * 0.03;
      } else if (colorRoll < 0.7) {
        hue = 0;
        sat = 120 + nextRand() * 40;
        lum = 15 + nextRand() * 10;
        alphaCenter = 0.19 + nextRand() * 0.02;
      } else {
        hue = 0;
        sat = 180;
        lum = 25 + nextRand() * 15;
        alphaCenter = 0.18 + nextRand() * 0.04;
      }

      const color = packHsl(hue, sat, lum);
      const points = 5 + Math.floor(nextRand() * 4);
      createStar(mesh, x, y, z, size, centerX, centerY, zBase, color, color, alphaCenter, points, nextRand);
    },
    rand,
    baseZ,
  );

  const farStars = buildLayer(
    'starfield-far',
    2500,
    [80, 110],
    [0.015, 0.035],
    [7.0, 0.1, 0.3, 1.0],
    (mesh, x, y, z, size, centerX, centerY, zBase, nextRand) => {
      const lum = 100 + Math.floor(nextRand() * 60);
      const color = packHsl(0, 0, lum);
      createStar(mesh, x, y, z, size, centerX, centerY, zBase, color, color, 1.0, 4, nextRand);
    },
    rand,
    baseZ,
  );

  const midStars = buildLayer(
    'starfield-mid',
    800,
    [50, 85],
    [0.035, 0.07],
    [7.0, 0.1, 0.6, 2.5],
    (mesh, x, y, z, size, centerX, centerY, zBase, nextRand) => {
      const roll = nextRand();
      let hue = 0;
      let sat = 0;
      let lum = 130 + nextRand() * 50;
      if (roll < 0.15) {
        hue = 0;
        sat = 96 + nextRand() * 64;
        lum = 100 + nextRand() * 40;
      } else if (roll < 0.2) {
        hue = 168;
        sat = 64;
        lum = 120 + nextRand() * 40;
      }
      const color = packHsl(hue, sat, lum);
      const points = roll < 0.1 ? 5 : 4;
      createStar(mesh, x, y, z, size, centerX, centerY, zBase, color, color, 0.9, points, nextRand);
    },
    rand,
    baseZ,
  );

  const closeStars = buildLayer(
    'starfield-close',
    150,
    [30, 55],
    [0.07, 0.15],
    [7.0, 0.3, 0.8, 5.0],
    (mesh, x, y, z, size, centerX, centerY, zBase, nextRand) => {
      const roll = nextRand();
      let hue = 0;
      let sat = 0;
      let lum = 180 + nextRand() * 45;
      if (roll < 0.25) {
        hue = 0;
        sat = 160;
        lum = 150 + nextRand() * 40;
      } else if (roll < 0.35) {
        hue = 168;
        sat = 96;
        lum = 160 + nextRand() * 40;
      }
      const centerColor = packHsl(hue, sat, lum);
      const edgeColor = packHsl(hue, sat, Math.max(0, lum - 100));
      createStar(mesh, x, y, z, size, centerX, centerY, zBase, centerColor, edgeColor, 0.7, 4, nextRand);
    },
    rand,
    baseZ,
  );

  const shootingStars = buildLayer(
    'starfield-streaks',
    40,
    [35, 80],
    [1.0, 3.0],
    [8.0, 0.05, 0.08, 0.0],
    (mesh, x, y, z, size, centerX, centerY, zBase, nextRand) => {
      const nx = x - centerX;
      const ny = y - centerY;
      const nz = z - zBase;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;

      const worldDownZ = -1.0;
      const dotDown = nnz * worldDownZ;
      let fallDirX = -nnx * dotDown;
      let fallDirY = -nny * dotDown;
      let fallDirZ = worldDownZ - nnz * dotDown;
      const fallLen = Math.sqrt(fallDirX * fallDirX + fallDirY * fallDirY + fallDirZ * fallDirZ) || 1;
      fallDirX /= fallLen;
      fallDirY /= fallLen;
      fallDirZ /= fallLen;

      const dotValue = nnx * 269.5 + nny * 183.3;
      const sinValue = Math.sin(dotValue) * 43758.5453;
      const lateralSeed = sinValue - Math.floor(sinValue);

      let latX = nny * fallDirZ - nnz * fallDirY;
      let latY = nnz * fallDirX - nnx * fallDirZ;
      let latZ = nnx * fallDirY - nny * fallDirX;
      const latLen = Math.sqrt(latX * latX + latY * latY + latZ * latZ) || 1;
      latX /= latLen;
      latY /= latLen;
      latZ /= latLen;

      const latOffset = (lateralSeed - 0.5) * 1.2;
      let dirX = fallDirX + latX * latOffset;
      let dirY = fallDirY + latY * latOffset;
      let dirZ = fallDirZ + latZ * latOffset;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
      dirX /= dirLen;
      dirY /= dirLen;
      dirZ /= dirLen;

      const perpX = nny * dirZ - nnz * dirY;
      const perpY = nnz * dirX - nnx * dirZ;
      const perpZ = nnx * dirY - nny * dirX;
      const width = size * 0.012 + nextRand() * 0.008;

      const roll = nextRand();
      let hue = 0;
      let sat = 0;
      let lum = 200 + nextRand() * 55;
      if (roll < 0.4) {
        hue = 0;
        sat = 192;
        lum = 160 + nextRand() * 40;
      }

      const color = packHsl(hue, sat, lum);
      const centerIdx = mesh.vIdx();
      mesh.addVertex(x, y, z, nnx, nny, nnz, color, 1.0);
      mesh.addVertex(x + perpX * width, y + perpY * width, z + perpZ * width, nnx, nny, nnz, color, 0.5);
      mesh.addVertex(x - perpX * width, y - perpY * width, z - perpZ * width, nnx, nny, nnz, color, 0.5);
      mesh.addVertex(x, y, z, nnx, nny, nnz, color, 0.0);
      mesh.indices.push(centerIdx, centerIdx + 1, centerIdx + 3);
      mesh.indices.push(centerIdx, centerIdx + 3, centerIdx + 2);
    },
    rand,
    baseZ,
  );

  return [nebula, farStars, midStars, closeStars, shootingStars];
}
