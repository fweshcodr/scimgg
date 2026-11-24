import { MAX_REPLAY_SNAPSHOT_ENTRIES, MAX_REPLAY_SNAPSHOT_NPCS, ReplaySafetyError } from './replaySafety';

export const REPLAY_TAKEOVER_LIMITS = {
  maxActions: 16_384,
  maxNpcs: 2 * MAX_REPLAY_SNAPSHOT_NPCS,
  maxSpawns: MAX_REPLAY_SNAPSHOT_ENTRIES,
  maxNpcTicks: 2 * MAX_REPLAY_SNAPSHOT_ENTRIES,
  maxTicks: 65_536,
} as const;

export type ReplayTakeoverLimits = { readonly [Key in keyof typeof REPLAY_TAKEOVER_LIMITS]: number };

export class ReplayTakeoverWork {
  readonly limits: ReplayTakeoverLimits;
  frameIndex = 0;
  private actions = 0;
  private spawns = 0;
  private npcTicks = 0;
  private ticks = 0;
  private inTick = false;
  private failure: ReplaySafetyError | undefined;

  constructor(limits: Partial<ReplayTakeoverLimits> = {}) {
    this.limits = { ...REPLAY_TAKEOVER_LIMITS, ...limits };
    for (const limit of Object.values(this.limits)) {
      if (!Number.isSafeInteger(limit) || limit < 0) throw new ReplaySafetyError('takeover-work-limit');
    }
  }

  private check(actual: number, limit: number): void {
    if (this.failure) throw this.failure;
    if (!Number.isSafeInteger(actual) || actual > limit || actual < 0) {
      this.failure = new ReplaySafetyError('takeover-work-limit', {
        ...(Number.isSafeInteger(actual) ? { actual } : {}),
        limit,
        frameIndex: this.frameIndex,
      });
      throw this.failure;
    }
  }

  checkPrefix(frames: readonly { readonly actions: readonly unknown[] }[], throughFrameIndex: number): void {
    this.check(throughFrameIndex, Math.min(frames.length - 1, this.limits.maxTicks));
    let actions = 0;
    for (let index = 1; index <= throughFrameIndex; index++) {
      this.frameIndex = index;
      actions += frames[index].actions.length;
      this.check(actions, this.limits.maxActions);
    }
    this.frameIndex = 0;
  }

  recordAction(): void {
    this.check(this.actions + 1, this.limits.maxActions);
    this.actions++;
  }

  admitNpcs(currentCount: number, addedCount: number): void {
    this.check(currentCount + addedCount, this.limits.maxNpcs);
    this.check(this.spawns + addedCount, this.limits.maxSpawns);
    if (this.inTick) this.check(this.npcTicks + addedCount, this.limits.maxNpcTicks);
    this.spawns += addedCount;
    if (this.inTick) this.npcTicks += addedCount;
  }

  beginTick(npcCount: number): void {
    this.check(this.ticks + 1, this.limits.maxTicks);
    this.check(this.npcTicks + npcCount, this.limits.maxNpcTicks);
    this.ticks++;
    this.npcTicks += npcCount;
    this.inTick = true;
  }

  endTick(): void {
    this.inTick = false;
  }

  getStats() {
    return { actions: this.actions, spawns: this.spawns, npcTicks: this.npcTicks, ticks: this.ticks };
  }
}
