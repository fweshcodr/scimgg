import type { NpcAttackTimer, PrayerType, SimulationEvent } from '../../types/simulation';
import type { NpcActor, NpcDefinitionIdentity } from '../actors/NpcActor';
import type { ActorId } from '../actors/types';
import type { DamageAppliedInfo } from '../combat/CombatSystem';
import type { DecisionRandom } from '../decisionRandom';
import type {
  EncounterCompletionOwnership,
  EncounterNpcDefeat,
  EncounterTickResult,
  EnvironmentalDamage,
  NpcAttackRequest,
  NpcMovementRequest,
} from '../encounters/types';
import type { TickEvents } from '../events/TickEvents';
import type { NpcDeathPolicy } from '../npcDeath';
import type { WorldState } from '../WorldState';

export type DefinedNpcActor<State extends object> = NpcActor<State> & {
  readonly definition: NpcDefinitionIdentity;
  readonly state: State;
};

export interface NpcDefinitionContext {
  readonly tick: number;
  readonly world: Readonly<WorldState>;
  readonly tickEvents: TickEvents;
  readonly random: () => number;
  /**
   * Labeled decisions over the same stream as `random` (`random()` is its `next()`); absent, sites
   * label draws of `random` itself. Read through `contextDecisions`.
   */
  readonly decisions?: DecisionRandom;
  readonly spawnNpc: (actor: NpcActor) => void;
  readonly despawnNpc: (npcId: ActorId) => void;
  /** Same engine-owned hit-queue delivery available to encounter mechanics ({@link EncounterContext.queueNpcHit}). */
  readonly queueNpcHit?: (attack: NpcAttackRequest) => void;
  readonly logEvent: (event: SimulationEvent) => void;
  /** Same engine-owned overhead mutation available to encounter mechanics. */
  readonly setProtectionPrayer?: (prayer: PrayerType | null) => void;
  /** Same engine-owned protection-prayer lockout available to encounter mechanics. */
  readonly disableProtectionPrayersUntil?: (untilTick: number) => void;
}

export interface NpcDefinitionInput<State extends object, Config> {
  readonly actor: DefinedNpcActor<State>;
  readonly config: Config;
  readonly context: NpcDefinitionContext;
}

export interface NpcDamageResolvedInput<State extends object, Config> extends NpcDefinitionInput<State, Config> {
  readonly damage: Readonly<DamageAppliedInfo>;
}

export interface NpcDefeatedInput<State extends object, Config> extends NpcDefinitionInput<State, Config> {
  readonly defeat: Readonly<EncounterNpcDefeat>;
  readonly ownership: EncounterCompletionOwnership;
}

export interface NpcDefinitionSpec<State extends object, Config> {
  readonly id: string;
  /**
   * Ticks after `spawnTick` during which the player cannot target the NPC (see
   * `NpcActor.targetableFromTick`). Defaults to 0: targetable on its spawn tick. Actors created
   * with a positive value must carry a `spawnTick`.
   */
  readonly spawnUntargetableTicks?: number;
  /**
   * When death processing runs after the lethal hit (`npcDeath.ts`). Defaults to `immediate`; a
   * `queued` NPC keeps the turn it was killed on unless the hit queue promotes its death to K.
   */
  readonly deathPolicy?: NpcDeathPolicy;
  readonly onDamageResolved?: (input: NpcDamageResolvedInput<State, Config>) => void;
  readonly onDefeated?: (input: NpcDefeatedInput<State, Config>) => void;
  /**
   * Death processing has started (K for `immediate`, `processTick` for `queued`): the NPC will never
   * act again. Cancel owner-held work that has not been released — a windup, a pursuit route.
   */
  readonly onDeathStarted?: (input: NpcDefinitionInput<State, Config>) => void;
  /**
   * A `queued` NPC's death animation starts this tick (`deathAnimationTick`): the moment for its death
   * sound and other death presentation. Called exactly once per life, from its turn on that tick or, for a
   * scripted death (which animates at once), from its death processing (`notifyDeathStarted`). Not called
   * for `immediate` NPCs, whose `onDefeated` is that moment.
   */
  readonly onDeathAnimation?: (input: NpcDefinitionInput<State, Config>) => void;
  /**
   * Attacks this NPC committed to before dying that launch anyway on its death-animation tick (a
   * windup due to release then). Asked once, by the engine in the NPC's turn slot on that tick, only
   * when `isNpcDeathReleaseDue`; each is committed through the NPC attack pipeline as a launch from a
   * dying source. It cannot start an attack: definitions return only what they had already scheduled.
   */
  readonly releaseOnDeathAnimation?: (input: NpcDefinitionInput<State, Config>) => readonly NpcAttackRequest[];
  readonly onDespawn?: (input: NpcDefinitionInput<State, Config>) => void;
  readonly move?: false | ((input: NpcDefinitionInput<State, Config>) => NpcMovementRequest[]);
  readonly tick?: (input: NpcDefinitionInput<State, Config>) => EncounterTickResult;
  readonly postTick?: (input: NpcDefinitionInput<State, Config>) => EnvironmentalDamage[];
  readonly resolveLocalEffects?: (input: NpcDefinitionInput<State, Config>) => EnvironmentalDamage[];
  /**
   * Read-only projection of this NPC's next attack for overlays. Needed because a definition
   * that schedules its own attacks (a beat pattern, a cast counter) leaves `combat.nextActionTick`
   * untouched, so the generic clock reads as "never attacks" for it.
   */
  readonly attackTimer?: (input: NpcDefinitionInput<State, Config>) => NpcAttackTimer | null;
}

export interface NpcDefinition<State extends object, Config> {
  readonly id: string;
  readonly identity: NpcDefinitionIdentity;
  createActor(actor: NpcActor, state: State): DefinedNpcActor<State>;
  getState(actor: NpcActor): State | null;
  isActor(actor: NpcActor): actor is DefinedNpcActor<State>;
  register(config: Config): NpcDefinitionRegistration;
}

export interface NpcDefinitionRegistration {
  readonly definitionId: string;
  isActor(actor: NpcActor): boolean;
  notifyDamageResolved(actor: NpcActor, damage: Readonly<DamageAppliedInfo>, context: NpcDefinitionContext): boolean;
  notifyDefeated(
    actor: NpcActor,
    defeat: Readonly<EncounterNpcDefeat>,
    ownership: EncounterCompletionOwnership,
    context: NpcDefinitionContext,
  ): boolean;
  notifyDespawn(actor: NpcActor, context: NpcDefinitionContext): boolean;
  notifyDeathStarted(actor: NpcActor, context: NpcDefinitionContext): boolean;
  notifyDeathAnimation(actor: NpcActor, context: NpcDefinitionContext): boolean;
  releaseOnDeathAnimation(actor: NpcActor, context: NpcDefinitionContext): readonly NpcAttackRequest[];
  move(actor: NpcActor, context: NpcDefinitionContext): NpcMovementRequest[];
  tick(actor: NpcActor, context: NpcDefinitionContext): EncounterTickResult;
  postTick(actor: NpcActor, context: NpcDefinitionContext): EnvironmentalDamage[];
  resolveLocalEffects(actor: NpcActor, context: NpcDefinitionContext): EnvironmentalDamage[];
  attackTimer(actor: NpcActor, context: NpcDefinitionContext): NpcAttackTimer | null;
}
