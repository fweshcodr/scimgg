import type { NpcActor } from '../../core/actors/NpcActor';
import type { ActorId } from '../../core/actors/types';
import type { EncounterContext } from '../../core/encounters/types';
import type { GameEvent } from '../../core/events/types';
import type { Coordinate } from '../../types/simulation';
import { ZUK_SPARK_IMPACT_DELAY_TICKS } from './constants';

export type ZukAttackKind =
  | 'zuk_blast'
  | 'mager_magic'
  | 'mager_melee'
  | 'ranger_range'
  | 'ranger_melee'
  | 'jad_magic'
  | 'jad_range'
  | 'jad_melee'
  | 'jad_healer_melee'
  // Ordinary waves 1-68. A Jal-Ak and its children share these: their attacks sound alike.
  | 'nibbler_melee'
  | 'bat_range'
  | 'blob_magic'
  | 'blob_range'
  | 'blob_melee'
  | 'meleer_melee';
export type ZukNpcKind =
  | 'zuk'
  | 'shield'
  | 'mager'
  | 'ranger'
  | 'jad'
  | 'jad_healer'
  | 'healer'
  | 'nibbler'
  | 'bat'
  | 'blob'
  | 'blob_child'
  | 'meleer';
// Keyed by the union, so a new kind cannot be left out of its guard.
const ZUK_ATTACK_KINDS = {
  zuk_blast: true,
  mager_magic: true,
  mager_melee: true,
  ranger_range: true,
  ranger_melee: true,
  jad_magic: true,
  jad_range: true,
  jad_melee: true,
  jad_healer_melee: true,
  nibbler_melee: true,
  bat_range: true,
  blob_magic: true,
  blob_range: true,
  blob_melee: true,
  meleer_melee: true,
} as const satisfies Record<ZukAttackKind, true>;
const ZUK_NPC_KINDS = {
  zuk: true,
  shield: true,
  mager: true,
  ranger: true,
  jad: true,
  jad_healer: true,
  healer: true,
  nibbler: true,
  bat: true,
  blob: true,
  blob_child: true,
  meleer: true,
} as const satisfies Record<ZukNpcKind, true>;
export type ZukEventPosition = readonly [number, number];

export type ZukAttackEvent = GameEvent & {
  readonly type: 'zuk_attack';
  readonly attack: ZukAttackKind;
  readonly sourceId: ActorId;
  readonly targetId: ActorId;
  readonly sourcePosition: ZukEventPosition;
  readonly targetPosition: ZukEventPosition;
  readonly launchTick: number;
  readonly impactTick: number;
  /**
   * Client cycles (30 per tick) from {@link launchTick} to the moment the flying model
   * reaches its target — the wind-up plus the cache profile's `endTime`. Absent for
   * attacks with no projectile, in which case the flight ends at {@link impactTick}.
   */
  readonly projectileArrivalCycles?: number;
};

export type ZukGroundEffectEvent = GameEvent & {
  readonly type: 'zuk_ground_effect';
  readonly effect: 'jal_mejjak_spark';
  readonly sourceId: ActorId;
  readonly sourcePosition: ZukEventPosition;
  readonly targetPositions: readonly ZukEventPosition[];
  readonly launchTick: number;
  readonly impactTick: number;
  readonly projectileEndTick: number;
};

export type ZukDeathEvent = GameEvent & {
  readonly type: 'zuk_death';
  readonly actorId: ActorId;
  readonly npcKind: ZukNpcKind;
  readonly position: ZukEventPosition;
};

/** An ordinary-wave NPC action with its own sound and no attack: digging, resurrecting. */
export type InfernoAbility = 'meleer_dig_down' | 'meleer_dig_up' | 'mager_resurrect';

export type InfernoAbilityEvent = GameEvent & {
  readonly type: 'inferno_ability';
  readonly ability: InfernoAbility;
  readonly actorId: ActorId;
  /** The actor's SW tile, where the captures center its `sound_area`. */
  readonly position: ZukEventPosition;
};

export type ZukHitEvent = GameEvent & {
  readonly type: 'zuk_hit';
  readonly actorId: ActorId;
  readonly npcKind: ZukNpcKind;
  readonly position: ZukEventPosition;
};

export type ZukAttackCue = {
  readonly attack: ZukAttackKind;
  readonly sourceId: ActorId;
  readonly targetId: ActorId;
  readonly sourcePosition: Readonly<Coordinate>;
  readonly targetPosition: Readonly<Coordinate>;
  readonly launchTick: number;
  readonly impactTick: number;
  readonly projectileArrivalCycles?: number;
};

export type ZukNpcCue = {
  readonly actorId: ActorId;
  readonly npcKind: ZukNpcKind;
  readonly position: Readonly<Coordinate>;
};

function copyCoordinate(position: Readonly<Coordinate>): ZukEventPosition {
  return [position[0], position[1]];
}

export function emitZukAttack(ctx: Pick<EncounterContext, 'tickEvents'>, cue: ZukAttackCue): void {
  ctx.tickEvents.emit({
    type: 'zuk_attack',
    ...cue,
    sourcePosition: copyCoordinate(cue.sourcePosition),
    targetPosition: copyCoordinate(cue.targetPosition),
  } satisfies Omit<ZukAttackEvent, 'eventId' | 'tick'>);
}

export function emitZukDeath(ctx: Pick<EncounterContext, 'tickEvents'>, cue: ZukNpcCue): void {
  ctx.tickEvents.emit({
    type: 'zuk_death',
    ...cue,
    position: copyCoordinate(cue.position),
  } satisfies Omit<ZukDeathEvent, 'eventId' | 'tick'>);
}

export function emitZukHit(ctx: Pick<EncounterContext, 'tickEvents'>, cue: ZukNpcCue): void {
  ctx.tickEvents.emit({
    type: 'zuk_hit',
    ...cue,
    position: copyCoordinate(cue.position),
  } satisfies Omit<ZukHitEvent, 'eventId' | 'tick'>);
}

export function emitInfernoAbility(
  ctx: Pick<EncounterContext, 'tickEvents'>,
  cue: { readonly ability: InfernoAbility; readonly actorId: ActorId; readonly position: Readonly<Coordinate> },
): void {
  ctx.tickEvents.emit({
    type: 'inferno_ability',
    ...cue,
    position: copyCoordinate(cue.position),
  } satisfies Omit<InfernoAbilityEvent, 'eventId' | 'tick'>);
}

export function zukNpcKind(npc: NpcActor): ZukNpcKind | null {
  const kinds: Readonly<Record<string, ZukNpcKind>> = {
    zuk: 'zuk',
    zuk_shield: 'shield',
    zuk_mager: 'mager',
    zuk_ranger: 'ranger',
    zuk_jad: 'jad',
    zuk_jad_healer: 'jad_healer',
    zuk_healer: 'healer',
    // Ordinary-wave types of the same species share their presentation.
    inferno_mager: 'mager',
    inferno_ranger: 'ranger',
    inferno_jad: 'jad',
    inferno_jad_healer: 'jad_healer',
    inferno_nibbler: 'nibbler',
    inferno_bat: 'bat',
    inferno_blob: 'blob',
    inferno_blob_mage: 'blob_child',
    inferno_blob_range: 'blob_child',
    inferno_blob_melee: 'blob_child',
    inferno_meleer: 'meleer',
  };
  return kinds[npc.archetypeId] ?? null;
}

export function isZukAttackKind(value: unknown): value is ZukAttackKind {
  return typeof value === 'string' && Object.hasOwn(ZUK_ATTACK_KINDS, value);
}

export function isZukNpcKind(value: unknown): value is ZukNpcKind {
  return typeof value === 'string' && Object.hasOwn(ZUK_NPC_KINDS, value);
}

function isCoordinate(value: unknown): value is ZukEventPosition {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function hasEventMetadata(event: GameEvent): boolean {
  return Number.isInteger(event.eventId) && Number.isInteger(event.tick);
}

export function isZukAttackEvent(event: GameEvent): event is ZukAttackEvent {
  return (
    event.type === 'zuk_attack' &&
    hasEventMetadata(event) &&
    isZukAttackKind(event.attack) &&
    typeof event.sourceId === 'string' &&
    typeof event.targetId === 'string' &&
    isCoordinate(event.sourcePosition) &&
    isCoordinate(event.targetPosition) &&
    typeof event.launchTick === 'number' &&
    Number.isInteger(event.launchTick) &&
    typeof event.impactTick === 'number' &&
    Number.isInteger(event.impactTick) &&
    event.impactTick >= event.launchTick &&
    (event.projectileArrivalCycles === undefined ||
      (typeof event.projectileArrivalCycles === 'number' &&
        Number.isFinite(event.projectileArrivalCycles) &&
        event.projectileArrivalCycles >= 0))
  );
}

export function isZukGroundEffectEvent(event: GameEvent): event is ZukGroundEffectEvent {
  return (
    event.type === 'zuk_ground_effect' &&
    hasEventMetadata(event) &&
    event.effect === 'jal_mejjak_spark' &&
    typeof event.sourceId === 'string' &&
    isCoordinate(event.sourcePosition) &&
    Array.isArray(event.targetPositions) &&
    event.targetPositions.length === 3 &&
    event.targetPositions.every(isCoordinate) &&
    typeof event.launchTick === 'number' &&
    Number.isInteger(event.launchTick) &&
    typeof event.impactTick === 'number' &&
    Number.isInteger(event.impactTick) &&
    event.impactTick === event.launchTick + ZUK_SPARK_IMPACT_DELAY_TICKS &&
    typeof event.projectileEndTick === 'number' &&
    Number.isInteger(event.projectileEndTick) &&
    event.projectileEndTick === event.launchTick + ZUK_SPARK_IMPACT_DELAY_TICKS
  );
}

export function isZukDeathEvent(event: GameEvent): event is ZukDeathEvent {
  return (
    event.type === 'zuk_death' &&
    hasEventMetadata(event) &&
    typeof event.actorId === 'string' &&
    isZukNpcKind(event.npcKind) &&
    isCoordinate(event.position)
  );
}

export function isZukHitEvent(event: GameEvent): event is ZukHitEvent {
  return (
    event.type === 'zuk_hit' &&
    hasEventMetadata(event) &&
    typeof event.actorId === 'string' &&
    isZukNpcKind(event.npcKind) &&
    isCoordinate(event.position)
  );
}

export function isInfernoAbilityEvent(event: GameEvent): event is InfernoAbilityEvent {
  return (
    event.type === 'inferno_ability' &&
    hasEventMetadata(event) &&
    (event.ability === 'meleer_dig_down' || event.ability === 'meleer_dig_up' || event.ability === 'mager_resurrect') &&
    typeof event.actorId === 'string' &&
    isCoordinate(event.position)
  );
}
