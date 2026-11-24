import { chebyshevDistanceToRect } from '../../core/combat/distance';
import { calculateProjectileEndTime, PROJ_ANIM_TIMINGS, type ProjAnimTiming } from '../../core/combat/hitDelay';
import { getSpecialAttackDef } from '../../core/combat/player/specialAttacks/registry';
import type { SpecialAttackDef } from '../../core/combat/player/specialAttacks/types';
import { getProjectileTiming } from '../../core/combat/weaponCombatData';
import { isCoreEvent, type RicochetFlight } from '../../core/events/types';
import { getSpellVisuals } from '../../data/spellVisuals';
import { getMeleeSweep, getWeaponCombatVisuals } from '../../data/weaponCombatVisuals';
import type { WeaponCombatVisuals } from '../../data/weaponCombatVisuals.generated';
import type { Coordinate } from '../../types/simulation';
import type { ReplayEffectSourceFrame } from '../core/replayEffectContext';

export type PlayerGraphicDescriptor = {
  readonly kind: 'graphic';
  readonly key: string;
  readonly tick: number;
  readonly spotAnimId: number;
  readonly height: number;
};

export type EffectTarget = {
  readonly position: Readonly<Coordinate>;
  readonly size: number;
  readonly npcTypeId: number;
  /** The actor the graphic follows and turns with; `undefined` pins it, unrotated, to the tile. */
  readonly actorId: string | undefined;
};

export type PlayerProjectileDescriptor = {
  readonly kind: 'projectile';
  readonly key: string;
  readonly tick: number;
  readonly source: Readonly<Coordinate>;
  readonly target: EffectTarget;
  readonly weaponId: number;
  readonly visuals: WeaponCombatVisuals;
  readonly timing: ProjAnimTiming | undefined;
  readonly presentation: { readonly origin?: 'caster' | 'target'; readonly impactHeightMode?: 'sequence' | 'actor' };
};

export type PlayerImpactDescriptor = {
  readonly kind: 'impact';
  readonly key: string;
  readonly tick: number;
  readonly startTick: number;
  readonly target: EffectTarget;
  readonly spotAnimId: number;
  readonly height: number;
  readonly heightMode: 'sequence' | 'actor';
};

export type PlayerEffectDescriptor = PlayerGraphicDescriptor | PlayerProjectileDescriptor | PlayerImpactDescriptor;
export type PlayerTravelDescriptor = PlayerProjectileDescriptor | PlayerImpactDescriptor;

export function projectileEndCycle(
  launch: Pick<PlayerProjectileDescriptor, 'tick' | 'source' | 'target' | 'weaponId' | 'timing' | 'visuals'>,
): number {
  const timing = launch.timing ?? getProjectileTiming(launch.weaponId);
  const distance = chebyshevDistanceToRect(...launch.source, ...launch.target.position, launch.target.size);
  return (
    launch.tick * 30 +
    (timing ? calculateProjectileEndTime(timing, distance) : launch.visuals.projectileStartDelay + 30)
  );
}

/**
 * What a magic attack that fails its accuracy roll shows on the target instead of its own impact:
 * `failedspell_impact`, at `height=124` on 249/249 player splashes across the captures (e.g.
 * capture inferno-waves-69-zuk-packet-data.txt:15038). The packet height is the whole offset.
 */
const SPLASH_IMPACT = { spotAnimId: 85, height: 124, heightMode: 'actor' } as const;

/**
 * A ricochet hop: `nex_finale_attack_proj` (2007) at angle 127, progress 0, heights 127/127 on all 190
 * hops in the three Colosseum wave captures, 116 of them after the 19 August 2026 update (e.g.
 * capture colosseum-waves-bees-death(no-sol)-packet-data-1.txt, tick 2816). The event carries
 * each hop's own start and end, so its flight ignores distance.
 */
function ricochetProjectile(
  key: string,
  event: Extract<ReplayEffectSourceFrame['events'][number], { type: 'attack_started' }>,
  ricochet: RicochetFlight,
  npcTypeId: number,
): PlayerProjectileDescriptor {
  return {
    kind: 'projectile',
    key,
    tick: event.tick,
    source: ricochet.sourcePosition,
    target: { position: ricochet.targetPosition, size: ricochet.targetSize, npcTypeId, actorId: ricochet.targetId },
    weaponId: event.weaponId ?? 0,
    timing: {
      delay: ricochet.startCycles,
      lengthAdjustment: ricochet.endCycles - ricochet.startCycles,
      stepMultiplier: 0,
      progress: 0,
    },
    presentation: {},
    visuals: {
      attackAnimation: -1,
      castSpotanim: -1,
      castSpotanimHeight: 0,
      projectileId: RICOCHET_PROJECTILE_SPOTANIM,
      projectileStartHeight: 127,
      projectileEndHeight: 127,
      projectileSlope: 127,
      projectileStartDelay: ricochet.startCycles,
      hitSpotanim: -1,
      hitSpotanimHeight: 0,
    },
  };
}

/** RuneLite gameval `SpotanimID.NEX_FINALE_ATTACK_PROJ`. */
export const RICOCHET_PROJECTILE_SPOTANIM = 2007;

/** A projectile-timed graphic needs the launch snapshot to find its arrival; without one it is skipped. */
function targetGraphicDelayCycles(
  event: Extract<ReplayEffectSourceFrame['events'][number], { type: 'attack_started' }>,
  graphic: NonNullable<SpecialAttackDef['targetGraphic']>,
): number | undefined {
  if (graphic.delayCycles !== 'projectile_arrival') return graphic.delayCycles;
  const cast = event.spellCast;
  const timing = event.weaponId === undefined ? undefined : getProjectileTiming(event.weaponId, true);
  if (!cast || !timing) return undefined;
  return calculateProjectileEndTime(
    timing,
    chebyshevDistanceToRect(
      cast.sourcePosition[0],
      cast.sourcePosition[1],
      cast.targetPosition[0],
      cast.targetPosition[1],
      cast.targetSize,
    ),
  );
}

/**
 * The swing graphic a sweeping weapon lays on the tile in front of the player, on every swing, hit or
 * miss. Melee only reaches cardinally, so the target's footprint always touches exactly one of the
 * player's four neighbors; any other layout draws nothing rather than guessing a direction.
 */
function meleeSweepEffect(
  weaponId: number | undefined,
  player: Readonly<Coordinate>,
  target: EffectTarget,
):
  | { readonly tile: Coordinate; readonly spotAnimId: number; readonly delayCycles: number; readonly height: number }
  | undefined {
  const [targetX, targetY] = target.position;
  const dx = Math.min(Math.max(player[0], targetX), targetX + target.size - 1) - player[0];
  const dy = Math.min(Math.max(player[1], targetY), targetY + target.size - 1) - player[1];
  const direction =
    dx === 0 && dy !== 0 ? (dy > 0 ? 'north' : 'south') : dy === 0 && dx !== 0 ? (dx > 0 ? 'east' : 'west') : null;
  if (direction === null) return undefined;
  const sweep = getMeleeSweep(weaponId, direction);
  if (!sweep) return undefined;
  return { ...sweep, tile: [player[0] + Math.sign(dx), player[1] + Math.sign(dy)] };
}

export function describePlayerEffects(frame: ReplayEffectSourceFrame): readonly PlayerEffectDescriptor[] {
  const effects: PlayerEffectDescriptor[] = [];
  let graphic: PlayerGraphicDescriptor | undefined;
  for (const event of frame.events) {
    const key = `event-${event.eventId}`;
    if (
      event.type === 'spell_self_cast' &&
      typeof event.spotAnimId === 'number' &&
      event.spotAnimId >= 0 &&
      typeof event.animationId === 'number'
    ) {
      graphic = { kind: 'graphic', key, tick: event.tick, spotAnimId: event.spotAnimId, height: 0 };
    }
    if ((!isCoreEvent(event, 'attack_started') && !isCoreEvent(event, 'spell_targeted')) || event.sourceId !== 'player')
      continue;
    const npc = frame.state.npcs.find((candidate) => candidate.id === event.targetId);
    const target: EffectTarget = {
      position: npc?.position ?? frame.state.primaryNpcPosition,
      size: npc?.size ?? frame.state.primaryNpcSize,
      npcTypeId: npc?.npcTypeId ?? 0,
      actorId: event.targetId,
    };
    const spell = event.spellId === undefined ? undefined : getSpellVisuals(event.spellId);
    if (event.spellId !== undefined && !spell) continue;
    if (spell) {
      const cast = spell.impactTiming || isCoreEvent(event, 'spell_targeted') ? event.spellCast : undefined;
      const source = cast?.sourcePosition ?? frame.state.playerPosition;
      const spellTarget = {
        ...target,
        position: cast?.targetPosition ?? target.position,
        size: cast?.targetSize ?? target.size,
      };
      const impact =
        event.spellCast?.accurate === false
          ? SPLASH_IMPACT
          : {
              spotAnimId: spell.hitSpotanimId,
              height: spell.hitSpotanimHeight,
              heightMode: spell.hitSpotanimHeightMode ?? 'sequence',
            };
      if (isCoreEvent(event, 'attack_started') && spell.castSpotanimId >= 0)
        graphic = {
          kind: 'graphic',
          key,
          tick: event.tick,
          spotAnimId: spell.castSpotanimId,
          height: spell.castSpotanimHeight ?? 0,
        };
      if (spell.projectileId >= 0) {
        effects.push({
          kind: 'projectile',
          key,
          tick: event.tick,
          source,
          target: spellTarget,
          weaponId: event.weaponId ?? 0,
          timing: PROJ_ANIM_TIMINGS.magic_spell,
          presentation: { origin: spell.projectileOrigin, impactHeightMode: impact.heightMode },
          visuals: {
            attackAnimation: spell.castAnimationId,
            castSpotanim: spell.castSpotanimId,
            castSpotanimHeight: 0,
            projectileId: spell.projectileId,
            projectileStartHeight: spell.projectileStartHeight,
            projectileEndHeight: spell.projectileEndHeight,
            projectileSlope: spell.projectileSlope,
            projectileStartDelay: spell.projectileStartDelay,
            hitSpotanim: impact.spotAnimId,
            hitSpotanimHeight: impact.height,
          },
        });
      } else if (impact.spotAnimId >= 0) {
        const delay = spell.impactTiming
          ? calculateProjectileEndTime(
              spell.impactTiming,
              chebyshevDistanceToRect(...source, ...spellTarget.position, spellTarget.size),
            ) / 30
          : event.impactDelayTicks;
        if (delay !== undefined)
          effects.push({
            kind: 'impact',
            key,
            tick: event.tick,
            startTick: event.tick + delay,
            target: spellTarget,
            spotAnimId: impact.spotAnimId,
            height: impact.height,
            heightMode: impact.heightMode,
          });
      }
    } else if (isCoreEvent(event, 'attack_started')) {
      const special =
        event.usingSpecialAttack && event.weaponId !== undefined ? getSpecialAttackDef(event.weaponId) : undefined;
      const weaponVisuals = getWeaponCombatVisuals(event.weaponId, event.ammoId, event.usingSpecialAttack);
      // A missed shot is only a splash when magic: a powered staff's built-in spell.
      const splashed = event.style === 'magic' && event.spellCast?.accurate === false;
      const visuals =
        weaponVisuals && splashed
          ? { ...weaponVisuals, hitSpotanim: SPLASH_IMPACT.spotAnimId, hitSpotanimHeight: SPLASH_IMPACT.height }
          : weaponVisuals;
      if (special?.graphicId !== undefined && special.graphicId >= 0)
        graphic = { kind: 'graphic', key, tick: event.tick, spotAnimId: special.graphicId, height: 0 };
      else if (visuals && visuals.castSpotanim >= 0)
        graphic = {
          kind: 'graphic',
          key,
          tick: event.tick,
          spotAnimId: visuals.castSpotanim,
          height: visuals.castSpotanimHeight,
        };
      if (visuals && visuals.projectileId >= 0 && event.style !== 'melee')
        effects.push({
          kind: 'projectile',
          key,
          tick: event.tick,
          source: frame.state.playerPosition,
          target,
          weaponId: event.weaponId ?? 0,
          visuals,
          timing: getProjectileTiming(event.weaponId, event.usingSpecialAttack),
          presentation: splashed ? { impactHeightMode: SPLASH_IMPACT.heightMode } : {},
        });
      for (const [hop, ricochet] of (event.ricochets ?? []).entries()) {
        const hopTarget = frame.state.npcs.find((candidate) => candidate.id === ricochet.targetId);
        effects.push(ricochetProjectile(`${key}-ricochet-${hop}`, event, ricochet, hopTarget?.npcTypeId ?? 0));
      }
      const targetGraphicDelay = special?.targetGraphic && targetGraphicDelayCycles(event, special.targetGraphic);
      if (special?.targetGraphic && targetGraphicDelay !== undefined)
        effects.push({
          kind: 'impact',
          key: `${key}-target-graphic`,
          tick: event.tick,
          startTick: event.tick + targetGraphicDelay / 30,
          target,
          spotAnimId: special.targetGraphic.spotAnimId,
          height: special.targetGraphic.height,
          heightMode: 'actor',
        });
      const sweep = meleeSweepEffect(event.weaponId, frame.state.playerPosition, target);
      if (sweep)
        effects.push({
          kind: 'impact',
          key: `${key}-sweep`,
          tick: event.tick,
          startTick: event.tick + sweep.delayCycles / 30,
          target: { position: sweep.tile, size: 1, npcTypeId: 0, actorId: undefined },
          spotAnimId: sweep.spotAnimId,
          height: sweep.height,
          heightMode: 'actor',
        });
    }
  }
  for (const event of frame.events) {
    if (isCoreEvent(event, 'npc_graphic_applied')) {
      const npc = frame.state.npcs.find((candidate) => candidate.id === event.targetId);
      if (npc)
        effects.push({
          kind: 'impact',
          key: `event-${event.eventId}`,
          tick: event.tick,
          startTick: event.tick,
          target: { position: npc.position, size: npc.size, npcTypeId: npc.npcTypeId, actorId: npc.id },
          spotAnimId: event.spotAnimId,
          height: event.height,
          // The packet's `height=` is an offset above the actor, not a sequence-relative lift.
          heightMode: 'actor',
        });
    }
    if (isCoreEvent(event, 'player_graphic_applied'))
      graphic = {
        kind: 'graphic',
        key: `event-${event.eventId}`,
        tick: event.tick,
        spotAnimId: event.spotAnimId,
        height: 0,
      };
  }
  if (graphic) effects.push(graphic);
  return effects;
}
