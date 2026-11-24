import { describe, expect, it } from 'vitest';
import type { PendingConflictionAttack } from '../confliction';
import {
  getConflictionAccuracyMode,
  resolveConflictionAttackIdentity,
  updatePendingConflictionAttack,
} from '../confliction';

const FIRE_STRIKE: PendingConflictionAttack = {
  kind: 'spell',
  spellId: 'Fire Strike',
  targetId: 'target',
};

describe('Confliction attack identity', () => {
  it('identifies an eligible spell by its exact spell and target', () => {
    const identity = resolveConflictionAttackIdentity({
      equipment: { hands: 31106 },
      formulaStyle: 'magic',
      attackResources: { kind: 'spell', source: 'none', spellId: 'Ice Barrage' },
      targetId: 'target',
    });

    expect(identity).toEqual({ kind: 'spell', spellId: 'Ice Barrage', targetId: 'target' });
  });

  it.each([
    { label: 'charged', weaponId: 31113 },
    { label: 'partially charged', weaponId: 11907 },
  ])('identifies $label staff attacks by exact weapon and target', ({ weaponId }) => {
    const identity = resolveConflictionAttackIdentity({
      equipment: { hands: 31106, weapon: weaponId },
      formulaStyle: 'magic',
      attackResources: { kind: 'none', source: 'none' },
      targetId: 'target',
    });

    expect(identity).toEqual({ kind: 'charged_staff', weaponId, targetId: 'target' });
  });

  it.each([27662, 31115])('rejects explicitly uncharged powered weapon %i', (weaponId) => {
    const identity = resolveConflictionAttackIdentity({
      equipment: { hands: 31106, weapon: weaponId },
      formulaStyle: 'magic',
      attackResources: { kind: 'none', source: 'none' },
      targetId: 'target',
    });

    expect(identity).toBeNull();
  });

  it('allows a standard spell cast while holding an uncharged one-handed powered weapon', () => {
    const identity = resolveConflictionAttackIdentity({
      equipment: { hands: 31106, weapon: 27662 },
      formulaStyle: 'magic',
      attackResources: { kind: 'spell', source: 'none', spellId: 'Fire Strike' },
      targetId: 'target',
    });

    expect(identity).toEqual({ kind: 'spell', spellId: 'Fire Strike', targetId: 'target' });
  });

  it.each([
    {
      label: 'Twisted bow spell',
      weapon: 20997,
      resources: { kind: 'spell', source: 'none', spellId: 'Fire Strike' } as const,
    },
    { label: 'Tumeken charged-staff attack', weapon: 27275, resources: { kind: 'none', source: 'none' } as const },
  ])('rejects the two-handed $label', ({ weapon, resources }) => {
    const identity = resolveConflictionAttackIdentity({
      equipment: { hands: 31106, weapon },
      formulaStyle: 'magic',
      attackResources: resources,
      targetId: 'target',
    });

    expect(identity).toBeNull();
  });

  it('rejects an otherwise eligible spell without the gauntlets equipped', () => {
    const identity = resolveConflictionAttackIdentity({
      equipment: {},
      formulaStyle: 'magic',
      attackResources: { kind: 'spell', source: 'none', spellId: 'Fire Strike' },
      targetId: 'target',
    });

    expect(identity).toBeNull();
  });
});

describe('Confliction pending state', () => {
  it('re-arms after a repeated matching miss', () => {
    const pending = updatePendingConflictionAttack(FIRE_STRIKE, FIRE_STRIKE, false);

    expect(pending).toEqual(FIRE_STRIKE);
    expect(getConflictionAccuracyMode(pending, FIRE_STRIKE)).toBe('double_roll');
  });

  it.each([
    {
      label: 'spell',
      current: { kind: 'spell', spellId: 'Ice Barrage', targetId: 'target' } as const,
    },
    {
      label: 'target',
      current: { kind: 'spell', spellId: 'Fire Strike', targetId: 'other-target' } as const,
    },
  ])('isolates a changed $label without consuming the pending miss', ({ current }) => {
    const pending = updatePendingConflictionAttack(FIRE_STRIKE, current, true);

    expect(getConflictionAccuracyMode(FIRE_STRIKE, current)).toBe('single_roll');
    expect(pending).toEqual(FIRE_STRIKE);
  });

  it('preserves pending state across an ineligible intervening attack', () => {
    const pending = updatePendingConflictionAttack(FIRE_STRIKE, null, true);

    expect(getConflictionAccuracyMode(FIRE_STRIKE, null)).toBe('single_roll');
    expect(pending).toEqual(FIRE_STRIKE);
  });

  it('isolates different charged-staff identities', () => {
    const eye: PendingConflictionAttack = { kind: 'charged_staff', weaponId: 31113, targetId: 'target' };
    const trident: PendingConflictionAttack = { kind: 'charged_staff', weaponId: 11905, targetId: 'target' };

    expect(getConflictionAccuracyMode(eye, trident)).toBe('single_roll');
    expect(updatePendingConflictionAttack(eye, trident, true)).toEqual(eye);
  });
});
