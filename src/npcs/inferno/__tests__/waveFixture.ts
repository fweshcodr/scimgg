import type { NpcActor } from '../../../core/actors/NpcActor';
import type { EncounterContext, EncounterEngineRules } from '../../../core/encounters/types';
import type { GameEvent } from '../../../core/events/types';
import { NpcDefinitionCollection, type NpcDefinitionContext } from '../../../core/npcs';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import type { Coordinate } from '../../../types/simulation';
import { jadDefinition, ORDINARY_JAD_EXECUTION } from '../jad';
import type { MagerResurrection } from '../resurrection';
import {
  createInfernoWaveNpc,
  type InfernoRemoval,
  registerInfernoWaveDefinitions,
  removeInfernoNpcIfDue,
  type SplitBlobSpawn,
} from '../waveNpcs';

export type WaveFixtureOptions = {
  /** The pillar every nibbler of the wave targets while it stands (the encounter's choice). */
  readonly waveTarget?: () => NpcActor | null;
  readonly resurrection?: MagerResurrection;
  readonly rules?: EncounterEngineRules;
  readonly startPos?: Coordinate;
  /** Adds a removed Jal-Ak's children in its removal turn, as the Inferno encounter does. */
  readonly spawnSplits?: boolean;
};

export const NO_RESURRECTION: MagerResurrection = { eligibleCorpses: () => [], revive: () => undefined };

/**
 * A minimal encounter forwarding every turn to the ordinary-wave definitions, with removals in
 * each NPC's own turn (`removeNpcIfDue`) as the Inferno encounter does. `random.next` is replaceable per test.
 */
export function createWaveEngine(actors: NpcActor[], options: WaveFixtureOptions = {}) {
  const random = { next: (): number => 0.5 };
  const removals: (InfernoRemoval & { readonly tick: number })[] = [];
  const definitions = new NpcDefinitionCollection([
    ...registerInfernoWaveDefinitions({
      getWaveTarget: () => options.waveTarget?.() ?? null,
      resurrection: options.resurrection ?? NO_RESURRECTION,
    }),
    jadDefinition.register({ execution: ORDINARY_JAD_EXECUTION, spawnHealers: () => undefined }),
  ]);
  const npcContext = (ctx: EncounterContext): NpcDefinitionContext => ({ ...ctx, random: () => random.next() });

  class WaveFixtureEncounter extends LobbyEncounter {
    override getIntroConfig() {
      return null;
    }
    override getArenaConfig() {
      return { bounds: null, walkableTiles: null, collisionMap: null };
    }
    override createNpcs() {
      return actors;
    }
    getNpcDefinitions() {
      return definitions;
    }
    getEngineRules() {
      return options.rules ?? {};
    }
    removeNpcIfDue(npc: NpcActor, ctx: EncounterContext) {
      const addSplit = options.spawnSplits
        ? (split: SplitBlobSpawn) =>
            ctx.spawnNpc(
              createInfernoWaveNpc(split.species, {
                id: `${npc.id}_${split.species}`,
                position: [...split.position],
                spawnTick: ctx.tick,
                targetId: 'player',
                origin: 'split',
              }),
            )
        : undefined;
      const removal = removeInfernoNpcIfDue(npc, ctx, addSplit);
      if (removal) removals.push({ ...removal, tick: ctx.tick });
    }
    moveNpc(actor: NpcActor, ctx: EncounterContext) {
      return definitions.move(actor, npcContext(ctx));
    }
    processNpcTick(actor: NpcActor, ctx: EncounterContext) {
      return definitions.tick(actor, npcContext(ctx));
    }
  }

  const engine = new SimulationEngine({
    encounter: new WaveFixtureEncounter(),
    startPos: options.startPos ?? [10, 20],
  });
  // Keeps long runs alive; damage still lands and is recorded.
  engine.setMechanicsConfig({ infiniteHealth: true });
  const world = engine['worldState'];
  const player = world.getPlayer();
  if (!player) throw new TypeError('Missing player fixture');
  const events: GameEvent[] = [];
  /** Advances to `tick`, the player standing still unless `stand` moves them; collects every event. */
  const advanceTo = (tick: number, stand: () => Coordinate = () => [...player.position]) => {
    while (engine.currentTick < tick) {
      engine.advanceTick(stand());
      events.push(...engine.getLastTickEvents());
    }
  };
  return { engine, world, player, random, removals, events, definitions, advanceTo };
}
