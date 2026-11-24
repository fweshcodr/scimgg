import type { NpcActor, NpcDefinitionIdentity } from '../actors/NpcActor';
import { standardNpcCombatMove } from '../npcCombatMovement';
import { claimNpcDeathAnimation } from '../npcDeath';
import type {
  DefinedNpcActor,
  NpcDefinition,
  NpcDefinitionContext,
  NpcDefinitionInput,
  NpcDefinitionRegistration,
  NpcDefinitionSpec,
} from './types';

export function createNpcDefinition<State extends object, Config>(
  spec: NpcDefinitionSpec<State, Config>,
): NpcDefinition<State, Config> {
  const identity: NpcDefinitionIdentity = { id: spec.id };
  const isActor = (actor: NpcActor): actor is DefinedNpcActor<State> =>
    actor.definition === identity && actor.state !== undefined;
  const untargetableTicks = spec.spawnUntargetableTicks ?? 0;
  if (!Number.isInteger(untargetableTicks) || untargetableTicks < 0) {
    throw new RangeError(`NPC definition '${spec.id}' has invalid spawnUntargetableTicks ${untargetableTicks}`);
  }
  const targetability = (actor: NpcActor): Pick<NpcActor, 'targetableFromTick'> => {
    if (untargetableTicks === 0) return {};
    if (actor.spawnTick === undefined) {
      throw new TypeError(`NPC definition '${spec.id}' needs a spawnTick to time its untargetable window`);
    }
    return { targetableFromTick: actor.spawnTick + untargetableTicks };
  };

  return {
    id: spec.id,
    identity,
    createActor: (actor, state) => ({
      ...actor,
      ...targetability(actor),
      ...(spec.deathPolicy === undefined ? {} : { deathPolicy: spec.deathPolicy }),
      definition: identity,
      state,
    }),
    getState: (actor) => (isActor(actor) ? actor.state : null),
    isActor,
    register: (config): NpcDefinitionRegistration => {
      const getInput = (actor: NpcActor, context: NpcDefinitionContext): NpcDefinitionInput<State, Config> | null =>
        isActor(actor) ? { actor, config, context } : null;

      return {
        definitionId: spec.id,
        isActor,
        notifyDamageResolved: (actor, damage, context) => {
          const input = getInput(actor, context);
          if (!input) return false;
          spec.onDamageResolved?.({ ...input, damage });
          return true;
        },
        notifyDefeated: (actor, defeat, ownership, context) => {
          const input = getInput(actor, context);
          if (!input) return false;
          spec.onDefeated?.({ ...input, defeat, ownership });
          return true;
        },
        notifyDespawn: (actor, context) => {
          const input = getInput(actor, context);
          if (!input) return false;
          spec.onDespawn?.(input);
          return true;
        },
        notifyDeathStarted: (actor, context) => {
          const input = getInput(actor, context);
          if (!input) return false;
          spec.onDeathStarted?.(input);
          // A death that animates as it is processed (a scripted death, or no step to wait for).
          if (claimNpcDeathAnimation(actor, context.tick)) spec.onDeathAnimation?.(input);
          return true;
        },
        notifyDeathAnimation: (actor, context) => {
          const input = getInput(actor, context);
          if (!input) return false;
          if (claimNpcDeathAnimation(actor, context.tick)) spec.onDeathAnimation?.(input);
          return true;
        },
        releaseOnDeathAnimation: (actor, context) => {
          const input = getInput(actor, context);
          return input ? (spec.releaseOnDeathAnimation?.(input) ?? []) : [];
        },
        move: (actor, context) => {
          const input = getInput(actor, context);
          if (!input || spec.move === false) return [];
          return spec.move ? spec.move(input) : standardNpcCombatMove(actor, context);
        },
        tick: (actor, context) => {
          const input = getInput(actor, context);
          return input ? (spec.tick?.(input) ?? { environmentalDamages: [] }) : { environmentalDamages: [] };
        },
        postTick: (actor, context) => {
          const input = getInput(actor, context);
          return input ? (spec.postTick?.(input) ?? []) : [];
        },
        resolveLocalEffects: (actor, context) => {
          const input = getInput(actor, context);
          return input ? (spec.resolveLocalEffects?.(input) ?? []) : [];
        },
        attackTimer: (actor, context) => {
          const input = getInput(actor, context);
          return input ? (spec.attackTimer?.(input) ?? null) : null;
        },
      };
    },
  };
}
