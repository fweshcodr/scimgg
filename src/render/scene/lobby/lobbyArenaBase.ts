import { packHsl } from '../../../rs/util/ColorUtil';
import {
  COLOR_ACCENT_DARK,
  COLOR_ACCENT_STONE,
  COLOR_BASE_STONE,
  COLOR_DARK_STONE,
  COLOR_DECO_STONE,
  COLOR_DROP_DARK,
  COLOR_EDGE_STONE,
  COLOR_GROUT,
  COLOR_LIGHT_STONE,
  COLOR_MAGIC_TEAL,
  darken,
  jitterLuminance,
} from './lobbyColorUtils';
import type { EmbeddedMeshCommand } from './lobbyConstants';
import { ARENA_CENTER_X, ARENA_CENTER_Y, faceLuminanceShift, hash } from './lobbyConstants';
import { createLobbyMeshBuilder } from './lobbyMeshBuilder';

function getZone(r: number, theta: number): { zOffset: number; color: number } {
  let t = theta;
  if (t < 0) t += Math.PI * 2;

  if (r <= 1.5) return { zOffset: -0.04, color: COLOR_BASE_STONE };
  if (r <= 3.0) return { zOffset: -0.03, color: COLOR_BASE_STONE };
  if (r <= 3.3) return { zOffset: -0.02, color: COLOR_DARK_STONE };
  if (r <= 3.85) {
    const wave = Math.sin(t * 32) * 0.004;
    return { zOffset: 0.004 + wave, color: COLOR_BASE_STONE };
  }
  if (r <= 4.35) {
    const seam = Math.abs(((t + Math.PI / 8) % (Math.PI / 4)) - Math.PI / 8);
    if (seam < 0.035) {
      return { zOffset: -0.014, color: COLOR_ACCENT_STONE };
    }
    return { zOffset: -0.02, color: COLOR_GROUT };
  }
  if (r <= 4.6) return { zOffset: 0.002, color: COLOR_BASE_STONE };
  if (r <= 6.2) {
    const ring = Math.floor((r - 4.6) / 0.4);
    const segment = Math.floor(t / (Math.PI / 16));
    if ((segment + ring) % 3 === 0) {
      return { zOffset: ring % 2 === 0 ? 0.004 : 0.0, color: COLOR_ACCENT_STONE };
    }
    if ((segment + ring) % 3 === 1) {
      return { zOffset: ring % 2 === 0 ? 0.002 : -0.002, color: COLOR_ACCENT_DARK };
    }
    return { zOffset: 0.0, color: COLOR_DARK_STONE };
  }
  if (r <= 8.3) return { zOffset: -0.01, color: COLOR_BASE_STONE };
  if (r <= 9.4) {
    const segment = Math.floor(t / (Math.PI / 16));
    if (segment % 2 === 0) {
      return { zOffset: 0.012, color: COLOR_DECO_STONE };
    }
    return { zOffset: 0.0, color: COLOR_BASE_STONE };
  }
  if (r <= 13.2) {
    const sector = Math.floor((t + Math.PI / 24) / (Math.PI / 24));
    const ring = Math.floor((r - 9.4) / 0.45);
    const checker = (sector + ring) % 2 === 0;
    const highlight = sector % 3 === 0 && ring % 3 === 0;
    if (highlight) {
      const highlightVar = (sector + ring) % 2;
      return { zOffset: 0.01, color: highlightVar === 0 ? COLOR_ACCENT_STONE : COLOR_ACCENT_DARK };
    }
    return {
      zOffset: checker ? 0.006 : -0.004,
      color: checker ? COLOR_DECO_STONE : COLOR_BASE_STONE,
    };
  }
  if (r <= 13.9) return { zOffset: -0.01, color: COLOR_BASE_STONE };
  if (r <= 14.6) return { zOffset: -0.03, color: COLOR_DARK_STONE };
  if (r <= 15.2) return { zOffset: 0.02, color: COLOR_EDGE_STONE };
  if (r <= 16.2) {
    const angleMod = t % (Math.PI / 8);
    const distToKeystone = Math.min(angleMod, Math.PI / 8 - angleMod);
    if (distToKeystone < 0.06) {
      return { zOffset: 0.06, color: COLOR_LIGHT_STONE };
    }
    const patternCoord = t / 0.04;
    const patternMod = patternCoord % 4;
    const isWide = patternMod < 2;
    const blockId = Math.floor(patternCoord / 4) * 2 + (isWide ? 0 : 1);
    const lumVar = (hash(blockId, 0) % 9) - 4;
    const crenellation = isWide ? 0.04 : 0.01;
    const colorChoice = hash(blockId, 1) % 5;
    if (colorChoice < 2) {
      return { zOffset: crenellation, color: jitterLuminance(COLOR_ACCENT_STONE, lumVar) };
    }
    if (colorChoice < 3) {
      return { zOffset: crenellation, color: jitterLuminance(COLOR_ACCENT_DARK, lumVar) };
    }
    return { zOffset: crenellation, color: jitterLuminance(COLOR_EDGE_STONE, lumVar) };
  }
  return { zOffset: -0.58, color: COLOR_DROP_DARK };
}

function addFlatQuad(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  z: number,
  color: number,
): void {
  mesh.addQuad(
    { x: x1, y: y1, z, nx: 0, ny: 0, nz: 1, color },
    { x: x2, y: y1, z, nx: 0, ny: 0, nz: 1, color },
    { x: x2, y: y2, z, nx: 0, ny: 0, nz: 1, color },
    { x: x1, y: y2, z, nx: 0, ny: 0, nz: 1, color },
  );
}

function addQuadVerticalX(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  x1: number,
  x2: number,
  y: number,
  zBottom: number,
  zTop: number,
  color: number,
  facePositiveY: boolean,
): void {
  if (facePositiveY) {
    mesh.addQuad(
      { x: x2, y, z: zBottom, nx: 0, ny: 0, nz: 1, color },
      { x: x1, y, z: zBottom, nx: 0, ny: 0, nz: 1, color },
      { x: x1, y, z: zTop, nx: 0, ny: 0, nz: 1, color },
      { x: x2, y, z: zTop, nx: 0, ny: 0, nz: 1, color },
    );
    return;
  }

  mesh.addQuad(
    { x: x1, y, z: zBottom, nx: 0, ny: 0, nz: 1, color },
    { x: x2, y, z: zBottom, nx: 0, ny: 0, nz: 1, color },
    { x: x2, y, z: zTop, nx: 0, ny: 0, nz: 1, color },
    { x: x1, y, z: zTop, nx: 0, ny: 0, nz: 1, color },
  );
}

function addQuadVerticalY(
  mesh: ReturnType<typeof createLobbyMeshBuilder>,
  x: number,
  y1: number,
  y2: number,
  zBottom: number,
  zTop: number,
  color: number,
  facePositiveX: boolean,
): void {
  if (facePositiveX) {
    mesh.addQuad(
      { x, y: y1, z: zBottom, nx: 0, ny: 0, nz: 1, color },
      { x, y: y2, z: zBottom, nx: 0, ny: 0, nz: 1, color },
      { x, y: y2, z: zTop, nx: 0, ny: 0, nz: 1, color },
      { x, y: y1, z: zTop, nx: 0, ny: 0, nz: 1, color },
    );
    return;
  }

  mesh.addQuad(
    { x, y: y2, z: zBottom, nx: 0, ny: 0, nz: 1, color },
    { x, y: y1, z: zBottom, nx: 0, ny: 0, nz: 1, color },
    { x, y: y1, z: zTop, nx: 0, ny: 0, nz: 1, color },
    { x, y: y2, z: zTop, nx: 0, ny: 0, nz: 1, color },
  );
}

export function buildArenaMesh(baseZ: number): { tiles: EmbeddedMeshCommand; starSpikes: EmbeddedMeshCommand } {
  const tileMesh = createLobbyMeshBuilder();

  for (let ix = -17; ix <= 17; ix++) {
    for (let iy = -17; iy <= 17; iy++) {
      const r = Math.sqrt(ix * ix + iy * iy);
      if (r > 16.5) continue;

      const cx = ARENA_CENTER_X + ix;
      const cy = ARENA_CENTER_Y + iy;
      const theta = Math.atan2(iy, ix);
      const zone = getZone(r, theta);
      const tileHash = hash(ix, iy);
      const wearZ = ((tileHash % 100) / 100) * 0.02 - 0.01;
      const lumJitter = (tileHash % 17) - 8;
      const topZ = baseZ + zone.zOffset + wearZ;
      const groutZ = topZ - 0.02;
      const color = jitterLuminance(zone.color, lumJitter);
      const sideColor = darken(color, 16);

      addFlatQuad(tileMesh, cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5, groutZ, COLOR_GROUT);
      addQuadVerticalX(tileMesh, cx - 0.5, cx + 0.5, cy + 0.5, baseZ - 1.0, groutZ, sideColor, true);
      addQuadVerticalX(tileMesh, cx - 0.5, cx + 0.5, cy - 0.5, baseZ - 1.0, groutZ, sideColor, false);
      addQuadVerticalY(tileMesh, cx + 0.5, cy - 0.5, cy + 0.5, baseZ - 1.0, groutZ, sideColor, true);
      addQuadVerticalY(tileMesh, cx - 0.5, cy - 0.5, cy + 0.5, baseZ - 1.0, groutZ, sideColor, false);

      const isNSChannel = ix === 0 && Math.abs(iy) >= 3 && Math.abs(iy) <= 9;
      const isEWChannel = iy === 0 && Math.abs(ix) >= 3 && Math.abs(ix) <= 9;

      if (isNSChannel) {
        addFlatQuad(tileMesh, cx - 0.46, cy - 0.46, cx - 0.175, cy + 0.46, topZ, color);
        addQuadVerticalX(tileMesh, cx - 0.46, cx - 0.175, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx - 0.46, cx - 0.175, cy - 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx - 0.46, cy - 0.46, cy + 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx - 0.175, cy - 0.46, cy + 0.46, topZ - 0.04, topZ, sideColor, true);

        addFlatQuad(tileMesh, cx + 0.175, cy - 0.46, cx + 0.46, cy + 0.46, topZ, color);
        addQuadVerticalX(tileMesh, cx + 0.175, cx + 0.46, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx + 0.175, cx + 0.46, cy - 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx + 0.46, cy - 0.46, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalY(tileMesh, cx + 0.175, cy - 0.46, cy + 0.46, topZ - 0.04, topZ, sideColor, false);

        addFlatQuad(tileMesh, cx - 0.175, cy - 0.5, cx + 0.175, cy + 0.5, topZ - 0.04, COLOR_DARK_STONE);
      } else if (isEWChannel) {
        addFlatQuad(tileMesh, cx - 0.46, cy - 0.46, cx + 0.46, cy - 0.175, topZ, color);
        addQuadVerticalY(tileMesh, cx - 0.46, cy - 0.46, cy - 0.175, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx + 0.46, cy - 0.46, cy - 0.175, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy - 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy - 0.175, topZ - 0.04, topZ, sideColor, true);

        addFlatQuad(tileMesh, cx - 0.46, cy + 0.175, cx + 0.46, cy + 0.46, topZ, color);
        addQuadVerticalY(tileMesh, cx - 0.46, cy + 0.175, cy + 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx + 0.46, cy + 0.175, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy + 0.175, topZ - 0.04, topZ, sideColor, false);

        addFlatQuad(tileMesh, cx - 0.5, cy - 0.175, cx + 0.5, cy + 0.175, topZ - 0.04, COLOR_DARK_STONE);
      } else {
        addFlatQuad(tileMesh, cx - 0.46, cy - 0.46, cx + 0.46, cy + 0.46, topZ, color);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalX(tileMesh, cx - 0.46, cx + 0.46, cy - 0.46, groutZ, topZ, sideColor, false);
        addQuadVerticalY(tileMesh, cx + 0.46, cy - 0.46, cy + 0.46, groutZ, topZ, sideColor, true);
        addQuadVerticalY(tileMesh, cx - 0.46, cy - 0.46, cy + 0.46, groutZ, topZ, sideColor, false);
      }
    }
  }

  const spikeMesh = createLobbyMeshBuilder();
  const spikeBase = baseZ - 0.001;

  for (let p = 0; p < 16; p++) {
    const angle = (p / 16) * Math.PI * 2;
    const isMajor = p % 2 === 0;
    const tipR = isMajor ? 3.55 : 2.85;
    const baseR = isMajor ? 1.0 : 1.4;
    const spread = isMajor ? 0.16 : 0.12;
    const bx0 = ARENA_CENTER_X + Math.cos(angle - spread) * baseR;
    const by0 = ARENA_CENTER_Y + Math.sin(angle - spread) * baseR;
    const bx1 = ARENA_CENTER_X + Math.cos(angle + spread) * baseR;
    const by1 = ARENA_CENTER_Y + Math.sin(angle + spread) * baseR;
    const tx = ARENA_CENTER_X + Math.cos(angle) * tipR;
    const ty = ARENA_CENTER_Y + Math.sin(angle) * tipR;
    const color = isMajor ? COLOR_ACCENT_STONE : jitterLuminance(COLOR_ACCENT_STONE, -8);
    const zTip = spikeBase + (isMajor ? 0.058 : 0.048);
    const zBase = spikeBase + 0.048;
    const i = spikeMesh.vIdx();

    spikeMesh.addVertex(bx0, by0, zBase, 0, 0, 1, color);
    spikeMesh.addVertex(tx, ty, zTip, 0, 0, 1, color);
    spikeMesh.addVertex(bx1, by1, zBase, 0, 0, 1, color);
    spikeMesh.indices.push(i, i + 1, i + 2);
  }

  for (let s = 0; s < 16; s++) {
    const theta = (s / 16) * Math.PI * 2;
    const sx = ARENA_CENTER_X + Math.cos(theta) * 2.22;
    const sy = ARENA_CENTER_Y + Math.sin(theta) * 2.22;
    const socketR = 0.12;

    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      const x0 = sx + Math.cos(a0) * socketR;
      const y0 = sy + Math.sin(a0) * socketR;
      const x1 = sx + Math.cos(a1) * socketR;
      const y1 = sy + Math.sin(a1) * socketR;
      const topZ = spikeBase + 0.03;
      const innerZ = spikeBase + 0.01;

      let i = spikeMesh.vIdx();
      spikeMesh.addVertex(sx, sy, innerZ, 0, 0, 1, COLOR_GROUT);
      spikeMesh.addVertex(x0, y0, innerZ, 0, 0, 1, COLOR_GROUT);
      spikeMesh.addVertex(x1, y1, innerZ, 0, 0, 1, COLOR_GROUT);
      spikeMesh.indices.push(i, i + 1, i + 2);

      i = spikeMesh.vIdx();
      spikeMesh.addQuad(
        { x: x0, y: y0, z: innerZ, nx: 0, ny: 0, nz: 1, color: COLOR_GROUT },
        { x: x1, y: y1, z: innerZ, nx: 0, ny: 0, nz: 1, color: COLOR_GROUT },
        { x: x1, y: y1, z: topZ, nx: 0, ny: 0, nz: 1, color: darken(COLOR_GROUT, 8) },
        { x: x0, y: y0, z: topZ, nx: 0, ny: 0, nz: 1, color: darken(COLOR_GROUT, 8) },
      );
    }
  }

  const tiles = tileMesh.toCommand('lobby-arena-floor-tiles', 0, {
    depth: 'read',
    blend: 'normal',
  });
  tiles.perVertexAlphas = new Float32Array(tileMesh.positions.length / 3).fill(0.35);

  return {
    tiles,
    starSpikes: spikeMesh.toCommand('lobby-arena-star-spikes', 0),
  };
}

export function buildCenterPoolGlow(baseZ: number): EmbeddedMeshCommand {
  const segments = 24;
  const rings = 5;
  const radius = 2.5;
  const z = baseZ + 0.06;
  const color = packHsl(0, 192, 60);
  const mesh = createLobbyMeshBuilder();

  const firstRing = radius / rings;
  const centerAlpha = 0.08;
  for (let s = 0; s < segments; s++) {
    const t0 = (s / segments) * Math.PI * 2;
    const t1 = ((s + 1) / segments) * Math.PI * 2;
    const o0x = ARENA_CENTER_X + Math.cos(t0) * firstRing;
    const o0y = ARENA_CENTER_Y + Math.sin(t0) * firstRing;
    const o1x = ARENA_CENTER_X + Math.cos(t1) * firstRing;
    const o1y = ARENA_CENTER_Y + Math.sin(t1) * firstRing;
    const i = mesh.vIdx();
    mesh.addVertex(ARENA_CENTER_X, ARENA_CENTER_Y, z, 0, 0, 1, color, centerAlpha);
    mesh.addVertex(o0x, o0y, z, 0, 0, 1, color, centerAlpha * (1 - firstRing / radius));
    mesh.addVertex(o1x, o1y, z, 0, 0, 1, color, centerAlpha * (1 - firstRing / radius));
    mesh.indices.push(i, i + 1, i + 2);
  }

  for (let r = 1; r < rings; r++) {
    const rIn = (r / rings) * radius;
    const rOut = ((r + 1) / rings) * radius;
    const aIn = centerAlpha * (1 - rIn / radius);
    const aOut = centerAlpha * (1 - rOut / radius);
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      const i0x = ARENA_CENTER_X + Math.cos(t0) * rIn;
      const i0y = ARENA_CENTER_Y + Math.sin(t0) * rIn;
      const i1x = ARENA_CENTER_X + Math.cos(t1) * rIn;
      const i1y = ARENA_CENTER_Y + Math.sin(t1) * rIn;
      const o0x = ARENA_CENTER_X + Math.cos(t0) * rOut;
      const o0y = ARENA_CENTER_Y + Math.sin(t0) * rOut;
      const o1x = ARENA_CENTER_X + Math.cos(t1) * rOut;
      const o1y = ARENA_CENTER_Y + Math.sin(t1) * rOut;
      mesh.addQuad(
        { x: i0x, y: i0y, z, nx: 0, ny: 0, nz: 1, color, alpha: aIn },
        { x: i1x, y: i1y, z, nx: 0, ny: 0, nz: 1, color, alpha: aIn },
        { x: o1x, y: o1y, z, nx: 0, ny: 0, nz: 1, color, alpha: aOut },
        { x: o0x, y: o0y, z, nx: 0, ny: 0, nz: 1, color, alpha: aOut },
      );
    }
  }

  return mesh.toCommand('lobby-center-pool-glow', 8, {
    depth: 'read',
    blend: 'normal',
    shaderId: 'scene-effects',
    uniforms: { u_animParams: [2.0, 0.003, 0.3, 0.0] },
  });
}

export function buildBoundaryGems(baseZ: number): EmbeddedMeshCommand {
  const mesh = createLobbyMeshBuilder();

  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const cx = ARENA_CENTER_X + Math.cos(t) * 15.75;
    const cy = ARENA_CENTER_Y + Math.sin(t) * 15.75;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    const nx = -dy;
    const ny = dx;

    const color = jitterLuminance(COLOR_MAGIC_TEAL, faceLuminanceShift(0, 0, 1));
    mesh.addQuad(
      { x: cx + dx * 0.12, y: cy + dy * 0.12, z: baseZ + 0.05, nx: 0, ny: 0, nz: 1, color, alpha: 0.6 },
      { x: cx + nx * 0.12, y: cy + ny * 0.12, z: baseZ + 0.05, nx: 0, ny: 0, nz: 1, color, alpha: 0.6 },
      { x: cx - dx * 0.12, y: cy - dy * 0.12, z: baseZ + 0.05, nx: 0, ny: 0, nz: 1, color, alpha: 0.6 },
      { x: cx - nx * 0.12, y: cy - ny * 0.12, z: baseZ + 0.05, nx: 0, ny: 0, nz: 1, color, alpha: 0.6 },
    );
  }

  return mesh.toCommand('lobby-boundary-gems', 4, {
    depth: 'read',
    blend: 'normal',
    shaderId: 'scene-effects',
    uniforms: { u_animParams: [3.0, 0.3, 0.5, 0.0] },
  });
}

export function buildSteppedStoneRings(baseZ: number): EmbeddedMeshCommand {
  const mesh = createLobbyMeshBuilder();

  for (const ring of [
    { r: 5.0, w: 0.2, h: 0.03 },
    { r: 9.0, w: 0.25, h: 0.04 },
    { r: 13.0, w: 0.3, h: 0.05 },
  ]) {
    const rInner = ring.r - ring.w / 2;
    const rOuter = ring.r + ring.w / 2;
    const zTop = baseZ + 0.04 + ring.h;
    const zBase = baseZ + 0.04;
    const colorTop = COLOR_DECO_STONE;
    const colorSideInner = darken(COLOR_DECO_STONE, 10);
    const colorSideOuter = darken(COLOR_DECO_STONE, 15);

    for (let s = 0; s < 64; s++) {
      const t1 = (s / 64) * Math.PI * 2;
      const t2 = ((s + 1) / 64) * Math.PI * 2;
      const c1 = Math.cos(t1);
      const s1 = Math.sin(t1);
      const c2 = Math.cos(t2);
      const s2 = Math.sin(t2);
      const x1i = ARENA_CENTER_X + c1 * rInner;
      const y1i = ARENA_CENTER_Y + s1 * rInner;
      const x2i = ARENA_CENTER_X + c2 * rInner;
      const y2i = ARENA_CENTER_Y + s2 * rInner;
      const x1o = ARENA_CENTER_X + c1 * rOuter;
      const y1o = ARENA_CENTER_Y + s1 * rOuter;
      const x2o = ARENA_CENTER_X + c2 * rOuter;
      const y2o = ARENA_CENTER_Y + s2 * rOuter;
      const tMid = (t1 + t2) / 2;
      const cMid = Math.cos(tMid);
      const sMid = Math.sin(tMid);

      const litTop = jitterLuminance(colorTop, faceLuminanceShift(0, 0, 1));
      mesh.addQuad(
        { x: x1i, y: y1i, z: zTop, nx: 0, ny: 0, nz: 1, color: litTop },
        { x: x2i, y: y2i, z: zTop, nx: 0, ny: 0, nz: 1, color: litTop },
        { x: x2o, y: y2o, z: zTop, nx: 0, ny: 0, nz: 1, color: litTop },
        { x: x1o, y: y1o, z: zTop, nx: 0, ny: 0, nz: 1, color: litTop },
      );

      const litOuter = jitterLuminance(colorSideOuter, faceLuminanceShift(cMid, sMid, 0));
      mesh.addQuad(
        { x: x1o, y: y1o, z: zBase, nx: c1, ny: s1, nz: 0, color: litOuter },
        { x: x2o, y: y2o, z: zBase, nx: c2, ny: s2, nz: 0, color: litOuter },
        { x: x2o, y: y2o, z: zTop, nx: c2, ny: s2, nz: 0, color: litOuter },
        { x: x1o, y: y1o, z: zTop, nx: c1, ny: s1, nz: 0, color: litOuter },
      );

      const litInner = jitterLuminance(colorSideInner, faceLuminanceShift(-cMid, -sMid, 0));
      mesh.addQuad(
        { x: x2i, y: y2i, z: zBase, nx: -c2, ny: -s2, nz: 0, color: litInner },
        { x: x1i, y: y1i, z: zBase, nx: -c1, ny: -s1, nz: 0, color: litInner },
        { x: x1i, y: y1i, z: zTop, nx: -c1, ny: -s1, nz: 0, color: litInner },
        { x: x2i, y: y2i, z: zTop, nx: -c2, ny: -s2, nz: 0, color: litInner },
      );
    }
  }

  return mesh.toCommand('lobby-stepped-rings', 0);
}
