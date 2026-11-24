import { MAX_REPLAY_PROJECTILE_STEPS, ReplaySafetyError } from '../../core/replaySafety';

export class ReplayProjectileWork {
  private samples = 0;

  charge(samples: number): void {
    const actual = this.samples + samples;
    if (!Number.isSafeInteger(actual) || samples < 0 || actual > MAX_REPLAY_PROJECTILE_STEPS) {
      throw new ReplaySafetyError('projectile-work-limit', { actual, limit: MAX_REPLAY_PROJECTILE_STEPS });
    }
    this.samples = actual;
  }
}
