export type WorldClickType = 'yellow' | 'red';
export type ReplayClickType = WorldClickType | 'ui';

export const REPLAY_CLICK_DURATION_MS = {
  yellow: 600,
  red: 600,
  ui: 420,
} as const satisfies Record<ReplayClickType, number>;

export const REPLAY_CLICK_OWNER_ATTRIBUTE = 'data-replay-click-owner';
export const REPLAY_CLICK_OWNERS = {
  world: 'world',
  explicit: 'explicit',
} as const;
export const REPLAY_CLICK_OWNERSHIP_PROPS = {
  world: { [REPLAY_CLICK_OWNER_ATTRIBUTE]: REPLAY_CLICK_OWNERS.world },
  explicit: { [REPLAY_CLICK_OWNER_ATTRIBUTE]: REPLAY_CLICK_OWNERS.explicit },
} as const;

export type ReplayUiPointerDown = {
  readonly clientX: number;
  readonly clientY: number;
  readonly timeStamp: number;
};

export function getReplayClickDurationMs(type: ReplayClickType): number {
  return REPLAY_CLICK_DURATION_MS[type];
}

export function createPrimaryUiPointerDownListener(
  onPointerDown: (pointerDown: ReplayUiPointerDown) => void,
): (event: PointerEvent) => void {
  return (event) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(`[${REPLAY_CLICK_OWNER_ATTRIBUTE}]`)) return;
    onPointerDown({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp });
  };
}
