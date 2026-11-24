/**
 * Capture replay ranges: the records a capture-conformance test replays, one capture stream's tick
 * range at a time (docs/testing/capture-timeline.md).
 *
 * Test-only: nothing under `src/test/capture` may be imported by production code
 * (`src/test/capture/__tests__/importBoundary.test.ts`).
 *
 * Values keep the packet's own units and field names (`starttime` / `endtime` in client cycles,
 * `angle` as the projectile's launch slope, `delay` in client cycles, OSRS world tiles).
 */

/** World tile `[x, y, plane]`. */
export type CaptureCoord = readonly [x: number, y: number, plane: number];

export type ActorKind = 'npc' | 'player';

/**
 * One continuous presence of an actor. NPC indices are reused, so an index alone does not identify
 * an NPC: `generation` counts earlier lives of the same index in the capture stream (0-based). The
 * recording player is the one player life, index 0. Lives compare by reference.
 */
export interface ActorLife {
  readonly kind: ActorKind;
  readonly index: number;
  readonly generation: number;
}

/** An actor named inside another record (a projectile's target, a facing target). */
export interface ActorRef {
  readonly kind: ActorKind;
  readonly index: number;
  readonly life: ActorLife;
  readonly npcId?: number;
  /** The referenced actor's tile, when the record prints it. */
  readonly coord?: CaptureCoord;
}

export interface SourceRef {
  /** The capture's file name. */
  readonly capture: string;
  /** 1-based stream ordinal within the capture. */
  readonly stream: number;
  /** The capture's own tick counter. */
  readonly tick: number;
  /** 1-based line of the record in the capture. */
  readonly line: number;
}

/** Actor update verbs a range holds. */
export type ActorOp = 'add' | 'del' | 'walk' | 'run' | 'crawl' | 'teleport' | 'telejump';

interface EventBase {
  readonly source: SourceRef;
}

interface OwnedEventBase extends EventBase {
  readonly actor: ActorLife;
}

/**
 * An actor update. `coord` is the start tile (the tile itself for `add` and `del`) and `newcoord`
 * the destination of a move. `path` is the tile after each step, present only for a move of more
 * than one step. A player run prints no steps, so its intermediate tile is unknown.
 */
export interface ActorUpdateEvent extends OwnedEventBase {
  readonly type: 'actor';
  readonly op: ActorOp;
  readonly npcId?: number;
  readonly coord: CaptureCoord;
  readonly newcoord?: CaptureCoord;
  readonly path?: readonly CaptureCoord[];
}

/** An animation. Every NPC sequence is kept; for the player only its attack sequences. `-1` clears. */
export interface SequenceEvent extends OwnedEventBase {
  readonly type: 'sequence';
  readonly id: number;
}

/** A graphic on an NPC: the ice impact (363) or the failed-spell impact (85, with its `delay`). */
export interface SpotanimEvent extends OwnedEventBase {
  readonly type: 'spotanim';
  readonly id: number;
  readonly delay?: number;
}

export interface HitEvent extends OwnedEventBase {
  readonly type: 'hit';
  /** Hitsplat type (RuneLite `HitsplatID`). */
  readonly id: number;
  readonly value: number;
}

/** An NPC's health bar reached zero. */
export interface DeadEvent extends OwnedEventBase {
  readonly type: 'dead';
}

/** A facing update: towards a tile (`coord`) or towards an actor (`target`, with its tile). */
export interface FacingEvent extends OwnedEventBase {
  readonly type: 'facing';
  readonly mode: 'coord' | 'actor';
  readonly coord?: CaptureCoord;
  readonly target?: ActorRef;
}

/**
 * A projectile: an NPC projectile, or the player's Ice Burst (366). `from` and `to` are the endpoint
 * tiles; `targetActor` is absent when the target resolves to no actor.
 */
export interface ProjectileEvent extends EventBase {
  readonly type: 'projectile';
  readonly id: number;
  /** Client cycles. */
  readonly starttime: number;
  /** Client cycles. */
  readonly endtime: number;
  /** Launch slope. */
  readonly angle: number;
  readonly progress: number;
  readonly startheight: number;
  readonly endheight: number;
  readonly from: CaptureCoord;
  readonly to: CaptureCoord;
  readonly targetActor?: ActorRef;
}

/** A graphic on a tile: Jal-Zek's resurrection graphic (444). */
export interface MapAnimEvent extends EventBase {
  readonly type: 'map_anim';
  readonly id: number;
  readonly coord: CaptureCoord;
}

/** The "Wave: N" game message. */
export interface WaveEvent extends EventBase {
  readonly type: 'wave';
  readonly wave: number;
}

/** A varbit's new value. */
export interface VarbitEvent extends EventBase {
  readonly type: 'varbit';
  readonly id: number;
  readonly value: number;
}

export type CaptureEvent =
  | ActorUpdateEvent
  | SequenceEvent
  | SpotanimEvent
  | HitEvent
  | DeadEvent
  | FacingEvent
  | ProjectileEvent
  | MapAnimEvent
  | WaveEvent
  | VarbitEvent;

export type CaptureEventType = CaptureEvent['type'];

export interface CaptureTick {
  readonly tick: number;
  readonly events: readonly CaptureEvent[];
}

export interface LifeRecord {
  readonly life: ActorLife;
  readonly npcId?: number;
  /** Tick of the life's first update in the capture stream. */
  readonly start: number;
  /** Tick of its removal, or `null` when it was still present at the stream's end. */
  readonly end: number | null;
}

/** The state at the end of the tick before a range: every actor's tile and each varbit's value. */
export interface RangeStart {
  readonly tick: number;
  readonly player: CaptureCoord;
  readonly npcs: readonly { readonly life: ActorLife; readonly coord: CaptureCoord }[];
  /** In the order the capture first set them. */
  readonly varbits: readonly { readonly id: number; readonly value: number }[];
}

/** One replayed range of a capture stream: every tick from `first` to `last`, in order. */
export interface ReplayRange {
  readonly capture: string;
  readonly stream: number;
  readonly first: number;
  readonly last: number;
  readonly lives: readonly LifeRecord[];
  readonly start: RangeStart;
  readonly ticks: readonly CaptureTick[];
}
