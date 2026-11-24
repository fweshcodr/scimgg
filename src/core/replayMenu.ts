export interface ReplayMenuLeaf {
  readonly action: string;
  readonly target?: string;
  readonly targetColor?: string;
  readonly disabled?: boolean;
  readonly clickType?: 'yellow' | 'red';
}

export interface ReplayMenuEntry extends ReplayMenuLeaf {
  readonly submenu?: readonly ReplayMenuLeaf[];
}

export interface ReplayMenuView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly hoveredIndex: number;
  readonly submenuParentIndex: number;
  readonly hoveredSubmenuIndex: number;
  readonly submenuPosition: { readonly x: number; readonly y: number } | null;
  /**
   * A menu a touch long-press opened: its minimum row height in CSS px (see touchPrefs), and
   * how far its rows were scrolled. Absent for a mouse menu, which has neither.
   */
  readonly rowHeight?: number;
  readonly scrollTop?: number;
}

export interface ReplayMenuState extends ReplayMenuView {
  readonly entries: readonly ReplayMenuEntry[];
}

export type ReplayMenuEvent =
  | { readonly kind: 'open'; readonly tMs: number; readonly state: ReplayMenuState }
  | { readonly kind: 'update'; readonly tMs: number; readonly view: ReplayMenuView }
  | { readonly kind: 'close'; readonly tMs: number };

export interface ReplayMenuTimelineSample {
  readonly tMs: number;
  readonly state: ReplayMenuState | null;
}

export function buildReplayMenuTimeline(events: readonly ReplayMenuEvent[]): readonly ReplayMenuTimelineSample[] {
  let state: ReplayMenuState | null = null;
  return events.map((event) => {
    switch (event.kind) {
      case 'open':
        state = event.state;
        break;
      case 'update':
        if (state === null) throw new TypeError('Replay menu update requires an open menu');
        state = { ...event.view, entries: state.entries };
        break;
      case 'close':
        state = null;
        break;
      default:
        return assertNever(event);
    }
    return { tMs: event.tMs, state };
  });
}

export function replayMenuStateAt(
  timeline: readonly ReplayMenuTimelineSample[],
  playheadMs: number,
): ReplayMenuState | null {
  let low = 0;
  let high = timeline.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const sample = timeline[middle];
    if (sample && sample.tMs <= playheadMs) low = middle + 1;
    else high = middle;
  }
  return timeline[low - 1]?.state ?? null;
}

export function replayMenuViewsEqual(left: ReplayMenuView, right: ReplayMenuView): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    left.hoveredIndex === right.hoveredIndex &&
    left.submenuParentIndex === right.submenuParentIndex &&
    left.hoveredSubmenuIndex === right.hoveredSubmenuIndex &&
    left.submenuPosition?.x === right.submenuPosition?.x &&
    left.submenuPosition?.y === right.submenuPosition?.y &&
    left.rowHeight === right.rowHeight &&
    left.scrollTop === right.scrollTop
  );
}

export function copyReplayMenuView(view: ReplayMenuView): ReplayMenuView {
  return {
    x: view.x,
    y: view.y,
    scale: view.scale,
    hoveredIndex: view.hoveredIndex,
    submenuParentIndex: view.submenuParentIndex,
    hoveredSubmenuIndex: view.hoveredSubmenuIndex,
    submenuPosition: view.submenuPosition === null ? null : { x: view.submenuPosition.x, y: view.submenuPosition.y },
    ...(view.rowHeight === undefined ? {} : { rowHeight: view.rowHeight }),
    ...(view.scrollTop === undefined ? {} : { scrollTop: view.scrollTop }),
  };
}

export function copyReplayMenuState(state: ReplayMenuState): ReplayMenuState {
  return {
    ...copyReplayMenuView(state),
    entries: state.entries.map((entry) => ({
      ...copyLeaf(entry),
      ...(entry.submenu === undefined ? {} : { submenu: entry.submenu.map(copyLeaf) }),
    })),
  };
}

function copyLeaf(leaf: ReplayMenuLeaf): ReplayMenuLeaf {
  return {
    action: leaf.action,
    ...(leaf.target === undefined ? {} : { target: leaf.target }),
    ...(leaf.targetColor === undefined ? {} : { targetColor: leaf.targetColor }),
    ...(leaf.disabled === undefined ? {} : { disabled: leaf.disabled }),
    ...(leaf.clickType === undefined ? {} : { clickType: leaf.clickType }),
  };
}

function assertNever(event: never): never {
  throw new TypeError(`Unexpected replay menu event: ${event}`);
}
