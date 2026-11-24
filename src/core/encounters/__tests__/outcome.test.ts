import { describe, expect, it } from 'vitest';
import type { ActorId } from '../../actors/types';
import type { EncounterVictoryDescriptor } from '../encounterFactory';
import type { EncounterOutcome } from '../outcome';

const TEST_ACTOR_ID: ActorId = 'test-boss';

const TEST_DESCRIPTOR = {
  eyebrow: 'Triumphant',
  title: 'VICTORY',
  narrative: 'TEST BOSS DEFEATED',
  accent: 'gold',
} satisfies EncounterVictoryDescriptor;

function summarizeOutcome(outcome: EncounterOutcome): string {
  switch (outcome.phase) {
    case 'active':
      return outcome.phase;
    case 'resolving':
      return `${outcome.phase}:${outcome.decisiveTick}:${outcome.completionTick}`;
    case 'victory':
      return `${outcome.phase}:${outcome.decisiveTick}:${outcome.completionTick}`;
    default:
      return assertNever(outcome);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected outcome: ${JSON.stringify(value)}`);
}

describe('EncounterOutcome contract', () => {
  it.each([
    [{ phase: 'active' }, 'active'],
    [
      {
        phase: 'resolving',
        decisiveTick: 5,
        completionTick: 14,
        primaryActorId: TEST_ACTOR_ID,
        completionActorIds: [TEST_ACTOR_ID],
      },
      'resolving:5:14',
    ],
    [
      {
        phase: 'victory',
        decisiveTick: 5,
        completionTick: 14,
        primaryActorId: TEST_ACTOR_ID,
        completionActorIds: [TEST_ACTOR_ID],
      },
      'victory:5:14',
    ],
  ] satisfies readonly (readonly [EncounterOutcome, string])[])('exhaustively handles %#', (outcome, expected) => {
    expect(summarizeOutcome(outcome)).toBe(expected);
  });

  it('constrains descriptor presentation to typed static metadata', () => {
    expect(TEST_DESCRIPTOR).toEqual({
      eyebrow: 'Triumphant',
      title: 'VICTORY',
      narrative: 'TEST BOSS DEFEATED',
      accent: 'gold',
    });
  });
});
