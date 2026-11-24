import { type EffectOp, EMPTY_VIAL_ID, type ItemActionDef } from './itemEffects';

const POTION_DELAY_TICKS = 3;

function potionDoseChain(
  ids: readonly [number, number, number, number],
  effects: () => EffectOp[],
): Record<number, ItemActionDef> {
  const [dose4Id, dose3Id, dose2Id, dose1Id] = ids;
  return {
    [dose4Id]: {
      track: 'potion',
      delayTicks: POTION_DELAY_TICKS,
      consume: { type: 'replace', withId: dose3Id },
      effects: effects(),
    },
    [dose3Id]: {
      track: 'potion',
      delayTicks: POTION_DELAY_TICKS,
      consume: { type: 'replace', withId: dose2Id },
      effects: effects(),
    },
    [dose2Id]: {
      track: 'potion',
      delayTicks: POTION_DELAY_TICKS,
      consume: { type: 'replace', withId: dose1Id },
      effects: effects(),
    },
    [dose1Id]: {
      track: 'potion',
      delayTicks: POTION_DELAY_TICKS,
      consume: { type: 'replace', withId: EMPTY_VIAL_ID },
      effects: effects(),
    },
  };
}

export const ZUK_CONSUMABLE_ACTIONS: Readonly<Record<number, ItemActionDef>> = {
  ...potionDoseChain([22461, 22464, 22467, 22470], () => [
    { op: 'boost_formula', stat: 'ranged', scaleStat: 'ranged', percent: 0.1, flat: 4 },
    { op: 'boost_formula', stat: 'defence', scaleStat: 'defence', percent: 0.15, flat: 5 },
  ]),
  // https://oldschool.runescape.wiki/w/Stamina_potion: 20% energy and two minutes per dose.
  ...potionDoseChain([12625, 12627, 12629, 12631], () => [
    { op: 'restore_run', amount: 2000 },
    { op: 'apply_timed_effect', effectType: 'stamina', durationTicks: 200 },
  ]),
  ...potionDoseChain([30125, 30128, 30131, 30134], () => [
    { op: 'apply_timed_effect', effectType: 'prayer_regeneration', durationTicks: 800 },
  ]),
  // https://oldschool.runescape.wiki/w/Armadyl_brew?oldid=15297899: heals and boosts Ranged from BASE
  // levels; drains the other four from each one's CURRENT level.
  ...potionDoseChain([31650, 31653, 31656, 31659], () => [
    { op: 'overheal_formula', scaleStat: 'hitpoints', percent: 0.1, flat: 2 },
    { op: 'boost_formula', stat: 'ranged', scaleStat: 'ranged', percent: 0.1, flat: 4 },
    { op: 'drain_formula', stat: 'attack', percent: 0.1, flat: 2 },
    { op: 'drain_formula', stat: 'strength', percent: 0.1, flat: 2 },
    { op: 'drain_formula', stat: 'defence', percent: 0.1, flat: 2 },
    { op: 'drain_formula', stat: 'magic', percent: 0.1, flat: 2 },
  ]),
};
