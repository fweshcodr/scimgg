import { describe, expect, it } from 'vitest';
import {
  deactivatePresetOverrides,
  isPresetActive,
  normalizePresetOverrides,
  presetChoicesFor,
  presetOverridesEqual,
  resolveActivePresetIds,
  type SelectablePreset,
  togglePresetOverrides,
} from '../presetState';

const A: SelectablePreset = { id: 'a', defaultActive: true };
const B: SelectablePreset = { id: 'b' };
const C: SelectablePreset = { id: 'c' };
const PRESETS = [A, B, C];
const KIND = 'yama_p3';

describe('isPresetActive', () => {
  it('falls back to defaultActive when the user has never chosen', () => {
    expect(isPresetActive(A, {})).toBe(true);
    expect(isPresetActive(B, {})).toBe(false);
  });

  it('lets an explicit choice beat defaultActive in both directions', () => {
    expect(isPresetActive(A, { a: false })).toBe(false);
    expect(isPresetActive(B, { b: true })).toBe(true);
  });
});

describe('presetChoicesFor', () => {
  it('reads one encounter kind, empty for a kind never touched', () => {
    expect(presetChoicesFor({ [KIND]: { a: false } }, KIND)).toEqual({ a: false });
    expect(presetChoicesFor({ [KIND]: { a: false } }, 'zuk')).toEqual({});
  });
});

describe('togglePresetOverrides', () => {
  it('multi leaves the other presets alone', () => {
    expect(togglePresetOverrides({}, KIND, PRESETS, 'b', 'multi')).toEqual({ [KIND]: { b: true } });
  });

  it('single switches the other presets in scope off explicitly', () => {
    // 'a' must be recorded false, not merely absent, or its defaultActive
    // would switch it straight back on.
    expect(togglePresetOverrides({}, KIND, PRESETS, 'b', 'single')).toEqual({
      [KIND]: { a: false, b: true, c: false },
    });
  });

  it('single does not touch presets outside the scope it was given', () => {
    const overrides = { [KIND]: { zuk_pack: true } };
    expect(togglePresetOverrides(overrides, KIND, PRESETS, 'b', 'single')).toEqual({
      [KIND]: { zuk_pack: true, a: false, b: true, c: false },
    });
  });

  it('switching off never reactivates siblings under single', () => {
    const overrides = { [KIND]: { a: false, b: true, c: false } };
    expect(togglePresetOverrides(overrides, KIND, PRESETS, 'b', 'single')).toEqual({
      [KIND]: { a: false, b: false, c: false },
    });
  });

  it('turns a defaultActive preset off on first toggle', () => {
    expect(togglePresetOverrides({}, KIND, PRESETS, 'a', 'multi')).toEqual({ [KIND]: { a: false } });
  });

  it('keeps each encounter kind that shares a preset id on its own choice', () => {
    // Yama's contracts are offered the base fight's packs, so the same ids
    // recur across kinds; a choice made on one must not follow the user.
    const base = togglePresetOverrides({}, 'yama_p3', PRESETS, 'b', 'single');
    const contract = togglePresetOverrides(base, 'yama_p3_glyphic', PRESETS, 'c', 'single');

    expect(resolveActivePresetIds(PRESETS, presetChoicesFor(contract, 'yama_p3'))).toEqual(['b']);
    expect(resolveActivePresetIds(PRESETS, presetChoicesFor(contract, 'yama_p3_glyphic'))).toEqual(['c']);
  });
});

describe('resolveActivePresetIds', () => {
  it('reports defaults plus explicit opt-ins, minus explicit opt-outs', () => {
    expect(resolveActivePresetIds(PRESETS, {})).toEqual(['a']);
    expect(resolveActivePresetIds(PRESETS, { b: true })).toEqual(['a', 'b']);
    expect(resolveActivePresetIds(PRESETS, { a: false, c: true })).toEqual(['c']);
  });
});

describe('deactivatePresetOverrides', () => {
  it('records an explicit off so default-on presets stay off', () => {
    expect(deactivatePresetOverrides({}, KIND, ['a', 'b'])).toEqual({ [KIND]: { a: false, b: false } });
  });

  it('leaves the other encounter kinds untouched', () => {
    const overrides = { zuk: { a: true } };
    expect(deactivatePresetOverrides(overrides, KIND, ['a'])).toEqual({ zuk: { a: true }, [KIND]: { a: false } });
  });
});

describe('presetOverridesEqual', () => {
  it('compares by content, not identity', () => {
    expect(presetOverridesEqual({ [KIND]: { a: true } }, { [KIND]: { a: true } })).toBe(true);
    expect(presetOverridesEqual({ [KIND]: { a: true } }, { [KIND]: { a: false } })).toBe(false);
    expect(presetOverridesEqual({ [KIND]: { a: true } }, { [KIND]: { a: true, b: true } })).toBe(false);
    expect(presetOverridesEqual({ [KIND]: { a: true } }, { [KIND]: { a: true }, zuk: { a: true } })).toBe(false);
    expect(presetOverridesEqual({ [KIND]: { a: true } }, { zuk: { a: true } })).toBe(false);
  });
});

describe('normalizePresetOverrides', () => {
  it('reads explicit choices, keeping false entries', () => {
    expect(normalizePresetOverrides({ presetOverrides: { [KIND]: { a: false, b: true } } })).toEqual({
      [KIND]: { a: false, b: true },
    });
  });

  it('refuses keys that would write onto Object.prototype', () => {
    // Built with JSON.parse because an object literal's __proto__ is a setter, not an own
    // key -- only parsed JSON reproduces what localStorage actually hands back.
    const hostile = JSON.parse(
      '{"presetOverrides":{"__proto__":{"polluted":true},"constructor":{"polluted":true},' +
        '"yama_p3":{"__proto__":true,"constructor":true,"prototype":true,"a":true}}}',
    ) as Record<string, unknown>;

    expect(normalizePresetOverrides(hostile)).toEqual({ yama_p3: { a: true } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('ignores junk', () => {
    expect(normalizePresetOverrides({ presetOverrides: { [KIND]: { a: 'yes', b: true } } })).toEqual({
      [KIND]: { b: true },
    });
    expect(normalizePresetOverrides({ presetOverrides: { [KIND]: true, other: { a: false } } })).toEqual({
      other: { a: false },
    });
    expect(normalizePresetOverrides({ presetOverrides: { [KIND]: ['a'] } })).toEqual({});
    expect(normalizePresetOverrides({ presetOverrides: ['a'] })).toEqual({});
    expect(normalizePresetOverrides({ presetOverrides: true })).toEqual({});
    expect(normalizePresetOverrides({})).toEqual({});
  });

  describe('retired encounter kinds', () => {
    it("moves a retired kind's choices, explicit off included, onto the kind that owns it", () => {
      expect(normalizePresetOverrides({ presetOverrides: { zuk: { zuk_inferno: false } } })).toEqual({
        inferno: { zuk_inferno: false },
      });
    });

    it("lets the retired kind's choice win per preset whatever the stored key order", () => {
      const expected = { inferno: { a: false, b: true, c: true }, [KIND]: { a: true } };
      const owned = { a: true, b: true };
      const retired = { a: false, c: true };
      expect(
        normalizePresetOverrides({ presetOverrides: { inferno: owned, zuk: retired, [KIND]: { a: true } } }),
      ).toEqual(expected);
      expect(
        normalizePresetOverrides({ presetOverrides: { zuk: retired, [KIND]: { a: true }, inferno: owned } }),
      ).toEqual(expected);
    });

    it("lets the retired kind's switch-on beat the owning kind's explicit off", () => {
      expect(
        normalizePresetOverrides({ presetOverrides: { inferno: { a: false }, zuk: { a: true, b: false } } }),
      ).toEqual({ inferno: { a: true, b: false } });
    });

    it('is idempotent', () => {
      const once = normalizePresetOverrides({ presetOverrides: { zuk: { a: false }, inferno: { a: true, b: true } } });
      expect(normalizePresetOverrides({ presetOverrides: once })).toEqual(once);
    });
  });
});
