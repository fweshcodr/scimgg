import { describe, expect, it } from 'vitest';
import { classifyMesh3DCommands } from '../../backends/picogl/commandClassifier';
import type { NpcMesh3DCommand } from '../../core/commands';
import { GROUND_DECAL_DEPTH_BIAS } from '../../graphics/sceneObjectTypes';
import { buildTileGridMesh, type TileGridMeshInput, tileGridMeshId } from '../tileGridMesh';

const LIFT = 0.01;
const bounds = { minX: 2, maxX: 4, minY: 5, maxY: 6 };
// Not planar, so a vertex given the wrong corner's height shows up.
const cornerHeight = (x: number, y: number) => -(x * x + 3 * y) / 16;
const input: TileGridMeshInput = { bounds, cornerHeight, hslColor: 1234, opacity: 0.4, lineWidth: 0.1 };
const hw = input.lineWidth / 2;

function build(overrides: Partial<TileGridMeshInput> = {}): NpcMesh3DCommand {
  const command = buildTileGridMesh({ ...input, ...overrides });
  if (!command) expect.fail('Expected a grid mesh');
  return command;
}

function vertices(command: NpcMesh3DCommand): [number, number, number][] {
  return Array.from({ length: command.positions.length / 3 }, (_, i) => [
    command.positions[i * 3],
    command.positions[i * 3 + 1],
    command.positions[i * 3 + 2],
  ]);
}

/** Every quad (two triangles) as its xy rectangle; the grid's quads are all axis-aligned. */
function rectangles(command: NpcMesh3DCommand) {
  const all = vertices(command);
  const rects: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
  for (let i = 0; i < all.length; i += 6) {
    const quad = all.slice(i, i + 6);
    const xs = quad.map(([x]) => x);
    const ys = quad.map(([, y]) => y);
    rects.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) });
  }
  return rects;
}

function coverCount(command: NpcMesh3DCommand, x: number, y: number): number {
  return rectangles(command).filter((r) => x > r.minX && x < r.maxX && y > r.minY && y < r.maxY).length;
}

describe('buildTileGridMesh', () => {
  it('is a blended, depth-tested ground decal so the no-depth markers draw over it', () => {
    const command = build();

    expect(command).toMatchObject({
      kind: 'mesh3d',
      materialId: 'tile-outline',
      blend: 'normal',
      depth: 'read',
      depthBias: GROUND_DECAL_DEPTH_BIAS,
      cullFace: 'none',
      transparentOrder: 'first',
    });
    expect(command.depthBias).toBeGreaterThan(0);
    expect(Array.from(command.modelMatrix)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const vertexCount = command.positions.length / 3;
    expect(command.perVertexAlphas).toEqual(new Float32Array(vertexCount).fill(0.4));
    expect(command.perVertexHslColors).toEqual(new Float32Array(vertexCount).fill(1234));

    const marker = { ...command, meshId: 'tile-marker', depth: 'none' as const };
    const buckets = classifyMesh3DCommands([marker, command]);
    expect(buckets.transparent).toEqual([command]);
    expect(buckets.noDepth).toEqual([marker]);
  });

  it('covers exactly the tile edges of its bounds, reaching half a line past the outer edges', () => {
    const all = vertices(build());
    const xs = all.map(([x]) => x);
    const ys = all.map(([, y]) => y);

    expect(Math.min(...xs)).toBeCloseTo(bounds.minX - hw);
    expect(Math.max(...xs)).toBeCloseTo(bounds.maxX + 1 + hw);
    expect(Math.min(...ys)).toBeCloseTo(bounds.minY - hw);
    expect(Math.max(...ys)).toBeCloseTo(bounds.maxY + 1 + hw);
  });

  it('follows the terrain corner heights, interpolating where a north-south segment meets a line', () => {
    const all = vertices(build());
    const has = (x: number, y: number, z: number) =>
      all.some(([vx, vy, vz]) => Math.abs(vx - x) < 1e-5 && Math.abs(vy - y) < 1e-5 && Math.abs(vz - z) < 1e-5);

    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
        // The east-west strip passes through every corner at that corner's height.
        expect(has(x, y - hw, cornerHeight(x, y) + LIFT)).toBe(true);
        if (y <= bounds.maxY) {
          const south = cornerHeight(x, y);
          const north = cornerHeight(x, y + 1);
          expect(has(x - hw, y + hw, south + (north - south) * hw + LIFT)).toBe(true);
          expect(has(x + hw, y + 1 - hw, south + (north - south) * (1 - hw) + LIFT)).toBe(true);
        }
      }
    }
    // The end caps keep the outer corner's height.
    expect(has(bounds.minX - hw, bounds.minY + hw, cornerHeight(bounds.minX, bounds.minY) + LIFT)).toBe(true);
  });

  it('never overlaps two quads, so a translucent grid has one alpha everywhere', () => {
    const command = build();
    const rects = rectangles(command);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        expect(overlapX > 1e-6 && overlapY > 1e-6, `quads ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('covers every crossing, T-junction, outer corner and edge once, without gaps', () => {
    const command = build();
    const nudge = hw * 0.9;
    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
        for (const [dx, dy] of [
          [0.001, 0.001],
          [-nudge, -nudge],
          [nudge, nudge],
          [-nudge, nudge],
          [nudge, -nudge],
        ]) {
          expect(coverCount(command, x + dx, y + dy), `corner ${x},${y} + ${dx},${dy}`).toBe(1);
        }
        // Just past the east-west line, where the north-south segment takes over.
        if (y <= bounds.maxY) expect(coverCount(command, x + 0.001, y + hw * 1.1)).toBe(1);
        if (y <= bounds.maxY) expect(coverCount(command, x + 0.001, y + 0.5)).toBe(1);
        if (x <= bounds.maxX) expect(coverCount(command, x + 0.5, y + 0.001)).toBe(1);
      }
    }
    // Off the lines, inside a tile.
    expect(coverCount(command, bounds.minX + 0.5, bounds.minY + 0.5)).toBe(0);
  });

  it('keys the VAO cache on everything that changes the buffers', () => {
    const ids = new Set([
      build().meshId,
      build({ opacity: 0.5 }).meshId,
      build({ lineWidth: 0.2 }).meshId,
      build({ hslColor: 99 }).meshId,
      build({ bounds: { ...bounds, maxX: 5 } }).meshId,
    ]);
    expect(ids.size).toBe(5);
    expect(build().meshId).toBe(tileGridMeshId(bounds, 1234, 0.4, 0.1));
  });

  it('draws nothing for empty bounds or a line as wide as a tile', () => {
    expect(buildTileGridMesh({ ...input, bounds: { minX: 3, maxX: 2, minY: 0, maxY: 4 } })).toBeNull();
    expect(buildTileGridMesh({ ...input, lineWidth: 1 })).toBeNull();
    expect(buildTileGridMesh({ ...input, lineWidth: 0 })).toBeNull();
  });
});
