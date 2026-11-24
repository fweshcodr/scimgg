import type { NpcActor } from '../../core/actors/NpcActor';
import { applyNpcHealing } from '../../core/combat/npcHealing';
import { markNpcDead } from '../../core/npcDeath';
import type { NpcDefinitionContext } from '../../core/npcs';
import { createNpcDefinition } from '../../core/npcs';
import { getMonsterFormulaStats, getMonsterHp } from '../../data/monsterData';
import type { Coordinate, TickNumber } from '../../types/simulation';
import {
  VOID_FLARE_DETONATED_DEATH_CAUSE,
  VOID_FLARE_FUSE_BAR_LEAD_TICKS,
  VOID_FLARE_NPC_ID,
  VOID_FLARE_UNTARGETABLE_TICKS,
  voidFlareHash,
} from './timing';

export { VOID_FLARE_NPC_ID } from './timing';

export type VoidFlareExplosionDamage =
  | 'lethal'
  | [number, number]
  | { readonly atZeroHp: [number, number]; readonly perRemainingHp: number };

export type VoidFlareImpact = {
  readonly impactTick: number;
  readonly damage: number;
};

export type VoidFlareState = {
  readonly damageRollIndex: number;
  readonly explodeTick: number;
  readonly variant: 'fire' | 'shadow';
  lifecycle: 'charging' | 'detonated' | 'destroyed';
};

export type VoidFlareDefinitionConfig = {
  readonly damageSeed: number;
  readonly explosionDamage: VoidFlareExplosionDamage;
  readonly getBoss: (context: NpcDefinitionContext) => NpcActor | null | undefined;
  readonly scheduleImpact: (impact: VoidFlareImpact) => void;
};

export type CreateVoidFlareActorInput = {
  readonly id: string;
  readonly damageRollIndex: number;
  readonly position: Coordinate;
  readonly spawnTick: TickNumber;
  readonly chargeTicks: number;
  readonly currentHp?: number;
  readonly guaranteedPlayerMaximum?: boolean;
};

// Captures place the player splat one tick after the detonation heal and explosion event.
const VOID_FLARE_IMPACT_DELAY_TICKS = 1;

export const voidFlareDefinition = createNpcDefinition<VoidFlareState, VoidFlareDefinitionConfig>({
  id: 'yama-void-flare',
  // A flare the player kills dies as a queued NPC. Its fuse stays its own: detonation and
  // `destroyVoidFlare` are scripted deaths at the HP it has left, and a flare at 0 HP never detonates.
  deathPolicy: 'queued',
  spawnUntargetableTicks: VOID_FLARE_UNTARGETABLE_TICKS,
  move: false,
  onDefeated: ({ actor, defeat }) => {
    actor.despawnTick = defeat.tick;
  },
  resolveLocalEffects: ({ actor, config, context }) => {
    if (actor.state.lifecycle !== 'charging') return [];
    if (!actor.alive) {
      actor.state.lifecycle = 'destroyed';
      context.tickEvents.emit({
        type: 'voidflare_destroyed',
        flareId: actor.id,
        position: actor.position,
        variant: actor.state.variant,
      });
      return [];
    }
    if (context.tick < actor.state.explodeTick) return [];

    markNpcDead(actor, context.tick);
    actor.deathCause = VOID_FLARE_DETONATED_DEATH_CAUSE;
    actor.state.lifecycle = 'detonated';
    // Remaining HP at detonation weakens scaled flares; their spawn HP is not a valid substitute.
    const [minimumDamage, maximumDamage] =
      config.explosionDamage === 'lethal'
        ? [999, 999]
        : voidFlareExplosionBand(config.explosionDamage, actor.vitals.hp);
    const damage =
      minimumDamage +
      (voidFlareHash(config.damageSeed, context.tick * 100 + actor.state.damageRollIndex) %
        (maximumDamage - minimumDamage + 1));
    config.scheduleImpact({ impactTick: context.tick + VOID_FLARE_IMPACT_DELAY_TICKS, damage });

    const boss = config.getBoss(context);
    // Lethal-contract explosions account for no heal splats in the captures.
    const heal =
      config.explosionDamage === 'lethal'
        ? 0
        : applyNpcHealing(boss, voidFlareExplosionHeal(damage), context.tickEvents);
    context.tickEvents.emit({
      type: 'voidflare_exploded',
      flareId: actor.id,
      position: actor.position,
      variant: actor.state.variant,
      damage,
      heal,
    });
    return [];
  },
});

export function createVoidFlareActor(input: CreateVoidFlareActorInput) {
  const currentHp = input.currentHp ?? 71;
  const maxHp = getMonsterHp(VOID_FLARE_NPC_ID) ?? currentHp;
  const formulaStats = getMonsterFormulaStats(VOID_FLARE_NPC_ID);
  if (formulaStats === undefined) throw new TypeError(`Missing monster formula stats for NPC ${VOID_FLARE_NPC_ID}`);
  const actor: NpcActor = {
    id: input.id,
    kind: 'npc',
    role: 'minion',
    alive: true,
    position: input.position,
    previousPosition: input.position,
    facing: 0,
    size: 2,
    vitals: { hp: currentHp, maxHp },
    npcTypeId: VOID_FLARE_NPC_ID,
    archetypeId: 'voidflare',
    history: new Map<TickNumber, Coordinate>(),
    spawnTick: input.spawnTick,
    despawnTick: input.spawnTick + input.chargeTicks,
    despawnTimerLeadTicks: VOID_FLARE_FUSE_BAR_LEAD_TICKS,
    // The server keeps the flare's `headbar id=2` up from activation, hit or not.
    alwaysShowHealthBar: true,
    combat: {
      attackSpeed: 0,
      attackRange: 0,
      attackStyle: 'typeless',
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: { idle: 12133, walk: null, run: null, attack: null, death: 12134 },
    },
    formulaStats: {
      ...formulaStats,
      alwaysMaximumPlayerHit: input.guaranteedPlayerMaximum ?? true,
      alwaysAccuratePlayerHit: true,
      demonbaneVulnerability: 2,
    },
  };
  return voidFlareDefinition.createActor(actor, {
    damageRollIndex: input.damageRollIndex,
    explodeTick: input.spawnTick + input.chargeTicks,
    variant: 'shadow',
    lifecycle: 'charging',
  });
}

export function destroyVoidFlare(actor: NpcActor, context: Pick<NpcDefinitionContext, 'tick' | 'tickEvents'>): void {
  const state = voidFlareDefinition.getState(actor);
  if (!state || !actor.alive || state.lifecycle !== 'charging') return;
  markNpcDead(actor, context.tick);
  actor.despawnTick = context.tick;
  state.lifecycle = 'destroyed';
  context.tickEvents.emit({
    type: 'voidflare_destroyed',
    flareId: actor.id,
    position: actor.position,
    variant: state.variant,
  });
}

export function voidFlareExplosionHeal(damage: number): number {
  return Math.floor((damage * 8) / 3);
}

export function voidFlareExplosionBand(
  spec: Exclude<VoidFlareExplosionDamage, 'lethal'>,
  remainingHp: number,
): [number, number] {
  if (Array.isArray(spec)) return [spec[0], spec[1]];
  const scaled = Math.floor(Math.max(0, remainingHp) * spec.perRemainingHp);
  return [spec.atZeroHp[0] + scaled, spec.atZeroHp[1] + scaled];
}
