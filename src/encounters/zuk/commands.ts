import { z } from 'zod';

const cycles = z.number().int().nonnegative();
const position = z.tuple([z.number().int(), z.number().int()]);
const sparkSchema = z
  .object({
    position,
    amount: z.number().int().min(5).max(10),
    projectile: z
      .object({
        sourcePosition: z.tuple([z.number(), z.number()]),
        startDelayCycles: cycles,
        endDelayCycles: cycles,
        slope: cycles,
        startOffset: cycles,
        startHeight: cycles,
        endHeight: cycles,
      })
      .strict()
      .refine((cue) => cue.endDelayCycles >= cue.startDelayCycles)
      .readonly()
      .optional(),
    landing: z.object({ height: cycles, delayCycles: cycles }).strict().readonly().optional(),
  })
  .strict()
  .readonly();

export const ZukSparkVolleyCommandSchema = z
  .object({
    encounter: z.literal('zuk'),
    type: z.literal('emit-spark-volley'),
    sparks: z.tuple([sparkSchema, sparkSchema, sparkSchema]).readonly(),
  })
  .strict()
  .readonly();

export type ZukSparkVolleyCommand = z.infer<typeof ZukSparkVolleyCommandSchema>;

export type ZukEncounterCommand =
  | ZukSparkVolleyCommand
  | { readonly encounter: 'zuk'; readonly type: 'spawn-set' }
  | { readonly encounter: 'zuk'; readonly type: 'replace-set' }
  | { readonly encounter: 'zuk'; readonly type: 'spawn-jad' }
  | { readonly encounter: 'zuk'; readonly type: 'spawn-healers' }
  | { readonly encounter: 'zuk'; readonly type: 'spawn-mager' }
  | { readonly encounter: 'zuk'; readonly type: 'spawn-ranger' }
  | { readonly encounter: 'zuk'; readonly type: 'spawn-jad-healers' }
  | { readonly encounter: 'zuk'; readonly type: 'respawn-glyph' }
  | { readonly encounter: 'zuk'; readonly type: 'clear-spawns' }
  | { readonly encounter: 'zuk'; readonly type: 'demonstrate-jad'; readonly style: 'magic' | 'range' }
  | { readonly encounter: 'zuk'; readonly type: 'demonstrate-set' }
  | { readonly encounter: 'zuk'; readonly type: 'demonstrate-heal' }
  | { readonly encounter: 'zuk'; readonly type: 'inspect-ranged-graphic' };

export const ZUK_DEBUG_ACTIONS = [
  { command: { encounter: 'zuk', type: 'spawn-set' }, label: 'Spawn set' },
  { command: { encounter: 'zuk', type: 'spawn-jad' }, label: 'Spawn Jad' },
  { command: { encounter: 'zuk', type: 'spawn-healers' }, label: 'Spawn healers' },
  { command: { encounter: 'zuk', type: 'respawn-glyph' }, label: 'Reset shield' },
  { command: { encounter: 'zuk', type: 'clear-spawns' }, label: 'Clear minions' },
] as const satisfies readonly { readonly command: ZukEncounterCommand; readonly label: string }[];

export const ZUK_SPAWN_SET_COMMAND = {
  encounter: 'zuk',
  type: 'spawn-set',
} as const satisfies ZukEncounterCommand;
