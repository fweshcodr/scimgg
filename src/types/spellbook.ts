/**
 * Shared by the simulation (combat supplies, spell resolution) and the UI
 * (spellbook panel, autocast picker) so neither has to import the other.
 */
export type SpellbookType = 'standard' | 'ancient' | 'lunar' | 'arceuus';

export const ALL_SPELLBOOKS: readonly SpellbookType[] = ['standard', 'ancient', 'lunar', 'arceuus'];

export const SPELLBOOK_DISPLAY_NAMES: Record<SpellbookType, string> = {
  standard: 'Standard',
  ancient: 'Ancient Magicks',
  lunar: 'Lunar',
  arceuus: 'Arceuus',
};

/** The book used when a loadout specifies none. */
export const DEFAULT_SPELLBOOK: SpellbookType = 'arceuus';

export function isSpellbookType(value: unknown): value is SpellbookType {
  return typeof value === 'string' && (ALL_SPELLBOOKS as readonly string[]).includes(value);
}
