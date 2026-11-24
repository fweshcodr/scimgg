/**
 * Picker-only editorial data.
 *
 * Per-encounter presentation (hero art, thumbnails, taglines) moved into the encounter
 * presentation manifest so a new encounter is declared in one place; it is re-exported here so
 * the picker keeps a single import. What remains below is genuinely picker-specific chrome that
 * does not belong to any one encounter.
 */
export { type EncounterPresentation, encounterPresentationModuleForKind } from '../encounters/presentationModules';

import { getItemSpriteUrl } from '../services/ItemSpriteService';

/** Infernal cape (21295), the Inferno's reward, as its mirrored item icon. */
const INFERNAL_CAPE_ICON = getItemSpriteUrl(21295);

/**
 * Icon per selectable row in the picker's detail list, keyed by `EncounterVariant.id`. A
 * boss with no variants renders one synthetic row whose id is its encounter kind (see
 * EncounterPicker's `entries`), and an encounter group's stage rows are keyed by stage
 * kind for the same reason. Rows that grant nothing (the base "No Contract") are
 * intentionally absent and fall back to a neutral glyph.
 *
 * Only the Inferno stage has one: its reward, the Infernal cape, is drawn from the mirrored item
 * icons. Every other row uses the neutral glyph.
 */
export const VARIANT_REWARD_ICON: Record<string, string> = {
  inferno: INFERNAL_CAPE_ICON,
};
