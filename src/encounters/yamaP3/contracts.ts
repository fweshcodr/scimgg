import type { EncounterVariant } from '../../core/encounters/variantTypes';

/**
 * Every encounter kind the Yama fight registers: the base phase-3 fight plus one kind per
 * contract. Declared in the Yama domain rather than core, because these are Yama's kinds.
 */
export type YamaEncounterKind =
  | 'yama_p3'
  | 'yama_p3_divine'
  | 'yama_p3_forfeit_breath'
  | 'yama_p3_sensory'
  | 'yama_p3_bloodied'
  | 'yama_p3_glyphic';

/**
 * Yama boss contracts — fight modifiers presented to Yama before the encounter.
 *
 * See: https://oldschool.runescape.wiki/w/Yama#Contracts
 */
export const YAMA_CONTRACTS: EncounterVariant[] = [
  {
    id: 'no_contract',
    encounterKind: 'yama_p3',
    name: 'No Contract',
    subtitle: 'The standard Yama encounter.',
    available: true,
    presetsKey: 'yama_p3',
    // No wikiUrl: the base fight's page is the one the panel's own encounter link already points
    // at, and two links to the same page read as a mistake.
  },

  {
    id: 'forfeit_breath',
    encounterKind: 'yama_p3_forfeit_breath',
    name: 'Forfeit Breath',
    subtitle: 'Yama drains run energy passively and on damage. Lose at 0 run energy. Rewards purifying sigil (top).',
    available: true,
    group: 'Sigil',
    terms: [
      'Your run energy passively drains by 1% every 4 ticks.',
      'Yama drains run energy equal to the damage he deals.',
      'You die if your run energy reaches 0%.',
      'Fire Streaks and Shadow Waves in phases 1 and 2 behave as if one phase ahead.',
    ],
    reward: 'Purifying sigil (top)',
    wikiUrl: 'https://oldschool.runescape.wiki/w/Contract_of_forfeit_breath',
  },
  {
    id: 'glyphic_attenuation',
    encounterKind: 'yama_p3_glyphic',
    name: 'Glyphic Attenuation',
    subtitle:
      'Yama is weak to crush and nothing else, and prayer bonus drains prayer faster instead of slower. Rewards sigil (bottom).',
    available: true,
    group: 'Sigil',
    terms: [
      "Yama's health is increased to 2875.",
      "Yama's defence bonuses become +80 crush and +666 to everything else.",
      'Your prayer bonus increases the damage you deal.',
      'Your prayer bonus affects drain rate inversely — it drains faster, not slower.',
      'Glyphs protect for 3 ticks instead of 10; Fire glyphs deal 3× damage and Shadow glyphs drain 3× prayer.',
      'Enhanced ruby and diamond bolt effects are disabled.',
    ],
    reward: 'Purifying sigil (bottom)',
    wikiUrl: 'https://oldschool.runescape.wiki/w/Contract_of_glyphic_attenuation',
  },
  {
    id: 'sensory_clouding',
    encounterKind: 'yama_p3_sensory',
    name: 'Sensory Clouding',
    subtitle:
      'Increased prayer penetration, infinite pursuit, lethal flare explosions, 50% reduced attack range. Rewards sigil (left).',
    available: true,
    group: 'Sigil',
    terms: [
      'Yama always pursues with melee, including phase 3, whatever your weapon.',
      "All of Yama's standard attacks pierce protection prayers for the entire fight.",
      'Void flares kill an unprotected player if allowed to explode.',
      'Your weapon attack ranges are halved.',
    ],
    reward: 'Purifying sigil (left)',
    wikiUrl: 'https://oldschool.runescape.wiki/w/Contract_of_sensory_clouding',
  },
  {
    id: 'divine_severance',
    encounterKind: 'yama_p3_divine',
    name: 'Divine Severance',
    subtitle:
      'Protection prayers deactivated on sight. No prayer penetration. Continuous lethal voidflares. Rewards sigil (right).',
    available: true,
    group: 'Sigil',
    terms: [
      'Protection prayers are forcibly turned off after two ticks active.',
      "All of Yama's standard attacks are fully blocked by protection prayers.",
      'Void flares spawn continuously throughout the fight with halved health, and each spawn counts as a special attack when Yama picks his next glyph attack.',
      'Void flares kill an unprotected player if allowed to explode.',
    ],
    reward: 'Purifying sigil (right)',
    wikiUrl: 'https://oldschool.runescape.wiki/w/Contract_of_divine_severance',
  },
  {
    id: 'bloodied_blows',
    encounterKind: 'yama_p3_bloodied',
    name: 'Bloodied Blows',
    subtitle: 'More and tougher voidflares. Both Yama and challenger gain Wretched Strength. Rewards sigil (middle).',
    available: true,
    startingHitpoints: 10,
    group: 'Sigil',
    terms: [
      "Yama's health is increased to 3000.",
      'You and Yama both gain Wretched Strength — minimum hit rises as health falls.',
      'Four void flares spawn per cycle instead of two, arriving as two pairs half a cycle apart.',
      'You are no longer guaranteed a maximum hit against void flares.',
    ],
    reward: 'Purifying sigil (middle)',
    wikiUrl: 'https://oldschool.runescape.wiki/w/Contract_of_bloodied_blows',
  },
];
