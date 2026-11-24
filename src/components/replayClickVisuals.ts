import type { ReplayClickType, WorldClickType } from '../input/replayClickFeedback';

export const REPLAY_CLICK_SPRITE_FRAME_SIZE_PX = 16;
/** The world click's frame sheet per color, painted as a stylesheet background; preloaded. */
export const REPLAY_CLICK_SHEET_URLS: Readonly<Record<WorldClickType, string>> = {
  yellow: '/yellow_click_sheet.webp',
  red: '/red_click_sheet.webp',
};
const WORLD_CLICK_FRAME_MS = 100;
const WORLD_CLICK_LAST_FRAME = 4;
const WORLD_CLICK_RENDER_SCALE = 22 / REPLAY_CLICK_SPRITE_FRAME_SIZE_PX;

export type WorldClickVisualState = {
  readonly kind: 'world';
  readonly spriteFrame: number;
  readonly spriteScale: number;
  readonly spriteOpacity: number;
};

export type UiClickVisualState = {
  readonly kind: 'ui';
  readonly coreScale: number;
  readonly coreOpacity: number;
  readonly ringScale: number;
  readonly ringOpacity: number;
};

export type ReplayClickVisualState = WorldClickVisualState | UiClickVisualState;

export function getReplayClickVisualState(
  type: ReplayClickType,
  elapsedMs: number,
  progress: number,
): ReplayClickVisualState {
  switch (type) {
    case 'yellow':
    case 'red':
      return worldClickVisualState(elapsedMs, progress);
    case 'ui':
      return uiClickVisualState(progress);
    default:
      return assertNever(type);
  }
}

/**
 * A finger's tap, drawn beneath a touch click's own feedback: a fingertip press on the X's
 * pixel grid and frame clock. Frame 0 is first contact, under the small X; frame 1 the
 * fingertip spread, under the full X; frame 2 the lift. Then it is gone, well inside every
 * click duration.
 */
export type ReplayTapVisualState = {
  readonly frame: 0 | 1 | 2;
  readonly opacity: number;
};

const TAP_FRAME_OPACITY = [1, 1, 0.5] as const;
/** CSS pixels per pixel of the X sprite, so the tap shares its grid. */
export const REPLAY_CLICK_PIXEL_SCALE = WORLD_CLICK_RENDER_SCALE;

/** Null once the tap has lifted. */
export function getReplayTapVisualState(elapsedMs: number): ReplayTapVisualState | null {
  const frame = Math.floor(Math.max(0, elapsedMs) / WORLD_CLICK_FRAME_MS);
  if (frame >= TAP_FRAME_OPACITY.length) return null;
  const tapFrame = frame as ReplayTapVisualState['frame'];
  return { frame: tapFrame, opacity: TAP_FRAME_OPACITY[tapFrame] };
}

/**
 * A finger's long-press, shown from the moment its menu opens: the tap's spread pad, already
 * pressed, held steady for three of the X's frames, then lifted over two. It never grows, which
 * is what tells it from a tap, and every frame fits inside `REPLAY_HOLD_MARK_DURATION_MS`.
 */
const HOLD_FRAME_OPACITY = [1, 1, 1, 0.6, 0.3] as const;

/** Null once the hold has lifted. */
export function getReplayHoldVisualState(elapsedMs: number): { readonly opacity: number } | null {
  const frame = Math.floor(Math.max(0, elapsedMs) / WORLD_CLICK_FRAME_MS);
  const opacity: number | undefined = HOLD_FRAME_OPACITY[frame];
  return opacity === undefined ? null : { opacity };
}

function worldClickVisualState(elapsedMs: number, progress: number): WorldClickVisualState {
  const normalized = clamp01(progress);

  return {
    kind: 'world',
    spriteFrame: Math.min(WORLD_CLICK_LAST_FRAME, Math.floor(Math.max(0, elapsedMs) / WORLD_CLICK_FRAME_MS)),
    spriteScale: WORLD_CLICK_RENDER_SCALE,
    spriteOpacity: fadeAfter(normalized, 0.68),
  };
}

function uiClickVisualState(progress: number): UiClickVisualState {
  const normalized = clamp01(progress);
  const entrance = easeOutQuart(clamp01(normalized / 0.2));
  const settle = easeOutQuart(clamp01((normalized - 0.2) / 0.25));

  return {
    kind: 'ui',
    coreScale: 0.68 + entrance * 0.42 - settle * 0.1,
    coreOpacity: fadeAfter(normalized, 0.52),
    ringScale: 0.72 + easeOutQuart(normalized) * 0.46,
    ringOpacity: 0.58 * (1 - easeOutQuart(normalized)),
  };
}

function fadeAfter(progress: number, start: number): number {
  return 1 - easeOutQuart(clamp01((progress - start) / (1 - start)));
}

function easeOutQuart(value: number): number {
  return 1 - (1 - value) ** 4;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported replay click type: ${String(value)}`);
}
