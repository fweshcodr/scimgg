import { describe, expect, it } from 'vitest';
import {
  createDefaultSpecialAttack,
  createDefaultTimers,
  DEATH_CHARGE_COOLDOWN_TICKS,
  DEATH_CHARGE_DURATION_TICKS,
  DEATH_CHARGE_SPEC_RESTORE,
  SPEC_REGEN_TICKS,
  SPEC_REGEN_TICKS_LIGHTBEARER,
} from '../../types/playerState';
import { castDeathCharge, consumeDeathCharge, syncLightbearer, tickCombatTimers, tickSpecialAttack } from '../timers';

/** Ticks between energy gains, from a bar that starts empty. */
function regenIntervals(lightbearer: boolean, ticks: number): number[] {
  let state = { ...createDefaultSpecialAttack(), energy: 0 };
  state = syncLightbearer(state, lightbearer);
  const gains: number[] = [];
  let last = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    const before = state.energy;
    state = tickSpecialAttack(state);
    if (state.energy > before) {
      gains.push(tick - last);
      last = tick;
    }
  }
  return gains;
}

describe('special attack energy regeneration', () => {
  it('restores 10% every 50 ticks bare, and every 25 with a Lightbearer', () => {
    // "The special attack bar recovers at a rate of 10% per 50 ticks... When wearing a
    // Lightbearer, the special attack bar will recover at a rate of 10% per 25 ticks" (wiki, Game
    // tick).
    expect(regenIntervals(false, 160)).toEqual([SPEC_REGEN_TICKS, SPEC_REGEN_TICKS, SPEC_REGEN_TICKS]);
    expect(regenIntervals(true, 160)).toEqual(Array(6).fill(SPEC_REGEN_TICKS_LIGHTBEARER));
  });

  it('caps at 100 rather than overshooting', () => {
    let state = { ...createDefaultSpecialAttack(), energy: 95, regenTickCounter: 1 };
    state = tickSpecialAttack(state);
    expect(state.energy).toBe(100);
  });

  it('runs no cycle while the bar is full, and starts a fresh one when it drops', () => {
    // The capture holds 100% for 200+ ticks without a single regen, then specs from full on t8843
    // and regenerates on t8868 — exactly 25 later, not 24. Reproducing that requires the SPEND
    // tick itself not to decrement, which is why the caller passes the energy as it stood at the
    // START of the tick rather than what is left after the special was paid for.
    let state = { ...createDefaultSpecialAttack(), energy: 100, lightbearerEquipped: true, regenTickCounter: 3 };
    for (let tick = 0; tick < 40; tick++) state = tickSpecialAttack(state, 100);
    expect(state.energy).toBe(100);
    expect(state.regenTickCounter).toBe(SPEC_REGEN_TICKS_LIGHTBEARER);

    state = { ...state, energy: 75 };
    let fired: number | null = null;
    for (let tick = 1; tick <= 60 && fired === null; tick++) {
      const before = state.energy;
      state = tickSpecialAttack(state, tick === 1 ? 100 : 75);
      if (state.energy > before) fired = tick;
    }
    expect(fired).toBe(1 + SPEC_REGEN_TICKS_LIGHTBEARER);
  });

  it('resets the timer on unequip, but on equip only past the halfway point', () => {
    // "Equipping the ring will cause the special attack energy restoration timer to reset only if
    // natural regeneration is below half. Unequipping the ring will always cause the special
    // attack energy restoration timer to reset" (wiki, Lightbearer). The counter runs DOWN, so
    // "below half" is a counter still above half.
    const early = syncLightbearer({ ...createDefaultSpecialAttack(), regenTickCounter: 40 }, true);
    expect(early.regenTickCounter).toBe(SPEC_REGEN_TICKS_LIGHTBEARER);

    const late = syncLightbearer({ ...createDefaultSpecialAttack(), regenTickCounter: 20 }, true);
    expect(late.regenTickCounter).toBe(20);

    const removed = syncLightbearer(
      { ...createDefaultSpecialAttack(), lightbearerEquipped: true, regenTickCounter: 3 },
      false,
    );
    expect(removed.regenTickCounter).toBe(SPEC_REGEN_TICKS);
  });

  it('is a no-op when the ring has not changed', () => {
    const state = { ...createDefaultSpecialAttack(), regenTickCounter: 7 };
    expect(syncLightbearer(state, false)).toBe(state);
  });
});

describe('Death Charge', () => {
  it('arms one proc, or two with the rite of vile transference (a double death charge)', () => {
    expect(castDeathCharge(createDefaultTimers(), false)?.deathChargeProcsRemaining).toBe(1);
    expect(castDeathCharge(createDefaultTimers(), true)?.deathChargeProcsRemaining).toBe(2);
  });

  it('sets the one-minute window and the one-minute cooldown', () => {
    const cast = castDeathCharge(createDefaultTimers(), true);
    expect(cast?.deathChargeActiveTicks).toBe(DEATH_CHARGE_DURATION_TICKS);
    expect(cast?.deathChargeCooldownTicks).toBe(DEATH_CHARGE_COOLDOWN_TICKS);
  });

  it('refuses to recast while on cooldown', () => {
    expect(castDeathCharge({ ...createDefaultTimers(), deathChargeCooldownTicks: 1 }, true)).toBeNull();
  });

  it('restores 15% per kill and spends exactly one proc each time', () => {
    const special = { ...createDefaultSpecialAttack(), energy: 40 };
    const timers = castDeathCharge(createDefaultTimers(), true)!;

    const first = consumeDeathCharge(special, timers)!;
    expect(first.special.energy).toBe(40 + DEATH_CHARGE_SPEC_RESTORE);
    expect(first.timers.deathChargeProcsRemaining).toBe(1);

    const second = consumeDeathCharge(first.special, first.timers)!;
    expect(second.special.energy).toBe(40 + 2 * DEATH_CHARGE_SPEC_RESTORE);
    expect(second.timers.deathChargeProcsRemaining).toBe(0);
    expect(second.timers.deathChargeActiveTicks).toBe(0);

    expect(consumeDeathCharge(second.special, second.timers)).toBeNull();
  });

  it('spends a proc on a kill at full energy, restoring nothing', () => {
    // "Killing a monster while the player's special attack bar is already at 100% will trigger the
    // active effect of the spell without actually restoring any special attack energy" (wiki,
    // Death Charge). Crediting first and only then deciding whether a proc was spent would hand
    // the player a free extra kill.
    const special = { ...createDefaultSpecialAttack(), energy: 100 };
    const result = consumeDeathCharge(special, castDeathCharge(createDefaultTimers(), false)!)!;
    expect(result.special.energy).toBe(100);
    expect(result.timers.deathChargeProcsRemaining).toBe(0);
  });

  it('drops its unspent procs when the window expires', () => {
    let timers = castDeathCharge(createDefaultTimers(), true)!;
    for (let tick = 0; tick < DEATH_CHARGE_DURATION_TICKS; tick++) {
      timers = tickCombatTimers(timers);
    }
    expect(timers.deathChargeActiveTicks).toBe(0);
    expect(timers.deathChargeProcsRemaining).toBe(0);
    expect(consumeDeathCharge(createDefaultSpecialAttack(), timers)).toBeNull();
  });

  it('does nothing without a cast', () => {
    expect(consumeDeathCharge(createDefaultSpecialAttack(), createDefaultTimers())).toBeNull();
  });
});
