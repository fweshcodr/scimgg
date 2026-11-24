import { describe, expect, it } from 'vitest';
import { applyElysianDamageMitigation } from '../elysian';

describe('applyElysianDamageMitigation', () => {
  it.each([
    { damage: 8, roll: 0.699_999, expected: 6 },
    { damage: 8, roll: 0.7, expected: 8 },
    { damage: 1, roll: 0, expected: 0 },
    { damage: 0, roll: 0, expected: 0 },
  ])('returns $expected for damage $damage and roll $roll', ({ damage, roll, expected }) => {
    const result = applyElysianDamageMitigation(damage, roll);
    expect(result).toBe(expected);
  });
});
