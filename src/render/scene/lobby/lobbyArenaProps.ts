import { mulberry32 } from '../../../core/rng';
import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { COLOR_BASE_STONE, COLOR_DARK_STONE, COLOR_DECO_STONE, darken, jitterLuminance } from './lobbyColorUtils';
import type { EmbeddedMeshCommand, LobbyEnvironmentBuildState } from './lobbyConstants';
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  faceLuminanceShift,
  getLobbyBossCenter,
  IDENTITY_MATRIX,
} from './lobbyConstants';
import { makeIndices } from './lobbyMeshBuilder';

const PATHWAY_ANGLES = [(213.7 / 180) * Math.PI, (90.0 / 180) * Math.PI, (329.0 / 180) * Math.PI];

function isInPathway(x: number, y: number, halfWidth: number): boolean {
  const dx = x - ARENA_CENTER_X;
  const dy = y - ARENA_CENTER_Y;
  for (const angle of PATHWAY_ANGLES) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const t = dx * dirX + dy * dirY;
    const dPerp = Math.abs(dx * dirY - dy * dirX);
    if (t > 3.2 && t < 16.8 && dPerp < halfWidth) return true;
  }
  return false;
}

function nearStructure(x: number, y: number, minDistCore: number, minDistBrazier: number): boolean {
  for (let p = 0; p < 4; p++) {
    const angle = Math.PI / 8 + (p * Math.PI) / 2;
    const px = ARENA_CENTER_X + Math.cos(angle) * 14.8;
    const py = ARENA_CENTER_Y + Math.sin(angle) * 14.8;
    if ((x - px) * (x - px) + (y - py) * (y - py) < minDistCore * minDistCore) {
      return true;
    }
  }

  for (let b = 0; b < 8; b++) {
    const angle = Math.PI / 8 + (b * Math.PI) / 4;
    const bx = ARENA_CENTER_X + Math.cos(angle) * 11.0;
    const by = ARENA_CENTER_Y + Math.sin(angle) * 11.0;
    if ((x - bx) * (x - bx) + (y - by) * (y - by) < minDistBrazier * minDistBrazier) {
      return true;
    }
  }

  return false;
}

function distToNearestStructure(x: number, y: number): number {
  let minDistance = Infinity;
  for (let p = 0; p < 4; p++) {
    const angle = Math.PI / 8 + (p * Math.PI) / 2;
    const px = ARENA_CENTER_X + Math.cos(angle) * 14.8;
    const py = ARENA_CENTER_Y + Math.sin(angle) * 14.8;
    const distance = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    if (distance < minDistance) {
      minDistance = distance;
    }
  }
  return minDistance;
}

export function buildDebrisMesh(state: LobbyEnvironmentBuildState): EmbeddedMeshCommand {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vIdx = 0;
  const rand = mulberry32(0x12345678);

  const getSector = (theta: number): number => {
    let t = theta % (Math.PI * 2);
    if (t < 0) t += Math.PI * 2;
    if (t >= 1.57 && t < 3.73) return 0;
    if (t >= 3.73 && t < 5.74) return 1;
    return 2;
  };

  const debrisList: Array<{ cx: number; cy: number; r: number }> = [];
  const sectorCounts = [0, 0, 0];
  const targetPerSector = 155 / 3;
  const maxPerSector = targetPerSector * 1.2;

  while (debrisList.length < 155) {
    const r = 3.5 + rand() * 11.5;
    const theta = rand() * Math.PI * 2;
    const cx = ARENA_CENTER_X + Math.cos(theta) * r;
    const cy = ARENA_CENTER_Y + Math.sin(theta) * r;

    if (isInPathway(cx, cy, 1.2) || nearStructure(cx, cy, 1.1, 0.9)) {
      continue;
    }

    let nearBoss = false;
    for (let b = 0; b < LOBBY_BOSS_NPCS.length; b++) {
      const boss = getLobbyBossCenter(b);
      if (Math.sqrt((cx - boss.x) * (cx - boss.x) + (cy - boss.y) * (cy - boss.y)) < 3.8) {
        nearBoss = true;
        break;
      }
    }
    if (nearBoss) continue;

    let weight = 0;
    if (r < 5.5) weight += 0.1;
    else if (r < 8.0) weight += 0.3;
    else if (r < 10.5) weight += 0.45;
    else if (r < 13.5) weight += 0.7;
    else weight += 1.2;

    const distStruct = distToNearestStructure(cx, cy);
    if (distStruct >= 1.0 && distStruct <= 2.2) {
      weight += 0.45;
    }

    for (const endpoint of state.fallenColumnEndpoints) {
      if (Math.hypot(cx - endpoint.x, cy - endpoint.y) < 1.5) {
        weight += 0.4;
      }
    }

    if (rand() >= weight / 2.2) continue;

    const sector = getSector(theta);
    if (sectorCounts[sector] >= maxPerSector) continue;
    sectorCounts[sector]++;
    debrisList.push({ cx, cy, r });
  }

  for (const debris of debrisList) {
    let size: number;
    let height: number;
    const sizeRoll = rand();
    if (debris.r < 6.0) {
      size = 0.02 + rand() * 0.04;
      height = 0.01 + rand() * 0.02;
    } else if (sizeRoll < 0.5) {
      size = 0.02 + rand() * 0.03;
      height = 0.01 + rand() * 0.03;
    } else if (sizeRoll < 0.85) {
      size = 0.05 + rand() * 0.1;
      height = 0.02 + rand() * 0.08;
    } else {
      size = 0.15 + rand() * 0.2;
      height = 0.05 + rand() * 0.15;
    }

    let color = rand() < 0.3 ? COLOR_DARK_STONE : rand() < 0.6 ? COLOR_BASE_STONE : COLOR_DECO_STONE;
    color = jitterLuminance(color, Math.floor(rand() * 10) - 5);
    const points: Array<{ x: number; y: number }> = [];
    const pointCount = 3 + Math.floor(rand() * 3);
    const baseAngle = rand() * Math.PI * 2;

    for (let p = 0; p < pointCount; p++) {
      const angle = baseAngle + (p / pointCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const distance = size * (0.5 + rand() * 0.5);
      points.push({
        x: debris.cx + Math.cos(angle) * distance,
        y: debris.cy + Math.sin(angle) * distance,
      });
    }

    const topIdx = vIdx;
    for (let p = 0; p < pointCount; p++) {
      positions.push(points[p].x, points[p].y, state.baseZ + 0.01 + height);
      normals.push(0, 0, 1);
      colors.push(jitterLuminance(color, faceLuminanceShift(0, 0, 1) + Math.floor(rand() * 3) - 1));
      if (p >= 2) {
        indices.push(topIdx, topIdx + p - 1, topIdx + p);
      }
    }
    vIdx += pointCount;

    const sideColor = darken(color, 12);
    for (let p = 0; p < pointCount; p++) {
      const next = (p + 1) % pointCount;
      const i0 = vIdx;
      const dx = points[next].x - points[p].x;
      const dy = points[next].y - points[p].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;

      positions.push(
        points[p].x,
        points[p].y,
        state.baseZ + 0.01,
        points[next].x,
        points[next].y,
        state.baseZ + 0.01,
        points[next].x,
        points[next].y,
        state.baseZ + 0.01 + height,
        points[p].x,
        points[p].y,
        state.baseZ + 0.01 + height,
      );
      const litSide = jitterLuminance(sideColor, faceLuminanceShift(nx, ny, 0));
      for (let k = 0; k < 4; k++) {
        normals.push(nx, ny, 0);
        colors.push(litSide);
      }
      indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      vIdx += 4;
    }
  }

  return {
    kind: 'mesh3d',
    meshId: 'lobby-debris',
    materialId: 'osrs-terrain',
    modelMatrix: IDENTITY_MATRIX,
    depth: 'readwrite',
    cullFace: 'none',
    zIndex: 0,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    perVertexHslColors: new Float32Array(colors),
    indices: makeIndices(indices),
  };
}

export function buildFallenColumnsMesh(state: LobbyEnvironmentBuildState): EmbeddedMeshCommand {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vIdx = 0;
  const rand = mulberry32(0x3c6ef372);

  interface ColumnDef {
    p1x: number;
    p1y: number;
    p2x: number;
    p2y: number;
    radius: number;
    angle: number;
    color: number;
    sideColor: number;
    topColor: number;
    z1: number;
    z2: number;
  }

  const closestTOnSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 0.0001) return 0;
    return Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  };

  const segSegClosest = (
    a1x: number,
    a1y: number,
    a2x: number,
    a2y: number,
    b1x: number,
    b1y: number,
    b2x: number,
    b2y: number,
  ) => {
    let t1 = 0.5;
    let t2 = 0.5;
    for (let iter = 0; iter < 4; iter++) {
      const px = b1x + (b2x - b1x) * t2;
      const py = b1y + (b2y - b1y) * t2;
      t1 = closestTOnSegment(a1x, a1y, a2x, a2y, px, py);
      const qx = a1x + (a2x - a1x) * t1;
      const qy = a1y + (a2y - a1y) * t1;
      t2 = closestTOnSegment(b1x, b1y, b2x, b2y, qx, qy);
    }
    const cx1 = a1x + (a2x - a1x) * t1;
    const cy1 = a1y + (a2y - a1y) * t1;
    const cx2 = b1x + (b2x - b1x) * t2;
    const cy2 = b1y + (b2y - b1y) * t2;
    return {
      dist: Math.sqrt((cx1 - cx2) * (cx1 - cx2) + (cy1 - cy2) * (cy1 - cy2)),
      t1,
      t2,
    };
  };

  const placed: ColumnDef[] = [];
  state.fallenColumnEndpoints.length = 0;
  let outerCount = 0;
  let pedestalCount = 0;

  for (let attempt = 0; placed.length < 7 && attempt < 200; attempt++) {
    let cx = 0;
    let cy = 0;
    let length = 0;
    let angle = 0;

    if (outerCount < 5) {
      const sourceIdx = Math.floor(rand() * 10);
      const sourceAngle = sourceIdx < 6 ? (sourceIdx * Math.PI) / 3 : Math.PI / 8 + ((sourceIdx - 6) * Math.PI) / 2;
      const sx = ARENA_CENTER_X + Math.cos(sourceAngle) * 14.8;
      const sy = ARENA_CENTER_Y + Math.sin(sourceAngle) * 14.8;
      const r = 13.0 + rand() * 2.0;
      cx = ARENA_CENTER_X + Math.cos(sourceAngle + (rand() - 0.5) * 0.2) * r;
      cy = ARENA_CENTER_Y + Math.sin(sourceAngle + (rand() - 0.5) * 0.2) * r;
      angle =
        Math.atan2(ARENA_CENTER_Y - sy, ARENA_CENTER_X - sx) +
        Math.PI +
        (rand() + rand() + rand() - 1.5) * ((40 / 180) * Math.PI);
      length = 1.5 + rand() * 1.2;
    } else if (pedestalCount < 2) {
      const pathAngle = PATHWAY_ANGLES[Math.floor(rand() * 3)];
      const theta = pathAngle + ((rand() < 0.5 ? 1 : -1) * (25 + rand() * 35) * Math.PI) / 180;
      const r = 11.8 + rand() * 1.4;
      cx = ARENA_CENTER_X + Math.cos(theta) * r;
      cy = ARENA_CENTER_Y + Math.sin(theta) * r;
      angle = pathAngle + Math.PI / 2 + (rand() - 0.5) * ((30 * Math.PI) / 180);
      length = 1.2 + rand() * 1.0;
    }

    if (isInPathway(cx, cy, 2.2)) continue;

    let nearBoss = false;
    for (let b = 0; b < LOBBY_BOSS_NPCS.length; b++) {
      const boss = getLobbyBossCenter(b);
      if (Math.sqrt((cx - boss.x) * (cx - boss.x) + (cy - boss.y) * (cy - boss.y)) < 4.2) {
        nearBoss = true;
        break;
      }
    }
    if (nearBoss) continue;

    const radius = 0.15 + rand() * 0.1;
    let color = rand() < 0.5 ? COLOR_BASE_STONE : COLOR_DECO_STONE;
    color = jitterLuminance(color, Math.floor(rand() * 10) - 5);
    const sideColor = darken(color, 15);
    const topColor = darken(color, 5);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const p1x = cx - dx * length * 0.5;
    const p1y = cy - dy * length * 0.5;
    const p2x = cx + dx * length * 0.5;
    const p2y = cy + dy * length * 0.5;
    let z1 = state.baseZ + radius * 0.8;
    let z2 = state.baseZ + radius * 0.8;

    for (const other of placed) {
      const result = segSegClosest(p1x, p1y, p2x, p2y, other.p1x, other.p1y, other.p2x, other.p2y);
      const touchDist = radius + other.radius + 0.05;
      if (result.dist >= touchDist) continue;
      const otherZAtCross = other.z1 + (other.z2 - other.z1) * result.t2;
      const liftZ = otherZAtCross + other.radius + radius + 0.02;
      if (result.t1 < 0.5) {
        const z1New = result.t1 < 0.99 ? (liftZ - z2 * result.t1) / (1 - result.t1) : liftZ;
        z1 = Math.max(z1, z1New);
      } else {
        const z2New = result.t1 > 0.01 ? (liftZ - z1 * (1 - result.t1)) / result.t1 : liftZ;
        z2 = Math.max(z2, z2New);
      }
    }

    placed.push({ p1x, p1y, p2x, p2y, radius, angle, color, sideColor, topColor, z1, z2 });
    state.fallenColumnEndpoints.push({ x: p1x, y: p1y }, { x: p2x, y: p2y });
    if (outerCount < 5) outerCount++;
    else pedestalCount++;
  }

  for (const column of placed) {
    const dx = Math.cos(column.angle);
    const dy = Math.sin(column.angle);
    const nx = -dy;
    const ny = dx;
    const points: Array<{ x: number; y: number; z: number; nx: number; ny: number; nz: number }> = [];

    for (let s = 0; s < 6; s++) {
      const angle = (s / 6) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      points.push({
        x: nx * ca * column.radius,
        y: ny * ca * column.radius,
        z: sa * column.radius,
        nx: nx * ca,
        ny: ny * ca,
        nz: sa,
      });
    }

    for (let s = 0; s < 6; s++) {
      const next = (s + 1) % 6;
      const i0 = vIdx;
      positions.push(
        column.p1x + points[s].x,
        column.p1y + points[s].y,
        column.z1 + points[s].z,
        column.p2x + points[s].x,
        column.p2y + points[s].y,
        column.z2 + points[s].z,
        column.p2x + points[next].x,
        column.p2y + points[next].y,
        column.z2 + points[next].z,
        column.p1x + points[next].x,
        column.p1y + points[next].y,
        column.z1 + points[next].z,
      );

      const normX = (points[s].nx + points[next].nx) * 0.5;
      const normY = (points[s].ny + points[next].ny) * 0.5;
      const normZ = (points[s].nz + points[next].nz) * 0.5;
      const len = Math.sqrt(normX * normX + normY * normY + normZ * normZ) || 1;
      const litSide = jitterLuminance(column.sideColor, faceLuminanceShift(normX / len, normY / len, normZ / len));
      for (let k = 0; k < 4; k++) {
        normals.push(normX / len, normY / len, normZ / len);
        colors.push(litSide);
      }
      indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      vIdx += 4;
    }

    const cap1Idx = vIdx;
    positions.push(column.p1x, column.p1y, column.z1);
    normals.push(-dx, -dy, 0);
    colors.push(jitterLuminance(column.topColor, faceLuminanceShift(-dx, -dy, 0)));
    vIdx++;
    for (let s = 0; s < 6; s++) {
      positions.push(column.p1x + points[s].x, column.p1y + points[s].y, column.z1 + points[s].z);
      normals.push(-dx, -dy, 0);
      colors.push(jitterLuminance(column.topColor, faceLuminanceShift(-dx, -dy, 0)));
      if (s > 0) {
        indices.push(cap1Idx, cap1Idx + s, cap1Idx + s + 1);
      }
      vIdx++;
    }
    indices.push(cap1Idx, cap1Idx + 6, cap1Idx + 1);

    const cap2Idx = vIdx;
    positions.push(column.p2x, column.p2y, column.z2);
    normals.push(dx, dy, 0);
    colors.push(jitterLuminance(column.topColor, faceLuminanceShift(dx, dy, 0)));
    vIdx++;
    for (let s = 0; s < 6; s++) {
      positions.push(column.p2x + points[s].x, column.p2y + points[s].y, column.z2 + points[s].z);
      normals.push(dx, dy, 0);
      colors.push(jitterLuminance(column.topColor, faceLuminanceShift(dx, dy, 0)));
      if (s > 0) {
        indices.push(cap2Idx, cap2Idx + s + 1, cap2Idx + s);
      }
      vIdx++;
    }
    indices.push(cap2Idx, cap2Idx + 1, cap2Idx + 6);
  }

  return {
    kind: 'mesh3d',
    meshId: 'lobby-fallen-columns',
    materialId: 'osrs-terrain',
    modelMatrix: IDENTITY_MATRIX,
    depth: 'readwrite',
    cullFace: 'none',
    zIndex: 0,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    perVertexHslColors: new Float32Array(colors),
    indices: makeIndices(indices),
  };
}

export function buildScatteredRubblePiles(state: LobbyEnvironmentBuildState): EmbeddedMeshCommand {
  const pos: number[] = [];
  const norm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vIdx = 0;
  const rand = mulberry32(0x51f0ab12);

  const clusters: Array<{ cx: number; cy: number }> = [];
  let columnCount = 0;

  for (let attempt = 0; clusters.length < 7 && attempt < 200; attempt++) {
    let cx = 0;
    let cy = 0;

    if (columnCount < 3 && state.fallenColumnEndpoints.length > 0) {
      const endpoint = state.fallenColumnEndpoints[Math.floor(rand() * state.fallenColumnEndpoints.length)];
      const distance = 0.4 + rand() * 0.5;
      const angle = rand() * Math.PI * 2;
      cx = endpoint.x + Math.cos(angle) * distance;
      cy = endpoint.y + Math.sin(angle) * distance;
    } else if (columnCount < 3) {
      const r = 14.0 + rand() * 1.5;
      const angle = rand() * Math.PI * 2;
      cx = ARENA_CENTER_X + Math.cos(angle) * r;
      cy = ARENA_CENTER_Y + Math.sin(angle) * r;
    } else {
      const pathAngle = PATHWAY_ANGLES[Math.floor(rand() * 3)];
      const theta = pathAngle + ((rand() < 0.5 ? 1 : -1) * (25 + rand() * 35) * Math.PI) / 180;
      const r = 12.2 + rand() * 1.4;
      cx = ARENA_CENTER_X + Math.cos(theta) * r;
      cy = ARENA_CENTER_Y + Math.sin(theta) * r;
    }

    const clusterRadius = Math.sqrt(
      (cx - ARENA_CENTER_X) * (cx - ARENA_CENTER_X) + (cy - ARENA_CENTER_Y) * (cy - ARENA_CENTER_Y),
    );
    if (clusterRadius > 15.5 || isInPathway(cx, cy, 1.6)) continue;

    let nearBoss = false;
    for (let b = 0; b < LOBBY_BOSS_NPCS.length; b++) {
      const boss = getLobbyBossCenter(b);
      if (Math.sqrt((cx - boss.x) * (cx - boss.x) + (cy - boss.y) * (cy - boss.y)) < 3.8) {
        nearBoss = true;
        break;
      }
    }
    if (nearBoss) continue;

    if (
      clusters.some(
        (cluster) => (cluster.cx - cx) * (cluster.cx - cx) + (cluster.cy - cy) * (cluster.cy - cy) < 1.8 * 1.8,
      )
    ) {
      continue;
    }

    clusters.push({ cx, cy });
    if (columnCount < 3) columnCount++;
  }

  for (const cluster of clusters) {
    const rockCount = 3 + Math.floor(rand() * 4);
    for (let rock = 0; rock < rockCount; rock++) {
      const rockAngle = rand() * Math.PI * 2;
      const rockDist = rand() * 0.4;
      const rx = cluster.cx + Math.cos(rockAngle) * rockDist;
      const ry = cluster.cy + Math.sin(rockAngle) * rockDist;
      const size = 0.05 + rand() * 0.15;
      const height = 0.05 + rand() * 0.15;
      let color = rand() < 0.4 ? COLOR_DARK_STONE : rand() < 0.8 ? COLOR_BASE_STONE : COLOR_DECO_STONE;
      color = jitterLuminance(color, Math.floor(rand() * 10) - 5);
      const sideColor = darken(color, 15);
      const pointCount = 4 + Math.floor(rand() * 3);
      const points: Array<{ x: number; y: number }> = [];
      const baseAngle = rand() * Math.PI * 2;

      for (let p = 0; p < pointCount; p++) {
        const angle = baseAngle + (p / pointCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
        const distance = size * (0.6 + rand() * 0.4);
        points.push({ x: rx + Math.cos(angle) * distance, y: ry + Math.sin(angle) * distance });
      }

      const topIdx = vIdx;
      for (let p = 0; p < pointCount; p++) {
        pos.push(points[p].x, points[p].y, state.baseZ + height);
        norm.push(0, 0, 1);
        col.push(jitterLuminance(color, faceLuminanceShift(0, 0, 1) + Math.floor(rand() * 3) - 1));
        if (p >= 2) {
          idx.push(topIdx, topIdx + p - 1, topIdx + p);
        }
      }
      vIdx += pointCount;

      for (let p = 0; p < pointCount; p++) {
        const next = (p + 1) % pointCount;
        const i0 = vIdx;
        const dx = points[next].x - points[p].x;
        const dy = points[next].y - points[p].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dy / len;
        const ny = -dx / len;
        pos.push(
          points[p].x,
          points[p].y,
          state.baseZ,
          points[next].x,
          points[next].y,
          state.baseZ,
          points[next].x,
          points[next].y,
          state.baseZ + height,
          points[p].x,
          points[p].y,
          state.baseZ + height,
        );
        const litSide = jitterLuminance(sideColor, faceLuminanceShift(nx, ny, 0));
        for (let k = 0; k < 4; k++) {
          norm.push(nx, ny, 0);
          col.push(litSide);
        }
        idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
        vIdx += 4;
      }
    }
  }

  return {
    kind: 'mesh3d',
    meshId: 'lobby-scattered-rubble',
    materialId: 'osrs-terrain',
    modelMatrix: IDENTITY_MATRIX,
    depth: 'readwrite',
    cullFace: 'none',
    zIndex: 0,
    positions: new Float32Array(pos),
    normals: new Float32Array(norm),
    perVertexHslColors: new Float32Array(col),
    indices: makeIndices(idx),
  };
}
