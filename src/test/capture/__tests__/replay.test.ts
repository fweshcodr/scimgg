import { describe, expect, it } from 'vitest';
import { ConstrainedDecisions } from '../constrainedRandom';
import { type Divergence, formatReport, type Observation, type ReplaySession, replayCapture } from '../replay';

/** A toy session: the capture says what `actor` did per tick; the sim is a function of the tick. */
function session(
  capture: Record<number, readonly Observation[]>,
  sim: (tick: number) => readonly Observation[],
  explain: (divergence: Divergence) => string | null = () => null,
): ReplaySession & { readonly applied: number[] } {
  const applied: number[] = [];
  const ticks = Object.keys(capture).map(Number);
  return {
    applied,
    firstTick: Math.min(...ticks),
    lastTick: Math.max(...ticks),
    applyInputs: (tick) => applied.push(tick),
    advance: () => undefined,
    observe: sim,
    expected: (tick) => capture[tick] ?? [],
    decisions: new ConstrainedDecisions(),
    conditioning: [{ name: 'toy', replaces: 'nothing' }],
    recentDecisions: () => [],
    explain,
  };
}

const at = (tick: number, actor: string, value: string, channel = 'move'): Observation => ({
  channel,
  tick,
  actor,
  value,
  line: tick * 10,
});

describe('replayCapture', () => {
  const capture = { 1: [at(1, 'a', '1,1')], 2: [at(2, 'a', '1,2'), at(2, 'b', 'x', 'attack')], 3: [at(3, 'a', '1,3')] };

  it('is conformant when every declared observation matches, ignoring undeclared channels', () => {
    const run = session(capture, (tick) => [...(capture[tick as 1 | 2 | 3] ?? []), at(tick, 'c', 'noise', 'sound')]);
    const report = replayCapture({ name: 'toy', channels: ['move', 'attack'] }, run);
    expect(report.outcome).toBe('conformant');
    expect(report.observations).toEqual({ move: { expected: 3, matched: 3 }, attack: { expected: 1, matched: 1 } });
    expect(run.applied).toEqual([1, 2, 3]);
  });

  it('reports the first divergence per actor and channel with its capture line, and counts the rest', () => {
    const report = replayCapture(
      { name: 'toy', channels: ['move', 'attack'] },
      session(capture, (tick) => (tick === 1 ? capture[1] : [at(tick, 'a', 'wrong')])),
    );
    expect(report.outcome).toBe('divergence');
    expect(
      report.divergences.map(({ tick, actor, channel, missing, unexpected, line, followUps }) => ({
        tick,
        actor,
        channel,
        missing,
        unexpected,
        line,
        followUps,
      })),
    ).toEqual([
      { tick: 2, actor: 'a', channel: 'move', missing: ['1,2'], unexpected: ['wrong'], line: 20, followUps: 1 },
      { tick: 2, actor: 'b', channel: 'attack', missing: ['x'], unexpected: [], line: 20, followUps: 0 },
    ]);
    expect(formatReport(report)).toContain('t2 move a (line 20)');
  });

  it('compares multiplicity, not just presence', () => {
    const doubled = { 1: [at(1, 'a', 'hit 3'), at(1, 'a', 'hit 3')] };
    const report = replayCapture(
      { name: 'toy', channels: ['move'] },
      session(doubled, () => [at(1, 'a', 'hit 3')]),
    );
    expect(report.divergences[0]).toMatchObject({ missing: ['hit 3'], unexpected: [] });
  });

  it('marks explained divergences inconclusive and matched expectations expected', () => {
    const report = replayCapture(
      {
        name: 'toy',
        channels: ['move', 'attack'],
        expectedDivergences: [
          { channel: 'attack', actor: 'b', tick: 2, note: 'open question' },
          { channel: 'move', tick: 9, note: 'gone' },
        ],
      },
      session(
        capture,
        (tick) =>
          capture[tick as 1 | 2 | 3]?.filter((observation) => observation.channel === 'move' && tick !== 3) ?? [],
        (divergence) => (divergence.channel === 'move' ? 'unconstrained draw' : null),
      ),
    );
    expect(report.divergences.map((divergence) => [divergence.channel, divergence.classification])).toEqual([
      ['attack', 'expected'],
      ['move', 'inconclusive'],
    ]);
    expect(report.outcome).toBe('inconclusive');
    expect(report.resolvedExpectations).toEqual([{ channel: 'move', tick: 9, note: 'gone' }]);
  });

  it('never passes a replay that observed nothing', () => {
    const report = replayCapture(
      { name: 'toy', channels: ['move'] },
      session({ 1: [] }, () => []),
    );
    expect(report.outcome).toBe('inconclusive');
  });
});
