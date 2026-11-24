import { z } from 'zod';
import type { NpcActor } from '../core/actors/NpcActor';
import type { PlayerActor } from '../core/actors/PlayerActor';
import type { Coordinate } from '../types/simulation';

/**
 * One NPC projectile as its projectile record describes it. Visual only: the hit it carries is
 * resolved separately by the attack request. Encounter visual events embed these cues, and
 * `render/effects/NpcProjectileFlights` draws them.
 *
 * Packet `angle` is `slope` and `progress` is `startOffset`; heights are raw OSRS units. See
 * docs/architecture/projectile-motion.md#inputs-and-lifetime-boundary for the arrival convention.
 */
export type NpcVisualTarget =
  | { readonly kind: 'actor'; readonly actorId: string; readonly size: number; readonly position: Coordinate }
  | { readonly kind: 'tile'; readonly position: Coordinate };

export type NpcProjectileCue = {
  readonly spotAnimId: number;
  /** World-space launch point: the attacker's center tile center, not its south-west tile. */
  readonly sourcePosition: Coordinate;
  readonly target: NpcVisualTarget;
  /** Client cycles after the emitting tick, 30 per tick: packet `starttime`. */
  readonly startDelayCycles: number;
  /** Packet `endtime`: arrival, and the exclusive end of the flight. */
  readonly endDelayCycles: number;
  readonly slope: number;
  readonly startOffset: number;
  readonly startHeight: number;
  readonly endHeight: number;
};

const cycles = z.number().int().nonnegative();
const coordinate = z.tuple([z.number(), z.number()]);

export const npcVisualTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('actor'),
    actorId: z.string().min(1),
    size: z.number().int().positive(),
    position: coordinate,
  }),
  z.object({ kind: z.literal('tile'), position: coordinate }),
]);

export const npcProjectileCueSchema = z
  .object({
    spotAnimId: cycles,
    sourcePosition: coordinate,
    target: npcVisualTargetSchema,
    startDelayCycles: cycles,
    endDelayCycles: cycles,
    slope: cycles,
    startOffset: cycles,
    startHeight: cycles,
    endHeight: cycles,
  })
  .refine((cue) => cue.endDelayCycles >= cue.startDelayCycles);

/** Homes onto the actor; `position` is where a flight aims if the actor is never seen rendered. */
export function actorVisualTarget(actor: Pick<NpcActor | PlayerActor, 'id' | 'size' | 'position'>): NpcVisualTarget {
  return { kind: 'actor', actorId: actor.id, size: actor.size, position: [...actor.position] };
}

/** World-space center of an NPC's center tile, where its projectiles launch. */
export function npcProjectileSource(actor: Pick<NpcActor, 'size' | 'position'>): Coordinate {
  const offset = Math.floor(actor.size / 2) + 0.5;
  return [actor.position[0] + offset, actor.position[1] + offset];
}
