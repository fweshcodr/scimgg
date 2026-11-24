import type { NpcActor } from '../../core/actors/NpcActor';
import type { EncounterContext, EnvironmentalDamage } from '../../core/encounters/types';
import type { WorldState } from '../../core/WorldState';
import { createVoidFlareActor, destroyVoidFlare, voidFlareDefinition } from '../../npcs/yama/voidFlare';
import { SpotAnimID } from '../../rs/config/spotanimtype/SpotAnimID';
import type { Coordinate } from '../../types/simulation';
import { VOID_FLARE_SPAWN_POSITIONS, type YamaBeatInfo } from './constants';
import { MELEE_VOID_FLARE_CHARGE_TICKS, type ResolvedYamaEncounterConfig } from './contractConfig';
import type { VoidFlareEncounterState, VoidFlareSpawn } from './state';

const VOID_FLARE_SIZE = 2;
/**
 * `vfx_voidflare_human_impact_blue`: blue to match the explode spotanim the renderer always draws
 * (`VoidFlareController`); the capture's impact color always matches its explosion's
 * (capture yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt:5211).
 */
const VOID_FLARE_HUMAN_IMPACT_SPOTANIM_ID = SpotAnimID.VFX_VOIDFLARE_HUMAN_IMPACT_BLUE;

type VoidFlareSpawnContext = Pick<EncounterContext, 'tick' | 'playerPos' | 'world' | 'spawnNpc'>;
type VoidFlareTickContext = VoidFlareSpawnContext & Pick<EncounterContext, 'tickEvents'>;
type VoidFlareDefeatContext = Pick<EncounterContext, 'tick' | 'world' | 'tickEvents'>;
type VoidFlareSpawnedEvent = {
  readonly type: 'voidflare_spawned';
  readonly flareId: string;
  readonly position: Coordinate;
  readonly variant: 'shadow';
};
type PostTickInput = {
  readonly enabled: boolean;
  readonly beatInfo: YamaBeatInfo;
  readonly didMeleeThisTick: boolean;
};
type FlarePlacement = VoidFlareSpawn & { readonly position: Coordinate };

export class YamaVoidFlareCoordinator {
  constructor(private readonly config: ResolvedYamaEncounterConfig['voidFlares']) {}

  processPendingSpawns(state: VoidFlareEncounterState, context: VoidFlareTickContext, enabled: boolean): void {
    const pending = state.pendingSpawns;
    state.pendingSpawns = [];
    if (enabled) this.spawnFlares(state, context, pending);
  }

  processPostTick(state: VoidFlareEncounterState, context: VoidFlareTickContext, input: PostTickInput): void {
    if (!input.enabled) return;
    if (this.config.continuous && context.tick > 0 && context.tick % this.config.continuousIntervalTicks === 0) {
      this.spawnFlares(state, context, [{ chargeTicks: this.config.chargeTicks, hp: this.config.continuousHp }]);
    }
    if (input.didMeleeThisTick) {
      state.pendingSpawns.push({ chargeTicks: MELEE_VOID_FLARE_CHARGE_TICKS, hp: this.config.hp });
    }
    if (input.beatInfo.isBeat && input.beatInfo.isVoidFlareBeat) {
      for (let index = 0; index < this.config.spawnCount; index++) {
        state.pendingSpawns.push({ chargeTicks: this.config.chargeTicks, hp: this.config.hp });
      }
    }
  }

  drainPendingImpacts(
    state: VoidFlareEncounterState,
    context: Pick<EncounterContext, 'tick' | 'world' | 'tickEvents'>,
    damages: EnvironmentalDamage[],
  ): void {
    const player = context.world.getPlayer();
    if (!player || !player.alive) return;
    state.pendingImpacts = state.pendingImpacts.filter((pending) => {
      if (pending.impactTick > context.tick) return true;
      // The capture sends this on the detonation tick with `delay=30`, so it first shows on the
      // impact tick, which is when it is emitted here - and only for an explosion that lands.
      context.tickEvents.emit({ type: 'player_graphic_applied', spotAnimId: VOID_FLARE_HUMAN_IMPACT_SPOTANIM_ID });
      damages.push({
        baseDamage: pending.damage,
        attackType: 'typeless',
        source: 'VoidFlare',
        playerPosition: [player.position[0], player.position[1]],
      });
      return false;
    });
  }

  spawnDebug(state: VoidFlareEncounterState, context: VoidFlareSpawnContext): VoidFlareSpawnedEvent | undefined {
    const active = this.getActiveActors(context.world);
    if (active.length >= this.config.maxActive) return undefined;
    const position = this.pickSpawnPosition(
      state,
      context.playerPos,
      active.map((actor) => actor.position),
    );
    return position
      ? this.spawnFlare(state, context, { position, chargeTicks: this.config.chargeTicks, hp: this.config.hp })
      : undefined;
  }

  clearForDefeat(state: VoidFlareEncounterState, context: VoidFlareDefeatContext, defeatTick: number): void {
    state.pendingSpawns = [];
    state.pendingImpacts = [];
    state.spawnIndex = state.seed % VOID_FLARE_SPAWN_POSITIONS.length;
    state.nextId = 0;
    for (const actor of context.world.getNpcs()) {
      if (voidFlareDefinition.isActor(actor)) {
        destroyVoidFlare(actor, { tick: defeatTick, tickEvents: context.tickEvents });
      }
    }
  }

  private spawnFlares(
    state: VoidFlareEncounterState,
    context: VoidFlareTickContext,
    spawns: readonly VoidFlareSpawn[],
  ): void {
    const active = this.getActiveActors(context.world);
    const positions = active.map((actor) => actor.position);
    for (const spawn of spawns.slice(0, Math.max(0, this.config.maxActive - active.length))) {
      const position = this.pickSpawnPosition(state, context.playerPos, positions);
      if (!position) continue;
      positions.push(position);
      context.tickEvents.emit(this.spawnFlare(state, context, { ...spawn, position }));
    }
  }

  private spawnFlare(
    state: VoidFlareEncounterState,
    context: VoidFlareSpawnContext,
    spawn: FlarePlacement,
  ): VoidFlareSpawnedEvent {
    const damageRollIndex = state.nextId++;
    const flareId = `vf-${damageRollIndex}`;
    const actor = createVoidFlareActor({
      id: flareId,
      damageRollIndex,
      position: spawn.position,
      spawnTick: context.tick,
      chargeTicks: spawn.chargeTicks,
      currentHp: spawn.hp,
      guaranteedPlayerMaximum: this.config.guaranteedPlayerMaximum,
    });
    context.spawnNpc(actor);
    return {
      type: 'voidflare_spawned',
      flareId,
      position: spawn.position,
      variant: 'shadow',
    };
  }

  private pickSpawnPosition(
    state: VoidFlareEncounterState,
    playerPosition: Coordinate,
    activePositions: readonly Coordinate[],
  ): Coordinate | undefined {
    const claimedIndex = state.spawnIndex;
    for (let step = 0; step < VOID_FLARE_SPAWN_POSITIONS.length; step++) {
      const position = VOID_FLARE_SPAWN_POSITIONS[(claimedIndex + step) % VOID_FLARE_SPAWN_POSITIONS.length];
      if (this.overlapsExisting(position, activePositions)) continue;
      if (position[0] === playerPosition[0] && position[1] === playerPosition[1]) continue;
      state.spawnIndex = (claimedIndex + 1) % VOID_FLARE_SPAWN_POSITIONS.length;
      return [position[0], position[1]];
    }
    return undefined;
  }

  private getActiveActors(world: Readonly<WorldState>): NpcActor[] {
    return world.getNpcs().filter((actor) => voidFlareDefinition.isActor(actor) && actor.alive);
  }

  private overlapsExisting(position: Coordinate, activePositions: readonly Coordinate[]): boolean {
    return activePositions.some(
      (active) =>
        position[0] + VOID_FLARE_SIZE > active[0] &&
        position[0] < active[0] + VOID_FLARE_SIZE &&
        position[1] + VOID_FLARE_SIZE > active[1] &&
        position[1] < active[1] + VOID_FLARE_SIZE,
    );
  }
}
