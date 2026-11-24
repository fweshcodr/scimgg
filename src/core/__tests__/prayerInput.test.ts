import { describe, expect, it } from 'vitest';
import { PrayerType } from '../../types/simulation';
import { type PrayerInputState, type QueuedPrayerAction, resolvePrayerActions } from '../prayerInput';

const NOTHING_ON: PrayerInputState = { protection: null, offensive: null, independent: [], quickPrayersActive: false };

const QUICK_SET = [PrayerType.ProtectMagic, PrayerType.Augury] as const;

function quick(): QueuedPrayerAction {
  return { type: 'quickPrayers', selections: [...QUICK_SET] };
}

describe('resolvePrayerActions', () => {
  describe('ordering', () => {
    it.each([
      PrayerType.Piety,
      PrayerType.Rigour,
      PrayerType.Augury,
      PrayerType.EagleEye,
      PrayerType.MysticMight,
      PrayerType.Deadeye,
      PrayerType.MysticVigour,
    ])('makes Zeal mutually exclusive with %s, including quick prayers', (other) => {
      const start = {
        ...NOTHING_ON,
        offensive: other,
        protection: PrayerType.ProtectMelee,
        independent: [PrayerType.Preserve],
      };
      const zeal = resolvePrayerActions(start, [{ type: 'offensive', prayer: PrayerType.Zeal }], true);
      expect(zeal.offensive).toBe(PrayerType.Zeal);
      expect(zeal.protection).toBe(PrayerType.ProtectMelee);
      expect(zeal.independent).toEqual([PrayerType.Preserve]);
      expect(resolvePrayerActions(zeal, [{ type: 'offensive', prayer: other }], true).offensive).toBe(other);
      expect(
        resolvePrayerActions(NOTHING_ON, [{ type: 'quickPrayers', selections: [other, PrayerType.Zeal] }], true)
          .offensive,
      ).toBe(PrayerType.Zeal);
    });

    it('toggles the same clicked protection prayer twice back to the starting state', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [
          { type: 'protection', prayer: PrayerType.ProtectMelee },
          { type: 'protection', prayer: PrayerType.ProtectMelee },
        ],
        true,
      );

      expect(outcome.protection).toBeNull();
      expect(outcome.transitions).toEqual([
        { slot: 'protection', from: null, to: PrayerType.ProtectMelee },
        { slot: 'protection', from: PrayerType.ProtectMelee, to: null },
      ]);
    });

    it('applies every action in arrival order rather than keeping only the last', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [
          { type: 'protection', prayer: PrayerType.ProtectMelee },
          { type: 'protection', prayer: null },
          { type: 'protection', prayer: PrayerType.ProtectMagic },
        ],
        true,
      );

      expect(outcome.protection).toBe(PrayerType.ProtectMagic);
      expect(outcome.protectionTouched).toBe(true);
      expect(outcome.transitions).toEqual([
        { slot: 'protection', from: null, to: PrayerType.ProtectMelee },
        { slot: 'protection', from: PrayerType.ProtectMelee, to: null },
        { slot: 'protection', from: null, to: PrayerType.ProtectMagic },
      ]);
    });

    it('turning a prayer on and back off inside one batch ends off', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [
          { type: 'protection', prayer: PrayerType.ProtectMelee },
          { type: 'protection', prayer: null },
        ],
        true,
      );

      expect(outcome.protection).toBeNull();
      expect(outcome.activated).toEqual([]);
    });

    it('keeps the protection and offensive slots independent', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [
          { type: 'offensive', prayer: PrayerType.Piety },
          { type: 'protection', prayer: PrayerType.ProtectMelee },
        ],
        true,
      );

      expect(outcome.protection).toBe(PrayerType.ProtectMelee);
      expect(outcome.offensive).toBe(PrayerType.Piety);
    });
  });

  describe('drain grace period', () => {
    it('counts a genuine off→on flick as an activation', () => {
      const outcome = resolvePrayerActions(
        { protection: PrayerType.ProtectMelee, offensive: null, independent: [], quickPrayersActive: false },
        [
          { type: 'protection', prayer: null },
          { type: 'protection', prayer: PrayerType.ProtectMelee },
        ],
        true,
      );

      expect(outcome.protection).toBe(PrayerType.ProtectMelee);
      expect(outcome.activated).toEqual([PrayerType.ProtectMelee]);
    });

    it('turns off a clicked prayer that is already active', () => {
      const outcome = resolvePrayerActions(
        { protection: PrayerType.ProtectMelee, offensive: null, independent: [], quickPrayersActive: false },
        [{ type: 'protection', prayer: PrayerType.ProtectMelee }],
        true,
      );

      expect(outcome.protection).toBeNull();
      expect(outcome.activated).toEqual([]);
      expect(outcome.transitions).toEqual([{ slot: 'protection', from: PrayerType.ProtectMelee, to: null }]);
    });

    it('does not report an activation for a prayer that ends the batch switched off', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [
          { type: 'protection', prayer: PrayerType.ProtectMelee },
          { type: 'protection', prayer: PrayerType.ProtectMagic },
        ],
        true,
      );

      expect(outcome.activated).toEqual([PrayerType.ProtectMagic]);
    });
  });

  describe('quick prayers', () => {
    it('an even number of orb toggles is a no-op', () => {
      const start: PrayerInputState = {
        protection: PrayerType.ProtectMagic,
        offensive: PrayerType.Augury,
        independent: [],
        quickPrayersActive: true,
      };

      const outcome = resolvePrayerActions(start, [quick(), quick()], true);

      expect(outcome.quickPrayersActive).toBe(true);
      expect(outcome.protection).toBe(PrayerType.ProtectMagic);
      expect(outcome.offensive).toBe(PrayerType.Augury);
      expect(outcome.transitions).toEqual([
        { slot: 'protection', from: PrayerType.ProtectMagic, to: null },
        { slot: 'offensive', from: PrayerType.Augury, to: null },
        { slot: 'protection', from: null, to: PrayerType.ProtectMagic },
        { slot: 'offensive', from: null, to: PrayerType.Augury },
      ]);
    });

    it('an even number of orb toggles from off is also a no-op', () => {
      const outcome = resolvePrayerActions(NOTHING_ON, [quick(), quick()], true);

      expect(outcome.quickPrayersActive).toBe(false);
      expect(outcome.protection).toBeNull();
      expect(outcome.offensive).toBeNull();
    });

    it('an odd number of orb toggles flips the set on', () => {
      const outcome = resolvePrayerActions(NOTHING_ON, [quick(), quick(), quick()], true);

      expect(outcome.quickPrayersActive).toBe(true);
      expect(outcome.protection).toBe(PrayerType.ProtectMagic);
      expect(outcome.offensive).toBe(PrayerType.Augury);
    });

    it('an off→on orb pair counts as an activation, so a flick avoids drain', () => {
      const start: PrayerInputState = {
        protection: PrayerType.ProtectMagic,
        offensive: PrayerType.Augury,
        independent: [],
        quickPrayersActive: true,
      };

      const outcome = resolvePrayerActions(start, [quick(), quick()], true);

      expect([...outcome.activated].sort()).toEqual([PrayerType.Augury, PrayerType.ProtectMagic].sort());
    });

    it('an individual prayer click drops the quick-prayer flag', () => {
      const start: PrayerInputState = {
        protection: PrayerType.ProtectMagic,
        offensive: PrayerType.Augury,
        independent: [],
        quickPrayersActive: true,
      };

      const outcome = resolvePrayerActions(start, [{ type: 'protection', prayer: PrayerType.ProtectMelee }], true);

      expect(outcome.quickPrayersActive).toBe(false);
      expect(outcome.protection).toBe(PrayerType.ProtectMelee);
      expect(outcome.offensive).toBe(PrayerType.Augury);
    });

    it('activating an empty quick-prayer set changes nothing', () => {
      const outcome = resolvePrayerActions(NOTHING_ON, [{ type: 'quickPrayers', selections: [] }], true);

      expect(outcome.quickPrayersActive).toBe(false);
      expect(outcome.protectionTouched).toBe(false);
    });
  });

  describe('no prayer points', () => {
    it('refuses an activation and reports it as rejected', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [{ type: 'protection', prayer: PrayerType.ProtectMelee }],
        false,
      );

      expect(outcome.protection).toBeNull();
      expect(outcome.rejected).toEqual([PrayerType.ProtectMelee]);
    });

    it('still allows deactivation', () => {
      const outcome = resolvePrayerActions(
        { protection: PrayerType.ProtectMelee, offensive: null, independent: [], quickPrayersActive: false },
        [{ type: 'protection', prayer: null }],
        false,
      );

      expect(outcome.protection).toBeNull();
      expect(outcome.rejected).toEqual([]);
    });

    it('refuses to engage quick prayers', () => {
      const outcome = resolvePrayerActions(NOTHING_ON, [quick()], false);

      expect(outcome.quickPrayersActive).toBe(false);
      expect(outcome.rejected).toEqual([PrayerType.ProtectMagic]);
    });
  });
});

describe('independent prayers', () => {
  const PRESERVE_ON: PrayerInputState = { ...NOTHING_ON, independent: [PrayerType.Preserve] };

  it('toggles membership without touching either exclusive slot', () => {
    const outcome = resolvePrayerActions(
      { protection: PrayerType.ProtectMelee, offensive: PrayerType.Piety, independent: [], quickPrayersActive: false },
      [{ type: 'independent', prayer: PrayerType.Preserve }],
      true,
    );

    expect(outcome.independent).toEqual([PrayerType.Preserve]);
    expect(outcome.protection).toBe(PrayerType.ProtectMelee);
    expect(outcome.offensive).toBe(PrayerType.Piety);
    expect(outcome.transitions).toEqual([{ slot: 'independent', from: null, to: PrayerType.Preserve }]);
  });

  it('clicking a lit independent prayer turns it off', () => {
    const outcome = resolvePrayerActions(PRESERVE_ON, [{ type: 'independent', prayer: PrayerType.Preserve }], true);

    expect(outcome.independent).toEqual([]);
    expect(outcome.transitions).toEqual([{ slot: 'independent', from: PrayerType.Preserve, to: null }]);
  });

  it('lighting an overhead leaves an independent prayer burning', () => {
    const outcome = resolvePrayerActions(PRESERVE_ON, [{ type: 'protection', prayer: PrayerType.Redemption }], true);

    expect(outcome.protection).toBe(PrayerType.Redemption);
    expect(outcome.independent).toEqual([PrayerType.Preserve]);
  });

  it('refuses activation with no prayer points but still allows deactivation', () => {
    const refused = resolvePrayerActions(NOTHING_ON, [{ type: 'independent', prayer: PrayerType.Preserve }], false);
    expect(refused.independent).toEqual([]);
    expect(refused.rejected).toEqual([PrayerType.Preserve]);

    const off = resolvePrayerActions(PRESERVE_ON, [{ type: 'independent', prayer: PrayerType.Preserve }], false);
    expect(off.independent).toEqual([]);
    expect(off.rejected).toEqual([]);
  });

  it('counts a genuine off→on flick as an activation but a no-op click pair as none', () => {
    const flick = resolvePrayerActions(
      PRESERVE_ON,
      [
        { type: 'independent', prayer: PrayerType.Preserve },
        { type: 'independent', prayer: PrayerType.Preserve },
      ],
      true,
    );

    expect(flick.independent).toEqual([PrayerType.Preserve]);
    expect(flick.activated).toEqual([PrayerType.Preserve]);
  });

  describe('quick prayers', () => {
    it('treats a Preserve-only set as non-empty and engages it', () => {
      const outcome = resolvePrayerActions(
        NOTHING_ON,
        [{ type: 'quickPrayers', selections: [PrayerType.Preserve] }],
        true,
      );

      expect(outcome.quickPrayersActive).toBe(true);
      expect(outcome.independent).toEqual([PrayerType.Preserve]);
    });

    it('does not re-stamp an independent prayer the set merely retains', () => {
      const outcome = resolvePrayerActions(
        { ...PRESERVE_ON, quickPrayersActive: false },
        [{ type: 'quickPrayers', selections: [PrayerType.Preserve, PrayerType.Piety] }],
        true,
      );

      expect(outcome.independent).toEqual([PrayerType.Preserve]);
      // Preserve was already burning, so only Piety earns the drain-grace stamp.
      expect(outcome.activated).toEqual([PrayerType.Piety]);
    });

    it('turning quick prayers off clears independent membership too', () => {
      const outcome = resolvePrayerActions(
        { ...PRESERVE_ON, offensive: PrayerType.Piety, quickPrayersActive: true },
        [{ type: 'quickPrayers', selections: [PrayerType.Preserve, PrayerType.Piety] }],
        true,
      );

      expect(outcome.quickPrayersActive).toBe(false);
      expect(outcome.independent).toEqual([]);
      expect(outcome.offensive).toBeNull();
    });
  });
});
