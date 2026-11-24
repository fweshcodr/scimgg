import type { Coordinate, PrayerType } from '../../types/simulation';
import type { ActorId, DamageType } from '../actors/types';
import type { AttackResourceSource } from '../combat/attackResources';
import type { AttackKind } from '../combat/attackTypes';

export type { AttackKind } from '../combat/attackTypes';

export type HitsplatType = 'damage' | 'block' | 'poison' | 'venom' | 'disease' | 'doom' | 'heal' | 'burn';

export type XpSkill = 'attack' | 'strength' | 'defence' | 'ranged' | 'magic' | 'hitpoints';

export type OverheadTextAnchor = { readonly kind: 'actor'; readonly actorId: ActorId };

export interface OverheadTextSegment {
  readonly text: string;
  readonly color?: string;
}

/**
 * Which chat channel a message arrives on: `game` and `spam` are server game messages (spam is the
 * filterable kind), `public` is NPC public chat, shown as "<speaker>: <text>".
 */
export type GameMessageKind = 'game' | 'spam' | 'public';

export type EquipSoundKind = 'helmet' | 'legs' | 'metal_body' | 'hands' | 'staff' | 'fun';

export interface BaseGameEvent {
  eventId: number;
  tick: number;
}

/**
 * Where an attack that flies was launched from and at, and whether its roll landed: every spell,
 * and a player's powered-staff or ranged attack. Named for the spells it was first built for.
 */
export type SpellCastSnapshot = {
  readonly sourcePosition: Readonly<Coordinate>;
  readonly targetPosition: Readonly<Coordinate>;
  readonly targetSize: number;
  readonly accurate: boolean;
};

/**
 * One hop of a ricocheting shot (the Venator bow's), from the previous target to the next. Every
 * hop is chosen on the launch tick, so the event carries the whole chain; cycles count from it.
 */
export type RicochetFlight = {
  readonly targetId: ActorId;
  /** The previous target's center tile, `south-west + floor((size - 1) / 2)`, where the hop leaves from. */
  readonly sourcePosition: Readonly<Coordinate>;
  /** The next target's south-west tile; with `targetSize`, the hop homes on its center. */
  readonly targetPosition: Readonly<Coordinate>;
  readonly targetSize: number;
  readonly startCycles: number;
  readonly endCycles: number;
};

export type CoreGameEvent =
  | ({
      type: 'attack_started';
      sourceId: ActorId;
      targetId: ActorId;
      style: DamageType;
      attackKind: AttackKind;
      spellId?: string;
      readonly spellCast?: SpellCastSnapshot;
      usingSpecialAttack?: boolean;
      impactDelayTicks?: number;
      weaponId?: number;
      ammoId?: number;
      ammoSource?: AttackResourceSource;
      readonly ricochets?: readonly RicochetFlight[];
    } & BaseGameEvent)
  | ({
      readonly type: 'spell_targeted';
      readonly sourceId: ActorId;
      readonly targetId: ActorId;
      readonly spellId: string;
      readonly spellCast: SpellCastSnapshot;
      readonly impactDelayTicks: number;
      readonly weaponId?: number;
    } & BaseGameEvent)
  | ({
      type: 'hit_applied';
      targetId: ActorId;
      /**
       * Tile the hit lands on. Positioned sounds attenuate from here, so an event built without
       * it plays a splash across the arena at the volume of one at your feet.
       */
      targetPosition: Coordinate;
      damage: number;
      blocked: boolean;
      attackKind: AttackKind;
      /**
       * Whether the target's active overhead prayer matched this hit's attack
       * style at resolution (magic→ProtectMagic, range→ProtectRange,
       * melee→ProtectMelee). `null` for typeless hits, which have no protectable
       * style. Drives prayer-accuracy tutorial drills.
       */
      prayedCorrectly: boolean | null;
      /**
       * Whether the attack roll landed. A magic attack that fails this splashes, which
       * is a different sound from a 0 hitsplat; absent when the emitter does not roll
       * accuracy separately (NPC hits on the player).
       */
      accurate?: boolean;
    } & BaseGameEvent)
  | ({
      type: 'projectile_spawned';
      sourceId: ActorId;
      targetId: ActorId;
      projectileKind: string;
      launchTick: number;
      impactTick: number;
    } & BaseGameEvent)
  | ({
      type: 'prayer_changed';
      actorId: ActorId;
      from: PrayerType | null;
      to: PrayerType | null;
    } & BaseGameEvent)
  | ({
      type: 'prayer_depleted';
      actorId: ActorId;
    } & BaseGameEvent)
  | ({
      type: 'prayer_activation_failed';
      actorId: ActorId;
      attemptedPrayer: PrayerType;
    } & BaseGameEvent)
  | ({
      type: 'actor_died';
      actorId: ActorId;
    } & BaseGameEvent)
  | ({
      readonly type: 'actor_despawned';
      readonly actorId: ActorId;
    } & BaseGameEvent)
  | ({
      type: 'hitsplat_spawned';
      targetId: ActorId;
      amount: number;
      hitsplatType: HitsplatType;
    } & BaseGameEvent)
  | ({
      type: 'xp_drop';
      /**
       * Integer XP deltas granted by one player attack, grouped like the OSRS
       * client groups simultaneous drops (one drop, multiple skill icons).
       * Amounts are deltas of the player's cumulative fractional XP counters,
       * so 1.33xp/damage skills alternate 13/14 for a 10 just like the real
       * client. Zero-delta skills are omitted.
       */
      skills: Array<{ skill: XpSkill; amount: number }>;
      /**
       * Damage this attack will deal on impact (sum over multi-hit specs).
       * Emitted on the ATTACK tick — before delayed hits land — which is what
       * makes a RuneLite-style "predicted hit" display possible.
       */
      predictedHit: number;
    } & BaseGameEvent)
  | ({
      type: 'movement';
      actorId: ActorId;
      from: Coordinate;
      to: Coordinate;
    } & BaseGameEvent)
  | ({
      type: 'item_consumed';
      track: 'food' | 'potion' | 'combo_food';
      /** The item as it was before this use consumed it. */
      itemId: number;
    } & BaseGameEvent)
  | ({
      type: 'item_equipped';
      slot: 'head' | 'cape' | 'amulet' | 'weapon' | 'body' | 'shield' | 'legs' | 'hands' | 'boots' | 'ring';
      itemId: number;
      equipSound: EquipSoundKind;
    } & BaseGameEvent)
  | ({
      type: 'overhead_text';
      anchor: OverheadTextAnchor;
      overheadText: string;
      overheadTextColor?: string;
      overheadTextSegments?: readonly OverheadTextSegment[];
      overheadCycle: number;
    } & BaseGameEvent)
  | ({
      /**
       * A chat box line. Separate from `overhead_text`: a taunt that shows overhead and in chat
       * emits both. Segments without a color take the chat box's default text color.
       */
      readonly type: 'game_message';
      readonly kind: GameMessageKind;
      /** The `public` speaker's name; game messages carry any "Name: " prefix in `segments`. */
      readonly speaker?: string;
      readonly segments: readonly OverheadTextSegment[];
    } & BaseGameEvent)
  | ({
      type: 'player_graphic_applied';
      spotAnimId: number;
    } & BaseGameEvent)
  | ({
      /** A one-shot graphic on an NPC, anchored at `height` like a packet `spotanim` line. */
      type: 'npc_graphic_applied';
      targetId: ActorId;
      spotAnimId: number;
      height: number;
    } & BaseGameEvent)
  | ({
      type: 'spell_self_cast';
      animationId: number;
      spotAnimId: number;
    } & BaseGameEvent)
  | ({
      type: 'status_effect_expired';
      /** `death_charge` only when the window ran out with a proc unspent, not when the last proc paid out. */
      effect: 'mark_of_darkness' | 'saturated_heart' | 'death_charge';
    } & BaseGameEvent)
  | ({
      /** A killing blow spent a Death Charge proc, whether or not the bar had room for the energy. */
      readonly type: 'death_charge_proc';
    } & BaseGameEvent)
  | ({
      type: 'ground_item_dropped';
      itemId: number;
      quantity: number;
      position: Coordinate;
    } & BaseGameEvent)
  | ({
      type: 'ground_item_taken';
      itemId: number;
      quantity: number;
      position: Coordinate;
    } & BaseGameEvent)
  | ({
      type: 'intro_started';
      animationSeqId: number;
      landingPosition: Coordinate;
    } & BaseGameEvent)
  | ({
      type: 'intro_completed';
    } & BaseGameEvent);

export type EncounterGameEvent = { eventId: number; tick: number; type: string; [key: string]: unknown };
export type GameEvent = CoreGameEvent | EncounterGameEvent;

/**
 * Type guard narrowing a GameEvent to a specific CoreGameEvent variant by its
 * `type`. Needed because EncounterGameEvent carries `type: string` plus an index
 * signature, which defeats plain `event.type === '...'` discrimination on the
 * union (property access on the narrowed value would otherwise widen to `unknown`).
 */
export function isCoreEvent<K extends CoreGameEvent['type']>(
  event: GameEvent,
  type: K,
): event is Extract<CoreGameEvent, { type: K }> {
  return event.type === type;
}
