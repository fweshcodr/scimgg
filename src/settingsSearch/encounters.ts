import type { EncounterVariant } from '../core/encounters/variantTypes';
import type { Searchable } from './types';

/**
 * Encounter rows for the quick search (Ctrl+K), built from the live encounter registry so only
 * fights that ship can be found. Every word comes from the encounter's own data: its picker title,
 * its descriptor name when that differs, the tagline's parts (where "inferno" and "colosseum" come
 * from) and each contract's name and effect. No hand-kept nickname list to drift.
 */

/** What the quick search needs to know about one encounter in the picker's rail. */
export interface EncounterSearchSource {
  /** The picker's rail entry: a base kind, or an encounter group's id (its rows are the stages). */
  readonly kind: string;
  /** The picker's title for it ("TzKal-Zuk"). */
  readonly title: string;
  /** The registry's name, when the picker shows a shorter one ("Yama - Phase 3"). */
  readonly displayName: string;
  readonly description: string;
  /** The picker's kicker, `·`-separated ("Inferno · Wave 69"). */
  readonly tagline?: string;
  readonly isWorkInProgress: boolean;
  readonly variants: readonly EncounterVariant[];
}

export interface EncounterSearchEntry extends Searchable {
  /** `encounter.<kind>`, or `encounter.<kind>.<variant id>` for a contract. */
  readonly id: string;
  readonly kind: 'encounter';
  readonly title: string;
  readonly breadcrumb: string[];
  /** The rail entry the picker opens on: a base kind, or an encounter group's id. */
  readonly encounterKind: string;
  /** The contract or group stage the picker opens with selected, when the row is one. */
  readonly variantId?: string;
  readonly isWorkInProgress: boolean;
}

const BREADCRUMB_ROOT = 'Encounters';

function taglineParts(tagline: string | undefined): string[] {
  return (tagline ?? '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function encounterSearchEntries(sources: readonly EncounterSearchSource[]): EncounterSearchEntry[] {
  const entries: EncounterSearchEntry[] = [];
  for (const source of sources) {
    const keywords = taglineParts(source.tagline);
    if (source.displayName !== source.title) keywords.push(source.displayName);
    entries.push({
      id: `encounter.${source.kind}`,
      kind: 'encounter',
      title: source.title,
      breadcrumb: [BREADCRUMB_ROOT],
      description: source.tagline ? source.tagline : source.description,
      keywords,
      encounterKind: source.kind,
      isWorkInProgress: source.isWorkInProgress,
    });
    for (const variant of source.variants) {
      // The base row ("No Contract") is the encounter itself, already listed; one not yet playable
      // is a "Soon" row in the picker, nothing to go to.
      if (variant.encounterKind === source.kind || !variant.available) continue;
      entries.push({
        id: `encounter.${source.kind}.${variant.id}`,
        kind: 'encounter',
        title: variant.name,
        breadcrumb: variant.group
          ? [BREADCRUMB_ROOT, source.title, `${variant.group} contracts`]
          : [BREADCRUMB_ROOT, source.title],
        description: variant.subtitle,
        encounterKind: source.kind,
        variantId: variant.id,
        isWorkInProgress: variant.isWorkInProgress ?? source.isWorkInProgress,
      });
    }
  }
  return entries;
}
