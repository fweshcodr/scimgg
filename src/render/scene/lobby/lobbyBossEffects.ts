import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { packHsl } from '../../../rs/util/ColorUtil';
import { COLOR_MAGIC_TEAL, COLOR_MAGIC_VIOLET } from './lobbyColorUtils';
import type { EmbeddedMeshCommand } from './lobbyConstants';
import { getLobbyBossCenter, IDENTITY_MATRIX, isLobbyBossAvailable } from './lobbyConstants';
import { makeIndices } from './lobbyMeshBuilder';

export function buildBossGroundEffects(baseZ: number): {
  active: EmbeddedMeshCommand[];
  inactive: EmbeddedMeshCommand[];
} {
  const activeCommands: EmbeddedMeshCommand[] = [];
  const inactiveCommands: EmbeddedMeshCommand[] = [];
  const scale = 0.55;

  for (let i = 0; i < LOBBY_BOSS_NPCS.length; i++) {
    const boss = LOBBY_BOSS_NPCS[i];
    const target = isLobbyBossAvailable(boss) ? activeCommands : inactiveCommands;
    const center = getLobbyBossCenter(i);
    const cx = center.x;
    const cy = center.y;

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      let vIdx = 0;

      const addVertex = (x: number, y: number, z: number, c: number, a: number) => {
        pos.push(x, y, z);
        norm.push(0, 0, 1);
        col.push(c);
        alpha.push(a);
      };

      const addQuad = (
        a: { x: number; y: number; z: number; c: number; a: number },
        b: { x: number; y: number; z: number; c: number; a: number },
        c: { x: number; y: number; z: number; c: number; a: number },
        d: { x: number; y: number; z: number; c: number; a: number },
      ) => {
        const vi = vIdx;
        addVertex(a.x, a.y, a.z, a.c, a.a);
        addVertex(b.x, b.y, b.z, b.c, b.a);
        addVertex(c.x, c.y, c.z, c.c, c.a);
        addVertex(d.x, d.y, d.z, d.c, d.a);
        idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        vIdx += 4;
      };

      const z = baseZ + 0.06;
      const coreColor = packHsl(0, 200, 30);
      for (let arm = 0; arm < 8; arm++) {
        const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
        for (let s = 0; s < 16; s++) {
          const rIn = (s / 16) * 0.8 * scale;
          const rOut = ((s + 1) / 16) * 0.8 * scale;
          const t0 = armOffset + (s / 16) * 2.0;
          const t1 = armOffset + ((s + 1) / 16) * 2.0;
          const wIn = 0.3 * (1.0 - (s / 16) * 0.5) + 0.05;
          const wOut = 0.3 * (1.0 - ((s + 1) / 16) * 0.5) + 0.05;
          const aIn = 0.6 * (1.0 - (s / 16) * 0.5);
          const aOut = 0.6 * (1.0 - ((s + 1) / 16) * 0.5);
          addQuad(
            { x: cx + Math.cos(t0 - wIn) * rIn, y: cy + Math.sin(t0 - wIn) * rIn, z, c: coreColor, a: aIn },
            { x: cx + Math.cos(t0 + wIn) * rIn, y: cy + Math.sin(t0 + wIn) * rIn, z, c: coreColor, a: aIn },
            { x: cx + Math.cos(t1 + wOut) * rOut, y: cy + Math.sin(t1 + wOut) * rOut, z, c: coreColor, a: aOut },
            { x: cx + Math.cos(t1 - wOut) * rOut, y: cy + Math.sin(t1 - wOut) * rOut, z, c: coreColor, a: aOut },
          );
        }
      }

      const midColor = COLOR_MAGIC_VIOLET;
      for (let arm = 0; arm < 8; arm++) {
        const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
        for (let s = 0; s < 20; s++) {
          const rIn = (0.8 + (s / 20) * 1.2) * scale;
          const rOut = (0.8 + ((s + 1) / 20) * 1.2) * scale;
          const t0 = armOffset + (s / 20) * 2.5;
          const t1 = armOffset + ((s + 1) / 20) * 2.5;
          const wIn = 0.2 * (1.0 - s / 20) + 0.05;
          const wOut = 0.2 * (1.0 - (s + 1) / 20) + 0.05;
          const aIn = 0.4 * (1.0 - s / 20);
          const aOut = 0.4 * (1.0 - (s + 1) / 20);
          addQuad(
            { x: cx + Math.cos(t0 - wIn) * rIn, y: cy + Math.sin(t0 - wIn) * rIn, z: z + 0.001, c: midColor, a: aIn },
            { x: cx + Math.cos(t0 + wIn) * rIn, y: cy + Math.sin(t0 + wIn) * rIn, z: z + 0.001, c: midColor, a: aIn },
            {
              x: cx + Math.cos(t1 + wOut) * rOut,
              y: cy + Math.sin(t1 + wOut) * rOut,
              z: z + 0.001,
              c: midColor,
              a: aOut,
            },
            {
              x: cx + Math.cos(t1 - wOut) * rOut,
              y: cy + Math.sin(t1 - wOut) * rOut,
              z: z + 0.001,
              c: midColor,
              a: aOut,
            },
          );
        }
      }

      const outerColor = COLOR_MAGIC_TEAL;
      for (let arm = 0; arm < 8; arm++) {
        const armOffset = (arm / 8) * Math.PI * 2 + Math.PI / 4;
        for (let s = 0; s < 16; s++) {
          const rIn = (2.0 + (s / 16) * 1.0) * scale;
          const rOut = (2.0 + ((s + 1) / 16) * 1.0) * scale;
          const t0 = armOffset + (s / 16) * 3.0;
          const t1 = armOffset + ((s + 1) / 16) * 3.0;
          const wIn = 0.15 * (1.0 - s / 16) + 0.02;
          const wOut = 0.15 * (1.0 - (s + 1) / 16) + 0.02;
          const aIn = 0.2 * (1.0 - s / 16);
          const aOut = 0.2 * (1.0 - (s + 1) / 16);
          addQuad(
            { x: cx + Math.cos(t0 - wIn) * rIn, y: cy + Math.sin(t0 - wIn) * rIn, z: z + 0.002, c: outerColor, a: aIn },
            { x: cx + Math.cos(t0 + wIn) * rIn, y: cy + Math.sin(t0 + wIn) * rIn, z: z + 0.002, c: outerColor, a: aIn },
            {
              x: cx + Math.cos(t1 + wOut) * rOut,
              y: cy + Math.sin(t1 + wOut) * rOut,
              z: z + 0.002,
              c: outerColor,
              a: aOut,
            },
            {
              x: cx + Math.cos(t1 - wOut) * rOut,
              y: cy + Math.sin(t1 - wOut) * rOut,
              z: z + 0.002,
              c: outerColor,
              a: aOut,
            },
          );
        }
      }

      target.push({
        kind: 'mesh3d',
        meshId: `lobby-boss-vortex-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 6,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [9.0, 0.25, cx, cy] },
      });
    }

    {
      const segments = 24;
      const rings = 5;
      const radius = 2.5 * scale;
      const z = baseZ + 0.06;
      const color = packHsl(0, 192, 60);
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      let vIdx = 0;

      const addVertex = (x: number, y: number, a: number) => {
        pos.push(x, y, z);
        norm.push(0, 0, 1);
        col.push(color);
        alpha.push(a);
      };

      const firstRing = radius / rings;
      const centerAlpha = 0.08;
      for (let s = 0; s < segments; s++) {
        const t0 = (s / segments) * Math.PI * 2;
        const t1 = ((s + 1) / segments) * Math.PI * 2;
        const o0x = cx + Math.cos(t0) * firstRing;
        const o0y = cy + Math.sin(t0) * firstRing;
        const o1x = cx + Math.cos(t1) * firstRing;
        const o1y = cy + Math.sin(t1) * firstRing;
        const vi = vIdx;
        addVertex(cx, cy, centerAlpha);
        addVertex(o0x, o0y, centerAlpha * (1 - firstRing / radius));
        addVertex(o1x, o1y, centerAlpha * (1 - firstRing / radius));
        idx.push(vi, vi + 1, vi + 2);
        vIdx += 3;
      }

      for (let r = 1; r < rings; r++) {
        const rIn = (r / rings) * radius;
        const rOut = ((r + 1) / rings) * radius;
        const aIn = centerAlpha * (1 - rIn / radius);
        const aOut = centerAlpha * (1 - rOut / radius);
        for (let s = 0; s < segments; s++) {
          const t0 = (s / segments) * Math.PI * 2;
          const t1 = ((s + 1) / segments) * Math.PI * 2;
          const i0x = cx + Math.cos(t0) * rIn;
          const i0y = cy + Math.sin(t0) * rIn;
          const i1x = cx + Math.cos(t1) * rIn;
          const i1y = cy + Math.sin(t1) * rIn;
          const o0x = cx + Math.cos(t0) * rOut;
          const o0y = cy + Math.sin(t0) * rOut;
          const o1x = cx + Math.cos(t1) * rOut;
          const o1y = cy + Math.sin(t1) * rOut;
          const vi = vIdx;
          addVertex(i0x, i0y, aIn);
          addVertex(i1x, i1y, aIn);
          addVertex(o1x, o1y, aOut);
          addVertex(o0x, o0y, aOut);
          idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          vIdx += 4;
        }
      }

      target.push({
        kind: 'mesh3d',
        meshId: `lobby-boss-pool-glow-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [2.0, 0.003, 0.3, 0.0] },
      });
    }
  }

  return { active: activeCommands, inactive: inactiveCommands };
}

export function buildGodRays(baseZ: number): EmbeddedMeshCommand[] {
  const commands: EmbeddedMeshCommand[] = [];
  let seed = 0x12345678;

  const nextRand = () => {
    seed = seed ^ 61 ^ (seed >>> 16);
    seed = seed + (seed << 3);
    seed = seed ^ (seed >>> 4);
    seed = Math.imul(seed, 0x27d4eb2d);
    seed = seed ^ (seed >>> 15);
    return (seed >>> 0) / 4294967296;
  };

  const addDiamond = (
    px: number,
    py: number,
    pz: number,
    size: number,
    color: number,
    alpha: number,
    pos: number[],
    norm: number[],
    col: number[],
    alphaValues: number[],
    idx: number[],
    vIdxRef: { v: number },
  ) => {
    const adjustedSize = size * 0.75;
    const sizeZ = adjustedSize * 1.3;
    pos.push(px + adjustedSize, py, pz);
    norm.push(1, 0, 0);
    col.push(color);
    alphaValues.push(alpha);
    pos.push(px - adjustedSize, py, pz);
    norm.push(-1, 0, 0);
    col.push(color);
    alphaValues.push(alpha);
    pos.push(px, py + adjustedSize, pz);
    norm.push(0, 1, 0);
    col.push(color);
    alphaValues.push(alpha);
    pos.push(px, py - adjustedSize, pz);
    norm.push(0, -1, 0);
    col.push(color);
    alphaValues.push(alpha);
    pos.push(px, py, pz + sizeZ);
    norm.push(0, 0, 1);
    col.push(color);
    alphaValues.push(alpha);
    pos.push(px, py, pz - sizeZ);
    norm.push(0, 0, -1);
    col.push(color);
    alphaValues.push(alpha);

    const v = vIdxRef.v;
    idx.push(
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
    vIdxRef.v += 6;
  };

  for (let i = 0; i < LOBBY_BOSS_NPCS.length; i++) {
    const boss = LOBBY_BOSS_NPCS[i];
    if (!isLobbyBossAvailable(boss)) continue;

    const center = getLobbyBossCenter(i);
    const warmPalette = [
      packHsl(0, 224, 100),
      packHsl(0, 192, 75),
      packHsl(4, 200, 115),
      packHsl(0, 160, 55),
      packHsl(0, 224, 135),
    ];
    const grayPalette = [packHsl(0, 0, 50), packHsl(0, 0, 40), packHsl(0, 0, 58), packHsl(0, 0, 34), packHsl(0, 0, 62)];
    const palette = isLobbyBossAvailable(boss) ? warmPalette : grayPalette;
    const pickColor = () => palette[Math.floor(nextRand() * palette.length)];

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      const vIdxRef = { v: 0 };
      const armCount = 3;
      const particlesPerArm = 60;
      const turns = 3.5;
      const zStart = baseZ + 1.0;
      const totalHeight = 10.0;

      for (let arm = 0; arm < armCount; arm++) {
        const armOffset = (arm / armCount) * Math.PI * 2;
        for (let p = 0; p < particlesPerArm; p++) {
          const t = p / (particlesPerArm - 1);
          const angle = armOffset + t * turns * Math.PI * 2;
          const radius = 0.6 + t ** 1.5 * 2.6;
          const x = center.x + Math.cos(angle) * radius + (nextRand() - 0.5) * 0.3;
          const y = center.y + Math.sin(angle) * radius + (nextRand() - 0.5) * 0.3;
          const z = zStart + t * totalHeight + (nextRand() - 0.5) * 0.6;
          const size = 0.01 + nextRand() ** 2.0 * 0.13;
          addDiamond(x, y, z, size, pickColor(), 0.8, pos, norm, col, alpha, idx, vIdxRef);
        }
      }

      commands.push({
        kind: 'mesh3d',
        meshId: `lobby-god-rays-core-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.12, center.x, center.y] },
      });
    }

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      const vIdxRef = { v: 0 };
      const atmoPalette = isLobbyBossAvailable(boss)
        ? [packHsl(0, 160, 50), packHsl(0, 128, 40), packHsl(0, 192, 60), packHsl(0, 140, 35)]
        : [packHsl(0, 0, 30), packHsl(0, 0, 25), packHsl(0, 0, 35), packHsl(0, 0, 22)];

      for (let p = 0; p < 45; p++) {
        const theta = nextRand() * Math.PI * 2;
        const radius = 1.8 + Math.sqrt(nextRand()) * 1.8;
        const z = baseZ + 2.0 + nextRand() * 6.0;
        const size = 0.02 + nextRand() ** 2.5 * 0.16;
        const color = atmoPalette[Math.floor(nextRand() * atmoPalette.length)];
        addDiamond(
          center.x + Math.cos(theta) * radius,
          center.y + Math.sin(theta) * radius,
          z,
          size,
          color,
          0.8,
          pos,
          norm,
          col,
          alpha,
          idx,
          vIdxRef,
        );
      }

      commands.push({
        kind: 'mesh3d',
        meshId: `lobby-god-rays-helix-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.09, center.x, center.y] },
      });
    }

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      const vIdxRef = { v: 0 };

      for (let p = 0; p < 30; p++) {
        const theta = nextRand() * Math.PI * 2;
        const radius = 2.5 + Math.sqrt(nextRand()) * 1.3;
        const z = baseZ + 5.0 + nextRand() * 7.0;
        const size = 0.04 + nextRand() ** 1.5 * 0.1;
        addDiamond(
          center.x + Math.cos(theta) * radius,
          center.y + Math.sin(theta) * radius,
          z,
          size,
          pickColor(),
          0.8,
          pos,
          norm,
          col,
          alpha,
          idx,
          vIdxRef,
        );
      }

      commands.push({
        kind: 'mesh3d',
        meshId: `lobby-god-rays-motes-inner-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.04, center.x, center.y] },
      });
    }

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      const vIdxRef = { v: 0 };
      const sparkPalette = isLobbyBossAvailable(boss)
        ? [packHsl(0, 224, 150), packHsl(4, 224, 140), packHsl(0, 200, 160)]
        : [packHsl(0, 0, 75), packHsl(0, 0, 65), packHsl(0, 0, 80)];

      for (let p = 0; p < 35; p++) {
        const theta = nextRand() * Math.PI * 2;
        const radius = 1.6 + nextRand() * 2.0;
        const z = baseZ + 0.5 + nextRand() * 5.0;
        const size = 0.01 + nextRand() * 0.02;
        const color = sparkPalette[Math.floor(nextRand() * sparkPalette.length)];
        addDiamond(
          center.x + Math.cos(theta) * radius,
          center.y + Math.sin(theta) * radius,
          z,
          size,
          color,
          0.8,
          pos,
          norm,
          col,
          alpha,
          idx,
          vIdxRef,
        );
      }

      commands.push({
        kind: 'mesh3d',
        meshId: `lobby-god-rays-motes-outer-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.17, center.x, center.y] },
      });
    }

    {
      const pos: number[] = [];
      const norm: number[] = [];
      const col: number[] = [];
      const alpha: number[] = [];
      const idx: number[] = [];
      const vIdxRef = { v: 0 };

      for (let p = 0; p < 20; p++) {
        const theta = nextRand() * Math.PI * 2;
        const radius = 2.0 + nextRand() * 1.8;
        const z = baseZ + 0.3 + nextRand() * 2.0;
        const size = 0.02 + nextRand() ** 2.0 * 0.07;
        addDiamond(
          center.x + Math.cos(theta) * radius,
          center.y + Math.sin(theta) * radius,
          z,
          size,
          pickColor(),
          0.8,
          pos,
          norm,
          col,
          alpha,
          idx,
          vIdxRef,
        );
      }

      commands.push({
        kind: 'mesh3d',
        meshId: `lobby-god-rays-motes-embers-${i}`,
        materialId: 'osrs-terrain',
        modelMatrix: IDENTITY_MATRIX,
        depth: 'read',
        blend: 'normal',
        cullFace: 'none',
        zIndex: 8,
        positions: new Float32Array(pos),
        normals: new Float32Array(norm),
        perVertexHslColors: new Float32Array(col),
        perVertexAlphas: new Float32Array(alpha),
        indices: makeIndices(idx),
        shaderId: 'scene-effects',
        uniforms: { u_animParams: [1.0, 0.015, center.x, center.y] },
      });
    }
  }

  return commands;
}

export function buildPedestalAuras(baseZ: number): EmbeddedMeshCommand[] {
  const commands: EmbeddedMeshCommand[] = [];

  for (let i = 0; i < LOBBY_BOSS_NPCS.length; i++) {
    const boss = LOBBY_BOSS_NPCS[i];
    const isAvailable = isLobbyBossAvailable(boss);
    const center = getLobbyBossCenter(i);
    const pos: number[] = [];
    const norm: number[] = [];
    const col: number[] = [];
    const alpha: number[] = [];
    const idx: number[] = [];
    let vIdx = 0;

    const addVertex = (x: number, y: number, z: number, color: number, alphaValue: number) => {
      pos.push(x, y, z);
      norm.push(0, 0, 1);
      col.push(color);
      alpha.push(alphaValue);
    };

    const addQuad = (
      a: { x: number; y: number; z: number; c: number; a: number },
      b: { x: number; y: number; z: number; c: number; a: number },
      c: { x: number; y: number; z: number; c: number; a: number },
      d: { x: number; y: number; z: number; c: number; a: number },
    ) => {
      const k = vIdx;
      addVertex(a.x, a.y, a.z, a.c, a.a);
      addVertex(b.x, b.y, b.z, b.c, b.a);
      addVertex(c.x, c.y, c.z, c.c, c.a);
      addVertex(d.x, d.y, d.z, d.c, d.a);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      vIdx += 4;
    };

    const z = baseZ + 0.025;
    const color = isAvailable ? COLOR_MAGIC_TEAL : packHsl(0, 0, 50);
    const baseAlpha = isAvailable ? 0.12 : 0.06;

    for (let s = 0; s < 32; s++) {
      const t0 = (s / 32) * Math.PI * 2;
      const t1 = ((s + 1) / 32) * Math.PI * 2;
      const i0x = center.x + Math.cos(t0) * 2.4;
      const i0y = center.y + Math.sin(t0) * 2.4;
      const i1x = center.x + Math.cos(t1) * 2.4;
      const i1y = center.y + Math.sin(t1) * 2.4;
      const o0x = center.x + Math.cos(t0) * 2.6;
      const o0y = center.y + Math.sin(t0) * 2.6;
      const o1x = center.x + Math.cos(t1) * 2.6;
      const o1y = center.y + Math.sin(t1) * 2.6;

      addQuad(
        { x: i0x, y: i0y, z, c: color, a: 0.0 },
        { x: i1x, y: i1y, z, c: color, a: 0.0 },
        { x: o1x, y: o1y, z, c: color, a: baseAlpha },
        { x: o0x, y: o0y, z, c: color, a: baseAlpha },
      );
    }

    commands.push({
      kind: 'mesh3d',
      meshId: `lobby-pedestal-aura-${i}`,
      materialId: 'osrs-terrain',
      modelMatrix: IDENTITY_MATRIX,
      depth: 'read',
      blend: 'normal',
      cullFace: 'none',
      zIndex: 7,
      positions: new Float32Array(pos),
      normals: new Float32Array(norm),
      perVertexHslColors: new Float32Array(col),
      perVertexAlphas: new Float32Array(alpha),
      indices: makeIndices(idx),
      shaderId: 'scene-effects',
      uniforms: { u_animParams: [2.0, 0.12, 0.25, i * 0.5] },
    });
  }

  return commands;
}

export function buildBossSpotlights(baseZ: number): EmbeddedMeshCommand[] {
  const commands: EmbeddedMeshCommand[] = [];

  for (let i = 0; i < LOBBY_BOSS_NPCS.length; i++) {
    const boss = LOBBY_BOSS_NPCS[i];
    if (!isLobbyBossAvailable(boss)) continue;

    const center = getLobbyBossCenter(i);
    const pos: number[] = [];
    const norm: number[] = [];
    const col: number[] = [];
    const alpha: number[] = [];
    const idx: number[] = [];
    let vIdx = 0;

    const addVertex = (x: number, y: number, z: number, color: number, alphaValue: number) => {
      pos.push(x, y, z);
      norm.push(0, 0, 1);
      col.push(color);
      alpha.push(alphaValue);
    };

    const addQuad = (
      a: { x: number; y: number; z: number; c: number; a: number },
      b: { x: number; y: number; z: number; c: number; a: number },
      c: { x: number; y: number; z: number; c: number; a: number },
      d: { x: number; y: number; z: number; c: number; a: number },
    ) => {
      const k = vIdx;
      addVertex(a.x, a.y, a.z, a.c, a.a);
      addVertex(b.x, b.y, b.z, b.c, b.a);
      addVertex(c.x, c.y, c.z, c.c, c.a);
      addVertex(d.x, d.y, d.z, d.c, d.a);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      vIdx += 4;
    };

    const addDisc = (
      radius: number,
      segments: number,
      z: number,
      centerColor: number,
      centerAlpha: number,
      edgeColor: number,
      edgeAlpha: number,
    ) => {
      const centerIdx = vIdx;
      addVertex(center.x, center.y, z, centerColor, centerAlpha);
      vIdx++;
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        addVertex(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius, z, edgeColor, edgeAlpha);
        vIdx++;
      }
      for (let s = 0; s < segments; s++) {
        const next = (s + 1) % segments;
        idx.push(centerIdx, centerIdx + 1 + s, centerIdx + 1 + next);
      }
    };

    const addRing = (
      innerRadius: number,
      outerRadius: number,
      segments: number,
      z: number,
      innerColor: number,
      innerAlpha: number,
      outerColor: number,
      outerAlpha: number,
      angleOffset = 0.0,
    ) => {
      for (let s = 0; s < segments; s++) {
        const t0 = (s / segments) * Math.PI * 2 + angleOffset;
        const t1 = ((s + 1) / segments) * Math.PI * 2 + angleOffset;
        addQuad(
          {
            x: center.x + Math.cos(t0) * innerRadius,
            y: center.y + Math.sin(t0) * innerRadius,
            z,
            c: innerColor,
            a: innerAlpha,
          },
          {
            x: center.x + Math.cos(t1) * innerRadius,
            y: center.y + Math.sin(t1) * innerRadius,
            z,
            c: innerColor,
            a: innerAlpha,
          },
          {
            x: center.x + Math.cos(t1) * outerRadius,
            y: center.y + Math.sin(t1) * outerRadius,
            z,
            c: outerColor,
            a: outerAlpha,
          },
          {
            x: center.x + Math.cos(t0) * outerRadius,
            y: center.y + Math.sin(t0) * outerRadius,
            z,
            c: outerColor,
            a: outerAlpha,
          },
        );
      }
    };

    const addShell = (
      segments: number,
      bottomRadius: number,
      topRadius: number,
      bottomZ: number,
      topZ: number,
      bottomColor: number,
      topColor: number,
      bottomAlpha: number,
      midAlpha: number,
      topAlpha: number,
      angleOffset = 0.0,
      radiusNoise = 0.0,
      twist = 0.0,
      bulge = 0.0,
    ) => {
      const midZ = bottomZ + (topZ - bottomZ) * 0.56;
      const midRadius = (bottomRadius + topRadius) * 0.5 + bulge;
      for (let s = 0; s < segments; s++) {
        const t0 = (s / segments) * Math.PI * 2 + angleOffset;
        const t1 = ((s + 1) / segments) * Math.PI * 2 + angleOffset;
        const wave0 = 1.0 + Math.sin(t0 * 3.0 + i * 0.73) * radiusNoise;
        const wave1 = 1.0 + Math.sin(t1 * 3.0 + i * 0.73) * radiusNoise;
        const wave0Mid = 1.0 + Math.sin(t0 * 3.0 + i * 0.73 + 0.8) * (radiusNoise * 0.75);
        const wave1Mid = 1.0 + Math.sin(t1 * 3.0 + i * 0.73 + 0.8) * (radiusNoise * 0.75);
        const b0 = bottomRadius * wave0;
        const b1 = bottomRadius * wave1;
        const m0 = midRadius * wave0Mid;
        const m1 = midRadius * wave1Mid;
        const t0r = topRadius * (1.0 + Math.sin(t0 * 2.0 + i * 0.41) * (radiusNoise * 0.4));
        const t1r = topRadius * (1.0 + Math.sin(t1 * 2.0 + i * 0.41) * (radiusNoise * 0.4));

        addQuad(
          {
            x: center.x + Math.cos(t0 + twist * 0.5) * t0r,
            y: center.y + Math.sin(t0 + twist * 0.5) * t0r,
            z: topZ,
            c: topColor,
            a: topAlpha,
          },
          {
            x: center.x + Math.cos(t1 + twist * 0.5) * t1r,
            y: center.y + Math.sin(t1 + twist * 0.5) * t1r,
            z: topZ,
            c: topColor,
            a: topAlpha,
          },
          {
            x: center.x + Math.cos(t1 + twist * 0.2) * m1,
            y: center.y + Math.sin(t1 + twist * 0.2) * m1,
            z: midZ,
            c: topColor,
            a: midAlpha,
          },
          {
            x: center.x + Math.cos(t0 + twist * 0.2) * m0,
            y: center.y + Math.sin(t0 + twist * 0.2) * m0,
            z: midZ,
            c: topColor,
            a: midAlpha,
          },
        );

        addQuad(
          {
            x: center.x + Math.cos(t0 + twist * 0.2) * m0,
            y: center.y + Math.sin(t0 + twist * 0.2) * m0,
            z: midZ,
            c: topColor,
            a: midAlpha,
          },
          {
            x: center.x + Math.cos(t1 + twist * 0.2) * m1,
            y: center.y + Math.sin(t1 + twist * 0.2) * m1,
            z: midZ,
            c: topColor,
            a: midAlpha,
          },
          {
            x: center.x + Math.cos(t1 - twist * 0.35) * b1,
            y: center.y + Math.sin(t1 - twist * 0.35) * b1,
            z: bottomZ,
            c: bottomColor,
            a: bottomAlpha,
          },
          {
            x: center.x + Math.cos(t0 - twist * 0.35) * b0,
            y: center.y + Math.sin(t0 - twist * 0.35) * b0,
            z: bottomZ,
            c: bottomColor,
            a: bottomAlpha,
          },
        );
      }
    };

    const colHeart = packHsl(5, 180, 165);
    const colHelix = packHsl(8, 160, 130);
    const colCore = packHsl(2, 224, 120);
    const colCrimson = packHsl(0, 224, 95);
    const colBlood = packHsl(0, 205, 68);
    const colWine = packHsl(0, 158, 40);
    const colGroundHot = packHsl(4, 200, 110);
    const colGroundOuter = packHsl(0, 160, 55);
    const baseZOff = baseZ + 0.12;
    const floorZ = baseZ + 0.015;
    const helixBaseZ = baseZ + 1.15;
    const helixTopZ = baseZ + 10.8;
    const topZ = baseZ + 15.5;
    const canopyZ = baseZ + 18.0;

    addShell(16, 0.26, 0.1, baseZOff, canopyZ, colCore, colHeart, 0.8, 0.5, 0.0, Math.PI / 16, 0.08, 0.22, 0.02);
    addShell(18, 0.78, 0.34, baseZOff, topZ, colCrimson, colCore, 0.55, 0.25, 0.0, 0.0, 0.1, -0.16, 0.1);
    addShell(
      20,
      1.38,
      1.0,
      helixBaseZ,
      helixTopZ,
      colCrimson,
      colHelix,
      0.38,
      0.28,
      0.0,
      Math.PI / 20,
      0.12,
      0.3,
      0.26,
    );
    addShell(
      20,
      1.72,
      1.26,
      helixBaseZ + 0.65,
      helixTopZ + 1.8,
      colHelix,
      colCore,
      0.28,
      0.18,
      0.0,
      Math.PI / 10,
      0.1,
      -0.28,
      0.18,
    );
    addShell(28, 3.55, 1.58, baseZOff, topZ + 1.8, colWine, colBlood, 0.18, 0.08, 0.0, 0.0, 0.08, 0.18, 0.16);
    addShell(
      24,
      2.8,
      2.1,
      baseZ + 2.2,
      canopyZ,
      colBlood,
      colCrimson,
      0.1,
      0.06,
      0.0,
      Math.PI / 24,
      0.06,
      -0.12,
      -0.08,
    );

    for (let ribbon = 0; ribbon < 6; ribbon++) {
      const angle = (ribbon / 6) * Math.PI * 2 + i * 0.19;
      const spread = 0.3 + (ribbon % 2) * 0.08;
      const innerR = 0.55 + (ribbon % 3) * 0.12;
      const outerR = 2.1 + (ribbon % 2) * 0.28;
      addQuad(
        {
          x: center.x + Math.cos(angle + spread) * innerR,
          y: center.y + Math.sin(angle + spread) * innerR,
          z: canopyZ,
          c: colHeart,
          a: 0.0,
        },
        {
          x: center.x + Math.cos(angle - spread) * innerR,
          y: center.y + Math.sin(angle - spread) * innerR,
          z: canopyZ,
          c: colHeart,
          a: 0.0,
        },
        {
          x: center.x + Math.cos(angle - spread * 1.35) * outerR,
          y: center.y + Math.sin(angle - spread * 1.35) * outerR,
          z: baseZOff,
          c: colCrimson,
          a: 0.22,
        },
        {
          x: center.x + Math.cos(angle + spread * 1.35) * outerR,
          y: center.y + Math.sin(angle + spread * 1.35) * outerR,
          z: baseZOff,
          c: colCrimson,
          a: 0.22,
        },
      );
    }

    addDisc(1.15, 24, floorZ, colGroundHot, 0.65, colCore, 0.12);
    addRing(1.05, 2.35, 28, floorZ, colHelix, 0.2, colGroundHot, 0.0, Math.PI / 28);
    addRing(1.55, 3.25, 32, floorZ, colCrimson, 0.14, colGroundOuter, 0.0, 0.0);
    addDisc(4.1, 36, floorZ, colGroundOuter, 0.08, colWine, 0.0);

    commands.push({
      kind: 'mesh3d',
      meshId: `lobby-boss-spotlight-${i}`,
      materialId: 'osrs-terrain',
      modelMatrix: IDENTITY_MATRIX,
      depth: 'read',
      blend: 'normal',
      cullFace: 'none',
      zIndex: 7,
      positions: new Float32Array(pos),
      normals: new Float32Array(norm),
      perVertexHslColors: new Float32Array(col),
      perVertexAlphas: new Float32Array(alpha),
      indices: makeIndices(idx),
      shaderId: 'scene-effects',
      uniforms: { u_animParams: [2.0, 0.115, 0.15, i * 1.7] },
    });
  }

  return commands;
}
