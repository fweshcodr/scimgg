import { z } from 'zod';
import type { TickEvents } from '../../core/events/TickEvents';
import type { GameEvent } from '../../core/events/types';
import {
  type NpcProjectileCue,
  type NpcVisualTarget,
  npcProjectileCueSchema,
  npcVisualTargetSchema,
} from '../projectileCue';

export const INFERNO_SPOT_ANIM_IDS = [1375, 1376, 1377, 131, 448, 449, 450, 660, 659, 444, 451] as const;

export type InfernoAnimationCue = {
  readonly actorId: string;
  readonly clipId: string;
  readonly delayCycles: number;
};

export type InfernoGraphicCue = {
  readonly spotAnimId: number;
  readonly target: NpcVisualTarget;
  readonly delayCycles: number;
  readonly height: number;
};

export type InfernoVisualCue = {
  readonly animations: readonly InfernoAnimationCue[];
  readonly projectiles: readonly NpcProjectileCue[];
  readonly graphics: readonly InfernoGraphicCue[];
};

export type InfernoVisualEvent = GameEvent & InfernoVisualCue & { readonly type: 'inferno_visual' };

const cycles = z.number().int().nonnegative();
const visualEventSchema = z.object({
  type: z.literal('inferno_visual'),
  eventId: cycles,
  tick: cycles,
  animations: z.array(z.object({ actorId: z.string().min(1), clipId: z.string().min(1), delayCycles: cycles })),
  projectiles: z.array(npcProjectileCueSchema),
  graphics: z.array(
    z.object({ spotAnimId: cycles, target: npcVisualTargetSchema, delayCycles: cycles, height: cycles }),
  ),
});

export function isInfernoVisualEvent(event: GameEvent): event is InfernoVisualEvent {
  return visualEventSchema.safeParse(event).success;
}

export function emitInfernoVisual(events: TickEvents, cue: InfernoVisualCue): void {
  events.emit({ type: 'inferno_visual', ...structuredClone(cue) });
}
