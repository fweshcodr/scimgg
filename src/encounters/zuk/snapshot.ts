export interface ZukPublicState {
  readonly setTimer: number | null;
  readonly timerPaused: boolean;
  readonly enraged: boolean;
  readonly jadSpawned: boolean;
  readonly shieldX: number;
  readonly shieldMovingEast: boolean;
  /** Next-tick glyph x, including holds: Zuk checks before that tick's player movement. */
  readonly shieldNextX: number | null;
}

export type ZukVisuals = Record<string, never>;
