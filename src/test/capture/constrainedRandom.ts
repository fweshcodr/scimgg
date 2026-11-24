import { chooseWeighted, type DecisionKey, type DecisionOption, type DecisionRandom } from '../../core/decisionRandom';

/**
 * Test-only `DecisionRandom` that forces captured outcomes onto labeled decisions.
 *
 * A forced outcome is used only when the decision's own support allows it: `chance` cannot be forced
 * true at p <= 0 or false at p >= 1, `int` only within its bounds, `choose` only among offered
 * options with positive weight. A constraint the support rules out is a recorded violation (the
 * capture shows something the model could not have drawn there) and the decision is drawn normally.
 * Every replaced decision still consumes one draw of the backing generator, so later draws on the
 * stream stay where they would have been. Unlabeled `next()` passes straight through.
 */
export type ForcedOutcome =
  | { readonly kind: 'chance'; readonly value: boolean }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'choose'; readonly label: string; readonly matches: (value: unknown) => boolean };

export interface DecisionConstraint {
  readonly site: string;
  readonly tick: number;
  /** Omitted fields match any key. */
  readonly actorId?: string;
  readonly targetId?: string;
  readonly ordinal?: number;
  readonly outcome: ForcedOutcome;
  /** Where the observed outcome comes from (capture line or derivation), for reports. */
  readonly evidence: string;
  /** Opportunistic: a constraint the model may legitimately never draw is not reported unused. */
  readonly optional?: boolean;
}

export type DecisionMethod = 'chance' | 'int' | 'choose';

export interface DecisionRecord {
  readonly stream: string;
  readonly method: DecisionMethod;
  readonly key: DecisionKey;
  /** The decided outcome, printed. */
  readonly outcome: string;
  readonly support: string;
  readonly constraint: DecisionConstraint | null;
  /** Why a matching constraint could not be forced. */
  readonly violation?: string;
}

/**
 * Supplies a constraint for a decision no registered constraint matched (e.g. a hitsplat witness
 * that depends on which sim actor is attacking). Returning null leaves the draw unconstrained.
 */
export type ConstraintResolver = (
  key: DecisionKey,
  method: DecisionMethod,
  support: { readonly low?: number; readonly high?: number; readonly probability?: number },
  stream: string,
) => DecisionConstraint | null;

function matches(constraint: DecisionConstraint, key: DecisionKey): boolean {
  return (
    constraint.site === key.site &&
    constraint.tick === key.tick &&
    (constraint.actorId === undefined || constraint.actorId === key.actorId) &&
    (constraint.targetId === undefined || constraint.targetId === key.targetId) &&
    (constraint.ordinal === undefined || constraint.ordinal === key.ordinal)
  );
}

function printValue(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

/** One ledger of constraints and decisions shared by every stream it wraps. */
export class ConstrainedDecisions {
  private pending: DecisionConstraint[] = [];
  private readonly used = new Set<DecisionConstraint>();
  private readonly expired: DecisionConstraint[] = [];
  readonly records: DecisionRecord[] = [];
  resolver: ConstraintResolver | null = null;

  add(...constraints: readonly DecisionConstraint[]): void {
    this.pending.push(...constraints);
  }

  /** Required constraints no decision consumed (optional ones are never reported). */
  unused(): DecisionConstraint[] {
    return [
      ...this.expired,
      ...this.pending.filter((constraint) => !this.used.has(constraint) && constraint.optional !== true),
    ];
  }

  violations(): DecisionRecord[] {
    return this.records.filter((record) => record.violation !== undefined);
  }

  /** Labeled decisions drawn freely, no constraint offered. */
  unconstrained(): DecisionRecord[] {
    return this.records.filter((record) => record.constraint === null);
  }

  /** The last `count` decisions at or before `tick` for which `filter` holds, oldest first. */
  recent(tick: number, filter: (record: DecisionRecord) => boolean, count = 6): DecisionRecord[] {
    const out: DecisionRecord[] = [];
    for (let index = this.records.length - 1; index >= 0 && out.length < count; index--) {
      const record = this.records[index]!;
      if (record.key.tick <= tick && filter(record)) out.unshift(record);
    }
    return out;
  }

  /** Retires consumed constraints and those for ticks before `tick`, keeping the unused report. */
  prune(tick: number): void {
    const active: DecisionConstraint[] = [];
    for (const constraint of this.pending) {
      if (this.used.has(constraint)) continue;
      if (constraint.tick >= tick) active.push(constraint);
      else if (constraint.optional !== true) this.expired.push(constraint);
    }
    this.pending = active;
    this.used.clear();
  }

  private take(stream: string, key: DecisionKey, method: DecisionMethod, support: Parameters<ConstraintResolver>[2]) {
    const constraint = this.pending.find((candidate) => !this.used.has(candidate) && matches(candidate, key));
    if (constraint) {
      this.used.add(constraint);
      return constraint;
    }
    return this.resolver?.(key, method, support, stream) ?? null;
  }

  /** Decisions over one backing stream, recorded in this ledger under `stream`. */
  wrap(stream: string, next: () => number): DecisionRandom {
    const record = (entry: Omit<DecisionRecord, 'stream'>) => this.records.push({ stream, ...entry });
    return {
      next,
      chance: (key, probability) => {
        const constraint = this.take(stream, key, 'chance', { probability });
        const support = `p=${probability}`;
        if (constraint?.outcome.kind === 'chance') {
          const value = constraint.outcome.value;
          if (value ? probability > 0 : probability < 1) {
            next();
            record({ method: 'chance', key, outcome: String(value), support, constraint });
            return value;
          }
          const drawn = next() < probability;
          const violation = `cannot force ${value} at ${support}`;
          record({ method: 'chance', key, outcome: String(drawn), support, constraint, violation });
          return drawn;
        }
        const drawn = next() < probability;
        const violation = constraint ? `expected ${constraint.outcome.kind} outcome` : undefined;
        record({
          method: 'chance',
          key,
          outcome: String(drawn),
          support,
          constraint,
          ...(violation ? { violation } : {}),
        });
        return drawn;
      },
      int: (key, low, high) => {
        const constraint = this.take(stream, key, 'int', { low, high });
        const support = `[${low}, ${high}]`;
        if (constraint?.outcome.kind === 'int') {
          const value = constraint.outcome.value;
          if (Number.isInteger(value) && value >= low && value <= high) {
            next();
            record({ method: 'int', key, outcome: String(value), support, constraint });
            return value;
          }
          const drawn = low + Math.floor(next() * (high - low + 1));
          const violation = `${value} is outside ${support}`;
          record({ method: 'int', key, outcome: String(drawn), support, constraint, violation });
          return drawn;
        }
        const drawn = low + Math.floor(next() * (high - low + 1));
        const violation = constraint ? `expected ${constraint.outcome.kind} outcome` : undefined;
        record({
          method: 'int',
          key,
          outcome: String(drawn),
          support,
          constraint,
          ...(violation ? { violation } : {}),
        });
        return drawn;
      },
      choose: <T>(key: DecisionKey, options: readonly DecisionOption<T>[]): T => {
        const constraint = this.take(stream, key, 'choose', {});
        const support = `${options.filter((option) => option.weight > 0).length} options`;
        if (constraint?.outcome.kind === 'choose') {
          const outcome = constraint.outcome;
          const forced = options.find((option) => option.weight > 0 && outcome.matches(option.value));
          if (forced) {
            next();
            record({ method: 'choose', key, outcome: printValue(forced.value), support, constraint });
            return forced.value;
          }
          const drawn = chooseWeighted(options, next());
          const violation = `${outcome.label} is not among the ${support}`;
          record({ method: 'choose', key, outcome: printValue(drawn), support, constraint, violation });
          return drawn;
        }
        const drawn = chooseWeighted(options, next());
        const violation = constraint ? `expected ${constraint.outcome.kind} outcome` : undefined;
        record({
          method: 'choose',
          key,
          outcome: printValue(drawn),
          support,
          constraint,
          ...(violation ? { violation } : {}),
        });
        return drawn;
      },
    };
  }
}
