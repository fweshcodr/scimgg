export type YamaEncounterCommand =
  | {
      readonly encounter: 'yama_p3';
      readonly type: 'set-opening-style';
      readonly style: 'magic' | 'range';
    }
  | { readonly encounter: 'yama_p3'; readonly type: 'spawn-fireball' }
  | { readonly encounter: 'yama_p3'; readonly type: 'spawn-void-flare' };

export const YAMA_SET_OPENING_MAGIC_COMMAND = {
  encounter: 'yama_p3',
  type: 'set-opening-style',
  style: 'magic',
} as const satisfies YamaEncounterCommand;

export const YAMA_SET_OPENING_RANGE_COMMAND = {
  encounter: 'yama_p3',
  type: 'set-opening-style',
  style: 'range',
} as const satisfies YamaEncounterCommand;

export const YAMA_SPAWN_FIREBALL_COMMAND = {
  encounter: 'yama_p3',
  type: 'spawn-fireball',
} as const satisfies YamaEncounterCommand;

export const YAMA_SPAWN_VOID_FLARE_COMMAND = {
  encounter: 'yama_p3',
  type: 'spawn-void-flare',
} as const satisfies YamaEncounterCommand;
