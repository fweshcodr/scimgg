import type { PlayerActor } from '../../../actors/PlayerActor';
import { useSpecialAttack as spendSpecialAttackEnergy } from '../../../timers';
import { getSpecialAttackDef } from './registry';

/** Shared, non-mutating affordability and energy transition for execution and input prediction. */
export function resolveInstantSpecialActivation(
  weaponId: number | undefined,
  specialAttack: PlayerActor['specialAttack'],
  energyCostMultiplier = 1,
): { specialAttack: PlayerActor['specialAttack']; activated: boolean } | null {
  const definition = weaponId === undefined ? undefined : getSpecialAttackDef(weaponId);
  if (definition?.instantEffect !== 'powerOfDeath') return null;
  const spent = spendSpecialAttackEnergy(
    specialAttack,
    Math.max(0, Math.floor((definition.energyCost ?? 100) * energyCostMultiplier)),
  );
  return { specialAttack: spent ?? specialAttack, activated: spent !== null };
}

/** Returns whether the toggle belongs to an instant special, including an unaffordable one. */
export function activateInstantSpecial(player: PlayerActor, tick: number, energyCostMultiplier = 1): boolean {
  const activation = resolveInstantSpecialActivation(
    player.equipment.weapon,
    player.specialAttack,
    energyCostMultiplier,
  );
  if (activation === null) return false;
  player.isSpecialAttackActive = false;
  player.specialAttack = activation.specialAttack;
  if (!activation.activated) return true;
  // /w/Staff_of_the_dead#Special_attack: one minute, no attack and no stacking reduction.
  player.powerOfDeathUntilTick = tick + 100;
  return true;
}

export function hasPowerOfDeathStaff(player: PlayerActor): boolean {
  return (
    player.equipment.weapon !== undefined &&
    getSpecialAttackDef(player.equipment.weapon)?.instantEffect === 'powerOfDeath'
  );
}

export function powerOfDeathMeleeMultiplier(player: PlayerActor, tick: number): number {
  return tick < (player.powerOfDeathUntilTick ?? 0) && hasPowerOfDeathStaff(player) ? 0.5 : 1;
}

export function endPowerOfDeathOnDamage(player: PlayerActor, damage: number): void {
  if (damage > 0 && !hasPowerOfDeathStaff(player)) player.powerOfDeathUntilTick = undefined;
}
