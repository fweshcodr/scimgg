import type { EncounterContext, EnvironmentalDamage } from '../../core/encounters/types';
import { type Coordinate, EventType, type MechanicsConfig, type TickNumber } from '../../types/simulation';
import * as constants from './constants';
import type { ResolvedYamaEncounterConfig } from './contractConfig';
import * as fireball from './fireball';
import { type FireballHazardContext, resolveFireballHazards } from './fireballHazards';
import type { YamaVisuals } from './snapshot';
import type { YamaFireballState } from './state';

const MANUAL_FIREBALL_LEAD_TICKS = 2;
const FIREBALL_LATCH_RETAINED_BURSTS = 6;

type MechanicsInput = { readonly mechanics: Readonly<Partial<MechanicsConfig>> };
type ManualBurstInput = MechanicsInput & { readonly tick: number };
type PostTickInput = MechanicsInput & {
  readonly beatInfo: constants.YamaBeatInfo;
  readonly didMeleeThisTick: boolean;
};
type HazardInput = MechanicsInput & { readonly damages: EnvironmentalDamage[] };
type VisualInput = MechanicsInput & { readonly tick: TickNumber; readonly defeated: boolean };
type FireballPostTickContext = Pick<EncounterContext, 'tick' | 'playerPos' | 'tickEvents' | 'logEvent'>;
type ActivePhasesInput = {
  readonly tick: number;
  readonly scheduledEnabled: boolean;
  readonly shape: fireball.FireballShapeResolver;
};

export class YamaFireballRuntime {
  constructor(
    private readonly sourceActorId: string,
    private readonly attackPattern: ResolvedYamaEncounterConfig['attackPattern'],
    private readonly damage: EnvironmentalDamage['baseDamage'],
    private readonly allowDuoSide: boolean,
  ) {}

  spawnManualBurst(state: YamaFireballState, input: ManualBurstInput): void {
    const shape = this.resolveShape(input.mechanics);
    const globalBurstIndex = state.manualBurstCount++;
    for (let setIndex = 0; setIndex < constants.FIREBALL_SET_OFFSETS.length; setIndex++) {
      const startTick = input.tick + MANUAL_FIREBALL_LEAD_TICKS + constants.FIREBALL_SET_OFFSETS[setIndex];
      const angle = constants.getFireballAngle(globalBurstIndex, setIndex, state.seed, shape.start, shape.side);
      const instanceId = -++state.manualNextId;
      state.manual.set(instanceId, { startTick, angle });
      state.registeredIds.add(instanceId);
    }
  }

  processPostTick(state: YamaFireballState, ctx: FireballPostTickContext, input: PostTickInput): boolean {
    const scheduledEnabled = input.mechanics.fireballs === true;
    const eligible =
      scheduledEnabled && input.beatInfo.isBeat && input.beatInfo.isFireballBeat && !input.didMeleeThisTick;
    if (eligible) this.registerBurst(state, input.beatInfo, this.resolveShape(input.mechanics));
    this.emitDueSpawnEvents(state, ctx);
    if (scheduledEnabled || state.manual.size > 0) {
      this.capturePositions(state, ctx, {
        tick: ctx.tick + 1,
        scheduledEnabled,
        shape: this.shapeResolver(state, input.mechanics),
      });
    }
    this.expireManual(state, ctx.tick);
    return eligible && input.beatInfo.fireballBeatKind === 'snap';
  }

  resolveHazards(state: YamaFireballState, ctx: FireballHazardContext, input: HazardInput): void {
    resolveFireballHazards(state, {
      ctx,
      activePhases: this.activePhases(state, {
        tick: ctx.tick,
        scheduledEnabled: input.mechanics.fireballs === true,
        shape: this.shapeResolver(state, input.mechanics),
      }),
      sourceActorId: this.sourceActorId,
      damage: this.damage,
      damages: input.damages,
    });
  }

  buildVisuals(state: YamaFireballState, input: VisualInput): YamaVisuals {
    if (input.defeated) return this.inactiveVisuals();
    const phases = this.activePhases(state, {
      tick: input.tick,
      scheduledEnabled: input.mechanics.fireballs === true,
      shape: this.shapeResolver(state, input.mechanics),
    });
    const fireballStates = phases.flatMap((phase) => {
      const centerPosition = state.startPositions.get(phase.instanceId);
      return centerPosition
        ? [
            {
              active: true,
              phaseIndex: phase.instanceId,
              centerPosition,
              angle: phase.angle,
              ticksIntoPhase: input.tick - phase.startTick,
            },
          ]
        : [];
    });
    return {
      fireballState: fireballStates[0] ?? this.inactiveVisuals().fireballState,
      fireballStates,
    };
  }

  clearForDefeat(state: YamaFireballState): void {
    state.startPositions.clear();
    state.pendingSpawnEvents.length = 0;
    state.impactDealt.clear();
    state.impactEmitted.clear();
    state.explosionDealt.clear();
    state.registeredIds.clear();
    state.burstShapes.clear();
    state.perfectDodgeTriggered.clear();
    state.shadowWaveImmunityTick = null;
    state.manual.clear();
    state.manualNextId = 0;
    state.manualBurstCount = 0;
  }

  private resolveShape(mechanics: Readonly<Partial<MechanicsConfig>>): fireball.FireballBurstShape {
    const start: constants.YamaFireballStart = constants.isYamaFireballStart(mechanics.fireballStart)
      ? mechanics.fireballStart
      : 'random';
    // Contracts are solo even when a saved setup selects Player 2.
    const side: constants.YamaDuoSide =
      this.allowDuoSide && constants.isYamaDuoSide(mechanics.duoSide) ? mechanics.duoSide : 'player1';
    return { start, side };
  }

  private shapeResolver(
    state: YamaFireballState,
    mechanics: Readonly<Partial<MechanicsConfig>>,
  ): fireball.FireballShapeResolver {
    const live = this.resolveShape(mechanics);
    return (globalBurstIndex) => state.burstShapes.get(globalBurstIndex) ?? live;
  }

  private activePhases(state: YamaFireballState, input: ActivePhasesInput): fireball.FireballPhaseInfo[] {
    return [
      ...(input.scheduledEnabled
        ? fireball.getFireballPhasesForTick(input.tick, state.seed, this.attackPattern, input.shape)
        : []),
      ...this.activeManualPhases(state, input.tick),
    ];
  }

  private activeManualPhases(state: YamaFireballState, tick: number): fireball.FireballPhaseInfo[] {
    const phases: fireball.FireballPhaseInfo[] = [];
    for (const [instanceId, fireball] of state.manual) {
      const endTick = fireball.startTick + constants.FIREBALL_SET_DURATION - 1;
      if (tick >= fireball.startTick && tick <= endTick) {
        phases.push({ startTick: fireball.startTick, endTick, angle: fireball.angle, instanceId });
      }
    }
    return phases;
  }

  private registerBurst(
    state: YamaFireballState,
    beatInfo: constants.YamaBeatInfo,
    shape: fireball.FireballBurstShape,
  ): void {
    const fireballBeats = this.attackPattern.fireballBeats;
    const cycleNumber = Math.floor(beatInfo.globalBeatOrdinal / this.attackPattern.beatsPerCycle);
    if (cycleNumber < 0) return;
    const burstIndex = fireballBeats.indexOf(beatInfo.beatIndex);
    if (burstIndex === -1) return;
    const globalBurstIndex = cycleNumber * fireballBeats.length + burstIndex;
    for (const index of state.burstShapes.keys()) {
      if (index <= globalBurstIndex - FIREBALL_LATCH_RETAINED_BURSTS) state.burstShapes.delete(index);
    }
    state.burstShapes.set(globalBurstIndex, {
      start: constants.getFireballBurstStartsVertical(globalBurstIndex, state.seed, shape.start)
        ? 'vertical'
        : 'horizontal',
      side: shape.side,
    });
    for (let setIndex = 0; setIndex < constants.FIREBALL_SET_OFFSETS.length; setIndex++) {
      state.registeredIds.add(constants.getFireballInstanceId(cycleNumber, burstIndex, setIndex));
    }
  }

  private capturePositions(state: YamaFireballState, ctx: FireballPostTickContext, input: ActivePhasesInput): void {
    for (const phase of this.activePhases(state, input)) {
      if (phase.startTick !== input.tick || state.startPositions.has(phase.instanceId)) continue;
      if (!state.registeredIds.has(phase.instanceId)) continue;
      const center = [...ctx.playerPos] as Coordinate;
      state.startPositions.set(phase.instanceId, center);
      ctx.logEvent({
        tick: phase.startTick,
        type: EventType.FIREBALL_SPAWN,
        phaseIndex: phase.instanceId,
        centerPosition: center,
        angle: phase.angle,
      });
      state.pendingSpawnEvents.push({ startTick: phase.startTick, instanceId: phase.instanceId, center });
    }
  }

  private emitDueSpawnEvents(state: YamaFireballState, ctx: FireballPostTickContext): void {
    if (state.pendingSpawnEvents.length === 0) return;
    const pending = state.pendingSpawnEvents;
    state.pendingSpawnEvents = pending.filter((entry) => entry.startTick > ctx.tick);
    for (const entry of pending) {
      if (entry.startTick !== ctx.tick) continue;
      ctx.tickEvents.emit({
        type: 'fireball_spawned',
        sourceId: this.sourceActorId,
        targetPosition: entry.center,
        fireballIndex: entry.instanceId,
      });
    }
  }

  private expireManual(state: YamaFireballState, tick: number): void {
    for (const [instanceId, fireball] of state.manual) {
      if (tick <= fireball.startTick + constants.FIREBALL_SET_DURATION - 1) continue;
      state.manual.delete(instanceId);
      state.startPositions.delete(instanceId);
      state.impactDealt.delete(instanceId);
      state.impactEmitted.delete(instanceId);
      state.explosionDealt.delete(instanceId);
      state.perfectDodgeTriggered.delete(instanceId);
      state.registeredIds.delete(instanceId);
    }
  }

  private inactiveVisuals(): YamaVisuals {
    return {
      fireballState: { active: false, phaseIndex: null, centerPosition: null, angle: null, ticksIntoPhase: 0 },
      fireballStates: [],
    };
  }
}
