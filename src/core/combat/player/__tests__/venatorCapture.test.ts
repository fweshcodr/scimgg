import { expect, it } from 'vitest';
import { coreAudioRules } from '../../../../audio/coreAudioRules';
import { getWeaponCombatVisuals } from '../../../../data/weaponCombatVisuals';
import type { ReplayEffectSourceFrame } from '../../../../render/core/replayEffectContext';
import { describePlayerEffects } from '../../../../render/effects/playerEffectDescriptors';
import type { GameEvent, RicochetFlight } from '../../../events/types';
import { chebyshevDistanceToRect } from '../../distance';
import { calculateProjectileEndTime } from '../../hitDelay';
import { getProjectileTiming } from '../../weaponCombatData';
import { isRicochetReachable, RICOCHET_FLIGHT_CYCLES, ricochetOrigin } from '../ricochet';
import { type CapturedProjanim, VENATOR_CAPTURED_SHOTS } from './fixtures/venatorShotsCapture';

/**
 * Every Venator shot the recording player fired in three Colosseum wave captures, by whether it was
 * recorded before or after the bow's 19 August 2026 target-finding update
 * (`fixtures/venatorShotsCapture.ts`).
 */
const VENATOR_BOW = 27610;
/** Cache NpcType sizes of every captured target: each has an Attack option. */
const NPC_SIZES: Readonly<Record<number, number>> = {
  12810: 2,
  12811: 1,
  12812: 3,
  12814: 1,
  12815: 1,
  12816: 1,
  12817: 3,
  12818: 3,
  12819: 3,
  12821: 5,
  12823: 2,
  12825: 1,
};

type Projanim = CapturedProjanim & { readonly targetSize: number };

function shots() {
  const sized = (projanim: CapturedProjanim): Projanim => ({
    ...projanim,
    targetSize: NPC_SIZES[projanim.targetNpcId] ?? Number.NaN,
  });
  return VENATOR_CAPTURED_SHOTS.map((shot) => ({ ...shot, primary: sized(shot.primary), hops: shot.hops.map(sized) }));
}

it('fires every captured Venator shot with the production visuals, timing, ricochet hops and sounds', () => {
  const visuals = getWeaponCombatVisuals(VENATOR_BOW, 11212);
  const timing = getProjectileTiming(VENATOR_BOW);
  const all = shots();
  const hopCounts = { preUpdate: [0, 0, 0], postUpdate: [0, 0, 0] };
  const lethal = {
    preUpdate: { shots: 0, firstHopFlew: 0, returned: 0 },
    postUpdate: { shots: 0, firstHopFlew: 0, returned: 0 },
  };
  const returns = { preUpdate: 0, postUpdate: 0 };
  let largeTargetShots = 0;
  for (const shot of all) {
    const { primary } = shot;
    if (!primary || !timing || !visuals) throw new Error('Expected a primary arrow and production data');
    expect(shot.launch).toBe(visuals.castSpotanim);
    expect({
      start: primary.start,
      angle: primary.angle,
      progress: primary.progress,
      heights: primary.heights,
    }).toEqual({
      start: visuals.projectileStartDelay,
      angle: visuals.projectileSlope,
      progress: timing.progress,
      heights: [visuals.projectileStartHeight, visuals.projectileEndHeight],
    });
    const distance = chebyshevDistanceToRect(...primary.source, ...primary.target, primary.targetSize);
    expect(primary.end).toBe(calculateProjectileEndTime(timing, distance));
    if (primary.targetSize > 1) largeTargetShots++;

    // Hop `k` leaves the previous target's center tile as the previous projectile lands.
    let previous = { end: primary.end, target: primary.target, size: primary.targetSize };
    const ricochets: RicochetFlight[] = [];
    for (const hop of shot.hops) {
      expect(hop.source).toEqual(ricochetOrigin({ position: [...previous.target], size: previous.size }));
      expect(hop.start).toBe(previous.end);
      expect(hop.end - hop.start).toBe(RICOCHET_FLIGHT_CYCLES);
      expect({ angle: hop.angle, progress: hop.progress, heights: hop.heights }).toEqual({
        angle: 127,
        progress: 0,
        heights: [127, 127],
      });
      expect(
        isRicochetReachable(
          { position: [...previous.target], size: previous.size },
          {
            position: [...hop.target],
            size: hop.targetSize,
          },
        ),
      ).toBe(true);
      ricochets.push({
        targetId: String(hop.targetIndex),
        sourcePosition: hop.source,
        targetPosition: hop.target,
        targetSize: hop.targetSize,
        startCycles: hop.start,
        endCycles: hop.end,
      });
      previous = { end: hop.end, target: hop.target, size: hop.targetSize };
    }
    hopCounts[shot.era][ricochets.length]!++;
    const returned = shot.hops[1]?.targetIndex === primary.targetIndex;
    if (returned) returns[shot.era]++;
    if (shot.primaryKilled) {
      lethal[shot.era].shots++;
      if (shot.hops.length > 0) lethal[shot.era].firstHopFlew++;
      if (returned) lethal[shot.era].returned++;
    }

    const event = {
      type: 'attack_started',
      eventId: 1,
      tick: 0,
      sourceId: 'player',
      targetId: String(primary.targetIndex),
      style: 'range',
      attackKind: 'range_arrow',
      weaponId: VENATOR_BOW,
      ammoId: 11212,
      ...(ricochets.length === 0 ? {} : { ricochets }),
    } satisfies GameEvent;
    const rule = coreAudioRules.attack_started?.resolve;
    const sound = typeof rule === 'function' ? rule(event) : undefined;
    expect(sound?.kind === 'play' ? [sound.sound].flat().sort() : sound).toEqual(shot.sounds);

    // The renderer draws the same hops the capture sent, from the event alone.
    const frame = {
      state: { playerPosition: primary.source, primaryNpcPosition: primary.target, primaryNpcSize: 1, npcs: [] },
      events: [event],
    } as unknown as ReplayEffectSourceFrame;
    const drawn = describePlayerEffects(frame).filter((effect) => effect.kind === 'projectile');
    expect(drawn.map((effect) => effect.kind === 'projectile' && effect.visuals.projectileId)).toEqual([
      2291,
      ...shot.hops.map(() => 2007),
    ]);
  }
  expect({ shots: all.length, largeTargetShots, hopCounts, returns, lethal }).toEqual({
    shots: 124,
    largeTargetShots: 49,
    hopCounts: { preUpdate: [7, 4, 35], postUpdate: [12, 16, 50] },
    returns: { preUpdate: 31, postUpdate: 37 },
    lethal: {
      preUpdate: { shots: 2, firstHopFlew: 2, returned: 0 },
      postUpdate: { shots: 30, firstHopFlew: 24, returned: 0 },
    },
  });
});
