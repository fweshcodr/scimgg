import type { NpcAttackTimer } from '../../types/simulation';
import type { NpcActor } from '../actors/NpcActor';
import type { DamageAppliedInfo } from '../combat/CombatSystem';
import type {
  EncounterCompletionOwnership,
  EncounterNpcDefeat,
  EncounterTickResult,
  EnvironmentalDamage,
  NpcAttackRequest,
  NpcMovementRequest,
} from '../encounters/types';
import type { NpcDefinitionContext, NpcDefinitionRegistration } from './types';

export class NpcDefinitionCollection {
  private readonly registrations: ReadonlyMap<string, NpcDefinitionRegistration>;

  constructor(registrations: readonly NpcDefinitionRegistration[] = []) {
    const byId = new Map<string, NpcDefinitionRegistration>();
    for (const registration of registrations) {
      if (byId.has(registration.definitionId)) throw new DuplicateNpcDefinitionError(registration.definitionId);
      byId.set(registration.definitionId, registration);
    }
    this.registrations = byId;
  }

  validateActor(actor: NpcActor): void {
    if (!actor.definition) {
      if (actor.state !== undefined) throw new NpcDefinitionMismatchError(actor.id, '(missing)');
      return;
    }
    if (!this.registrations.get(actor.definition.id)?.isActor(actor)) {
      throw new NpcDefinitionMismatchError(actor.id, actor.definition.id);
    }
  }

  notifyDamageResolved(actor: NpcActor, damage: Readonly<DamageAppliedInfo>, context: NpcDefinitionContext): boolean {
    return this.registrations.get(actor.definition?.id ?? '')?.notifyDamageResolved(actor, damage, context) ?? false;
  }

  notifyDefeated(
    actor: NpcActor,
    defeat: Readonly<EncounterNpcDefeat>,
    ownership: EncounterCompletionOwnership,
    context: NpcDefinitionContext,
  ): boolean {
    return (
      this.registrations.get(actor.definition?.id ?? '')?.notifyDefeated(actor, defeat, ownership, context) ?? false
    );
  }

  notifyDespawn(actor: NpcActor, context: NpcDefinitionContext): boolean {
    return this.registrations.get(actor.definition?.id ?? '')?.notifyDespawn(actor, context) ?? false;
  }

  notifyDeathStarted(actor: NpcActor, context: NpcDefinitionContext): boolean {
    return this.registrations.get(actor.definition?.id ?? '')?.notifyDeathStarted(actor, context) ?? false;
  }

  notifyDeathAnimation(actor: NpcActor, context: NpcDefinitionContext): boolean {
    return this.registrations.get(actor.definition?.id ?? '')?.notifyDeathAnimation(actor, context) ?? false;
  }

  releaseOnDeathAnimation(actor: NpcActor, context: NpcDefinitionContext): readonly NpcAttackRequest[] {
    return this.registrations.get(actor.definition?.id ?? '')?.releaseOnDeathAnimation(actor, context) ?? [];
  }

  move(actor: NpcActor, context: NpcDefinitionContext): NpcMovementRequest[] {
    return this.registrations.get(actor.definition?.id ?? '')?.move(actor, context) ?? [];
  }

  tick(actor: NpcActor, context: NpcDefinitionContext): EncounterTickResult {
    return this.registrations.get(actor.definition?.id ?? '')?.tick(actor, context) ?? { environmentalDamages: [] };
  }

  postTick(actor: NpcActor, context: NpcDefinitionContext): EnvironmentalDamage[] {
    return this.registrations.get(actor.definition?.id ?? '')?.postTick(actor, context) ?? [];
  }

  resolveLocalEffects(actor: NpcActor, context: NpcDefinitionContext): EnvironmentalDamage[] {
    return this.registrations.get(actor.definition?.id ?? '')?.resolveLocalEffects(actor, context) ?? [];
  }

  attackTimer(actor: NpcActor, context: NpcDefinitionContext): NpcAttackTimer | null {
    return this.registrations.get(actor.definition?.id ?? '')?.attackTimer(actor, context) ?? null;
  }
}

export class DuplicateNpcDefinitionError extends Error {
  constructor(readonly definitionId: string) {
    super(`Duplicate NPC definition id: ${definitionId}`);
    this.name = 'DuplicateNpcDefinitionError';
  }
}

export class NpcDefinitionMismatchError extends Error {
  constructor(
    readonly actorId: string,
    readonly definitionId: string,
  ) {
    super(`NPC '${actorId}' has no matching registered definition '${definitionId}'`);
    this.name = 'NpcDefinitionMismatchError';
  }
}
