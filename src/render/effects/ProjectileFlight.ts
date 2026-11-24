import { isSafeReplayCycle, ReplaySafetyError } from '../../core/replaySafety';
import {
  advanceProjectileMotion,
  aimProjectileMotion,
  createProjectileMotion,
  type ProjectileEndpoint,
  type ProjectileMotion,
  projectileDirection,
  projectileEndpoint,
} from './projectileMotion';
import { ReplayProjectileWork } from './replayProjectileWork';
import type { SpotAnimRenderer } from './SpotAnimRenderer';
import { PROJECTILE_FLIGHT_STYLE } from './spotAnimRenderPolicy';
import type { SpotAnimStyle } from './spotAnimTypes';

export type ProjectileFlightRenderer = Pick<
  SpotAnimRenderer,
  'isLoaded' | 'getFrameLengths' | 'getFrameStep' | 'upsert' | 'despawn'
>;

export type ProjectileFlightConfig = {
  readonly instanceId: string;
  readonly spotAnimId: number;
  readonly startCycle: number;
  readonly endCycleExclusive: number;
  readonly startOffset: number;
  readonly slope: number;
  readonly animationLoop: 'full-sequence' | 'frame-step';
  readonly heightOffsetMode: 'sequence' | 'actor';
  readonly style?: SpotAnimStyle;
};

export type ProjectileFlightFrame = {
  readonly cycle: number;
  readonly source: ProjectileEndpoint;
  readonly target: ProjectileEndpoint;
};

type FlightSample =
  | { readonly kind: 'pending' }
  | { readonly kind: 'active'; readonly motion: ProjectileMotion }
  | { readonly kind: 'expired' };

export class ProjectileFlight {
  private cycle: number;
  private motion: ProjectileMotion | null = null;

  constructor(readonly config: ProjectileFlightConfig) {
    this.cycle = config.startCycle;
  }

  sample(frame: ProjectileFlightFrame): FlightSample {
    const { startCycle, endCycleExclusive, startOffset, slope } = this.config;
    if (startCycle === endCycleExclusive || frame.cycle >= endCycleExclusive) return { kind: 'expired' };
    if (frame.cycle < startCycle) return { kind: 'pending' };
    let motion =
      this.motion ??
      createProjectileMotion(
        { source: frame.source, target: frame.target, startOffset, slope },
        endCycleExclusive - startCycle,
      );
    const elapsed = frame.cycle - this.cycle;
    if (elapsed > 0) {
      motion = advanceProjectileMotion(
        aimProjectileMotion(motion, projectileEndpoint(frame.target), endCycleExclusive - this.cycle),
        elapsed,
      );
      this.cycle = frame.cycle;
    }
    this.motion = motion;
    return { kind: 'active', motion };
  }

  update(renderer: ProjectileFlightRenderer, frame: ProjectileFlightFrame): FlightSample['kind'] {
    const sample = this.sample(frame);
    const { instanceId, spotAnimId, startCycle, endCycleExclusive, heightOffsetMode, style } = this.config;
    switch (sample.kind) {
      case 'pending':
      case 'expired':
        renderer.despawn(instanceId);
        return sample.kind;
      case 'active': {
        if (!renderer.isLoaded(spotAnimId)) {
          renderer.despawn(instanceId);
          return 'active';
        }
        const { position, velocity } = sample.motion;
        const direction = projectileDirection(sample.motion);
        const yawRadians = Math.atan2(velocity.x, velocity.y) + Math.PI;
        renderer.upsert({
          instanceId,
          spotAnimId,
          transform: {
            kind: 'static',
            value: {
              position: [position.x, position.y, position.z],
              yaw2048: ((yawRadians * 2048) / (2 * Math.PI) + 2048) % 2048,
              pitchRad: -direction.pitchRadians,
            },
          },
          lifecycle: { kind: 'duration', startTick: startCycle / 30, endTick: endCycleExclusive / 30 },
          heightOffsetMode,
          projectile: true,
          style: { ...PROJECTILE_FLIGHT_STYLE, ...style },
          frameProgress: this.frameProgress(renderer, frame.cycle - startCycle),
        });
        return 'active';
      }
      default: {
        const exhaustive: never = sample;
        return exhaustive;
      }
    }
  }

  updateReplay(
    renderer: ProjectileFlightRenderer,
    destinationCycle: number,
    frameAt: (cycle: number) => ProjectileFlightFrame,
    work = new ReplayProjectileWork(),
  ): FlightSample['kind'] {
    const { startCycle, endCycleExclusive } = this.config;
    if (
      !isSafeReplayCycle(startCycle) ||
      !isSafeReplayCycle(endCycleExclusive) ||
      endCycleExclusive < startCycle ||
      !Number.isFinite(destinationCycle) ||
      destinationCycle < 0 ||
      !isSafeReplayCycle(Math.ceil(destinationCycle)) ||
      !isSafeReplayCycle(this.cycle)
    ) {
      throw new ReplaySafetyError('invalid-clock');
    }
    if (startCycle === endCycleExclusive) {
      renderer.despawn(this.config.instanceId);
      return 'expired';
    }
    const active = destinationCycle >= startCycle && destinationCycle < endCycleExclusive;
    const rewind = destinationCycle < this.cycle;
    const baseCycle = rewind ? startCycle : this.cycle;
    const initialize = active && (rewind || !this.motion);
    const steps = active ? Math.max(0, Math.floor(destinationCycle) - baseCycle) : 0;
    work.charge(steps + (initialize ? 1 : 0) + 1);
    const replayFrameAt = (cycle: number) => {
      const frame = frameAt(cycle);
      if (frame.cycle !== cycle) throw new ReplaySafetyError('invalid-clock');
      return frame;
    };
    if (rewind) {
      this.cycle = startCycle;
      this.motion = null;
    }
    if (initialize) this.sample(replayFrameAt(startCycle));
    for (let step = 1; step <= steps; step++) {
      const nextCycle = baseCycle + step;
      if (nextCycle <= this.cycle) throw new ReplaySafetyError('invalid-clock');
      this.sample(replayFrameAt(nextCycle));
    }
    const savedCycle = this.cycle;
    const savedMotion = this.motion;
    try {
      return this.update(renderer, replayFrameAt(destinationCycle));
    } finally {
      this.cycle = savedCycle;
      this.motion = savedMotion;
    }
  }

  private frameProgress(renderer: ProjectileFlightRenderer, elapsed: number): number {
    const { spotAnimId, animationLoop, startCycle, endCycleExclusive } = this.config;
    const lengths = renderer.getFrameLengths(spotAnimId) ?? [];
    const duration = lengths.reduce((total, length) => total + length, 0);
    switch (animationLoop) {
      case 'full-sequence': {
        const period = duration > 0 ? duration : endCycleExclusive - startCycle;
        return (elapsed % period) / period;
      }
      case 'frame-step': {
        if (duration <= 0) return 0;
        if (elapsed < duration) return elapsed / duration;
        const frameStep = renderer.getFrameStep(spotAnimId) ?? -1;
        const loopStartFrame = frameStep > 0 && frameStep <= lengths.length ? lengths.length - frameStep : 0;
        const loopStart = lengths.slice(0, loopStartFrame).reduce((total, length) => total + length, 0);
        const loopDuration = duration - loopStart;
        return loopDuration > 0 ? (loopStart + ((elapsed - duration) % loopDuration)) / duration : 0;
      }
      default: {
        const exhaustive: never = animationLoop;
        return exhaustive;
      }
    }
  }
}
