import { describe, expect, it } from 'vitest';
import { type EffectOp, getPrepotEffects, ITEM_ACTIONS, isPrepottable } from '../../data/itemEffects';
import type { PoisonState } from '../../types/playerState';
import { createDefaultPoisonState, createDefaultStats, POISON_TICK_INTERVAL } from '../../types/playerState';
import { createDefaultPrayerState } from '../../types/simulation';
import { applyEffectOp, type ItemActionState } from '../itemActions';
import { tickPoisonState } from '../timers';

function createPoisonState(overrides: Partial<PoisonState> = {}): PoisonState {
  return { ...createDefaultPoisonState(), ...overrides };
}

function createTestState(overrides: Partial<ItemActionState> = {}): ItemActionState {
  return {
    playerHP: 99,
    maxHP: 99,
    stats: createDefaultStats(),
    poisonState: createDefaultPoisonState(),
    prayerState: createDefaultPrayerState(),
    runEnergy: { energy: 10000 },
    specialAttack: { energy: 100, regenTickCounter: 50, lightbearerEquipped: false },
    combatTimers: {
      markOfDarknessCooldownTicks: 0,
      markOfDarknessActiveTicks: 0,
      deathChargeCooldownTicks: 0,
      deathChargeActiveTicks: 0,
      deathChargeProcsRemaining: 0,
      saturatedHeartCooldownTicks: 0,
      surgePotionCooldownTicks: 0,
      statBoostDecayTick: 100,
      statBoostDecayExtended: false,
      statRecoveryTick: 100,
      statDecayLocks: {},
      hpRegenTick: 101,
    },
    cooldownTracks: { food: 0, potion: 0, combo_food: 0 },
    activeEffects: [],
    currentTick: 0,
    ...overrides,
  };
}

describe('Poison/Venom System', () => {
  describe('tickPoisonState', () => {
    it('returns zero damage and unchanged state when not poisoned', () => {
      const state = createPoisonState({ poisonVarp: 0, poisonTickCounter: 17 });

      const result = tickPoisonState(state);

      expect(result.damage).toBe(0);
      expect(result.state).toEqual(state);
      expect(result.state).not.toBe(state);
    });

    it('uses the correct poison damage formula across boundaries', () => {
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1 })).damage).toBe(1);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 5 })).damage).toBe(1);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 6 })).damage).toBe(2);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 20 })).damage).toBe(4);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 30 })).damage).toBe(6);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 100 })).damage).toBe(20);
    });

    it('decrements poison by one varp each tick', () => {
      expect(tickPoisonState(createPoisonState({ poisonVarp: 10 })).state.poisonVarp).toBe(9);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1 })).state.poisonVarp).toBe(0);
    });

    it('naturally cures poison at varp 1 after dealing 1 damage', () => {
      const result = tickPoisonState(createPoisonState({ poisonVarp: 1 }));

      expect(result.damage).toBe(1);
      expect(result.state.poisonVarp).toBe(0);
    });

    it('uses the correct venom damage formula including cap', () => {
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1_000_000 })).damage).toBe(6);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1_000_001 })).damage).toBe(8);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1_000_004 })).damage).toBe(14);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1_000_007 })).damage).toBe(20);
      expect(tickPoisonState(createPoisonState({ poisonVarp: 1_000_010 })).damage).toBe(20);
    });

    it('increments venom severity by one varp each tick', () => {
      const result = tickPoisonState(createPoisonState({ poisonVarp: 1_000_000 }));

      expect(result.damage).toBe(6);
      expect(result.state.poisonVarp).toBe(1_000_001);
    });

    it('never lets venom self-cure even after many ticks', () => {
      let state = createPoisonState({ poisonVarp: 1_000_000 });

      for (let i = 0; i < 50; i += 1) {
        state = tickPoisonState(state).state;
      }

      expect(state.poisonVarp).toBeGreaterThanOrEqual(1_000_000);
    });

    it('counts immunity down toward zero', () => {
      const result = tickPoisonState(createPoisonState({ poisonVarp: -20 }));

      expect(result.damage).toBe(0);
      expect(result.state.poisonVarp).toBe(-19);
    });

    it('expires immunity from -1 to 0', () => {
      const result = tickPoisonState(createPoisonState({ poisonVarp: -1 }));

      expect(result.damage).toBe(0);
      expect(result.state.poisonVarp).toBe(0);
    });

    it('never lets immunity go positive', () => {
      const result = tickPoisonState(createPoisonState({ poisonVarp: -1 }));

      expect(result.state.poisonVarp).toBe(0);
      expect(result.state.poisonVarp).toBe(Math.min(0, -1 + 1));
    });
  });

  describe('cure_poison effect', () => {
    it('cures active poison and grants immunity', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 50 }) });
      const op: EffectOp = { op: 'cure_poison', immunityTicks: 600 };

      const result = applyEffectOp(op, state);

      expect(result.poisonState.poisonVarp).toBe(-20);
    });

    it('grants immunity when not poisoned', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 0 }) });
      const op: EffectOp = { op: 'cure_poison', immunityTicks: 600 };

      const result = applyEffectOp(op, state);

      expect(result.poisonState.poisonVarp).toBe(-20);
    });

    it('replaces shorter immunity with the cure immunity duration', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: -5 }) });
      const op: EffectOp = { op: 'cure_poison', immunityTicks: 600 };

      const result = applyEffectOp(op, state);

      expect(result.poisonState.poisonVarp).toBe(-20);
    });

    it('downgrades venom to equivalent poison then cures to immunity', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_000 }) });
      const downgradeResult = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(downgradeResult.poisonState.poisonVarp).toBe(30);
      expect(Math.ceil(downgradeResult.poisonState.poisonVarp / 5)).toBe(6);

      const cureResult = applyEffectOp({ op: 'cure_poison', immunityTicks: 600 }, state);

      expect(cureResult.poisonState.poisonVarp).toBe(-20);
    });

    it('preserves venom damage when downgrading before cure', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_004 }) });
      const downgradeResult = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(downgradeResult.poisonState.poisonVarp).toBe(70);
      expect(Math.ceil(downgradeResult.poisonState.poisonVarp / 5)).toBe(14);

      const cureResult = applyEffectOp({ op: 'cure_poison', immunityTicks: 600 }, state);

      expect(cureResult.poisonState.poisonVarp).toBe(-20);
    });

    it('converts immunity ticks to poison varp units with ceiling division', () => {
      const state = createTestState();
      const op: EffectOp = { op: 'cure_poison', immunityTicks: 1200 };

      const result = applyEffectOp(op, state);

      expect(result.poisonState.poisonVarp).toBe(-40);
      expect(result.poisonState.poisonVarp).toBe(-Math.ceil(1200 / POISON_TICK_INTERVAL));
    });

    it('creates an immune state that blocks future poison application attempts', () => {
      const state = createTestState();
      const result = applyEffectOp({ op: 'cure_poison', immunityTicks: 600 }, state);

      expect(result.poisonState.poisonVarp).toBeLessThan(0);
      expect(result.poisonState.poisonVarp).toBe(-20);
    });
  });

  describe('reduce_poison effect', () => {
    it('reduces poison severity by the requested amount', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 50 }) });
      const op: EffectOp = { op: 'reduce_poison', amount: 1 };

      const result = applyEffectOp(op, state);

      expect(result.poisonState.poisonVarp).toBe(49);
    });

    it('reduces poison to zero when the amount exactly matches severity', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 1 }, state);

      expect(result.poisonState.poisonVarp).toBe(0);
    });

    it('never reduces poison below zero', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 5 }, state);

      expect(result.poisonState.poisonVarp).toBe(0);
    });

    it('is a no-op with the same reference when already cured', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 0 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 1 }, state);

      expect(result).toBe(state);
    });

    it('is a no-op with the same reference when immune', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: -10 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 1 }, state);

      expect(result).toBe(state);
    });

    it('downgrades venom to poison before reducing', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_000 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 1 }, state);

      expect(result.poisonState.poisonVarp).toBe(29);
      expect(Math.ceil(result.poisonState.poisonVarp / 5)).toBe(6);
    });
  });

  describe('venom-to-poison downgrade', () => {
    it('converts 1000000 venom to poison varp 30 with identical damage', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_000 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(result.poisonState.poisonVarp).toBe(30);
      expect(Math.ceil(result.poisonState.poisonVarp / 5)).toBe(6);
    });

    it('converts 1000003 venom to poison varp 60 with identical damage', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_003 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(result.poisonState.poisonVarp).toBe(60);
      expect(Math.ceil(result.poisonState.poisonVarp / 5)).toBe(12);
    });

    it('converts 1000007 venom to poison varp 100 with capped damage preserved', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_007 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(result.poisonState.poisonVarp).toBe(100);
      expect(Math.ceil(result.poisonState.poisonVarp / 5)).toBe(20);
    });

    it('keeps venom cap when converting values above the cap threshold', () => {
      const state = createTestState({ poisonState: createPoisonState({ poisonVarp: 1_000_010 }) });

      const result = applyEffectOp({ op: 'reduce_poison', amount: 0 }, state);

      expect(result.poisonState.poisonVarp).toBe(100);
      expect(Math.ceil(result.poisonState.poisonVarp / 5)).toBe(20);
    });
  });

  describe('PoisonState defaults', () => {
    it('creates the default poison state', () => {
      expect(createDefaultPoisonState()).toEqual({ poisonVarp: 0, poisonTickCounter: 30, startedTick: null });
      expect(createDefaultPoisonState().poisonTickCounter).toBe(POISON_TICK_INTERVAL);
    });
  });

  describe('prepot integration', () => {
    it('treats sanfew serum as prepottable because of cure_poison', () => {
      expect(isPrepottable(ITEM_ACTIONS[10925])).toBe(true);
      expect(getPrepotEffects(ITEM_ACTIONS[10925].effects)).toEqual([{ op: 'cure_poison', immunityTicks: 600 }]);
    });

    it('treats antidote++ as prepottable because of cure_poison', () => {
      expect(isPrepottable(ITEM_ACTIONS[5952])).toBe(true);
      expect(getPrepotEffects(ITEM_ACTIONS[5952].effects)).toEqual([{ op: 'cure_poison', immunityTicks: 1200 }]);
    });

    it('does not treat guthix rest as prepottable because reduce_poison is excluded', () => {
      expect(isPrepottable(ITEM_ACTIONS[4417])).toBe(false);
      expect(getPrepotEffects(ITEM_ACTIONS[4417].effects)).toEqual([]);
    });
  });
});
