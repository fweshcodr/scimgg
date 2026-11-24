import type { EncounterModifierDefinition } from '../../core/encounters/encounterFactory';
import { type EncounterSetupNoteRule, loadoutHasItem } from '../../core/encounters/setupNotes';
import { COLOSSEUM_MODIFIERS, type ColosseumModifierId } from '../colosseum/modifiers/definitions';

/**
 * Wave-12-eligible modifiers in selector order: alphabetical, like the wiki's modifier table, since the
 * game offers random picks and has no fixed order. Shared behavior lives in colosseum/modifiers.
 */
const OFFERED: readonly ColosseumModifierId[] = [
  'bees',
  'blasphemy',
  'doom',
  'frailty',
  'myopia',
  'quartet',
  'relentless',
  'solarflare',
  'totemic',
  'volatility',
];
export const SOL_HEREDIT_MODIFIERS: readonly EncounterModifierDefinition[] = OFFERED.map(
  (id) => COLOSSEUM_MODIFIERS.find((definition) => definition.id === id)!,
);

// equipment.json also lists 33178, but that Barbarian Assault copy is not supported here.
const NOXIOUS_HALBERD_IDS: readonly number[] = [29796];

export const SOL_HEREDIT_SETUP_NOTES: readonly EncounterSetupNoteRule[] = [
  {
    id: 'halberd-without-myopia',
    // Myopia limits the halberd to range 1, still reaching diagonally adjacent tiles, so a halberd
    // run practiced without it is easier than the real wave 12; colosseum/modifiers/rules.ts.
    message: 'Noxious halberd in loadout, but Myopia is off.',
    applies: (ctx) => loadoutHasItem(ctx, NOXIOUS_HALBERD_IDS) && !ctx.modifiers.myopia,
  },
];
