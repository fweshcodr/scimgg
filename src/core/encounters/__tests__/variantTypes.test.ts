import { describe, expect, it } from 'vitest';
import { type EncounterVariant, resolveEncounterPresetsKey, resolveStartingHitpoints } from '../variantTypes';

const DECLARED_VARIANT: EncounterVariant = {
  id: 'bloodied_blows',
  encounterKind: 'yama_p3_bloodied',
  name: 'Bloodied Blows',
  subtitle: 'Low-health contract',
  available: true,
  startingHitpoints: 10,
};

const UNDECLARED_VARIANT: EncounterVariant = {
  id: 'no_contract',
  encounterKind: 'yama_p3',
  name: 'No Contract',
  subtitle: 'Base encounter',
  available: true,
};

describe('resolveEncounterPresetsKey', () => {
  const variants: EncounterVariant[] = [{ ...DECLARED_VARIANT, presetsKey: 'yama_p3' }, UNDECLARED_VARIANT];

  it("uses the matching variant's explicit shared presets key", () => {
    expect(resolveEncounterPresetsKey('yama_p3_bloodied', variants)).toBe('yama_p3');
  });

  it('keeps the requested kind when the matching variant has no presets key', () => {
    expect(resolveEncounterPresetsKey('yama_p3', variants)).toBe('yama_p3');
  });

  it.each(['inferno', 'unknown'])('keeps an unmatched base or unknown kind: %s', (kind) => {
    expect(resolveEncounterPresetsKey(kind, variants)).toBe(kind);
  });

  it('keeps the requested kind without variants', () => {
    expect(resolveEncounterPresetsKey('yama_p3_bloodied')).toBe('yama_p3_bloodied');
    expect(resolveEncounterPresetsKey('yama_p3_bloodied', [])).toBe('yama_p3_bloodied');
  });

  it('preserves an explicit empty presets key rather than falling back to the kind', () => {
    expect(resolveEncounterPresetsKey('yama_p3_bloodied', [{ ...DECLARED_VARIANT, presetsKey: '' }])).toBe('');
  });
});

describe('resolveStartingHitpoints', () => {
  it('returns undefined without a variant or a starting-hitpoints declaration', () => {
    expect(resolveStartingHitpoints(undefined, {})).toBeUndefined();
    expect(resolveStartingHitpoints(UNDECLARED_VARIANT, { yama_p3: 25 })).toBeUndefined();
  });

  it('returns the declared default without an override for the variant kind', () => {
    expect(resolveStartingHitpoints(DECLARED_VARIANT, {})).toBe(10);
  });

  it('returns an override stored for the variant kind', () => {
    expect(resolveStartingHitpoints(DECLARED_VARIANT, { yama_p3_bloodied: 25 })).toBe(25);
  });

  it('ignores an override stored for a different encounter kind', () => {
    expect(resolveStartingHitpoints(DECLARED_VARIANT, { yama_p3: 25 })).toBe(10);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -5,
    '25',
  ])('falls back to the declared default for the unusable override %p', (override) => {
    const overrides: Record<string, number> = {};
    Object.assign(overrides, { yama_p3_bloodied: override });

    expect(resolveStartingHitpoints(DECLARED_VARIANT, overrides)).toBe(10);
  });

  it('floors a fractional override', () => {
    expect(resolveStartingHitpoints(DECLARED_VARIANT, { yama_p3_bloodied: 25.9 })).toBe(25);
  });
});
