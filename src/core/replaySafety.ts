export type ReplaySafetyReason =
  | 'invalid-clock'
  | 'projectile-work-limit'
  | 'invalid-geometry'
  | 'movement-path-limit'
  | 'validation-work-limit'
  | 'snapshot-work-limit'
  | 'takeover-work-limit';

/**
 * `diffResumableState` stops collecting at this many differences.
 */
export const MAX_RESUMABLE_STATE_DIFFS = 12;

export class ReplaySafetyError extends Error {
  readonly name = 'ReplaySafetyError';

  constructor(
    readonly reason: ReplaySafetyReason,
    readonly details: { readonly actual?: number; readonly limit?: number; readonly frameIndex?: number } = {},
  ) {
    super(reason);
  }
}

// One reconstruction across both projectile controllers, not the sum of every flight's lifetime.
export const MAX_REPLAY_PROJECTILE_STEPS = 262_144;
export const MAX_REPLAY_BOOTSTRAP_ATTACK_STYLES = 256;
export const MAX_REPLAY_SNAPSHOT_NPCS = 1_024;
export const MAX_REPLAY_SNAPSHOT_ENTRIES = 131_072;

export function isSafeReplayCycle(cycle: number): boolean {
  return Number.isSafeInteger(cycle) && cycle >= 0 && Number.isSafeInteger((cycle + 30) * 20);
}
