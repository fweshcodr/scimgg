import { describe, expect, it } from 'vitest';
import {
  combatSuppliesEqual,
  createEmptyCombatSupplies,
  normalizeCombatSupplies,
  type RunePouch,
  runePouchEqual,
  withRunePouchSlot,
} from '../encounterLoadout';

describe('normalizeCombatSupplies', () => {
  it('preserves four independently typed slots for a divine rune pouch', () => {
    const runePouch = {
      kind: 'divine',
      slots: [{ id: 555 }, { id: 565 }, { id: 560 }, { id: 9075 }],
    };

    expect(normalizeCombatSupplies({ runePouch }).runePouch).toEqual(runePouch);
  });

  it('keeps only the item ids of stored supplies', () => {
    const stored = {
      equippedAmmo: { id: 11212, quantity: 5000 },
      quiverAmmo: { id: 9242, quantity: 807 },
      runePouch: {
        kind: 'standard',
        slots: [{ id: 555, quantity: 8000 }, { id: 565, quantity: 8000 }, null],
      },
      blowpipe: { id: 11230, quantity: 3000 },
      selectedSpell: null,
      spellbook: 'arceuus',
    };

    const normalized = normalizeCombatSupplies(stored);

    expect(normalized.equippedAmmo).toEqual({ id: 11212 });
    expect(normalized.quiverAmmo).toEqual({ id: 9242 });
    expect(normalized.runePouch).toEqual({ kind: 'standard', slots: [{ id: 555 }, { id: 565 }, null] });
    expect(normalized.blowpipe).toEqual({ id: 11230 });
  });

  it('uses empty fields when the stored supplies value is not an object', () => {
    expect(normalizeCombatSupplies('malformed')).toEqual({
      equippedAmmo: null,
      quiverAmmo: null,
      runePouch: null,
      blowpipe: null,
      selectedSpell: null,
      spellbook: 'arceuus',
    });
  });
});

const STANDARD: RunePouch = { kind: 'standard', slots: [{ id: 560 }, { id: 554 }, null] };
const DIVINE: RunePouch = { kind: 'divine', slots: [{ id: 560 }, { id: 554 }, { id: 565 }, { id: 30843 }] };

describe('runePouchEqual', () => {
  it('holds for two pouches carrying the same runes in the same order', () => {
    expect(runePouchEqual(STANDARD, { kind: 'standard', slots: [{ id: 560 }, { id: 554 }, null] })).toBe(true);
    expect(runePouchEqual(null, null)).toBe(true);
  });

  it('separates a pouch from no pouch at all', () => {
    expect(runePouchEqual(STANDARD, null)).toBe(false);
    expect(runePouchEqual(null, DIVINE)).toBe(false);
  });

  it('separates the two pouch kinds even when the first three runes agree', () => {
    expect(
      runePouchEqual(
        { kind: 'standard', slots: [{ id: 560 }, { id: 554 }, { id: 565 }] },
        { kind: 'divine', slots: [{ id: 560 }, { id: 554 }, { id: 565 }, null] },
      ),
    ).toBe(false);
  });

  it('separates pouches that differ in one slot, empty included', () => {
    expect(runePouchEqual(STANDARD, { kind: 'standard', slots: [{ id: 560 }, { id: 555 }, null] })).toBe(false);
    expect(runePouchEqual(STANDARD, { kind: 'standard', slots: [{ id: 560 }, { id: 554 }, { id: 565 }] })).toBe(false);
    expect(runePouchEqual(DIVINE, { kind: 'divine', slots: [{ id: 560 }, { id: 554 }, { id: 565 }, null] })).toBe(
      false,
    );
  });

  it('is the rule combatSuppliesEqual applies to the pouch', () => {
    const base = createEmptyCombatSupplies();

    expect(combatSuppliesEqual({ ...base, runePouch: STANDARD }, { ...base, runePouch: STANDARD })).toBe(true);
    expect(combatSuppliesEqual({ ...base, runePouch: STANDARD }, { ...base, runePouch: DIVINE })).toBe(false);
    expect(combatSuppliesEqual({ ...base, runePouch: STANDARD }, base)).toBe(false);
  });
});

describe('withRunePouchSlot', () => {
  it('replaces one rune and leaves the other slots alone', () => {
    expect(withRunePouchSlot(STANDARD, 1, { id: 565 })).toEqual({
      kind: 'standard',
      slots: [{ id: 560 }, { id: 565 }, null],
    });
  });

  it('clears a slot without collapsing the pouch', () => {
    expect(withRunePouchSlot(DIVINE, 3, null)).toEqual({
      kind: 'divine',
      slots: [{ id: 560 }, { id: 554 }, { id: 565 }, null],
    });
  });

  it('keeps each kind at its own slot count', () => {
    expect(withRunePouchSlot(STANDARD, 0, { id: 566 }).slots).toHaveLength(3);
    expect(withRunePouchSlot(DIVINE, 0, { id: 566 }).slots).toHaveLength(4);
  });

  it('leaves the pouch unchanged for an index it does not have', () => {
    expect(withRunePouchSlot(STANDARD, 3, { id: 566 })).toEqual(STANDARD);
  });

  it('returns a new pouch rather than editing the one it was given', () => {
    const edited = withRunePouchSlot(STANDARD, 0, { id: 566 });

    expect(edited).not.toBe(STANDARD);
    expect(STANDARD.slots[0]).toEqual({ id: 560 });
  });
});
