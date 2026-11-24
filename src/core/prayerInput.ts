import { PRAYER_CATEGORIES, type PrayerType } from '../types/simulation';

/** Prayer clicks remain discrete toggles evaluated against live state when processed. */
export type QueuedPrayerAction =
  // Non-null slot actions are prayer-button toggles. Null remains an explicit clear.
  | { readonly type: 'protection'; readonly prayer: PrayerType | null }
  | { readonly type: 'offensive'; readonly prayer: PrayerType | null }
  // An independent prayer stacks with both slots, so its click is a toggle of one membership
  // rather than an assignment to a slot. There is no null form: clearing them all is what
  // turning quick prayers off does.
  | { readonly type: 'independent'; readonly prayer: PrayerType }
  | { readonly type: 'quickPrayers'; readonly selections: readonly PrayerType[] };

export interface PrayerInputState {
  readonly protection: PrayerType | null;
  readonly offensive: PrayerType | null;
  /** Unordered in meaning, but kept deduplicated and in insertion order so replays stay byte-stable. */
  readonly independent: readonly PrayerType[];
  readonly quickPrayersActive: boolean;
}

export type PrayerTransition = {
  /**
   * For `independent`, exactly one of `from`/`to` is null: membership is added or removed, never
   * swapped, because independent prayers do not evict one another.
   */
  readonly slot: 'protection' | 'offensive' | 'independent';
  readonly from: PrayerType | null;
  readonly to: PrayerType | null;
};

export interface PrayerInputOutcome extends PrayerInputState {
  /** True when at least one action in the batch could change the protection slot. */
  readonly protectionTouched: boolean;
  /** True when at least one action in the batch could change the offensive slot. */
  readonly offensiveTouched: boolean;
  /** True when at least one action in the batch could change independent membership. */
  readonly independentTouched: boolean;
  /**
   * Prayers that went from inactive to active while resolving the batch and are
   * still active at the end. Only these earn the drain grace period — a prayer
   * that was already burning and never transitioned does not, which stops rejected
   * or otherwise ineffective inputs from silently buying free prayer.
   */
  readonly activated: readonly PrayerType[];
  /** Prayers whose activation was refused because the player had no prayer points. */
  readonly rejected: readonly PrayerType[];
  /** Every actual per-slot value change, in input replay order. */
  readonly transitions: readonly PrayerTransition[];
}

function splitSelections(selections: readonly PrayerType[]): {
  protection: PrayerType | null;
  offensive: PrayerType | null;
  independent: PrayerType[];
} {
  let protection: PrayerType | null = null;
  let offensive: PrayerType | null = null;
  const independent: PrayerType[] = [];
  for (const prayer of selections) {
    const category = PRAYER_CATEGORIES[prayer];
    if (category === 'protection') protection = prayer;
    else if (category === 'offensive') offensive = prayer;
    else if (category === 'independent' && !independent.includes(prayer)) independent.push(prayer);
  }
  return { protection, offensive, independent };
}

/** One queued input paired with whether the player had prayer points when it ran. */
export interface PrayerActionStep {
  readonly action: QueuedPrayerAction;
  readonly hasPrayerPoints: boolean;
}

/**
 * Replay an ordered batch of prayer inputs against `start`, exactly as the
 * server would apply the packets it received during one tick.
 *
 * Availability is per STEP because a restore dose earlier in the same tick's FIFO can
 * write the points this guard reads — see {@link projectPendingPrayerInput}.
 *
 * Pure: the engine uses it to commit the tick, and the state snapshot uses it to
 * report the client-predicted result of inputs that have not been ticked yet.
 */
export function resolvePrayerActionSteps(
  start: PrayerInputState,
  steps: readonly PrayerActionStep[],
): PrayerInputOutcome {
  let protection = start.protection;
  let offensive = start.offensive;
  let independent: readonly PrayerType[] = start.independent;
  let quickPrayersActive = start.quickPrayersActive;
  let protectionTouched = false;
  let offensiveTouched = false;
  let independentTouched = false;
  const activated = new Set<PrayerType>();
  const rejected: PrayerType[] = [];
  const transitions: PrayerTransition[] = [];

  const activate = (from: PrayerType | null, to: PrayerType | null): void => {
    if (to !== null && to !== from) activated.add(to);
  };

  const setProtection = (next: PrayerType | null): void => {
    if (protection === next) return;
    transitions.push({ slot: 'protection', from: protection, to: next });
    protection = next;
  };

  const setOffensive = (next: PrayerType | null): void => {
    if (offensive === next) return;
    transitions.push({ slot: 'offensive', from: offensive, to: next });
    offensive = next;
  };

  const setIndependent = (next: readonly PrayerType[]): void => {
    // Removals before additions: each becomes a `prayer_changed` event, and swapping the loops
    // would play the activation sound before the deactivation it replaces.
    for (const prayer of independent) {
      if (!next.includes(prayer)) transitions.push({ slot: 'independent', from: prayer, to: null });
    }
    for (const prayer of next) {
      if (!independent.includes(prayer)) transitions.push({ slot: 'independent', from: null, to: prayer });
    }
    independent = [...next];
  };

  for (const { action, hasPrayerPoints } of steps) {
    if (action.type === 'protection') {
      protectionTouched = true;
      quickPrayersActive = false;
      if (action.prayer === null || action.prayer === protection) {
        setProtection(null);
      } else if (!hasPrayerPoints) {
        rejected.push(action.prayer);
      } else {
        activate(protection, action.prayer);
        setProtection(action.prayer);
      }
      continue;
    }

    if (action.type === 'offensive') {
      offensiveTouched = true;
      quickPrayersActive = false;
      if (action.prayer === null || action.prayer === offensive) {
        setOffensive(null);
      } else if (!hasPrayerPoints) {
        rejected.push(action.prayer);
      } else {
        activate(offensive, action.prayer);
        setOffensive(action.prayer);
      }
      continue;
    }

    if (action.type === 'independent') {
      independentTouched = true;
      quickPrayersActive = false;
      if (independent.includes(action.prayer)) {
        setIndependent(independent.filter((prayer) => prayer !== action.prayer));
      } else if (!hasPrayerPoints) {
        rejected.push(action.prayer);
      } else {
        activated.add(action.prayer);
        setIndependent([...independent, action.prayer]);
      }
      continue;
    }

    if (quickPrayersActive) {
      protectionTouched = true;
      offensiveTouched = true;
      independentTouched = true;
      quickPrayersActive = false;
      setProtection(null);
      setOffensive(null);
      setIndependent([]);
      continue;
    }

    const next = splitSelections(action.selections);
    if (next.protection === null && next.offensive === null && next.independent.length === 0) {
      // Nothing is assigned to the quick-prayer set, so there is nothing to turn
      // on and the flag stays where it was.
      continue;
    }
    if (!hasPrayerPoints) {
      rejected.push(next.protection ?? next.offensive ?? (next.independent[0] as PrayerType));
      continue;
    }
    protectionTouched = true;
    offensiveTouched = true;
    independentTouched = true;
    quickPrayersActive = true;
    activate(protection, next.protection);
    activate(offensive, next.offensive);
    // An independent prayer the set merely RETAINS was already burning, so it must not collect a
    // fresh activation stamp and buy itself another drain-free tick.
    for (const prayer of next.independent) {
      if (!independent.includes(prayer)) activated.add(prayer);
    }
    setProtection(next.protection);
    setOffensive(next.offensive);
    setIndependent(next.independent);
  }

  return {
    protection,
    offensive,
    independent,
    quickPrayersActive,
    protectionTouched,
    offensiveTouched,
    independentTouched,
    activated: [...activated].filter(
      (prayer) => prayer === protection || prayer === offensive || independent.includes(prayer),
    ),
    rejected,
    transitions,
  };
}

/** Every input judged against the same availability. */
export function resolvePrayerActions(
  start: PrayerInputState,
  actions: readonly QueuedPrayerAction[],
  hasPrayerPoints: boolean,
): PrayerInputOutcome {
  return resolvePrayerActionSteps(
    start,
    actions.map((action) => ({ action, hasPrayerPoints })),
  );
}
