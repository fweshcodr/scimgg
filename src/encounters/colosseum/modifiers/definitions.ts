import type { EncounterModifierDefinition } from '../../../core/encounters/encounterFactory';

export type ColosseumModifierId =
  | 'solarflare'
  | 'volatility'
  | 'doom'
  | 'frailty'
  | 'blasphemy'
  | 'myopia'
  | 'bees'
  | 'quartet'
  | 'totemic'
  | 'relentless';

/**
 * Shared Fortis Colosseum modifier definitions. Encounters choose their offered subset;
 * rules.ts owns Doom, Blasphemy, Frailty and Myopia; Relentless lives with the NPC attacks it changes
 * (src/npcs/colosseum). Solarflare/Volatility helpers own their hits;
 * Run A verifies timing/exclusions, while their uniform damage ranges remain models.
 *
 * Effect text follows the OSRS Wiki's modifier table (/w/Fortis_Colosseum/Modifiers, rev 15163385).
 */
export const COLOSSEUM_MODIFIERS: readonly EncounterModifierDefinition[] = [
  {
    id: 'solarflare',
    name: 'Solarflare',
    icon: '/assets/encounters/modifier-solarflare.png',
    summary: 'An orb circles the pillars, dealing 10–20 damage.',
    tiers: [
      'The orb moves every 2 ticks, with 7-tick corner gaps. Departure hits land one tick later.',
      'The orb moves every 2 ticks without stopping. Departure hits land one tick later.',
      'The orb moves every tick, with 2-tick corner gaps, and disables protection prayers on departure. Hits land one tick later.',
    ],
  },
  {
    id: 'volatility',
    name: 'Volatility',
    icon: '/assets/encounters/modifier-volatility.png',
    summary: 'Enemies explode when they die, dealing 16–24 damage.',
    tiers: [
      'The explosion reaches one tile beyond the enemy footprint.',
      'The explosion reaches two tiles beyond the enemy footprint.',
      "The explosion reaches two tiles beyond the enemy footprint. The center sand pool isn't simulated yet.",
    ],
  },
  {
    id: 'doom',
    name: 'Doom',
    icon: '/assets/encounters/modifier-doom.png',
    summary: 'Every damaging enemy hit adds a Doom stack; enough stacks kill you.',
    tiers: [
      'Every damaging enemy hit adds a stack of Doom; 15 stacks kill you.',
      'Doom kills at 10 stacks.',
      'Doom kills at 5 stacks.',
    ],
  },
  {
    id: 'frailty',
    name: 'Frailty',
    icon: '/assets/encounters/modifier-frailty.png',
    summary: 'Base Hitpoints are reduced and overhealing is disabled.',
    tiers: [
      'Base Hitpoints are reduced by 10%; overhealing is disabled.',
      'Base Hitpoints are reduced by 20%.',
      'Base Hitpoints are reduced by 40%.',
    ],
  },
  {
    id: 'blasphemy',
    name: 'Blasphemy',
    icon: '/assets/encounters/modifier-blasphemy.png',
    summary: 'Each full 5 damage taken drains prayer points, except Solarflare, Volatility and Bees! hits.',
    tiers: [
      'Drain 1 prayer point per full 5 damage taken, excluding Solarflare, Volatility and Bees!.',
      'Drain 2 prayer points per full 5 damage taken, excluding Solarflare, Volatility and Bees!.',
      'Drain 3 prayer points per full 5 damage taken, excluding Solarflare, Volatility and Bees!.',
    ],
  },
  {
    id: 'myopia',
    name: 'Myopia',
    icon: '/assets/encounters/modifier-myopia.png',
    summary: 'Attack range is reduced; manually cast spells are unaffected.',
    tiers: [
      'Attack range is reduced by 2 tiles; manually cast spells are unaffected.',
      'Attack range is reduced by 4 tiles; manually cast spells are unaffected.',
      'Attack range is reduced by 6 tiles; manually cast spells are unaffected.',
    ],
  },
  {
    id: 'bees',
    name: 'Bees!',
    icon: '/assets/encounters/modifier-bees.png',
    // Wiki Modifiers oldid=15163385: swarms pursue and sting; higher tiers add swarms.
    summary: 'Bee swarms pursue you and sting when they catch you. Defeated swarms return after a delay.',
    tiers: ['1 bee swarm', '2 bee swarms', '3 bee swarms'],
  },
  {
    id: 'quartet',
    name: 'Quartet',
    icon: '/assets/encounters/modifier-quartet.png',
    // Wiki /w/Fortis_Colosseum/Modifiers (revision not pinned): "An extra random Fremennik Warbander
    // spawns every wave"; a single tier.
    summary: 'A random Fremennik warbander joins the fight.',
    tiers: ['One berserker, archer or seer, chosen at random, sticks beside you and attacks every 6 ticks.'],
  },
  {
    id: 'totemic',
    name: 'Totemic',
    icon: '/assets/encounters/modifier-totemic.png',
    // Wiki /w/Fortis_Colosseum/Modifiers rev 15163385: a single tier. Heal amounts are per encounter.
    summary: 'A 1 HP healing totem appears beside a wounded enemy and heals it.',
    tiers: [
      'At half HP a totem appears beside the enemy and heals it every 6 ticks while it is hurt. A destroyed totem returns 2 minutes later.',
    ],
  },
  {
    id: 'relentless',
    name: 'Relentless',
    icon: '/assets/encounters/modifier-relentless.png',
    // Wiki /w/Fortis_Colosseum/Modifiers (revision not pinned). Applied to enemies' own attacks, not
    // to modifier or arena hazards; Sol's triple gets the max-hit bonus, his regular AoE does not
    // (npcs/colosseum/constants.ts).
    summary: 'Enemies bypass part of your Defence level and hit harder.',
    tiers: [
      'Enemies bypass 33% of your Defence level, and their max hit is increased by 1.',
      'Enemies bypass 66% of your Defence level, and their max hit is increased by 3.',
      'Enemies ignore accuracy checks entirely, and their max hit is increased by 6.',
    ],
  },
];
