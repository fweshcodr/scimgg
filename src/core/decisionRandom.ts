/**
 * Labeled random decisions over an existing generator. A decision site states what it decides
 * (`DecisionKey`) and the outcome's support; the default implementation turns exactly one generator
 * draw into the outcome with the arithmetic the site used before it was labeled, so labeling a site
 * never changes a seeded run. Tests can substitute an implementation that forces observed outcomes
 * (src/test/capture/constrainedRandom.ts). Eligibility (whether a decision is drawn at all, and which
 * options are offered) stays with the caller: every call is one draw.
 */
export interface DecisionKey {
  /** Stable site name, e.g. `inferno.blob.style`. */
  readonly site: string;
  readonly tick: number;
  readonly actorId?: string;
  readonly targetId?: string;
  /** Distinguishes draws of one site in one call (a shuffle's swap index, a nibbler's spawn order). */
  readonly ordinal?: number;
}

export interface DecisionOption<T> {
  readonly value: T;
  readonly weight: number;
}

export interface DecisionRandom {
  /** One unlabeled draw in [0, 1). */
  next(): number;
  /** `next() < probability`. */
  chance(key: DecisionKey, probability: number): boolean;
  /** `low + floor(next() * (high - low + 1))`, inclusive bounds. */
  int(key: DecisionKey, low: number, high: number): number;
  /**
   * Weighted pick in option order: `roll = next() * totalWeight`, the first option whose weight
   * exceeds the remaining roll. Uniform integer weights give `options[floor(next() * n)]` exactly.
   */
  choose<T>(key: DecisionKey, options: readonly DecisionOption<T>[]): T;
}

/** The default: each decision is one draw from `next`, mapped as documented on {@link DecisionRandom}. */
export function generatorDecisionRandom(next: () => number): DecisionRandom {
  return {
    next,
    chance: (_key, probability) => next() < probability,
    int: (_key, low, high) => low + Math.floor(next() * (high - low + 1)),
    choose: (_key, options) => chooseWeighted(options, next()),
  };
}

/** Maps a draw in [0, 1) to a weighted option; shared so substitutes map floats identically. */
export function chooseWeighted<T>(options: readonly DecisionOption<T>[], draw: number): T {
  let roll = draw * options.reduce((total, option) => total + option.weight, 0);
  for (const option of options) {
    if (roll < option.weight) return option.value;
    roll -= option.weight;
  }
  throw new RangeError('A weighted decision requires finite positive weights and a draw in [0, 1)');
}

/** Equal weights over `values`, in order. */
export function uniformOptions<T>(values: readonly T[]): DecisionOption<T>[] {
  return values.map((value) => ({ value, weight: 1 }));
}

/**
 * Up to `count` distinct values, uniformly without replacement: one `choose` per pick (`ordinal` 0, 1,
 * ...) over the values not yet picked, in their original order. Returns fewer when `values` runs out.
 */
export function chooseDistinct<T>(
  decisions: DecisionRandom,
  key: Omit<DecisionKey, 'ordinal'>,
  values: readonly T[],
  count: number,
): T[] {
  const remaining = [...values];
  const picked: T[] = [];
  for (let ordinal = 0; ordinal < count && remaining.length > 0; ordinal++) {
    const value = decisions.choose({ ...key, ordinal }, uniformOptions(remaining));
    remaining.splice(remaining.indexOf(value), 1);
    picked.push(value);
  }
  return picked;
}

/**
 * The decisions a context draws from: its own when it carries them, otherwise its `random` stream.
 * Contexts that only override `random` (most unit tests) keep working unchanged.
 */
export function contextDecisions(context: {
  readonly random: () => number;
  readonly decisions?: DecisionRandom;
}): DecisionRandom {
  return context.decisions ?? generatorDecisionRandom(context.random);
}

/** A turn's decision stream with its tick, the form `resolveAttackRequest({ labelled })` takes. */
export function contextAttackDecisions(context: {
  readonly tick: number;
  readonly random: () => number;
  readonly decisions?: DecisionRandom;
}): { readonly decisions: DecisionRandom; readonly tick: number } {
  return { decisions: contextDecisions(context), tick: context.tick };
}
