import { describe, expect, it } from 'vitest';

import {
  getTutorialById,
  getTutorialsByEncounter,
  getTutorialTargetEncounter,
  hasTutorialsForEncounter,
  TUTORIAL_REGISTRY,
} from '..';

describe('getTutorialById', () => {
  it('returns the matching tutorial for every registered id', () => {
    for (const tutorial of TUTORIAL_REGISTRY) {
      expect(getTutorialById(tutorial.id)).toBe(tutorial);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getTutorialById('does-not-exist')).toBeUndefined();
  });
});

describe('getTutorialTargetEncounter', () => {
  it('returns the declared encounterContext.kind when present', () => {
    const withContext = TUTORIAL_REGISTRY.find((t) => t.encounterContext != null);
    expect(withContext, 'expected at least one tutorial with an encounterContext').toBeTruthy();
    expect(getTutorialTargetEncounter(withContext!)).toBe(withContext!.encounterContext!.kind);
  });

  it("falls back to 'lobby' when the tutorial has no encounterContext", () => {
    const withoutContext = TUTORIAL_REGISTRY.find((t) => t.encounterContext == null);
    expect(withoutContext, 'expected at least one lobby tutorial with no encounterContext').toBeTruthy();
    expect(getTutorialTargetEncounter(withoutContext!)).toBe('lobby');
  });
});

describe('getTutorialsByEncounter', () => {
  it('returns exactly the tutorials whose encounterContext.kind matches', () => {
    const kind = TUTORIAL_REGISTRY.find((t) => t.encounterContext != null)?.encounterContext?.kind;
    expect(kind, 'expected at least one encounter tutorial').toBeTruthy();

    const expected = TUTORIAL_REGISTRY.filter((t) => t.encounterContext?.kind === kind);
    const actual = getTutorialsByEncounter(kind!);

    expect(actual).toEqual(expected);
    expect(actual.every((t) => t.encounterContext?.kind === kind)).toBe(true);
  });

  it('returns an empty array for an encounter kind no tutorial targets', () => {
    expect(getTutorialsByEncounter('no-such-encounter')).toEqual([]);
  });
});

describe('tutorial shortcut markup', () => {
  // Shortcuts render as the shared `.kbd` cap; bold prose for a shortcut is the shape this rejects.
  // Serializing the whole tutorial catches the copy wherever it hangs off a step, so a new field
  // carrying HTML is covered the day it is added.
  const KEYBIND_IN_BOLD =
    /<b>(?:(?!<\/b>).)*\b(?:Shift|Ctrl|Alt|Esc|Right-click|Left-click|Middle-click)\b(?:(?!<\/b>).)*<\/b>/gi;

  it('wraps every keybind in a .kbd cap rather than <b>', () => {
    const offenders: string[] = [];
    for (const tutorial of TUTORIAL_REGISTRY) {
      for (const match of JSON.stringify(tutorial).matchAll(KEYBIND_IN_BOLD)) {
        offenders.push(`${tutorial.id}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('fires on a bold keybind and not on other bold prose', () => {
    const regressed = JSON.stringify({ html: '<b>Shift + right-click</b> a tile to mark it.' });
    expect(regressed.match(KEYBIND_IN_BOLD)).toHaveLength(1);
    expect(JSON.stringify({ html: '<b>true tile</b> highlighting' }).match(KEYBIND_IN_BOLD)).toBeNull();
  });
});

describe('hasTutorialsForEncounter', () => {
  it('is true exactly when the encounter has at least one tutorial', () => {
    const kind = TUTORIAL_REGISTRY.find((t) => t.encounterContext != null)?.encounterContext?.kind;
    expect(kind, 'expected at least one encounter tutorial').toBeTruthy();

    expect(hasTutorialsForEncounter(kind!)).toBe(true);
    expect(hasTutorialsForEncounter('no-such-encounter')).toBe(false);
  });
});
