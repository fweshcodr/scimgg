import { mulberry32 } from '../../../core/rng';
import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { packHsl } from '../../../rs/util/ColorUtil';
import {
  COLOR_ACCENT_DARK,
  COLOR_BASE_STONE,
  COLOR_DROP_DARK,
  COLOR_GROUT,
  darken,
  jitterLuminance,
} from './lobbyColorUtils';
import type { EmbeddedMeshCommand } from './lobbyConstants';
import { faceLuminanceShift, getLobbyBossCenter, IDENTITY_MATRIX, isLobbyBossAvailable } from './lobbyConstants';
import { makeIndices } from './lobbyMeshBuilder';

export function buildBraziers(baseZ: number): { opaque: EmbeddedMeshCommand; flames: EmbeddedMeshCommand } {
  const pos: number[] = [];
  const norm: number[] = [];
  const col: number[] = [];
  const alpha: number[] = [];
  const idx: number[] = [];
  let vIdx = 0;

  const flamePos: number[] = [];
  const flameNorm: number[] = [];
  const flameCol: number[] = [];
  const flameAlpha: number[] = [];
  const flameIdx: number[] = [];
  let flameV = 0;

  const brazierPositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < LOBBY_BOSS_NPCS.length; i++) {
    const boss = LOBBY_BOSS_NPCS[i];
    if (!isLobbyBossAvailable(boss)) continue;
    const center = getLobbyBossCenter(i);
    const theta = (boss.facingAngle / 2048) * Math.PI * 2;
    brazierPositions.push(
      { x: center.x - Math.cos(theta) * 2.5, y: center.y + Math.sin(theta) * 2.5 },
      { x: center.x + Math.cos(theta) * 2.5, y: center.y - Math.sin(theta) * 2.5 },
    );
  }

  const addQuad = (
    p1: number[],
    p2: number[],
    p3: number[],
    p4: number[],
    n1: number[],
    n2: number[],
    n3: number[],
    n4: number[],
    color: number,
    alphaValue: number,
  ) => {
    const i = vIdx;
    pos.push(...p1, ...p2, ...p3, ...p4);
    norm.push(...n1, ...n2, ...n3, ...n4);
    col.push(color, color, color, color);
    alpha.push(alphaValue, alphaValue, alphaValue, alphaValue);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    vIdx += 4;
  };

  const addTri = (
    p1: number[],
    p2: number[],
    p3: number[],
    n1: number[],
    n2: number[],
    n3: number[],
    color: number,
    alphaValue: number,
  ) => {
    const i = vIdx;
    pos.push(...p1, ...p2, ...p3);
    norm.push(...n1, ...n2, ...n3);
    col.push(color, color, color);
    alpha.push(alphaValue, alphaValue, alphaValue);
    idx.push(i, i + 1, i + 2);
    vIdx += 3;
  };

  for (const brazier of brazierPositions) {
    const profile = [
      { r: 0.35, z: 0.0, color: COLOR_DROP_DARK },
      { r: 0.3, z: 0.05, color: COLOR_DROP_DARK },
      { r: 0.22, z: 0.1, color: COLOR_DROP_DARK },
      { r: 0.18, z: 0.15, color: COLOR_DROP_DARK },
      { r: 0.15, z: 0.4, color: COLOR_DROP_DARK },
      { r: 0.4, z: 0.55, color: COLOR_DROP_DARK },
      { r: 0.48, z: 0.6, color: COLOR_ACCENT_DARK },
      { r: 0.5, z: 0.65, color: COLOR_DROP_DARK },
      { r: 0.52, z: 0.7, color: COLOR_GROUT },
    ];

    const colorTop = COLOR_DROP_DARK;
    const colorInner = packHsl(0, 50, 6);

    for (let p = 0; p < profile.length - 1; p++) {
      const r1 = profile[p].r;
      const z1 = baseZ + profile[p].z;
      const r2 = profile[p + 1].r;
      const z2 = baseZ + profile[p + 1].z;
      const ringColor = profile[p].color ?? darken(COLOR_BASE_STONE, 5);

      for (let s = 0; s < 16; s++) {
        const t1 = (s / 16) * Math.PI * 2;
        const t2 = ((s + 1) / 16) * Math.PI * 2;
        const c1 = Math.cos(t1);
        const s1 = Math.sin(t1);
        const c2 = Math.cos(t2);
        const s2 = Math.sin(t2);

        const p1 = [brazier.x + c1 * r1, brazier.y + s1 * r1, z1];
        const p2 = [brazier.x + c2 * r1, brazier.y + s2 * r1, z1];
        const p3 = [brazier.x + c2 * r2, brazier.y + s2 * r2, z2];
        const p4 = [brazier.x + c1 * r2, brazier.y + s1 * r2, z2];

        const dz = z2 - z1;
        const dr = r1 - r2;
        const len = Math.sqrt(dz * dz + dr * dr) || 1;
        const nz = dr / len;
        const nr = dz / len;
        const n1 = [c1 * nr, s1 * nr, nz];
        const n2 = [c2 * nr, s2 * nr, nz];
        const tMid = (t1 + t2) / 2;
        const sideColor = jitterLuminance(ringColor, faceLuminanceShift(Math.cos(tMid) * nr, Math.sin(tMid) * nr, nz));
        addQuad(p1, p2, p3, p4, n1, n2, n2, n1, sideColor, 0.35);
      }
    }

    const rOuter = profile[profile.length - 1].r;
    const zTop = baseZ + profile[profile.length - 1].z;
    const rInner = 0.38;
    const zInner = zTop - 0.25;

    for (let s = 0; s < 16; s++) {
      const t1 = (s / 16) * Math.PI * 2;
      const t2 = ((s + 1) / 16) * Math.PI * 2;
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      const c2 = Math.cos(t2);
      const s2 = Math.sin(t2);

      const p1o = [brazier.x + c1 * rOuter, brazier.y + s1 * rOuter, zTop];
      const p2o = [brazier.x + c2 * rOuter, brazier.y + s2 * rOuter, zTop];
      const p3i = [brazier.x + c2 * rInner, brazier.y + s2 * rInner, zTop];
      const p4i = [brazier.x + c1 * rInner, brazier.y + s1 * rInner, zTop];
      const nUp = [0, 0, 1];
      addQuad(p1o, p2o, p3i, p4i, nUp, nUp, nUp, nUp, jitterLuminance(colorTop, faceLuminanceShift(0, 0, 1)), 0.4);

      const p5i = [brazier.x + c2 * 0.1, brazier.y + s2 * 0.1, zInner];
      const p6i = [brazier.x + c1 * 0.1, brazier.y + s1 * 0.1, zInner];
      const dz = zInner - zTop;
      const dr = rInner - 0.1;
      const len = Math.sqrt(dz * dz + dr * dr) || 1;
      const nz = dr / len;
      const nr = -dz / len;
      const n1i = [-c1 * nr, -s1 * nr, nz];
      const n2i = [-c2 * nr, -s2 * nr, nz];
      const tMid = (t1 + t2) / 2;
      addQuad(
        p4i,
        p3i,
        p5i,
        p6i,
        n1i,
        n2i,
        n2i,
        n1i,
        jitterLuminance(
          colorInner,
          faceLuminanceShift(-Math.cos(tMid) * nr, -Math.sin(tMid) * nr, nz) + ((zInner * 10) % 2),
        ),
        0.45,
      );
      addTri(
        p6i,
        p5i,
        [brazier.x, brazier.y, zInner],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
        jitterLuminance(colorInner, faceLuminanceShift(0, 0, 1) + 2),
        0.5,
      );
    }
  }

  const flameRand = mulberry32(0xbbbbbbbb);

  const addFlameVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    color: number,
    alphaValue: number,
  ): number => {
    const i = flameV;
    flamePos.push(x, y, z);
    flameNorm.push(nx, ny, nz);
    flameCol.push(color);
    flameAlpha.push(alphaValue);
    flameV += 1;
    return i;
  };

  const fireStops = [
    { h: 250, s: 170, l: 140, a: 1.0 },
    { h: 254, s: 255, l: 82, a: 0.96 },
    { h: 1, s: 220, l: 24, a: 0.84 },
    { h: 252, s: 60, l: 10, a: 0.52 },
    { h: 252, s: 18, l: 6, a: 0.18 },
  ];

  for (const brazier of brazierPositions) {
    const flameBaseZ = baseZ + 0.71;
    const brazierLShift = Math.floor((flameRand() - 0.5) * 20);
    const brazierSShift = Math.floor((flameRand() - 0.5) * 64);
    const glowCenterColor = packHsl(
      252,
      Math.max(0, Math.min(255, 235 + brazierSShift)),
      Math.max(0, Math.min(255, 104 + brazierLShift + Math.floor((flameRand() - 0.5) * 15))),
    );
    const glowCenter = addFlameVertex(
      brazier.x,
      brazier.y,
      flameBaseZ + 0.08,
      0,
      0,
      1,
      glowCenterColor,
      0.9 + (flameRand() - 0.5) * 0.1,
    );
    const glowRim: number[] = [];

    for (let s = 0; s < 14; s++) {
      const t = (s / 14) * Math.PI * 2;
      const radius = 0.38 + flameRand() * 0.05;
      const x = brazier.x + Math.cos(t) * radius;
      const y = brazier.y + Math.sin(t) * radius;
      const z = flameBaseZ + 0.005 + flameRand() * 0.02;
      const rimColor = packHsl(
        254,
        Math.max(0, Math.min(255, 70 + brazierSShift)),
        Math.max(0, Math.min(255, 14 + brazierLShift + Math.floor((flameRand() - 0.5) * 8))),
      );
      glowRim.push(addFlameVertex(x, y, z, 0, 0, 1, rimColor, 0.42 + flameRand() * 0.08));
    }

    for (let s = 0; s < 14; s++) {
      const next = (s + 1) % 14;
      flameIdx.push(glowCenter, glowRim[s], glowRim[next]);
    }

    for (let c = 0; c < 10; c++) {
      const angle = (c / 10) * Math.PI * 2 + flameRand() * 0.3;
      const inner = 0.12 + flameRand() * 0.06;
      const outer = 0.32 + flameRand() * 0.06;
      const zCoal = flameBaseZ + 0.02 + flameRand() * 0.04;
      const c1 = Math.cos(angle);
      const s1 = Math.sin(angle);
      const c2 = Math.cos(angle + 0.5);
      const s2 = Math.sin(angle + 0.5);
      const darkCoal = flameRand() > 0.65;
      const coalColor1 = darkCoal
        ? packHsl(254, 150, 24 + Math.floor(flameRand() * 8))
        : packHsl(1, 255, 78 + Math.floor(flameRand() * 10));
      const coalColor2 = darkCoal
        ? packHsl(254, 150, 18 + Math.floor(flameRand() * 8))
        : packHsl(1, 255, 70 + Math.floor(flameRand() * 10));
      const coalAlpha = (darkCoal ? 0.85 : 0.9) + flameRand() * 0.05;
      const v0 = addFlameVertex(brazier.x + c1 * inner, brazier.y + s1 * inner, zCoal, 0, 0, 1, coalColor1, coalAlpha);
      const v1 = addFlameVertex(
        brazier.x + c2 * outer,
        brazier.y + s2 * outer,
        zCoal,
        0,
        0,
        1,
        coalColor2,
        coalAlpha - 0.1,
      );
      const v2 = addFlameVertex(
        brazier.x + c1 * outer,
        brazier.y + s1 * outer,
        zCoal,
        0,
        0,
        1,
        coalColor2,
        coalAlpha - 0.1,
      );
      const v3 = addFlameVertex(brazier.x + c2 * inner, brazier.y + s2 * inner, zCoal, 0, 0, 1, coalColor1, coalAlpha);
      flameIdx.push(v0, v1, v2);
      flameIdx.push(v0, v3, v1);
    }

    const flameCount = 12 + Math.floor(flameRand() * 4);
    for (let f = 0; f < flameCount; f++) {
      const flameHueShift = Math.floor((flameRand() - 0.5) * 2);
      const radiusOff = flameRand() * 0.3;
      const angleOff = flameRand() * Math.PI * 2;
      const baseX = brazier.x + Math.cos(angleOff) * radiusOff;
      const baseY = brazier.y + Math.sin(angleOff) * radiusOff;
      const baseHalfW = 0.09 + flameRand() * 0.08;
      const tipHalfW = baseHalfW * (0.4 + flameRand() * 0.3);
      const heightRoll = flameRand();
      const height =
        heightRoll < 0.25
          ? 0.25 + flameRand() * 0.15
          : heightRoll < 0.65
            ? 0.45 + flameRand() * 0.15
            : 0.65 + flameRand() * 0.15;
      const leanAngle = (flameRand() - 0.5) * ((25 * Math.PI) / 180);
      const leanDir = flameRand() * Math.PI * 2;
      const leanX = Math.cos(leanDir) * Math.sin(leanAngle);
      const leanY = Math.sin(leanDir) * Math.sin(leanAngle);
      const quadCount = 4 + Math.floor(flameRand() * 2);
      const faceAngle = flameRand() * Math.PI * 2;
      const dirX = Math.cos(faceAngle);
      const dirY = Math.sin(faceAngle);
      const sideX = -dirY;
      const sideY = dirX;
      const leftRow: number[] = [];
      const rightRow: number[] = [];

      for (let q = 0; q <= quadCount; q++) {
        const t = q / quadCount;
        const currentH = height * t;
        const currentW = baseHalfW + (tipHalfW - baseHalfW) * t;
        const pX = baseX + leanX * currentH + dirX * (flameRand() - 0.5) * 0.05 * t;
        const pY = baseY + leanY * currentH + dirY * (flameRand() - 0.5) * 0.05 * t;
        const pZ = flameBaseZ + currentH + (flameRand() - 0.5) * 0.02;
        const stopPos = t * (fireStops.length - 1);
        const stopLo = Math.floor(stopPos);
        const stopHi = Math.min(stopLo + 1, fireStops.length - 1);
        const stopMix = stopPos - stopLo;
        const lo = fireStops[stopLo];
        const hi = fireStops[stopHi];
        let hue = Math.round(lo.h + (hi.h - lo.h) * stopMix) + flameHueShift;
        if (hue < 0) hue += 256;
        if (hue > 255) hue -= 256;
        const sat = Math.max(0, Math.min(255, Math.round(lo.s + (hi.s - lo.s) * stopMix) + brazierSShift));
        const lum = Math.round(lo.l + (hi.l - lo.l) * stopMix) + brazierLShift;
        const alphaValue = (lo.a + (hi.a - lo.a) * stopMix) * (0.95 + flameRand() * 0.15);
        const leftLum = Math.max(0, Math.min(255, lum + Math.floor((flameRand() - 0.5) * 10)));
        const rightLum = Math.max(0, Math.min(255, lum + Math.floor((flameRand() - 0.5) * 10)));
        leftRow.push(
          addFlameVertex(
            pX - sideX * currentW,
            pY - sideY * currentW,
            pZ,
            sideX,
            sideY,
            0.2,
            packHsl(hue, sat, leftLum),
            alphaValue,
          ),
        );
        rightRow.push(
          addFlameVertex(
            pX + sideX * currentW,
            pY + sideY * currentW,
            pZ,
            sideX,
            sideY,
            0.2,
            packHsl(hue, sat, rightLum),
            alphaValue,
          ),
        );
      }

      for (let q = 0; q < quadCount; q++) {
        const l0 = leftRow[q];
        const r0 = rightRow[q];
        const l1 = leftRow[q + 1];
        const r1 = rightRow[q + 1];
        flameIdx.push(l0, r0, r1);
        flameIdx.push(l0, r1, l1);
      }
    }

    for (let t = 0; t < 8; t++) {
      const spin = flameRand() * Math.PI * 2;
      const dirX = Math.cos(spin);
      const dirY = Math.sin(spin);
      const sideX = -dirY;
      const sideY = dirX;
      const baseR = 0.05 + flameRand() * 0.16;
      const baseX = brazier.x + dirX * baseR;
      const baseY = brazier.y + dirY * baseR;
      const baseZ2 = flameBaseZ + 0.12 + flameRand() * 0.18;
      const halfW = 0.06 + flameRand() * 0.05;
      const tipHalfW = halfW * (0.35 + flameRand() * 0.25);
      const tipDrift = 0.05 + flameRand() * 0.1;
      const tipX = baseX + dirX * tipDrift + sideX * (flameRand() - 0.5) * 0.1;
      const tipY = baseY + dirY * tipDrift + sideY * (flameRand() - 0.5) * 0.1;
      const tipZ2 = baseZ2 + 0.18 + flameRand() * 0.25;
      let tongueColor: number;
      let tongueTipColor: number;
      let tongueBaseAlpha: number;
      let tongueTipAlpha: number;
      const roll = flameRand();

      if (roll < 0.5) {
        tongueColor = packHsl(252, 120, 20);
        tongueTipColor = packHsl(252, 70, 10);
        tongueBaseAlpha = 0.45;
        tongueTipAlpha = 0.15;
      } else if (roll < 0.8) {
        tongueColor = packHsl(252, 70, 10);
        tongueTipColor = packHsl(252, 30, 6);
        tongueBaseAlpha = 0.35;
        tongueTipAlpha = 0.1;
      } else {
        tongueColor = packHsl(254, 150, 34);
        tongueTipColor = packHsl(252, 80, 14);
        tongueBaseAlpha = 0.5;
        tongueTipAlpha = 0.12;
      }

      const nx = dirX * 0.2;
      const ny = dirY * 0.2;
      const nz = 0.98;
      const i0 = addFlameVertex(
        baseX - sideX * halfW,
        baseY - sideY * halfW,
        baseZ2,
        nx,
        ny,
        nz,
        tongueColor,
        tongueBaseAlpha + flameRand() * 0.08,
      );
      const i1 = addFlameVertex(
        baseX + sideX * halfW,
        baseY + sideY * halfW,
        baseZ2,
        nx,
        ny,
        nz,
        tongueColor,
        tongueBaseAlpha - 0.04 + flameRand() * 0.08,
      );
      const i2 = addFlameVertex(
        tipX + sideX * tipHalfW,
        tipY + sideY * tipHalfW,
        tipZ2,
        nx,
        ny,
        nz,
        tongueTipColor,
        tongueTipAlpha + flameRand() * 0.04,
      );
      const i3 = addFlameVertex(
        tipX - sideX * tipHalfW,
        tipY - sideY * tipHalfW,
        tipZ2,
        nx,
        ny,
        nz,
        tongueTipColor,
        tongueTipAlpha + flameRand() * 0.04,
      );
      flameIdx.push(i0, i1, i2);
      flameIdx.push(i0, i2, i3);
    }

    for (let s = 0; s < 12; s++) {
      const spin = flameRand() * Math.PI * 2;
      const dirX = Math.cos(spin);
      const dirY = Math.sin(spin);
      const sideX = -dirY;
      const sideY = dirX;
      const driftR = 0.02 + flameRand() * 0.28;
      const baseX = brazier.x + dirX * driftR;
      const baseY = brazier.y + dirY * driftR;
      const baseZ2 = flameBaseZ + 0.25 + flameRand() * 0.4;
      const size = 0.012 + flameRand() * 0.018;
      let sparkColor: number;
      let sparkFadeColor: number;
      let sparkAlpha: number;
      const roll = flameRand();

      if (roll < 0.55) {
        sparkColor = packHsl(253, 255, 102);
        sparkFadeColor = packHsl(253, 200, 60);
        sparkAlpha = 0.92;
      } else if (roll < 0.85) {
        sparkColor = packHsl(1, 255, 88);
        sparkFadeColor = packHsl(1, 220, 50);
        sparkAlpha = 0.88;
      } else {
        sparkColor = packHsl(252, 45, 18);
        sparkFadeColor = packHsl(252, 30, 10);
        sparkAlpha = 0.52;
      }

      const v0 = addFlameVertex(
        baseX,
        baseY,
        baseZ2 + size * 1.5,
        0,
        0,
        1,
        sparkColor,
        sparkAlpha + flameRand() * 0.06,
      );
      const v1 = addFlameVertex(
        baseX + sideX * size,
        baseY + sideY * size,
        baseZ2,
        0,
        0,
        1,
        sparkFadeColor,
        sparkAlpha - 0.15 + flameRand() * 0.06,
      );
      const v2 = addFlameVertex(
        baseX,
        baseY,
        baseZ2 - size * 1.2,
        0,
        0,
        1,
        sparkFadeColor,
        sparkAlpha - 0.25 + flameRand() * 0.06,
      );
      const v3 = addFlameVertex(
        baseX - sideX * size,
        baseY - sideY * size,
        baseZ2,
        0,
        0,
        1,
        sparkFadeColor,
        sparkAlpha - 0.15 + flameRand() * 0.06,
      );
      flameIdx.push(v0, v1, v2);
      flameIdx.push(v0, v2, v3);
    }
  }

  return {
    opaque: {
      kind: 'mesh3d',
      meshId: 'lobby-brazier-bowls',
      materialId: 'osrs-terrain',
      modelMatrix: IDENTITY_MATRIX,
      depth: 'read',
      blend: 'normal',
      cullFace: 'none',
      zIndex: 5,
      positions: new Float32Array(pos),
      normals: new Float32Array(norm),
      perVertexHslColors: new Float32Array(col),
      perVertexAlphas: new Float32Array(alpha),
      indices: makeIndices(idx),
    },
    flames: {
      kind: 'mesh3d',
      meshId: 'lobby-brazier-flames',
      materialId: 'osrs-terrain',
      modelMatrix: IDENTITY_MATRIX,
      depth: 'read',
      blend: 'normal',
      cullFace: 'none',
      zIndex: 9,
      positions: new Float32Array(flamePos),
      normals: new Float32Array(flameNorm),
      perVertexHslColors: new Float32Array(flameCol),
      perVertexAlphas: new Float32Array(flameAlpha),
      indices: makeIndices(flameIdx),
      shaderId: 'scene-effects',
      uniforms: { u_animParams: new Float32Array([5.0, 0.9, 0.4, 0.0]) },
    },
  };
}
