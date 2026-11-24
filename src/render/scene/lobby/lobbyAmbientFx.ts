import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { packHsl } from '../../../rs/util/ColorUtil';
import { COLOR_MAGIC_TEAL, COLOR_MAGIC_VIOLET } from './lobbyColorUtils';
import type { EmbeddedMeshCommand } from './lobbyConstants';
import { ARENA_CENTER_X, ARENA_CENTER_Y, getLobbyBossCenter, hash, isLobbyBossAvailable } from './lobbyConstants';
import { createLobbyMeshBuilder } from './lobbyMeshBuilder';

function addOctahedron(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  px: number,
  py: number,
  pz: number,
  size: number,
  color: number,
  alpha: number,
  spin: number,
): void {
  const adjustedSize = size * 0.75;
  const sizeZ = adjustedSize * 1.3;
  const nx = Math.cos(spin);
  const ny = Math.sin(spin);
  const mx = -ny;
  const my = nx;
  const ux = nx * adjustedSize;
  const uy = ny * adjustedSize;
  const vx = mx * adjustedSize;
  const vy = my * adjustedSize;
  const v = mesh.vIdx();

  mesh.addVertex(px + ux, py + uy, pz, nx, ny, 0, color, alpha);
  mesh.addVertex(px - ux, py - uy, pz, -nx, -ny, 0, color, alpha);
  mesh.addVertex(px + vx, py + vy, pz, mx, my, 0, color, alpha);
  mesh.addVertex(px - vx, py - vy, pz, -mx, -my, 0, color, alpha);
  mesh.addVertex(px, py, pz + sizeZ, 0, 0, 1, color, alpha);
  mesh.addVertex(px, py, pz - sizeZ, 0, 0, -1, color, alpha);

  mesh.indices.push(
    v,
    v + 2,
    v + 4,
    v + 2,
    v + 1,
    v + 4,
    v + 1,
    v + 3,
    v + 4,
    v + 3,
    v,
    v + 4,
    v,
    v + 5,
    v + 2,
    v + 2,
    v + 5,
    v + 1,
    v + 1,
    v + 5,
    v + 3,
    v + 3,
    v + 5,
    v,
  );
}

function addFlatQuad(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  a: { x: number; y: number; z: number; c: number; a: number },
  b: { x: number; y: number; z: number; c: number; a: number },
  c: { x: number; y: number; z: number; c: number; a: number },
  d: { x: number; y: number; z: number; c: number; a: number },
): void {
  mesh.addQuad(
    { x: a.x, y: a.y, z: a.z, nx: 0, ny: 0, nz: 1, color: a.c, alpha: a.a },
    { x: b.x, y: b.y, z: b.z, nx: 0, ny: 0, nz: 1, color: b.c, alpha: b.a },
    { x: c.x, y: c.y, z: c.z, nx: 0, ny: 0, nz: 1, color: c.c, alpha: c.a },
    { x: d.x, y: d.y, z: d.z, nx: 0, ny: 0, nz: 1, color: d.c, alpha: d.a },
  );
}

export function buildAmbientMotes(baseZ: number): EmbeddedMeshCommand[] {
  const availableBossIndices = LOBBY_BOSS_NPCS.map((boss, index) => ({ boss, index }))
    .filter(({ boss }) => isLobbyBossAvailable(boss))
    .map(({ index }) => index);

  if (availableBossIndices.length === 0) {
    return [];
  }

  const motePalette = [
    COLOR_MAGIC_TEAL,
    packHsl(0, 224, 90),
    packHsl(0, 192, 70),
    packHsl(4, 200, 100),
    packHsl(0, 160, 55),
  ];

  const groups = new Map<number, ReturnType<typeof createLobbyMeshBuilder>>();
  for (const bossIndex of availableBossIndices) {
    groups.set(bossIndex, createLobbyMeshBuilder());
  }

  // Per-boss mote budget. Looping this for EACH available boss (rather than
  // splitting a fixed total round-robin) keeps every boss's cloud at full
  // density no matter how many bosses are unlocked.
  const MOTES_PER_BOSS = 175;
  for (const bossIndex of availableBossIndices) {
    const bossCenter = getLobbyBossCenter(bossIndex);
    const group = groups.get(bossIndex)!;
    for (let i = 0; i < MOTES_PER_BOSS; i++) {
      const seed = hash(bossIndex * 9973 + i + 11, i + 37);
      const theta = ((seed & 1023) / 1023) * Math.PI * 2;
      const zFrac = (((seed >> 20) & 1023) / 1023) ** 2.0;
      const z = baseZ + 3.0 + zFrac * 4.5;
      const maxR = 3.4 - zFrac * 1.4;
      const rFrac = ((seed >> 10) & 1023) / 1023;
      const r = 1.8 + Math.sqrt(rFrac) * (maxR - 1.8);
      const x = bossCenter.x + Math.cos(theta) * r;
      const y = bossCenter.y + Math.sin(theta) * r;
      const sizeFrac = ((seed >> 6) & 255) / 255;
      const size = 0.02 + sizeFrac ** 2.0 * 0.14;
      const spin = (((seed >> 14) & 511) / 511) * Math.PI * 2;
      const color = motePalette[seed % motePalette.length];
      addOctahedron(group, x, y, z, size, color, 1.0, spin);
    }
  }

  const commands: EmbeddedMeshCommand[] = [];
  for (const [bossIndex, mesh] of groups.entries()) {
    if (mesh.vIdx() === 0) continue;
    const center = getLobbyBossCenter(bossIndex);
    commands.push(
      mesh.toCommand(`lobby-ambient-motes-${bossIndex}`, 9, {
        depth: 'read',
        blend: 'normal',
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.12, center.x, center.y] },
      }),
    );
  }

  return commands;
}

export function buildAmbientHaze(baseZ: number): EmbeddedMeshCommand {
  const mesh = createLobbyMeshBuilder();
  const centerColor = packHsl(0, 160, 36);
  const centerIdx = mesh.addVertex(ARENA_CENTER_X, ARENA_CENTER_Y, baseZ + 1.0, 0, 0, 1, centerColor, 0.35);
  let previousIdx: number | null = null;

  for (let s = 0; s <= 32; s++) {
    const t = (s / 32) * Math.PI * 2;
    const currentIdx = mesh.addVertex(
      ARENA_CENTER_X + Math.cos(t) * 19.0,
      ARENA_CENTER_Y + Math.sin(t) * 19.0,
      baseZ + 1.0,
      0,
      0,
      1,
      centerColor,
      0.0,
    );
    if (previousIdx !== null) {
      mesh.indices.push(centerIdx, previousIdx, currentIdx);
    }
    previousIdx = currentIdx;
  }

  return mesh.toCommand('lobby-ambient-haze', 4, {
    depth: 'read',
    blend: 'normal',
    shaderId: 'scene-effects',
    uniforms: { u_animParams: [2.0, 0.1, 0.2, 0.0] },
  });
}

export function buildVortexSwirl(baseZ: number): EmbeddedMeshCommand {
  const mesh = createLobbyMeshBuilder();
  const z = baseZ + 0.06;
  const coreColor = packHsl(0, 200, 30);

  for (let arm = 0; arm < 8; arm++) {
    const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
    for (let s = 0; s < 16; s++) {
      const rNormIn = s / 16;
      const rNormOut = (s + 1) / 16;
      const rIn = rNormIn * 0.8;
      const rOut = rNormOut * 0.8;
      const t0 = armOffset + rNormIn * 2.0;
      const t1 = armOffset + rNormOut * 2.0;
      const wIn = 0.3 * (1.0 - rNormIn * 0.5) + 0.05;
      const wOut = 0.3 * (1.0 - rNormOut * 0.5) + 0.05;
      const aIn = 0.6 * (1.0 - rNormIn * 0.5);
      const aOut = 0.6 * (1.0 - rNormOut * 0.5);
      addFlatQuad(
        mesh,
        {
          x: ARENA_CENTER_X + Math.cos(t0 - wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 - wIn) * rIn,
          z,
          c: coreColor,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t0 + wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 + wIn) * rIn,
          z,
          c: coreColor,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 + wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 + wOut) * rOut,
          z,
          c: coreColor,
          a: aOut,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 - wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 - wOut) * rOut,
          z,
          c: coreColor,
          a: aOut,
        },
      );
    }
  }

  for (let arm = 0; arm < 8; arm++) {
    const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
    for (let s = 0; s < 20; s++) {
      const rNormIn = s / 20;
      const rNormOut = (s + 1) / 20;
      const rIn = 0.8 + rNormIn * 1.2;
      const rOut = 0.8 + rNormOut * 1.2;
      const t0 = armOffset + rNormIn * 2.5;
      const t1 = armOffset + rNormOut * 2.5;
      const wIn = 0.2 * (1.0 - rNormIn) + 0.05;
      const wOut = 0.2 * (1.0 - rNormOut) + 0.05;
      const aIn = 0.4 * (1.0 - rNormIn);
      const aOut = 0.4 * (1.0 - rNormOut);
      addFlatQuad(
        mesh,
        {
          x: ARENA_CENTER_X + Math.cos(t0 - wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 - wIn) * rIn,
          z: z + 0.001,
          c: COLOR_MAGIC_VIOLET,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t0 + wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 + wIn) * rIn,
          z: z + 0.001,
          c: COLOR_MAGIC_VIOLET,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 + wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 + wOut) * rOut,
          z: z + 0.001,
          c: COLOR_MAGIC_VIOLET,
          a: aOut,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 - wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 - wOut) * rOut,
          z: z + 0.001,
          c: COLOR_MAGIC_VIOLET,
          a: aOut,
        },
      );
    }
  }

  for (let arm = 0; arm < 8; arm++) {
    const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
    for (let s = 0; s < 16; s++) {
      const rNormIn = s / 16;
      const rNormOut = (s + 1) / 16;
      const rIn = 2.0 + rNormIn * 1.0;
      const rOut = 2.0 + rNormOut * 1.0;
      const t0 = armOffset + rNormIn * 3.0;
      const t1 = armOffset + rNormOut * 3.0;
      const wIn = 0.15 * (1.0 - rNormIn) + 0.02;
      const wOut = 0.15 * (1.0 - rNormOut) + 0.02;
      const aIn = 0.2 * (1.0 - rNormIn);
      const aOut = 0.2 * (1.0 - rNormOut);
      addFlatQuad(
        mesh,
        {
          x: ARENA_CENTER_X + Math.cos(t0 - wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 - wIn) * rIn,
          z: z + 0.002,
          c: COLOR_MAGIC_TEAL,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t0 + wIn) * rIn,
          y: ARENA_CENTER_Y + Math.sin(t0 + wIn) * rIn,
          z: z + 0.002,
          c: COLOR_MAGIC_TEAL,
          a: aIn,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 + wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 + wOut) * rOut,
          z: z + 0.002,
          c: COLOR_MAGIC_TEAL,
          a: aOut,
        },
        {
          x: ARENA_CENTER_X + Math.cos(t1 - wOut) * rOut,
          y: ARENA_CENTER_Y + Math.sin(t1 - wOut) * rOut,
          z: z + 0.002,
          c: COLOR_MAGIC_TEAL,
          a: aOut,
        },
      );
    }
  }

  return mesh.toCommand('lobby-vortex-swirl', 6, {
    depth: 'read',
    blend: 'normal',
    shaderId: 'scene-effects',
    uniforms: { u_animParams: [9.0, 0.25, ARENA_CENTER_X, ARENA_CENTER_Y] },
  });
}
