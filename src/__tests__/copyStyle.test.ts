import { describe, expect, it } from 'vitest';
import { getAllLinePresets } from '../data/linePackPresets';
import { getAllPresets } from '../data/tilePackPresets';
import { TIPS } from '../data/tips';
import { LOBBY_NPC_ENCOUNTERS } from '../encounters/lobby/metadata';
import { TRAINING_COURSES } from '../tutorial/content/courses';
import { TUTORIAL_REGISTRY } from '../tutorial/content/registry';

/**
 * AGENTS.md makes "no em-dashes" a binding rule for user-facing copy. Hyphens
 * and en-dashes are left alone: `Yama - Phase 3` and the `App · Onboarding`
 * eyebrows are deliberate.
 */
const EM_DASH = '\u2014';

/**
 * Keys that hold prose a player reads. Walked by name rather than by step kind
 * so a new tutorial step type is covered the day it is added, without this file
 * having to know the step union.
 */
const COPY_KEYS = new Set([
  'annotation',
  'body',
  'caption',
  'completedText',
  'continueLabel',
  'cue',
  'description',
  'displayName',
  'failPrompt',
  'hint',
  'impact',
  'label',
  'name',
  'prayer',
  'successMessage',
  'title',
  'waitingText',
]);

interface CopyString {
  readonly where: string;
  readonly text: string;
}

/**
 * Collect every copy-bearing string under `value`. Functions are skipped: step
 * `element` resolvers and event matchers are code, not copy.
 */
function collectCopy(value: unknown, path: string, out: CopyString[]): void {
  if (typeof value === 'function' || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectCopy(entry, `${path}[${index}]`, out);
    });
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (typeof entry === 'string') {
      if (COPY_KEYS.has(key)) out.push({ where: childPath, text: entry });
      continue;
    }
    collectCopy(entry, childPath, out);
  }
}

function copyFrom(label: string, value: unknown): CopyString[] {
  const out: CopyString[] = [];
  collectCopy(value, label, out);
  return out;
}

function allUserFacingCopy(): CopyString[] {
  return [
    ...TIPS.map((tip, index) => ({ where: `TIPS[${index}]`, text: tip.text })),
    ...copyFrom('TRAINING_COURSES', TRAINING_COURSES),
    ...copyFrom('TUTORIAL_REGISTRY', TUTORIAL_REGISTRY),
    ...copyFrom('tilePackPresets', getAllPresets()),
    ...copyFrom('linePackPresets', getAllLinePresets()),
    ...copyFrom('LOBBY_NPC_ENCOUNTERS', LOBBY_NPC_ENCOUNTERS),
  ];
}

describe('user-facing copy style', () => {
  it('reaches every copy surface', () => {
    // Guards the walker itself: a refactor that silently stops finding copy
    // would otherwise make the em-dash check pass by inspecting nothing.
    const copy = allUserFacingCopy();
    expect(copy.length).toBeGreaterThan(200);
    expect(copy.some((entry) => entry.where.startsWith('TIPS'))).toBe(true);
    expect(copy.some((entry) => entry.where.startsWith('TUTORIAL_REGISTRY'))).toBe(true);
    expect(copy.some((entry) => entry.where.startsWith('tilePackPresets'))).toBe(true);
  });

  it('uses no em-dashes', () => {
    const offenders = allUserFacingCopy()
      .filter((entry) => entry.text.includes(EM_DASH))
      .map((entry) => `${entry.where}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });

  it('uses American spelling', () => {
    // Every pattern below matches ONLY the British form (each carries a `u`, an
    // `s`-for-`z`, or a doubled `l`), so the American spelling can never trip
    // it. That also keeps OSRS proper nouns safe: the Defence skill and the
    // Attack/Defence bonus labels are in-game names and are not listed here.
    const BRITISH = [
      /\bcolour/i,
      /\bcentre/i,
      /\bpractis/i,
      /\borganis/i,
      /\brecognis/i,
      /\banalys/i,
      /\bcustomis/i,
      /\boptimis/i,
      /\bmodelled\b/i,
      /\bcancelled\b/i,
      /\barmour/i,
      /\bbehaviour/i,
      /\bfavourite/i,
      /\bneighbour/i,
      /\bcatalogue/i,
      /\bwhilst\b/i,
    ];

    const offenders = allUserFacingCopy()
      .filter((entry) => BRITISH.some((pattern) => pattern.test(entry.text)))
      .map((entry) => `${entry.where}: ${entry.text}`);

    expect(offenders).toEqual([]);
  });
});
