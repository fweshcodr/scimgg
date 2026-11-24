import { describe, expect, it, vi } from 'vitest';
import {
  AMULET_OF_BLOOD_FURY,
  BLOOD_FURY_HEAL_FRACTION,
  BLOOD_FURY_PROC_CHANCE,
  type BloodFuryHit,
  rollBloodFury,
} from '../onHitPassives';

const OTHER_AMULET = 99999;

function makeHit(overrides: Partial<BloodFuryHit> = {}): BloodFuryHit {
  return {
    amuletId: AMULET_OF_BLOOD_FURY,
    attackType: 'melee',
    damage: 50,
    roll: () => 0,
    ...overrides,
  };
}

describe('rollBloodFury — amulet of blood fury life-leech', () => {
  it('heals floor(30% of damage) on a melee hit when the roll procs', () => {
    expect(rollBloodFury(makeHit())).toBe(15);
    expect(rollBloodFury(makeHit({ damage: 33, roll: () => 0.19 }))).toBe(9); // floor(9.9)
    // A proc on a small hit still procs (and shows its graphic), though it heals nothing.
    expect(rollBloodFury(makeHit({ damage: 1 }))).toBe(0); // floor(0.3)
  });

  it('does not proc when the roll is at or above the 20% chance', () => {
    expect(rollBloodFury(makeHit({ roll: () => BLOOD_FURY_PROC_CHANCE }))).toBeNull();
    expect(rollBloodFury(makeHit({ roll: () => 0.99 }))).toBeNull();
  });

  it('never procs for ranged, magic, or typeless hits', () => {
    expect(rollBloodFury(makeHit({ attackType: 'range' }))).toBeNull();
    expect(rollBloodFury(makeHit({ attackType: 'magic' }))).toBeNull();
    expect(rollBloodFury(makeHit({ attackType: 'typeless' }))).toBeNull();
  });

  it('never procs without the amulet of blood fury equipped', () => {
    expect(rollBloodFury(makeHit({ amuletId: OTHER_AMULET }))).toBeNull();
    expect(rollBloodFury(makeHit({ amuletId: undefined }))).toBeNull();
  });

  it('never procs on a blocked (0 or negative) hit', () => {
    expect(rollBloodFury(makeHit({ damage: 0 }))).toBeNull();
    expect(rollBloodFury(makeHit({ damage: -5 }))).toBeNull();
  });

  it('does not consume RNG for ineligible hits', () => {
    const roll = vi.fn(() => 0);

    rollBloodFury(makeHit({ amuletId: OTHER_AMULET, roll }));
    rollBloodFury(makeHit({ attackType: 'range', roll }));
    rollBloodFury(makeHit({ damage: 0, roll }));

    expect(roll).not.toHaveBeenCalled();
  });

  it('exposes the wiki-accurate constants (24780, 20% chance, 30% heal)', () => {
    expect(AMULET_OF_BLOOD_FURY).toBe(24780);
    expect(BLOOD_FURY_PROC_CHANCE).toBe(0.2);
    expect(BLOOD_FURY_HEAL_FRACTION).toBe(0.3);
  });
});
