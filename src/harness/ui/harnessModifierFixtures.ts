import type { EncounterModifierSelection } from '../../core/encounters/encounterFactory';
import { SOL_HEREDIT_MODIFIERS } from '../../encounters/solHeredit/modifiers';
import type { HarnessOptions } from './harnessOptions';

/** UI density fixtures only: encounter metadata remains the owner of names, effects and valid tiers. */
const MODIFIER_FIXTURES = {
  // Seven selections, the density the overview reference screenshot shows.
  'sol-seven': { blasphemy: 3, doom: 3, frailty: 3, myopia: 3, quartet: 1, relentless: 3, solarflare: 3 },
  'sol-all': Object.fromEntries(SOL_HEREDIT_MODIFIERS.map(({ id, tiers }) => [id, tiers.length])),
} as const satisfies Record<string, EncounterModifierSelection>;

/** Keep raw URL input until boot validation, so invalid requests get the usual harness error UI. */
export function resolveHarnessModifierFixture(
  options: Pick<HarnessOptions, 'modifierFixture' | 'encounter' | 'open'>,
): EncounterModifierSelection | undefined {
  const { modifierFixture, encounter, open } = options;
  if (modifierFixture === null) return undefined;
  if (!Object.hasOwn(MODIFIER_FIXTURES, modifierFixture)) {
    throw new Error(
      `Unknown modifierFixture '${modifierFixture}'. Known: ${Object.keys(MODIFIER_FIXTURES).join(', ')}`,
    );
  }
  if (encounter !== 'lobby' || open.length !== 1 || open[0] !== 'encounter-panel:sol_heredit') {
    throw new Error('modifierFixture requires encounter=lobby&open=encounter-panel:sol_heredit (one surface only)');
  }
  return { ...MODIFIER_FIXTURES[modifierFixture as keyof typeof MODIFIER_FIXTURES] };
}
