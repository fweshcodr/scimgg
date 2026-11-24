import { calculateProjectileEndTime, npcHitDelayFromEndTime } from '../../core/combat/hitDelay';
import { isNpcActionReady, scheduleNpcAction } from '../../core/combat/npcActionClock';
import { type AttackPlan, canNpcAttack, resolveAttackRequest } from '../../core/combat/npcAttackRequest';
import { createNpcRetaliation } from '../../core/combat/retaliation';
import { contextAttackDecisions } from '../../core/decisionRandom';
import type { EncounterHookEffect, EncounterPlayerDamageInfo } from '../../core/encounters/types';
import { canNpcActThisTurn } from '../../core/npcDeath';
import { createNpcDefinition } from '../../core/npcs';
import { COMBAT_SKILLS, type CombatSkill } from '../../types/playerState';
import type { Coordinate } from '../../types/simulation';
import { createInfernoActor } from './actors';
import { INFERNO_WAVE_NPC_IDS } from './constants';
import { emitZukDeath } from './events';
import { presentInfernoDamage } from './presentation';
import { JAL_MEJRAH_PROJECTILE } from './projectileProfiles';
import { resolveReadyTarget } from './targetResolution';
import { emitInfernoWaveAttack, infernoWaveProjectileCue } from './waveCombat';

// docs/encounters/inferno-facts-spec.md (Behavior, Jal-MejRah): ranged every 3 ticks, from up
// to 4 tiles of its footprint edge (Q:83876); W Jal-MejRah max 19.
const BAT_ATTACK_SPEED = 3;
const BAT_ATTACK_RANGE = 4;
const BAT_MAX_HIT = 19;
// Policy (Bat drain): 3 run energy (0-100 scale; the engine counts 0-10000) and 1 per combat stat.
const BAT_RUN_ENERGY_DRAIN = 300;
const BAT_STAT_DRAIN = 1;

export type BatState = { readonly firstActionTick: number };

export const batDefinition = createNpcDefinition<BatState, undefined>({
  id: 'inferno-jal-mejrah',
  deathPolicy: 'queued',
  onDamageResolved: presentInfernoDamage,
  // Facts spec (NPCs table) death sequence; its sound rides the same tick (zukAudioRules).
  onDeathAnimation: ({ actor, context }) =>
    emitZukDeath(context, { actorId: actor.id, npcKind: 'bat', position: actor.position }),
  tick: ({ actor, context }) => {
    const empty = { environmentalDamages: [] };
    if (!canNpcActThisTurn(actor, context.tick) || context.tick < actor.state.firstActionTick) return empty;
    if (!isNpcActionReady(actor.combat, context.tick)) return empty;
    const target = resolveReadyTarget(actor, context.world);
    if (!target) return empty;
    // Every bat endtime fits `32 + 8D` from the packet source, which is the bat's SW tile (facts spec,
    // Projectiles), not the center tile `projectileDistance` uses for larger NPCs.
    const distance = Math.max(
      Math.abs(actor.position[0] - target.position[0]),
      Math.abs(actor.position[1] - target.position[1]),
    );
    const endCycles = calculateProjectileEndTime(JAL_MEJRAH_PROJECTILE.timing, distance);
    const plan = {
      formulaStyle: 'ranged',
      damageType: 'range',
      attackKind: 'range_arrow',
      impactDelayTicks: npcHitDelayFromEndTime(endCycles),
      maxHit: BAT_MAX_HIT,
      // Released projectiles land after their source dies (Inferno 1-68: 1312→1313, 5091→5093).
      sourceDeathPolicy: 'persist',
    } as const satisfies AttackPlan;
    if (!canNpcAttack(actor, target, plan)) return empty;
    const attack = resolveAttackRequest({
      attacker: actor,
      target,
      plan,
      random: context.random,
      labelled: contextAttackDecisions(context),
    });
    if (!attack) throw new TypeError(`Missing formula stats for ${actor.id} or ${target.id}`);
    emitInfernoWaveAttack(context, {
      actor,
      target,
      clipId: 'attack',
      kind: 'bat_range',
      impactDelayTicks: attack.impactDelayTicks,
      projectiles: [
        {
          ...infernoWaveProjectileCue(actor, target, JAL_MEJRAH_PROJECTILE, endCycles),
          // Presentation only: a Jal-MejRah launches from its SW tile, not its 2x2 center (143/143
          // stationary launches in P+Q, e.g. P t481: bat (39,41), source (39,41); after a step, the new SW).
          sourcePosition: [actor.position[0] + 0.5, actor.position[1] + 0.5],
        },
      ],
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNpcAction(actor.combat, context.tick, BAT_ATTACK_SPEED);
    return { environmentalDamages: [], npcAttacks: [attack] };
  },
});

/**
 * Bat drain for the encounter's `onPlayerDamageTaken` rule (docs/encounters/inferno-policy.md,
 * Bat drain): each bat hit drains 3 run energy unless Protect from Missiles was up at its prayer
 * check, and a damaging hit without it also drains 1 from each combat stat. A bat hit is identified
 * by its launching NPC type, so it still drains after the bat has died.
 */
export function jalMejRahDrainEffect(info: EncounterPlayerDamageInfo): EncounterHookEffect | null {
  if (info.sourceKind !== 'combat' || info.sourceNpcTypeId !== INFERNO_WAVE_NPC_IDS.bat) return null;
  if (info.prayedCorrectly === true) return null;
  const statDrains =
    info.effectiveDamage > 0
      ? (Object.fromEntries(COMBAT_SKILLS.map((skill) => [skill, BAT_STAT_DRAIN])) as Record<CombatSkill, number>)
      : undefined;
  return { runEnergyDelta: -BAT_RUN_ENERGY_DRAIN, ...(statDrains ? { playerStatDrains: statDrains } : {}) };
}

export function createBat(options: {
  readonly id: string;
  readonly position: Coordinate;
  readonly spawnTick: number;
  readonly targetId: string | null;
  /** First attack observed at add+1 (facts spec, Jal-MejRah). */
  readonly initialDelayTicks?: number;
}) {
  const actor = createInfernoActor('bat', options.id, options.position);
  actor.spawnTick = options.spawnTick;
  actor.combat.attackSpeed = BAT_ATTACK_SPEED;
  actor.combat.attackRange = BAT_ATTACK_RANGE;
  actor.combat.attackStyle = 'range';
  actor.combat.targetId = options.targetId;
  actor.combat.retaliation = createNpcRetaliation();
  return batDefinition.createActor(actor, {
    firstActionTick: options.spawnTick + (options.initialDelayTicks ?? 1),
  });
}
