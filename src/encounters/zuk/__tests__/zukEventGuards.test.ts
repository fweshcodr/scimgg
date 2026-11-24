import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../core/events/types';
import { isZukGroundEffectEvent } from '../../../npcs/inferno/events';
import { ZUK_SPARK_IMPACT_DELAY_TICKS } from '../constants';

/**
 * The spark's splat and its projectile land on the SAME tick, `launchTick +
 * ZUK_SPARK_IMPACT_DELAY_TICKS`. The guard pins both fields to it independently, so drift in
 * either one is rejected at the runtime boundary - each case below holds the other field
 * valid to isolate it.
 */
describe('Zuk visual event guards', () => {
  const LAUNCH = 10;
  const LANDING = LAUNCH + ZUK_SPARK_IMPACT_DELAY_TICKS;

  const valid: GameEvent = {
    eventId: 1,
    tick: LAUNCH,
    type: 'zuk_ground_effect',
    effect: 'jal_mejjak_spark',
    sourceId: 'zuk_healer_1',
    sourcePosition: [36, 51],
    targetPositions: [
      [31, 45],
      [32, 44],
      [33, 43],
    ],
    launchTick: LAUNCH,
    impactTick: LANDING,
    projectileEndTick: LANDING,
  };

  it('accepts a spark whose splat and projectile both land at launch + 3', () => {
    expect(isZukGroundEffectEvent(valid)).toBe(true);
  });

  it.each([LANDING - 1, LANDING + 1])('rejects impactTick %i, holding projectileEndTick valid', (impactTick) => {
    expect(isZukGroundEffectEvent({ ...valid, impactTick })).toBe(false);
  });

  it.each([LANDING - 1, LANDING + 1])('rejects projectileEndTick %i, holding impactTick valid', (projectileEndTick) => {
    expect(isZukGroundEffectEvent({ ...valid, projectileEndTick })).toBe(false);
  });
});
