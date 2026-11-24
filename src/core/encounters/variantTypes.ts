export interface EncounterVariant {
  id: string;
  encounterKind: string;
  name: string;
  subtitle: string;
  available: boolean;
  /**
   * Playable, but modeled from thin evidence — usually a single packet capture that leaves part
   * of the fight unobserved. Distinct from `available: false`, which is not playable at all.
   * What each one still guesses at is written up in `docs/encounters/<contract>-open-questions.md`.
   */
  isWorkInProgress?: boolean;
  presetsKey?: string;
  group?: string;
  /**
   * The clauses the in-game contract itself states, one per entry. Only what the
   * contract page's "Contract details" section attributes to THIS contract — rules
   * every sigil contract shares belong on the wiki page the link points at, not
   * repeated into every list.
   */
  terms?: readonly string[];
  /**
   * Current hitpoints the player starts this variant at, and the flag that offers the
   * control at all: a variant without it starts at full health and renders no field.
   * Bloodied Blows is fought deliberately low — from a full bar the Wretched Strength
   * floor it is built around never comes up.
   */
  startingHitpoints?: number;
  reward?: string;
  wikiUrl?: string;
}

export function resolveEncounterPresetsKey(kind: string, variants?: readonly EncounterVariant[]): string {
  return variants?.find((variant) => variant.encounterKind === kind)?.presetsKey ?? kind;
}

/**
 * Hitpoints to open `variant` on: the player's saved override for that kind, else the
 * variant's declared default, and `undefined` for a variant that declares none — which is
 * also what keeps the configurer's field off it. The configurer and the engine both resolve
 * through here; read apart, one would show a number the other does not fight at.
 */
export function resolveStartingHitpoints(
  variant: EncounterVariant | undefined,
  overrides: Record<string, number>,
): number | undefined {
  if (variant?.startingHitpoints === undefined) return undefined;
  // The override comes off a hand-editable localStorage blob that outlives schema changes,
  // and nothing between there and here re-checks its type. `Math.floor` of a string or NaN
  // is NaN, which the engine's clamp passes straight through into the player's hitpoints.
  const override = overrides[variant.encounterKind];
  return Number.isFinite(override) && override >= 1 ? Math.floor(override) : variant.startingHitpoints;
}
