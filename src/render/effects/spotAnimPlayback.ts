import type { SpotAnimRenderer } from './SpotAnimRenderer';
import type { SpotAnimSpawnRequest, SpotAnimStyle, TransformSource } from './spotAnimTypes';

export type OneShotSpotAnimRenderer = Pick<SpotAnimRenderer, 'isLoaded' | 'getFrameLengths' | 'upsert' | 'despawn'>;

export type OneShotSpotAnimRequest = {
  readonly instanceId: string;
  readonly spotAnimId: number;
  readonly startCycle: number;
  readonly transformSource: TransformSource;
  readonly style?: SpotAnimStyle;
  readonly heightOffsetMode: NonNullable<SpotAnimSpawnRequest['heightOffsetMode']>;
  readonly fallbackDurationCycles: number;
};

export type OneShotSpotAnimStatus = 'pending' | 'active' | 'unloaded' | 'expired';

type OneShotSpawnRequest = SpotAnimSpawnRequest & {
  readonly lifecycle: { kind: 'oneShot'; startTick: number; durationTicks: number };
};

export function getOneShotDurationCycles(
  renderer: Pick<SpotAnimRenderer, 'getFrameLengths'>,
  spotAnimId: number,
  fallbackDurationCycles: number,
): number {
  const frameLengths = renderer.getFrameLengths(spotAnimId);
  let durationCycles = 0;
  // Indexed: an array iterator is allocated wherever it is not optimized away, and this runs per effect per frame.
  if (frameLengths)
    for (let index = 0; index < frameLengths.length; index++) durationCycles += frameLengths[index] as number;
  return durationCycles > 0 ? durationCycles : fallbackDurationCycles;
}

function spawnRequestOf(request: OneShotSpotAnimRequest): OneShotSpawnRequest {
  return {
    instanceId: request.instanceId,
    spotAnimId: request.spotAnimId,
    transform: request.transformSource,
    lifecycle: { kind: 'oneShot', startTick: 0, durationTicks: 0 },
    style: request.style,
    heightOffsetMode: request.heightOffsetMode,
  };
}

/** Upserts `spawn` (built from `request` when absent) while the effect plays; despawns it otherwise. */
function playOneShot(
  renderer: OneShotSpotAnimRenderer,
  request: OneShotSpotAnimRequest,
  cycle: number,
  spawn: OneShotSpawnRequest | undefined,
): OneShotSpotAnimStatus {
  const { instanceId, spotAnimId, startCycle, fallbackDurationCycles } = request;
  if (!renderer.isLoaded(spotAnimId)) {
    renderer.despawn(instanceId);
    return 'unloaded';
  }
  const durationCycles = getOneShotDurationCycles(renderer, spotAnimId, fallbackDurationCycles);
  if (durationCycles <= 0 || cycle >= startCycle + durationCycles) {
    renderer.despawn(instanceId);
    return 'expired';
  }
  if (cycle < startCycle) {
    renderer.despawn(instanceId);
    return 'pending';
  }
  const upserted = spawn ?? spawnRequestOf(request);
  upserted.lifecycle.startTick = startCycle / 30;
  upserted.lifecycle.durationTicks = durationCycles / 30;
  renderer.upsert(upserted);
  return 'active';
}

export function updateOneShotSpotAnim(
  renderer: OneShotSpotAnimRenderer,
  request: OneShotSpotAnimRequest,
  cycle: number,
): OneShotSpotAnimStatus {
  return playOneShot(renderer, request, cycle, undefined);
}

/**
 * One one-shot effect kept from frame to frame, for a caller that updates many of them every frame:
 * its request, and the spawn request it upserts, are built once, so an update allocates nothing.
 * The request's transform and style are read again every frame, so they must stay current.
 */
export class OneShotSpotAnim {
  private readonly spawn: OneShotSpawnRequest;

  constructor(readonly request: OneShotSpotAnimRequest) {
    this.spawn = spawnRequestOf(request);
  }

  update(renderer: OneShotSpotAnimRenderer, cycle: number): OneShotSpotAnimStatus {
    return playOneShot(renderer, this.request, cycle, this.spawn);
  }
}
