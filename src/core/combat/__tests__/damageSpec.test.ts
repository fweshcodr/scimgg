import { describe, expect, it, vi } from 'vitest';
import { sampleDamageSpec } from '../damageSpec';
import type { DamageSpec } from '../playerAttackTypes';

describe('sampleDamageSpec', () => {
  it('samples both inclusive uniform endpoints', () => {
    const spec: DamageSpec = { kind: 'uniform', minimumInclusive: 4, maximumInclusive: 9 };

    expect(sampleDamageSpec(spec, [], () => 0)).toBe(4);
    expect(sampleDamageSpec(spec, [], () => 0.999_999)).toBe(9);
  });

  it('represents magic as minimum(uniform(0, max), 1)', () => {
    const magic: DamageSpec = {
      kind: 'minimum',
      minimumDamage: 1,
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 4 },
    };

    expect(sampleDamageSpec(magic, [], () => 0)).toBe(1);
    expect(sampleDamageSpec(magic, [], () => 0.2)).toBe(1);
    expect(sampleDamageSpec(magic, [], () => 0.4)).toBe(2);
  });

  it('floors a fraction of already-transformed prior damage without consuming RNG', () => {
    const random = vi.fn(() => 0.5);
    const spec: DamageSpec = {
      kind: 'floorFractionOfPriorHit',
      priorHitIndex: 1,
      numerator: 1,
      denominator: 2,
    };

    expect(sampleDamageSpec(spec, [3, 11], random)).toBe(5);
    expect(random).not.toHaveBeenCalled();
  });

  it('applies a minimum to the sampled base damage', () => {
    const spec: DamageSpec = {
      kind: 'minimum',
      minimumDamage: 5,
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 10 },
    };

    expect(sampleDamageSpec(spec, [], () => 0)).toBe(5);
    expect(sampleDamageSpec(spec, [], () => 0.9)).toBe(9);
  });

  it('applies a proc to the same sampled base value', () => {
    const random = vi.fn().mockReturnValueOnce(0.6).mockReturnValueOnce(0);
    const spec: DamageSpec = {
      kind: 'floorScaleOnProc',
      chance: 0.1,
      ratio: { numerator: 3, denominator: 1 },
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 10 },
    };

    expect(sampleDamageSpec(spec, [], random)).toBe(18);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('floors every nested scale stage', () => {
    const spec: DamageSpec = {
      kind: 'floorScale',
      ratio: { numerator: 3, denominator: 2 },
      base: {
        kind: 'floorScale',
        ratio: { numerator: 7, denominator: 6 },
        base: { kind: 'fixed', damage: 41 },
      },
    };

    expect(sampleDamageSpec(spec, [], () => 0.5)).toBe(70);
  });

  it('samples a correlated addition base once and floors every copy stage', () => {
    const random = vi.fn(() => 0.999_999);
    const spec: DamageSpec = {
      kind: 'addFloorScaledCopy',
      stages: [
        { numerator: 1, denominator: 2 },
        { numerator: 1, denominator: 2 },
      ],
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 9 },
    };

    expect(sampleDamageSpec(spec, [], random)).toBe(11);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('consumes base RNG before proc RNG and avoids RNG for fixed nodes', () => {
    const random = vi.fn().mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);
    const proc: DamageSpec = {
      kind: 'floorScaleOnProc',
      chance: 0.5,
      ratio: { numerator: 2, denominator: 1 },
      base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 3 },
    };
    const fixedRandom = vi.fn(() => 0.5);

    expect(sampleDamageSpec(proc, [], random)).toBe(6);
    expect(random).toHaveBeenCalledTimes(2);
    expect(sampleDamageSpec({ kind: 'fixed', damage: 7 }, [], fixedRandom)).toBe(7);
    expect(fixedRandom).not.toHaveBeenCalled();
  });
});
