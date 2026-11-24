import { screenNpcModelHitDepth } from './npcPick';
import type { NpcHitTestData } from './types';

export interface PickedGroundItem {
  readonly groundItemId: string;
  readonly distance: number;
}

export function pickGroundItemsAtScreen(
  screenPx: { x: number; y: number },
  entries: ReadonlyArray<{ groundItemId: string; hitTestData: NpcHitTestData }>,
  viewMatrix: number[],
  projMatrix: number[],
  viewportWidth: number,
  viewportHeight: number,
): PickedGroundItem[] {
  const hits: PickedGroundItem[] = [];
  for (const { groundItemId, hitTestData } of entries) {
    const distance = screenNpcModelHitDepth(
      screenPx,
      hitTestData,
      viewMatrix,
      projMatrix,
      viewportWidth,
      viewportHeight,
    );
    if (distance !== null) {
      hits.push({ groundItemId, distance });
    }
  }
  hits.sort((left, right) => left.distance - right.distance);
  return hits;
}
