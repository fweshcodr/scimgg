import { describe, expect, it } from 'vitest';
import type { CollisionLocPlacement } from '../../../core/arena/collisionSpec';
import { ENCOUNTER_CORE_MODULES } from '../../modules';
import { SOL_BOUNDARY_WARRIORS } from '../arenaBoundary';
import { SOL_BOUNDARY_GUARDS_CAPTURED } from './fixtures/solBoundaryGuardsCapture';

function readGuards(filename: string): readonly CollisionLocPlacement[] {
  return SOL_BOUNDARY_GUARDS_CAPTURED[filename] ?? [];
}

const placementKey = (placement: CollisionLocPlacement): string =>
  `${placement.localX},${placement.localY},${placement.rotation},${placement.type},${placement.level}`;

describe('Sol boundary warriors', () => {
  it('includes the packet-spawned guards when baking cache collision', () => {
    const descriptor = ENCOUNTER_CORE_MODULES.find((entry) => entry.kind === 'sol_heredit')?.descriptor;
    expect(descriptor?.collision?.dynamicLocs).toEqual(SOL_BOUNDARY_WARRIORS);
  });
  it('reproduces all 48 K:3998 LOC identities, coordinates and rotations', () => {
    const recorded = readGuards('colosseum-sol-heredit-packet-data.txt');
    expect(recorded).toHaveLength(48);
    expect(SOL_BOUNDARY_WARRIORS).toHaveLength(48);
    const key = (placement: CollisionLocPlacement) => `${placementKey(placement)},${placement.locId}`;
    expect(SOL_BOUNDARY_WARRIORS.map(key).sort()).toEqual(recorded.map(key).sort());
  });

  it('matches the second capture layout without claiming its cosmetic variants are fixed', () => {
    const recorded = readGuards('colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt');
    expect(recorded).toHaveLength(48);
    expect(SOL_BOUNDARY_WARRIORS.map(placementKey).sort()).toEqual(recorded.map(placementKey).sort());
  });
});
