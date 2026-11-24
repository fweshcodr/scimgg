import type { NpcActor } from '../../core/actors/NpcActor';
import type { PlayerActor } from '../../core/actors/PlayerActor';
import { isNpcActionReady, scheduleNpcAction } from '../../core/combat/npcActionClock';
import { canNpcAttack } from '../../core/combat/npcAttackRequest';
import { contextDecisions } from '../../core/decisionRandom';
import type { NpcAttackRequest } from '../../core/encounters/types';
import { standardNpcCombatMove } from '../../core/npcCombatMovement';
import { canNpcActThisTurn, canReceiveNewAttack } from '../../core/npcDeath';
import { createNpcDefinition, type NpcDefinitionContext, type NpcDefinitionInput } from '../../core/npcs';
import type { Coordinate } from '../../types/simulation';
import { createInfernoActor } from './actors';
import { emitZukDeath } from './events';
import { presentInfernoDamage } from './presentation';
import { emitInfernoWaveAttack } from './waveCombat';

// docs/encounters/inferno-facts-spec.md (Behavior, Jal-Nib): every 4 ticks for 0-4.
const NIBBLER_ATTACK_SPEED = 4;
const NIBBLER_MAX_HIT = 4;

export type NibblerConfig = {
  /**
   * The pillar proxy (NPC 7709) the encounter chose for this nibbler's wave, while it stands; null once
   * it has collapsed or when the wave had none. Every nibbler of a wave shares it (facts spec, Jal-Nib).
   */
  readonly getWaveTarget: (context: NpcDefinitionContext) => NpcActor | null;
};

export type NibblerState = {
  readonly firstActionTick: number;
  /** Set once the wave's pillar is gone (policy: "then you become the pillar"); it never comes back. */
  targetsPlayer: boolean;
  /** The target it has reached: the first swing at a target is the tick after arriving (93/93). */
  arrivedTargetId: string | null;
};

type NibblerInput = NpcDefinitionInput<NibblerState, NibblerConfig>;

/**
 * The wave's pillar while it stands, then the player for good. No re-draw and no retaliation: a hit
 * nibbler keeps walking to its pillar (facts spec, Jal-Nib). Runs from both `move` and `tick`.
 */
function resolveNibblerTarget({ actor, config, context }: NibblerInput): PlayerActor | NpcActor | null {
  const player = context.world.getPlayer();
  if (!actor.state.targetsPlayer) {
    const pillar = config.getWaveTarget(context);
    if (pillar && canReceiveNewAttack(pillar)) {
      actor.combat.targetId = pillar.id;
      return pillar;
    }
    actor.state.targetsPlayer = true;
  }
  actor.combat.targetId = player?.id ?? null;
  return player?.alive ? player : null;
}

export const nibblerDefinition = createNpcDefinition<NibblerState, NibblerConfig>({
  id: 'inferno-jal-nib',
  deathPolicy: 'queued',
  onDamageResolved: presentInfernoDamage,
  // Facts spec (NPCs table) death sequence; its sound rides the same tick (zukAudioRules).
  onDeathAnimation: ({ actor, context }) =>
    emitZukDeath(context, { actorId: actor.id, npcKind: 'nibbler', position: actor.position }),
  move: (input) => {
    if (!canNpcActThisTurn(input.actor, input.context.tick)) return [];
    resolveNibblerTarget(input);
    return standardNpcCombatMove(input.actor, input.context);
  },
  tick: (input) => {
    const { actor, context } = input;
    const empty = { environmentalDamages: [] };
    if (!canNpcActThisTurn(actor, context.tick) || context.tick < actor.state.firstActionTick) return empty;
    const target = resolveNibblerTarget(input);
    if (!target || !canReceiveNewAttack(target)) return empty;
    const plan = {
      formulaStyle: 'melee_crush',
      damageType: 'melee',
      attackKind: 'melee_crush',
      impactDelayTicks: 0,
    } as const;
    if (!canNpcAttack(actor, target, plan)) return empty;
    // Never on the turn it arrives: the first swing is the tick after reaching the attack tile.
    if (actor.state.arrivedTargetId !== target.id) {
      actor.state.arrivedTargetId = target.id;
      return empty;
    }
    if (!isNpcActionReady(actor.combat, context.tick)) return empty;
    // W Jal-Nib: always hits (pillar or player), max 4 crush; uniform 0-4 needs no formula stats on a pillar.
    const attack: NpcAttackRequest = {
      attackerId: actor.id,
      targetId: target.id,
      style: 'melee',
      attackKind: 'melee_crush',
      rolledDamage: contextDecisions(context).int(
        { site: 'inferno.nibbler.damage', tick: context.tick, actorId: actor.id, targetId: target.id },
        0,
        NIBBLER_MAX_HIT,
      ),
      accuracySucceeded: true,
      impactDelayTicks: 0,
      // Lands on the swing tick, so it is never queued.
      sourceDeathPolicy: 'cancel-before-impact',
    };
    emitInfernoWaveAttack(context, { actor, target, clipId: 'attack', kind: 'nibbler_melee', impactDelayTicks: 0 });
    actor.combat.lastAttackTick = context.tick;
    scheduleNpcAction(actor.combat, context.tick, NIBBLER_ATTACK_SPEED);
    return { environmentalDamages: [], npcAttacks: [attack] };
  },
});

export function createNibbler(options: {
  readonly id: string;
  readonly position: Coordinate;
  readonly spawnTick: number;
  /** Ticks after the add tick before its first swing; it walks from add+1 regardless. */
  readonly initialDelayTicks?: number;
}) {
  const actor = createInfernoActor('nibbler', options.id, options.position);
  actor.spawnTick = options.spawnTick;
  actor.combat.attackSpeed = NIBBLER_ATTACK_SPEED;
  actor.combat.attackRange = 1;
  actor.combat.attackStyle = 'melee';
  // Facts spec (Jal-Nib): nibblers walk onto each other and through other NPCs, and other NPCs walk
  // onto them, so they neither block nor are blocked.
  actor.passThruNpcs = true;
  actor.blocksNpcMovement = false;
  return nibblerDefinition.createActor(actor, {
    firstActionTick: options.spawnTick + (options.initialDelayTicks ?? 1),
    targetsPlayer: false,
    arrivedTargetId: null,
  });
}
