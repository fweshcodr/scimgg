import type { ReplayCursorSample } from './ReplayRecorder';

export const REPLAY_CURSOR_HZ = 60;
export const REPLAY_CURSOR_INTERPOLATION_GAP_MS = 50;
const MIN_STATIONARY_HOLD_MS = 1000 / REPLAY_CURSOR_HZ;

function samePosition(left: ReplayCursorSample, right: ReplayCursorSample): boolean {
  return left.x === right.x && left.y === right.y && left.insideFrame === right.insideFrame;
}

function canDiscardTail(samples: readonly ReplayCursorSample[], sample: ReplayCursorSample, end: number): boolean {
  const previous = samples[end - 1];
  const prior = samples[end - 2];
  const beforePrior = samples[end - 3];
  if (!prior || !previous || previous.pinned || sample.pinned || previous.breakBefore || sample.breakBefore)
    return false;
  if (previous.insideFrame !== sample.insideFrame || prior.insideFrame !== previous.insideFrame) return false;
  // Dropping a device switch would replay the old device's hover and cursor until the next kept sample.
  if (previous.touch !== sample.touch || prior.touch !== previous.touch) return false;
  const held = samePosition(prior, previous);
  if (samePosition(previous, sample)) return held;
  if (held && previous.tMs - prior.tMs >= MIN_STATIONARY_HOLD_MS) return false;
  if (beforePrior && samePosition(beforePrior, prior) && prior.tMs - beforePrior.tMs >= MIN_STATIONARY_HOLD_MS)
    return false;
  return (
    previous.tMs - prior.tMs <= REPLAY_CURSOR_INTERPOLATION_GAP_MS &&
    sample.tMs - previous.tMs <= REPLAY_CURSOR_INTERPOLATION_GAP_MS
  );
}

const APPEND = { fromEnd: 0, count: 0 } as const;
const REPLACE_TAIL = { fromEnd: 1, count: 1 } as const;
const REPLACE_BRIEF_HOLD = { fromEnd: 2, count: 2 } as const;
const REMOVE_BRIEF_ARRIVAL = { fromEnd: 2, count: 1 } as const;

function sameBucket(left: ReplayCursorSample, right: ReplayCursorSample): boolean {
  return Math.floor((left.tMs * REPLAY_CURSOR_HZ) / 1000) === Math.floor((right.tMs * REPLAY_CURSOR_HZ) / 1000);
}

export function replayCursorTailUpdate(
  samples: readonly ReplayCursorSample[],
  sample: ReplayCursorSample,
): typeof APPEND | typeof REPLACE_TAIL | typeof REPLACE_BRIEF_HOLD | typeof REMOVE_BRIEF_ARRIVAL {
  if (!canDiscardTail(samples, sample, samples.length)) return APPEND;
  const previous = samples.at(-1);
  const prior = samples.at(-2);
  if (
    previous &&
    prior &&
    samePosition(previous, prior) &&
    !samePosition(previous, sample) &&
    previous.tMs - prior.tMs < MIN_STATIONARY_HOLD_MS &&
    sameBucket(prior, previous) &&
    canDiscardTail(samples, sample, samples.length - 1)
  )
    return sameBucket(previous, sample) ? REPLACE_BRIEF_HOLD : REMOVE_BRIEF_ARRIVAL;
  return previous && (samePosition(previous, sample) || sameBucket(previous, sample)) ? REPLACE_TAIL : APPEND;
}
