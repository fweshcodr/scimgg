import { describe, expect, it } from 'vitest';
import { generatorDecisionRandom, uniformOptions } from '../../../core/decisionRandom';
import { mulberry32 } from '../../../core/rng';
import { ConstrainedDecisions, type DecisionConstraint } from '../constrainedRandom';

const key = { site: 'test.site', tick: 5, actorId: 'a' };

function counted(seed = 1) {
  const generator = mulberry32(seed);
  let draws = 0;
  return {
    next: () => {
      draws++;
      return generator();
    },
    draws: () => draws,
  };
}

describe('ConstrainedDecisions', () => {
  it('is the plain decision mapping when nothing is constrained', () => {
    const plain = generatorDecisionRandom(mulberry32(9));
    const ledger = new ConstrainedDecisions();
    const wrapped = ledger.wrap('s', mulberry32(9));
    const run = (random: typeof plain) => [
      random.chance(key, 0.3),
      random.int(key, 40, 60),
      random.choose(key, uniformOptions(['x', 'y', 'z'])),
      random.next(),
    ];
    expect(run(wrapped)).toEqual(run(plain));
    expect(ledger.unconstrained()).toHaveLength(3);
  });

  it('forces supported outcomes and still advances the generator once per replaced draw', () => {
    const backing = counted();
    const ledger = new ConstrainedDecisions();
    ledger.add(
      { ...key, outcome: { kind: 'chance', value: true }, evidence: 'line 1' },
      { ...key, outcome: { kind: 'int', value: 57 }, evidence: 'line 2' },
      { ...key, outcome: { kind: 'choose', label: 'z', matches: (value) => value === 'z' }, evidence: 'line 3' },
    );
    const random = ledger.wrap('s', backing.next);
    expect(random.chance(key, 0.01)).toBe(true);
    expect(random.int(key, 40, 60)).toBe(57);
    expect(random.choose(key, uniformOptions(['x', 'y', 'z']))).toBe('z');
    expect(backing.draws()).toBe(3);
    // The stream continues exactly where it would have.
    const reference = mulberry32(1);
    for (let index = 0; index < 3; index++) reference();
    expect(random.next()).toBe(reference());
    expect(ledger.unused()).toEqual([]);
    expect(ledger.violations()).toEqual([]);
  });

  it.each([
    { name: 'true at p=0', constraint: { kind: 'chance', value: true }, call: 'chance0' },
    { name: 'false at p=1', constraint: { kind: 'chance', value: false }, call: 'chance1' },
    { name: 'an int outside its bounds', constraint: { kind: 'int', value: 61 }, call: 'int' },
    {
      name: 'a value that is not offered',
      constraint: { kind: 'choose', label: 'w', matches: (value: unknown) => value === 'w' },
      call: 'choose',
    },
    {
      name: 'a zero-weight option',
      constraint: { kind: 'choose', label: 'y', matches: (value: unknown) => value === 'y' },
      call: 'chooseZero',
    },
  ] as const)('refuses to force $name and records a violation', ({ constraint, call }) => {
    const ledger = new ConstrainedDecisions();
    ledger.add({ ...key, outcome: constraint, evidence: 'capture' } as DecisionConstraint);
    const random = ledger.wrap('s', mulberry32(3));
    const reference = generatorDecisionRandom(mulberry32(3));
    switch (call) {
      case 'chance0':
        expect(random.chance(key, 0)).toBe(reference.chance(key, 0));
        break;
      case 'chance1':
        expect(random.chance(key, 1)).toBe(reference.chance(key, 1));
        break;
      case 'int':
        expect(random.int(key, 40, 60)).toBe(reference.int(key, 40, 60));
        break;
      case 'choose':
        expect(random.choose(key, uniformOptions(['x', 'y']))).toBe(reference.choose(key, uniformOptions(['x', 'y'])));
        break;
      case 'chooseZero': {
        const options = [
          { value: 'x', weight: 1 },
          { value: 'y', weight: 0 },
        ];
        expect(random.choose(key, options)).toBe(reference.choose(key, options));
        break;
      }
    }
    expect(ledger.violations()).toHaveLength(1);
  });

  it('matches on site, tick and every field the constraint names, and reports required unused ones', () => {
    const ledger = new ConstrainedDecisions();
    const other = { ...key, actorId: 'b', outcome: { kind: 'chance', value: true }, evidence: 'b' } as const;
    const optional = {
      ...key,
      tick: 6,
      outcome: { kind: 'chance', value: true },
      evidence: 'o',
      optional: true,
    } as const;
    ledger.add(other, optional);
    const random = ledger.wrap('s', () => 0.99);
    expect(random.chance(key, 0.5)).toBe(false);
    ledger.prune(7);
    expect(ledger.unused()).toEqual([other]);
  });

  it('asks the resolver when no registered constraint matches', () => {
    const ledger = new ConstrainedDecisions();
    ledger.resolver = (decision, method) =>
      method === 'int' ? { ...decision, outcome: { kind: 'int', value: 2 }, evidence: 'resolved' } : null;
    const random = ledger.wrap('s', () => 0.99);
    expect(random.int(key, 0, 4)).toBe(2);
    expect(random.chance(key, 0.5)).toBe(false);
    expect(ledger.records.map((record) => record.constraint?.evidence ?? null)).toEqual(['resolved', null]);
  });
});
