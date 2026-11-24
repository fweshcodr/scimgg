import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { interpolateNpcPosition } from '../../../render/npc/npcRenderPosition';
import { enqueueEnginePendingHit } from '../../../test/helpers/pendingHits';
import type { Coordinate, MechanicsConfig } from '../../../types/simulation';
import { canInitiateAttackOnNpc, type NpcActor } from '../../actors/NpcActor';
import type { ActorId } from '../../actors/types';
import type { ArenaConfig } from '../../arena/ArenaConfig';
import { setArenaConfig, setDefaultArenaConfig } from '../../constants';
import type { EncounterOutcome } from '../../encounters/outcome';
import type { EncounterSnapshot } from '../../encounters/snapshot';
import type {
  Encounter,
  EncounterCompletionOwnership,
  EncounterContext,
  EncounterNpcDefeat,
  EncounterTickResult,
  EnvironmentalDamage,
  NpcMovementRequest,
} from '../../encounters/types';
import { TickEvents } from '../../events/TickEvents';
import { SimulationEngine } from '../../SimulationEngine';
import { WorldState } from '../../WorldState';
import {
  createNpcDefinition,
  DuplicateNpcDefinitionError,
  NpcDefinitionCollection,
  type NpcDefinitionContext,
  NpcDefinitionMismatchError,
  type NpcDefinitionRegistration,
} from '../index';

afterEach(() => {
  setDefaultArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null });
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
});

type TestNpcState = {
  phase: number;
};

type TestNpcConfig = {
  readonly generation: number;
};

type DefinitionHooks = {
  readonly onDamageResolved?: (actor: NpcActor, context: NpcDefinitionContext) => void;
  readonly onDespawn?: (actor: NpcActor, context: NpcDefinitionContext) => void;
};

const makeDefinition = (notifications: string[], hooks: DefinitionHooks = {}) =>
  createNpcDefinition<TestNpcState, TestNpcConfig>({
    id: 'test-npc',
    onDamageResolved: ({ actor, config, context }) => {
      notifications.push(`damage:${actor.state.phase}:${config.generation}`);
      hooks.onDamageResolved?.(actor, context);
    },
    onDefeated: ({ actor, config }) => notifications.push(`defeated:${actor.state.phase}:${config.generation}`),
    onDespawn: ({ actor, config, context }) => {
      notifications.push(`despawn:${actor.state.phase}:${config.generation}`);
      hooks.onDespawn?.(actor, context);
    },
    tick: ({ actor, config }) => {
      notifications.push(`tick:${actor.state.phase}:${config.generation}`);
      return { environmentalDamages: [] };
    },
    postTick: ({ actor, config }) => {
      notifications.push(`post:${actor.state.phase}:${config.generation}`);
      return [];
    },
    move: ({ actor, config }) => {
      notifications.push(`move:${actor.state.phase}:${config.generation}`);
      return [];
    },
    resolveLocalEffects: ({ actor, config }) => {
      notifications.push(`effects:${actor.state.phase}:${config.generation}`);
      return [];
    },
  });

function registerDefinition(
  notifications: string[],
  generation: number,
): { readonly definition: ReturnType<typeof makeDefinition>; readonly registration: NpcDefinitionRegistration } {
  const definition = makeDefinition(notifications);
  return { definition, registration: definition.register({ generation }) };
}

describe('typed NPC definitions', () => {
  it('keeps actor state correlated with its definition', () => {
    const { definition } = registerDefinition([], 1);
    const state = { phase: 3 };
    const actor = definition.createActor(createBaseNpc(), state);

    expectTypeOf(actor.state).toEqualTypeOf<TestNpcState>();
    expect(definition.getState(actor)).toBe(state);
  });

  it('rejects access through a different definition', () => {
    const first = registerDefinition([], 1).definition;
    const second = createNpcDefinition<{ active: boolean }, TestNpcConfig>({ id: 'test-npc' });
    const actor = first.createActor(createBaseNpc(), { phase: 3 });

    expect(second.getState(actor)).toBeNull();
  });

  it('stamps a spawn untargetable window from the definition onto created actors', () => {
    const inert = createNpcDefinition<{ phase: number }, TestNpcConfig>({ id: 'inert', spawnUntargetableTicks: 3 });
    const plain = createNpcDefinition<{ phase: number }, TestNpcConfig>({ id: 'plain' });
    const spawned = { ...createBaseNpc(), spawnTick: 40 };

    const actor = inert.createActor(spawned, { phase: 0 });

    expect(actor.targetableFromTick).toBe(43);
    expect([42, 43].map((tick) => canInitiateAttackOnNpc(actor, tick))).toEqual([false, true]);
    expect(plain.createActor(spawned, { phase: 0 })).not.toHaveProperty('targetableFromTick');
    expect(() => inert.createActor(createBaseNpc(), { phase: 0 })).toThrow(TypeError);
    expect(() => createNpcDefinition({ id: 'bad', spawnUntargetableTicks: -1 })).toThrow(RangeError);
  });

  it('rejects duplicate ids in one encounter scope', () => {
    const first = registerDefinition([], 1).registration;
    const second = registerDefinition([], 2).registration;

    expect(() => new NpcDefinitionCollection([first, second])).toThrow(DuplicateNpcDefinitionError);
  });

  it('allows an actor without state or a definition identity', () => {
    const collection = new NpcDefinitionCollection();

    expect(() => collection.validateActor(createBaseNpc())).not.toThrow();
  });

  it('forwards structured stage results through explicit collection calls', () => {
    const definition = createNpcDefinition<TestNpcState, TestNpcConfig>({
      id: 'stage-npc',
      move: ({ actor }) => [{ npcId: actor.id, path: [[1, 0]] }],
      tick: ({ actor }) => ({
        npcAttacks: [
          {
            attackerId: actor.id,
            targetId: 'player',
            style: 'magic',
            attackKind: 'magic_fire',
            rolledDamage: 3,
            accuracySucceeded: true,
            impactDelayTicks: 1,
            sourceDeathPolicy: 'cancel-before-impact',
          },
        ],
        environmentalDamages: [{ baseDamage: 4, attackType: 'magic', source: 'Waves' }],
      }),
      postTick: () => [{ baseDamage: 5, attackType: 'melee', source: 'VoidFlare' }],
      resolveLocalEffects: () => [{ baseDamage: 6, attackType: 'typeless', source: 'Fireball' }],
    });
    const collection = new NpcDefinitionCollection([definition.register({ generation: 4 })]);
    const actor = definition.createActor(createBaseNpc(), { phase: 2 });
    const context = createDefinitionContext();

    const movement = collection.move(actor, context);
    const tick = collection.tick(actor, context);
    const postTick = collection.postTick(actor, context);
    const localEffects = collection.resolveLocalEffects(actor, context);

    expect(movement).toEqual([{ npcId: 'test-npc-1', path: [[1, 0]] }]);
    expect(tick).toEqual({
      npcAttacks: [
        {
          attackerId: 'test-npc-1',
          targetId: 'player',
          style: 'magic',
          attackKind: 'magic_fire',
          rolledDamage: 3,
          accuracySucceeded: true,
          impactDelayTicks: 1,
          sourceDeathPolicy: 'cancel-before-impact',
        },
      ],
      environmentalDamages: [{ baseDamage: 4, attackType: 'magic', source: 'Waves' }],
    });
    expect(postTick).toEqual([{ baseDamage: 5, attackType: 'melee', source: 'VoidFlare' }]);
    expect(localEffects).toEqual([{ baseDamage: 6, attackType: 'typeless', source: 'Fireball' }]);
    expectTypeOf(tick).toEqualTypeOf<EncounterTickResult>();
  });

  it('returns neutral stage results for a targetless actor when handlers are omitted', () => {
    const definition = createNpcDefinition<TestNpcState, TestNpcConfig>({ id: 'inert-npc' });
    const collection = new NpcDefinitionCollection([definition.register({ generation: 1 })]);
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    const context = createDefinitionContext();

    expect(collection.move(actor, context)).toEqual([]);
    expect(collection.tick(actor, context)).toEqual({ environmentalDamages: [] });
    expect(collection.postTick(actor, context)).toEqual([]);
    expect(collection.resolveLocalEffects(actor, context)).toEqual([]);
  });

  it('inherits combat movement when a registered definition omits its move handler', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'default-mover' });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    const context = createDefinitionContext();
    const target = { ...createBaseNpc(), id: 'target', position: [4, 0] satisfies Coordinate };
    context.world.actors.set(actor.id, actor);
    context.world.actors.set(target.id, target);
    actor.combat.targetId = target.id;
    const collection = new NpcDefinitionCollection([definition.register(undefined)]);

    const requests = collection.move(actor, context);

    expect(requests).toEqual([{ npcId: actor.id, path: [[1, 0]] }]);
    expect(actor.position).toEqual([0, 0]);
    expect(actor.combat).toMatchObject({ targetId: target.id, nextActionTick: 0, lastAttackTick: -1 });
  });

  it('keeps raw, unregistered and mismatched actors inert even with a live combat target', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'default-mover' });
    const other = createNpcDefinition<TestNpcState, undefined>({ id: 'default-mover' });
    const context = createDefinitionContext();
    const target = { ...createBaseNpc(), id: 'target', position: [4, 0] satisfies Coordinate };
    context.world.actors.set(target.id, target);
    const raw = createBaseNpc();
    raw.combat.targetId = target.id;
    const actor = definition.createActor(raw, { phase: 1 });

    expect(new NpcDefinitionCollection().move(actor, context)).toEqual([]);
    expect(new NpcDefinitionCollection([definition.register(undefined)]).move(raw, context)).toEqual([]);
    expect(other.register(undefined).move(actor, context)).toEqual([]);
  });

  it('opts out of default movement when a definition explicitly sets move to false', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'stationary', move: false });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    const context = createDefinitionContext();
    const target = { ...createBaseNpc(), id: 'target', position: [4, 0] satisfies Coordinate };
    context.world.actors.set(actor.id, actor);
    context.world.actors.set(target.id, target);
    actor.combat.targetId = target.id;

    const requests = definition.register(undefined).move(actor, context);

    expect(requests).toEqual([]);
  });

  it('returns neutral stage results for an actor from a mismatched definition', () => {
    const first = createNpcDefinition<TestNpcState, TestNpcConfig>({ id: 'shared-id' });
    const second = createNpcDefinition<TestNpcState, TestNpcConfig>({
      id: 'shared-id',
      tick: () => ({ environmentalDamages: [{ baseDamage: 9, attackType: 'typeless', source: 'Fireball' }] }),
    });
    const collection = new NpcDefinitionCollection([second.register({ generation: 1 })]);
    const actor = first.createActor(createBaseNpc(), { phase: 1 });

    expect(collection.tick(actor, createDefinitionContext())).toEqual({ environmentalDamages: [] });
  });
});

class LifecycleEncounter implements Encounter {
  readonly kind = 'lobby';
  private generation = 0;
  private collection: NpcDefinitionCollection;
  readonly notifications: string[] = [];
  readonly encounterDefeat = vi.fn();
  readonly definition: ReturnType<typeof makeDefinition>;
  despawnOnPostTick = false;
  readonly despawnIdsOnPostTick: ActorId[] = [];
  damageResolvedHook: DefinitionHooks['onDamageResolved'];
  despawnHook: DefinitionHooks['onDespawn'];

  constructor() {
    this.definition = makeDefinition(this.notifications, {
      onDamageResolved: (actor, context) => this.damageResolvedHook?.(actor, context),
      onDespawn: (actor, context) => this.despawnHook?.(actor, context),
    });
    this.collection = this.createCollection();
  }

  getDefaultPlayerStart(): Coordinate {
    return [0, 1];
  }

  getIntroConfig(): null {
    return null;
  }

  createNpcs(): NpcActor[] {
    return [this.definition.createActor({ ...createBaseNpc(), role: 'boss' }, { phase: 1 })];
  }

  reset(): void {
    this.generation += 1;
    this.collection = this.createCollection();
  }

  getNpcDefinitions(): NpcDefinitionCollection {
    return this.collection;
  }

  getSeeds(): Record<string, unknown> {
    return {};
  }

  resolveHazards(): EnvironmentalDamage[] {
    return [];
  }

  processNpcTick(npc: NpcActor, ctx: EncounterContext): EncounterTickResult {
    if (npc.id !== 'test-npc-1') return { environmentalDamages: [] };
    return this.collection.tick(npc, { ...ctx, random: () => 0 });
  }

  processPostTick(ctx: EncounterContext): EnvironmentalDamage[] {
    const npc = ctx.world.getNpc('test-npc-1');
    const damages = npc ? this.collection.postTick(npc, { ...ctx, random: () => 0 }) : [];
    if (this.despawnOnPostTick) {
      ctx.despawnNpc('test-npc-1');
      ctx.despawnNpc('test-npc-1');
    }
    for (const actorId of this.despawnIdsOnPostTick) ctx.despawnNpc(actorId);
    return damages;
  }

  onNpcDefeated(defeat: EncounterNpcDefeat, ctx: EncounterContext, ownership: EncounterCompletionOwnership): void {
    this.encounterDefeat(defeat, ctx, ownership);
  }

  getSnapshot(): EncounterSnapshot {
    return { kind: 'lobby', state: {}, visuals: {} };
  }

  getOutcome(): EncounterOutcome {
    return { phase: 'active' };
  }

  getDefaultMechanicsConfig(): Partial<MechanicsConfig> {
    return {};
  }

  getArenaConfig(): ArenaConfig {
    return { bounds: null, walkableTiles: null, collisionMap: null };
  }

  getNpcDamageSourceLabel(): string {
    return 'TestNpcAttack';
  }

  private createCollection(): NpcDefinitionCollection {
    return new NpcDefinitionCollection([this.definition.register({ generation: this.generation })]);
  }
}

class MovementEncounter extends LifecycleEncounter {
  constructor(
    readonly actors: NpcActor[],
    readonly movementDefinitions: NpcDefinitionCollection,
  ) {
    super();
  }

  override createNpcs(): NpcActor[] {
    return this.actors;
  }

  override getNpcDefinitions(): NpcDefinitionCollection {
    return this.movementDefinitions;
  }

  override processNpcTick(actor: NpcActor, context: EncounterContext): EncounterTickResult {
    return {
      environmentalDamages: [],
      npcAttacks: this.movementDefinitions.tick(actor, { ...context, random: () => 0 }).npcAttacks ?? [],
    };
  }
}

describe('SimulationEngine NPC movement dispatch', () => {
  function crawlFixture() {
    const commands = new Map<number, Omit<NpcMovementRequest, 'npcId'>>([
      [1, { path: [[0, 1]], movementSpeed: 'crawl' }],
    ]);
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'crawl-test',
      move: ({ actor, context }) => {
        const command = commands.get(context.tick);
        return command ? [{ npcId: actor.id, ...command }] : [];
      },
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    const engine = new SimulationEngine({
      encounter: new MovementEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)])),
      startPos: [5, 0],
    });
    const advance = () => engine.advanceTick([5, 0]);
    const snapshot = () => engine.getState().npcs.find((npc) => npc.id === actor.id)!;
    return { actor, engine, commands, advance, snapshot };
  }

  it('publishes a copied crawl across the unchanged second tick and expires it before the next corner step', () => {
    const { actor, commands, advance, snapshot, engine } = crawlFixture();
    expect(snapshot().crawlMovement).toBeUndefined();
    advance();
    const first = snapshot();
    expect(actor.position).toEqual([0, 1]);
    expect(first.crawlMovement).toEqual({ from: [0, 0], to: [0, 1], startTick: 1 });
    expect(interpolateNpcPosition(first, 0.5, 1)).toEqual([0, 0.25]);
    commands.get(1)!.path[0][1] = 99;
    expect(actor.crawlMovement!.to).toEqual([0, 1]);
    first.crawlMovement!.from[0] = 99;
    first.crawlMovement!.to[0] = 99;
    expect(actor.crawlMovement).toEqual({ from: [0, 0], to: [0, 1], startTick: 1 });
    advance();
    const second = snapshot();
    expect(second.previousPosition).toEqual(second.position);
    expect(interpolateNpcPosition(second, 0, 2)).toEqual([0, 0.5]);
    expect(interpolateNpcPosition(second, 0.5, 2)).toEqual([0, 0.75]);
    expect(interpolateNpcPosition(second, 1, 2)).toEqual([0, 1]);
    commands.set(3, { path: [[1, 1]], movementSpeed: 'crawl' });
    advance();
    expect(interpolateNpcPosition(snapshot(), 0, 3)).toEqual([0, 1]);
    expect(interpolateNpcPosition(snapshot(), 0.5, 3)).toEqual([0.25, 1]);
    expect(second.crawlMovement).toEqual({ from: [0, 0], to: [0, 1], startTick: 1 });
    engine.reset([5, 0]);
    expect(actor.crawlMovement).toBeUndefined();
    expect(snapshot().crawlMovement).toBeUndefined();
  });

  it.each(['expired', 'walk', 'run', 'relocated'] as const)('clears crawl when %s', (reason) => {
    const { actor, commands, advance, snapshot } = crawlFixture();
    advance();
    if (reason === 'walk') commands.set(2, { path: [[1, 1]] });
    if (reason === 'run')
      commands.set(2, {
        path: [
          [1, 1],
          [1, 2],
        ],
      });
    if (reason === 'relocated') {
      actor.position = [8, 8];
      expect(snapshot().crawlMovement).toBeUndefined();
    }
    advance();
    if (reason === 'expired') advance();
    expect(actor.crawlMovement).toBeUndefined();
    expect(snapshot().crawlMovement).toBeUndefined();
  });

  it('does not publish or commit a suppressed crawl', () => {
    const { actor, advance, snapshot } = crawlFixture();
    actor.debuffs = { boundFromTick: 1, boundUntilTick: 2 };
    advance();
    expect(actor.position).toEqual([0, 0]);
    expect(snapshot().crawlMovement).toBeUndefined();
  });

  it('accepts adjacent diagonal crawls without interpreting them as runs', () => {
    const { actor, commands, advance, snapshot } = crawlFixture();
    commands.set(1, { path: [[1, 1]], movementSpeed: 'crawl' });
    advance();
    expect(actor.isRunning).toBe(false);
    expect(interpolateNpcPosition(snapshot(), 0.5, 1)).toEqual([0.25, 0.25]);
  });

  it.each([
    'suppressed',
    'invalid',
  ] as const)('retains an accepted segment when a second-tick request is %s', (reason) => {
    const { actor, commands, advance, snapshot } = crawlFixture();
    advance();
    if (reason === 'suppressed') actor.debuffs = { boundFromTick: 2, boundUntilTick: 3 };
    commands.set(2, { path: reason === 'suppressed' ? [[1, 1]] : [[2, 1]], movementSpeed: 'crawl' });
    advance();
    expect(interpolateNpcPosition(snapshot(), 0.5, 2)).toEqual([0, 0.75]);
    expect(actor.crawlMovement?.startTick).toBe(1);
  });

  it.each([
    [
      [0, 1],
      [0, 2],
    ],
    [[0, 2]],
    [[0.5, 0]],
    [[0, 0]],
    [[Number.NaN, 1]],
  ] satisfies Coordinate[][])('rejects invalid crawl path %j without changing position', (...path) => {
    const { actor, commands, advance, snapshot } = crawlFixture();
    commands.set(1, { path, movementSpeed: 'crawl' });
    advance();
    expect(actor.position).toEqual([0, 0]);
    expect(snapshot().crawlMovement).toBeUndefined();
  });

  it.each(['default', 'custom'] as const)('enforces the half-open bind window for %s movement', (policy) => {
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'bound-mover',
      ...(policy === 'custom'
        ? {
            move: ({ actor }: { actor: NpcActor }): NpcMovementRequest[] => [
              { npcId: actor.id, path: [[actor.position[0] + 1, 0]] },
            ],
          }
        : {}),
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    actor.combat.targetId = 'player';
    actor.combat.nextActionTick = 20;
    actor.debuffs = { boundFromTick: 2, boundUntilTick: 4 };
    const encounter = new MovementEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)]));
    const engine = new SimulationEngine({ encounter, startPos: [6, 0] });
    const positions: Coordinate[] = [];
    const moving: boolean[] = [];

    for (let tick = 1; tick <= 4; tick++) {
      engine.advanceTick([6, 0]);
      positions.push([...actor.position]);
      moving.push(actor.isMoving === true);
    }

    expect(positions).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(moving).toEqual([true, false, false, true]);
    expect(actor.combat).toMatchObject({ targetId: 'player', nextActionTick: 20, lastAttackTick: -1 });
  });

  it.each([
    'default',
    'custom',
  ] as const)('suppresses %s movement without an escape draw while Red-X is active', (policy) => {
    const random = vi.fn(() => 0);
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'red-x-mover',
      ...(policy === 'custom'
        ? { move: ({ actor }: { actor: NpcActor }): NpcMovementRequest[] => [{ npcId: actor.id, path: [[1, 0]] }] }
        : {}),
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    actor.combat.targetId = 'player';
    const encounter = new MovementEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)]));
    const engine = new SimulationEngine({ encounter, startPos: [0, 0], combatRandom: random });
    const player = engine['worldState'].getPlayer();
    if (!player) throw new TypeError('Missing movement player');
    player.attackTarget = actor.id;
    player.attackInteractionActive = true;
    setArenaConfig({ bounds: null, walkableTiles: new Set(['0,0']), collisionMap: null }, true);

    engine.advanceTick([0, 0]);

    expect(actor.position).toEqual([0, 0]);
    expect(
      engine.getLastTickEvents().filter((event) => event.type === 'movement' && event.actorId === actor.id),
    ).toEqual([]);
    expect(random).not.toHaveBeenCalled();
  });

  it('clears old movement metadata without routing a raw actor with a live target', () => {
    const actor = createBaseNpc();
    actor.combat.targetId = 'player';
    actor.isMoving = true;
    actor.isRunning = true;
    actor.movementPath = [[0, 0]];
    const engine = new SimulationEngine({
      encounter: new MovementEncounter([actor], new NpcDefinitionCollection()),
      startPos: [5, 0],
    });

    engine.advanceTick([5, 0]);

    expect(actor).toMatchObject({
      position: [0, 0],
      previousPosition: [0, 0],
      movementPath: [],
      isMoving: false,
      isRunning: false,
    });
  });

  it('moves and records a default actor before its same-tick attack when the encounter has no override', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'default-mover',
      tick: ({ actor, context }) => {
        expect(actor.position).toEqual([1, 0]);
        expect(actor.history.get(context.tick)).toEqual([1, 0]);
        return {
          environmentalDamages: [],
          npcAttacks: [
            {
              attackerId: actor.id,
              targetId: 'player',
              style: 'melee',
              attackKind: 'melee_crush',
              rolledDamage: 0,
              accuracySucceeded: true,
              impactDelayTicks: 0,
              sourceDeathPolicy: 'cancel-before-impact',
            },
          ],
        };
      },
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    actor.combat.targetId = 'player';
    const encounter = new MovementEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)]));
    const engine = new SimulationEngine({ encounter, startPos: [2, 0] });

    engine.advanceTick([2, 0]);

    expect(actor).toMatchObject({ previousPosition: [0, 0], movementPath: [[1, 0]], isMoving: true, isRunning: false });
    const events = engine.getLastTickEvents();
    const movementIndex = events.findIndex((event) => event.type === 'movement' && event.actorId === actor.id);
    const attackIndex = events.findIndex((event) => event.type === 'attack_started' && event.sourceId === actor.id);
    expect(movementIndex).toBeGreaterThanOrEqual(0);
    expect(attackIndex).toBeGreaterThan(movementIndex);
  });

  it('plans later default movement against the tile vacated by the earlier actor', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'default-mover' });
    const first = definition.createActor({ ...createBaseNpc(), position: [1, 0] }, { phase: 1 });
    const second = definition.createActor({ ...createBaseNpc(), id: 'second' }, { phase: 1 });
    for (const actor of [first, second]) actor.combat.targetId = 'player';
    const encounter = new MovementEncounter(
      [first, second],
      new NpcDefinitionCollection([definition.register(undefined)]),
    );
    const engine = new SimulationEngine({ encounter, startPos: [5, 0] });

    engine.advanceTick([5, 0]);

    expect([first.position, second.position]).toEqual([
      [2, 0],
      [1, 0],
    ]);
  });

  it('runs a forwarding encounter override once without also invoking the fallback', () => {
    const move = vi.fn(({ actor }: { actor: NpcActor }): NpcMovementRequest[] => [
      { npcId: actor.id, path: [[actor.position[0] + 1, 0]] },
    ]);
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'custom-mover', move });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    class OverrideEncounter extends MovementEncounter {
      *moveNpc(mover: NpcActor, context: EncounterContext): Iterable<NpcMovementRequest> {
        yield* this.movementDefinitions.move(mover, { ...context, random: () => 0 });
      }
    }
    const encounter = new OverrideEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)]));
    const engine = new SimulationEngine({ encounter, startPos: [5, 0] });

    engine.advanceTick([5, 0]);

    expect(move).toHaveBeenCalledTimes(1);
    expect(actor.position).toEqual([1, 0]);
  });

  it('honors an empty encounter override instead of falling back to a definition callback', () => {
    const move = vi.fn((): NpcMovementRequest[] => [{ npcId: 'test-npc-1', path: [[1, 0]] }]);
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'custom-mover', move });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    actor.movementPath = [[0, 0]];
    actor.isMoving = true;
    actor.isRunning = true;
    class OverrideEncounter extends MovementEncounter {
      moveNpc(): NpcMovementRequest[] {
        return [];
      }
    }
    const encounter = new OverrideEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)]));
    const engine = new SimulationEngine({ encounter, startPos: [5, 0] });

    engine.advanceTick([5, 0]);

    expect(move).not.toHaveBeenCalled();
    expect(actor).toMatchObject({ position: [0, 0], movementPath: [], isMoving: false, isRunning: false });
  });

  it('allows an encounter-specific movement policy for a definition that opts out of default pursuit', () => {
    const definition = createNpcDefinition<TestNpcState, undefined>({ id: 'stationary', move: false });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    class OverrideEncounter extends MovementEncounter {
      moveNpc(mover: NpcActor): NpcMovementRequest[] {
        return [{ npcId: mover.id, path: [[1, 0]] }];
      }
    }
    const engine = new SimulationEngine({
      encounter: new OverrideEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)])),
      startPos: [5, 0],
    });

    engine.advanceTick([5, 0]);

    expect(actor.position).toEqual([1, 0]);
  });

  it.each([
    'remove',
    'replace',
  ] as const)('skips stale later actors when an earlier callback performs %s', (operation) => {
    const movedIds: string[] = [];
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'custom-mover',
      move: ({ actor, context }) => {
        movedIds.push(actor.id);
        if (actor.id === 'test-npc-1') {
          context.despawnNpc('second');
          if (operation === 'replace')
            context.spawnNpc(
              definition.createActor({ ...createBaseNpc(), id: 'second', position: [9, 0] }, { phase: 2 }),
            );
        }
        return [{ npcId: actor.id, path: [[actor.position[0] + 1, 0]] }];
      },
    });
    const first = definition.createActor(createBaseNpc(), { phase: 1 });
    const second = definition.createActor({ ...createBaseNpc(), id: 'second', position: [3, 0] }, { phase: 1 });
    const encounter = new MovementEncounter(
      [first, second],
      new NpcDefinitionCollection([definition.register(undefined)]),
    );
    const engine = new SimulationEngine({ encounter, startPos: [5, 0] });

    engine.advanceTick([5, 0]);

    // The removed or replaced instance loses its turn. A replacement is a new registration, so it takes
    // its own turn after every earlier one (the live roster: zuk-facts-spec section 5, W69 t877).
    expect(movedIds).toEqual(operation === 'replace' ? [first.id, 'second'] : [first.id]);
    expect(second.position).toEqual([3, 0]);
    expect(engine['worldState'].getNpc('second')?.position).toEqual(operation === 'replace' ? [10, 0] : undefined);
  });

  // A turn's requests name the NPC taking it: one for any other actor is a programming error, not a
  // request to rebind by id.
  it.each(['movement', 'attack'] as const)('throws on a %s request naming another actor', (kind) => {
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'foreign-requester',
      move: () => (kind === 'movement' ? [{ npcId: 'other', path: [[1, 0]] }] : []),
      tick: () => ({
        environmentalDamages: [],
        npcAttacks:
          kind === 'attack'
            ? [
                {
                  attackerId: 'player',
                  targetId: 'test-npc-1',
                  style: 'typeless',
                  attackKind: 'typeless',
                  rolledDamage: 1,
                  accuracySucceeded: true,
                  impactDelayTicks: 0,
                  sourceDeathPolicy: 'persist',
                },
              ]
            : [],
      }),
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    const engine = new SimulationEngine({
      encounter: new MovementEncounter([actor], new NpcDefinitionCollection([definition.register(undefined)])),
      startPos: [5, 0],
    });

    expect(() => engine.advanceTick([5, 0])).toThrow(
      kind === 'movement'
        ? "NPC 'test-npc-1' returned a movement request for 'other' from its own turn"
        : "NPC 'test-npc-1' returned an attack for 'player' from its own turn",
    );
  });

  it.each(['fallback', 'override'] as const)('rejects a replaced instance request from the %s source', (source) => {
    const definition = createNpcDefinition<TestNpcState, undefined>({
      id: 'replacing-mover',
      move: ({ actor, context }) => {
        if (actor.state.phase !== 1) return [];
        context.despawnNpc(actor.id);
        context.spawnNpc(definition.createActor({ ...createBaseNpc(), position: [9, 0] }, { phase: 2 }));
        return [{ npcId: actor.id, path: [[1, 0]] }];
      },
    });
    const actor = definition.createActor(createBaseNpc(), { phase: 1 });
    class OverrideEncounter extends MovementEncounter {
      moveNpc(mover: NpcActor, context: EncounterContext): NpcMovementRequest[] {
        return this.movementDefinitions.move(mover, { ...context, random: () => 0 });
      }
    }
    const EncounterType = source === 'override' ? OverrideEncounter : MovementEncounter;
    const engine = new SimulationEngine({
      encounter: new EncounterType([actor], new NpcDefinitionCollection([definition.register(undefined)])),
      startPos: [5, 0],
    });

    engine.advanceTick([5, 0]);

    expect(engine['worldState'].getNpc(actor.id)?.position).toEqual([9, 0]);
    expect(
      engine.getLastTickEvents().filter((event) => event.type === 'movement' && event.actorId === actor.id),
    ).toEqual([]);
  });
});

describe('SimulationEngine NPC lifecycle dispatch', () => {
  it('rejects a defined actor when its encounter forgot to register the definition', () => {
    class MissingDefinitionEncounter extends LifecycleEncounter {
      override getNpcDefinitions(): NpcDefinitionCollection {
        return new NpcDefinitionCollection();
      }
    }

    expect(() => new SimulationEngine({ encounter: new MissingDefinitionEncounter(), startPos: [0, 1] })).toThrow(
      NpcDefinitionMismatchError,
    );
  });

  it('rejects initial NPC state without a paired definition identity', () => {
    class UnpairedInitialStateEncounter extends LifecycleEncounter {
      override createNpcs(): NpcActor[] {
        return [{ ...createBaseNpc(), state: { phase: 1 } }];
      }
    }

    expect(() => new SimulationEngine({ encounter: new UnpairedInitialStateEncounter(), startPos: [0, 1] })).toThrow(
      NpcDefinitionMismatchError,
    );
  });

  it('rejects dynamically spawned NPC state without a paired definition identity', () => {
    class UnpairedDynamicStateEncounter extends LifecycleEncounter {
      override processPostTick(ctx: EncounterContext): EnvironmentalDamage[] {
        ctx.spawnNpc({ ...createBaseNpc(), id: 'unpaired-dynamic', state: { phase: 1 } });
        return [];
      }
    }
    const engine = new SimulationEngine({ encounter: new UnpairedDynamicStateEncounter(), startPos: [0, 1] });

    expect(() => engine.advanceTick(engine.getState().playerPosition)).toThrow(NpcDefinitionMismatchError);
  });

  it('delivers damage and defeat once while preserving the encounter callback', () => {
    const encounter = new LifecycleEncounter();
    const engine = new SimulationEngine({ encounter, startPos: [0, 1], combatRandom: () => 0 });
    queuePlayerHit(engine, { rolledDamage: 1, impactTick: 1 });

    engine.advanceTick(engine.getState().playerPosition);
    engine.setBossHp(0);
    engine.advanceTick(engine.getState().playerPosition);
    engine.advanceTick(engine.getState().playerPosition);

    expect(encounter.notifications.filter((entry) => entry.startsWith('damage:'))).toHaveLength(1);
    expect(encounter.notifications.filter((entry) => entry.startsWith('defeated:'))).toHaveLength(1);
    expect(encounter.encounterDefeat).toHaveBeenCalledTimes(1);
  });

  it('refreshes the encounter-scoped collection before rebuilding actors on reset', () => {
    const encounter = new LifecycleEncounter();
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });

    engine.advanceTick(engine.getState().playerPosition);
    engine.reset([0, 1]);
    engine.advanceTick(engine.getState().playerPosition);

    expect(encounter.notifications.filter((entry) => entry.startsWith('tick:'))).toEqual(['tick:1:0', 'tick:1:1']);
  });

  it('removes an explicitly despawned actor and delivers one notification', () => {
    const encounter = new LifecycleEncounter();
    encounter.despawnOnPostTick = true;
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });

    engine.advanceTick(engine.getState().playerPosition);

    expect(encounter.notifications.filter((entry) => entry.startsWith('despawn:'))).toHaveLength(1);
    expect(engine.getState().npcs).toHaveLength(0);
  });

  it('notifies a self-inclusive recursive despawn once', () => {
    const encounter = new LifecycleEncounter();
    encounter.despawnOnPostTick = true;
    encounter.despawnHook = (actor, context) => context.despawnNpc(actor.id);
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });

    engine.advanceTick(engine.getState().playerPosition);

    expect(encounter.notifications.filter((entry) => entry.startsWith('despawn:'))).toHaveLength(1);
    expect(engine.getState().npcs).toHaveLength(0);
  });

  it('preserves a same-id replacement spawned by the despawn hook', () => {
    const encounter = new LifecycleEncounter();
    encounter.despawnOnPostTick = true;
    encounter.despawnHook = (actor, context) => {
      context.spawnNpc(encounter.definition.createActor({ ...createBaseNpc(), id: actor.id }, { phase: 2 }));
    };
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });

    engine.advanceTick(engine.getState().playerPosition);

    expect(engine.getState().npcs).toHaveLength(1);
    expect(encounter.definition.getState(requireNpc(engine, 'test-npc-1'))?.phase).toBe(2);
  });

  it('does not remove the player when despawn receives the player id', () => {
    const encounter = new LifecycleEncounter();
    encounter.despawnIdsOnPostTick.push('player');
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });

    engine.advanceTick(engine.getState().playerPosition);

    expect(engine.getState().isAlive).toBe(true);
    expect(engine.getState().npcs).toHaveLength(1);
  });

  it.each([
    'source',
    'target',
  ] as const)('discards a queued hit when the NPC %s is replaced by its despawn hook', (replaced) => {
    // The NPC's own shot comes from its turn; the player's is queued the way a player attack is.
    class DelayedHitEncounter extends LifecycleEncounter {
      override processNpcTick(npc: NpcActor, ctx: EncounterContext): EncounterTickResult {
        if (npc.id !== 'test-npc-1' || replaced !== 'source' || ctx.tick !== 1) return { environmentalDamages: [] };
        return {
          environmentalDamages: [],
          npcAttacks: [
            {
              attackerId: npc.id,
              targetId: 'player',
              style: 'range',
              attackKind: 'range_arrow',
              rolledDamage: 10,
              accuracySucceeded: true,
              impactDelayTicks: 2,
              sourceDeathPolicy: 'cancel-before-impact',
            },
          ],
        };
      }

      override processPostTick(ctx: EncounterContext): EnvironmentalDamage[] {
        if (ctx.tick === 1) ctx.despawnNpc('test-npc-1');
        return [];
      }
    }
    const encounter = new DelayedHitEncounter();
    encounter.despawnHook = (actor, context) => {
      context.spawnNpc(encounter.definition.createActor({ ...createBaseNpc(), id: actor.id }, { phase: 2 }));
    };
    const engine = new SimulationEngine({ encounter, startPos: [0, 1] });
    engine.setAttackTarget(null);
    if (replaced === 'target')
      queuePlayerHit(engine, { rolledDamage: 10, launchTick: 1, impactTick: 3, style: 'range' });

    engine.advanceTick([0, 1]);
    engine.advanceTick([0, 1]);
    engine.advanceTick([0, 1]);

    expect(engine.getState().playerHP).toBe(99);
    expect(requireNpc(engine, 'test-npc-1').vitals.hp).toBe(10);
    expect(encounter.notifications.filter((entry) => entry.startsWith('damage:'))).toEqual([]);
    expect(engine.getLastTickEvents().filter((event) => event.type === 'hit_applied')).toEqual([]);
  });

  it('dispatches defeat to the killed actor when its damage hook creates a same-id replacement', () => {
    const encounter = new LifecycleEncounter();
    encounter.damageResolvedHook = (actor, context) => {
      context.despawnNpc(actor.id);
      context.spawnNpc(encounter.definition.createActor({ ...createBaseNpc(), id: actor.id }, { phase: 2 }));
    };
    const engine = new SimulationEngine({ encounter, startPos: [0, 1], combatRandom: () => 0 });
    engine.setBossHp(1);
    queuePlayerHit(engine, { rolledDamage: 1, impactTick: 1 });

    engine.advanceTick(engine.getState().playerPosition);

    expect(encounter.notifications.filter((entry) => entry.startsWith('defeated:'))).toEqual(['defeated:1:0']);
    expect(encounter.definition.getState(requireNpc(engine, 'test-npc-1'))?.phase).toBe(2);
  });
});

/** A player hit on the test NPC through the production queue, landing in the NPC's turn drain on `impactTick`. */
function queuePlayerHit(
  engine: SimulationEngine,
  hit: { rolledDamage: number; impactTick: number; launchTick?: number; style?: 'typeless' | 'range' },
): void {
  const style = hit.style ?? 'typeless';
  enqueueEnginePendingHit(engine, {
    sourceId: 'player',
    targetId: 'test-npc-1',
    style,
    attackKind: style === 'range' ? 'range_arrow' : 'typeless',
    launchTick: hit.launchTick ?? hit.impactTick,
    impactTick: hit.impactTick,
    rolledDamage: hit.rolledDamage,
    accuracySucceeded: true,
  });
}

function requireNpc(engine: SimulationEngine, npcId: ActorId): NpcActor {
  const npc = engine.getState().npcs.find((candidate) => candidate.id === npcId);
  if (!npc) throw new Error(`Expected NPC '${npcId}' in simulation state`);
  const actor = Reflect.get(engine, 'worldState');
  if (!(actor instanceof WorldState)) throw new Error('Expected SimulationEngine world state');
  const worldNpc = actor.getNpc(npc.id);
  if (!worldNpc) throw new Error(`Expected NPC actor '${npcId}' in world state`);
  return worldNpc;
}

function createBaseNpc(): NpcActor {
  return {
    id: 'test-npc-1',
    kind: 'npc',
    npcTypeId: 1,
    archetypeId: 'test',
    alive: true,
    position: [0, 0],
    previousPosition: [0, 0],
    facing: 0,
    size: 1,
    vitals: { hp: 10, maxHp: 10 },
    history: new Map(),
    combat: {
      attackSpeed: 4,
      attackRange: 1,
      attackStyle: 'melee',
      nextActionTick: 0,
      targetId: null,
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
      lastAttackTick: -1,
    },
  };
}

function createDefinitionContext(): NpcDefinitionContext {
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  return {
    tick: 0,
    world: new WorldState(),
    tickEvents: new TickEvents(),
    random: () => 0,
    spawnNpc: () => undefined,
    despawnNpc: () => undefined,
    logEvent: () => undefined,
  };
}
