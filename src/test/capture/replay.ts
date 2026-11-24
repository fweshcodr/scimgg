import type { ConstrainedDecisions, DecisionConstraint, DecisionRecord } from './constrainedRandom';

/**
 * Single-pass capture replay: drive a simulation with a capture's inputs, tick by tick, and compare
 * what it produces with what the capture shows. No seed search, no backtracking, no resync: a sim
 * actor is never moved to where the capture says it is. Randomness is "could happen": an adapter
 * forces captured outcomes through `ConstrainedDecisions` wherever the model's support allows.
 *
 * Inputs and expectations are separate by construction: `applyInputs` may only use what the
 * player did (and explicitly labeled conditioning); `expected` reads the capture and never the sim;
 * `observe` reads the sim and never the capture.
 */

/** A comparable fact on one tick: what `actor` did on `channel`, canonically printed in `value`. */
export interface Observation {
  readonly channel: string;
  /** The capture's tick. */
  readonly tick: number;
  /** Capture-side actor name (a life key, `player`, or `world`); unmapped sim actors print as `sim:<id>`. */
  readonly actor: string;
  readonly value: string;
  /** Capture line, on expected observations. */
  readonly line?: number;
}

/** Something the replay supplies from the capture instead of the model, and what it replaces. */
export interface ConditioningNote {
  readonly name: string;
  readonly replaces: string;
}

export interface ReplaySession {
  /** Inclusive capture ticks to replay. */
  readonly firstTick: number;
  readonly lastTick: number;
  /** Before the sim advances into `tick`: player inputs and labeled conditioning only. */
  applyInputs(tick: number): void;
  /** Advances the sim by one tick. */
  advance(): void;
  /** What the sim did on `tick`, on the declared channels. */
  observe(tick: number): readonly Observation[];
  /** What the capture shows on `tick`, on the declared channels. */
  expected(tick: number): readonly Observation[];
  readonly decisions: ConstrainedDecisions | null;
  readonly conditioning: readonly ConditioningNote[];
  /** The decisions relevant to `actor` near `tick`, for divergence context. */
  recentDecisions(actor: string, tick: number): readonly DecisionRecord[];
  /**
   * Why a divergence is not evidence against the model (an unconstrained draw it depended on, an
   * input the capture lacks, an earlier divergence it follows from), or null when it is. Called once
   * per divergence in tick order, expected ones included.
   */
  explain(divergence: Divergence): string | null;
}

export interface ReplayCase {
  readonly name: string;
  /** Only these channels are compared; anything else the sim or capture does is ignored. */
  readonly channels: readonly string[];
  /**
   * Known, reported divergences (open questions). Matching ones keep the case honest without failing
   * it; one that no longer occurs is reported as resolved.
   */
  readonly expectedDivergences?: readonly ExpectedDivergence[];
  /** Constraint violations at these decision sites are known findings (same honesty rules). */
  readonly expectedViolations?: readonly { readonly site: string; readonly note: string }[];
}

/**
 * A known divergence: on `channel` (and `actor`, `tick` when given), or wherever `match` holds.
 * Each must occur at least once, or the report lists it as resolved.
 */
export interface ExpectedDivergence {
  readonly channel: string;
  readonly actor?: string;
  readonly tick?: number;
  readonly match?: (divergence: Divergence) => boolean;
  readonly note: string;
}

export interface Divergence {
  readonly channel: string;
  readonly actor: string;
  readonly tick: number;
  /** Capture values the sim did not produce, and sim values the capture does not show. */
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly line?: number;
  readonly decisions: readonly DecisionRecord[];
  /** Later divergences on the same actor and channel, not reported separately. */
  followUps: number;
  classification: 'divergence' | 'inconclusive' | 'expected';
  reason?: string;
}

export type ReplayOutcome = 'conformant' | 'divergence' | 'inconclusive';

export interface ConformanceReport {
  readonly name: string;
  readonly outcome: ReplayOutcome;
  readonly ticks: number;
  /** Expected observations per channel, and how many the sim matched. */
  readonly observations: Readonly<Record<string, { readonly expected: number; readonly matched: number }>>;
  readonly divergences: readonly Divergence[];
  readonly resolvedExpectations: readonly ExpectedDivergence[];
  readonly violations: readonly DecisionRecord[];
  /** Violations declared in `expectedViolations`. */
  readonly knownViolations: readonly DecisionRecord[];
  readonly unusedConstraints: readonly DecisionConstraint[];
  readonly conditioning: readonly ConditioningNote[];
  readonly elapsedMs: number;
}

function group(observations: readonly Observation[], channels: ReadonlySet<string>) {
  const groups = new Map<string, { channel: string; actor: string; values: string[]; line?: number }>();
  for (const observation of observations) {
    if (!channels.has(observation.channel)) continue;
    const key = `${observation.channel}\u0000${observation.actor}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { channel: observation.channel, actor: observation.actor, values: [] };
      groups.set(key, entry);
    }
    entry.values.push(observation.value);
    if (observation.line !== undefined && (entry.line === undefined || observation.line < entry.line))
      entry.line = observation.line;
  }
  return groups;
}

/** Multiset difference: values of `left` not matched one-for-one in `right`. */
function difference(left: readonly string[], right: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const value of right) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  const out: string[] = [];
  for (const value of left) {
    const count = remaining.get(value) ?? 0;
    if (count > 0) remaining.set(value, count - 1);
    else out.push(value);
  }
  return out;
}

export function replayCapture(replayCase: ReplayCase, session: ReplaySession): ConformanceReport {
  const started = performance.now();
  const channels = new Set(replayCase.channels);
  const observations: Record<string, { expected: number; matched: number }> = Object.fromEntries(
    replayCase.channels.map((channel) => [channel, { expected: 0, matched: 0 }]),
  );
  const divergences: Divergence[] = [];
  const firstByActorChannel = new Map<string, Divergence>();
  for (let tick = session.firstTick; tick <= session.lastTick; tick++) {
    session.applyInputs(tick);
    session.advance();
    const expected = group(session.expected(tick), channels);
    const actual = group(session.observe(tick), channels);
    for (const key of new Set([...expected.keys(), ...actual.keys()])) {
      const want = expected.get(key);
      const got = actual.get(key);
      const channel = (want ?? got)!.channel;
      const actor = (want ?? got)!.actor;
      const missing = difference(want?.values ?? [], got?.values ?? []);
      const unexpected = difference(got?.values ?? [], want?.values ?? []);
      const stats = observations[channel]!;
      stats.expected += want?.values.length ?? 0;
      stats.matched += (want?.values.length ?? 0) - missing.length;
      if (missing.length === 0 && unexpected.length === 0) continue;
      const first = firstByActorChannel.get(key);
      if (first) {
        first.followUps++;
        continue;
      }
      const divergence: Divergence = {
        channel,
        actor,
        tick,
        missing,
        unexpected,
        ...(want?.line === undefined ? {} : { line: want.line }),
        decisions: session.recentDecisions(actor, tick),
        followUps: 0,
        classification: 'divergence',
      };
      firstByActorChannel.set(key, divergence);
      divergences.push(divergence);
    }
  }
  const expectations = [...(replayCase.expectedDivergences ?? [])];
  const matchedExpectations = new Set<ExpectedDivergence>();
  for (const divergence of divergences) {
    // Asked for every divergence, in order, so the session can recognize consequences of earlier ones.
    const reason = session.explain(divergence);
    const expectation = expectations.find(
      (candidate) =>
        candidate.channel === divergence.channel &&
        (candidate.tick === undefined || candidate.tick === divergence.tick) &&
        (candidate.actor === undefined || candidate.actor === divergence.actor) &&
        (candidate.match === undefined || candidate.match(divergence)),
    );
    if (expectation) {
      matchedExpectations.add(expectation);
      divergence.classification = 'expected';
      divergence.reason = expectation.note;
      continue;
    }
    if (reason !== null) {
      divergence.classification = 'inconclusive';
      divergence.reason = reason;
    }
  }
  const expectedViolations = replayCase.expectedViolations ?? [];
  const violations = (session.decisions?.violations() ?? []).filter(
    (record) => !expectedViolations.some((expected) => expected.site === record.key.site),
  );
  const knownViolations = (session.decisions?.violations() ?? []).filter((record) => !violations.includes(record));
  const totalExpected = Object.values(observations).reduce((total, entry) => total + entry.expected, 0);
  const outcome: ReplayOutcome =
    divergences.some((divergence) => divergence.classification === 'divergence') || violations.length > 0
      ? 'divergence'
      : totalExpected === 0 || divergences.length > 0
        ? 'inconclusive'
        : 'conformant';
  return {
    name: replayCase.name,
    outcome,
    ticks: session.lastTick - session.firstTick + 1,
    observations,
    divergences,
    resolvedExpectations: expectations.filter((expectation) => !matchedExpectations.has(expectation)),
    violations,
    knownViolations,
    unusedConstraints: session.decisions?.unused() ?? [],
    conditioning: session.conditioning,
    elapsedMs: performance.now() - started,
  };
}

/** A readable summary for assertion messages and logs. */
export function formatReport(report: ConformanceReport): string {
  const lines = [
    `${report.name}: ${report.outcome} over ${report.ticks} ticks in ${report.elapsedMs.toFixed(0)} ms`,
    `  observations: ${Object.entries(report.observations)
      .map(([channel, { expected, matched }]) => `${channel} ${matched}/${expected}`)
      .join(', ')}`,
  ];
  for (const divergence of report.divergences) {
    lines.push(
      `  [${divergence.classification}] t${divergence.tick} ${divergence.channel} ${divergence.actor}` +
        `${divergence.line === undefined ? '' : ` (line ${divergence.line})`}: missing [${divergence.missing.join('; ')}]` +
        ` unexpected [${divergence.unexpected.join('; ')}]` +
        `${divergence.followUps > 0 ? ` +${divergence.followUps} later` : ''}${divergence.reason ? ` — ${divergence.reason}` : ''}`,
    );
    for (const record of divergence.decisions) {
      lines.push(
        `      ${record.stream} t${record.key.tick} ${record.key.site} ${record.key.actorId ?? ''} -> ${record.outcome}` +
          `${record.constraint ? ` (forced: ${record.constraint.evidence})` : ' (free)'}${record.violation ? ` VIOLATION ${record.violation}` : ''}`,
      );
    }
  }
  for (const record of report.violations) {
    lines.push(`  violation t${record.key.tick} ${record.key.site} ${record.key.actorId ?? ''}: ${record.violation}`);
  }
  for (const record of report.knownViolations) {
    lines.push(
      `  [expected] violation t${record.key.tick} ${record.key.site} ${record.key.actorId ?? ''}: ${record.violation}`,
    );
  }
  if (report.unusedConstraints.length > 0)
    lines.push(
      `  unused constraints: ${report.unusedConstraints
        .slice(0, 12)
        .map(
          (constraint) => `${constraint.site}@${constraint.tick}${constraint.actorId ? `/${constraint.actorId}` : ''}`,
        )
        .join(', ')}${report.unusedConstraints.length > 12 ? ` (+${report.unusedConstraints.length - 12})` : ''}`,
    );
  if (report.resolvedExpectations.length > 0)
    lines.push(
      `  expected divergences that did not occur: ${report.resolvedExpectations.map((e) => `${e.channel}@${e.tick ?? e.note}`).join(', ')}`,
    );
  for (const note of report.conditioning) lines.push(`  conditioning: ${note.name} (replaces ${note.replaces})`);
  return lines.join('\n');
}
