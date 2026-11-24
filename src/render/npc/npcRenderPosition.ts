import type { NpcSnapshot } from '../../types/simulation';
import { calculateVisualPlayerPosition } from '../core/interpolation';

type NpcPosition = Pick<NpcSnapshot, 'position' | 'previousPosition' | 'movementPath' | 'crawlMovement'>;

/** Shared by position sampling and movement animation selection; mismatched relocations are stale. */
export function npcCrawlProgress(
  npc: Pick<NpcSnapshot, 'position' | 'crawlMovement'>,
  fraction: number,
  currentTick?: number,
): number | null {
  const crawl = npc.crawlMovement;
  if (!crawl || currentTick === undefined || npc.position[0] !== crawl.to[0] || npc.position[1] !== crawl.to[1])
    return null;
  return Math.max(0, Math.min(1, (currentTick + fraction - crawl.startTick) / 2));
}

/**
 * Where an NPC is drawn `fraction` of the way through the tick that moved it, in tile units (south-west
 * corner). A multi-step move walks its published `movementPath` with equal time per step, as the
 * player's does, so a run that turns a corner passes through the corner tile instead of cutting it.
 * Without a usable path (one step, or a teleport) it slides straight from `previousPosition` to
 * `position`.
 * Crawl metadata instead uses the snapshot's tick and a two-tick linear presentation model, even
 * when this tick's authoritative positions are equal. It does not recover exact client velocity.
 */
export function interpolateNpcPosition(npc: NpcPosition, fraction: number, currentTick?: number): [number, number] {
  const progress = npcCrawlProgress(npc, fraction, currentTick);
  if (progress !== null && npc.crawlMovement) {
    const { from, to } = npc.crawlMovement;
    return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
  }
  const { position: to, previousPosition: from, movementPath: path } = npc;
  if (from[0] === to[0] && from[1] === to[1]) return [to[0], to[1]];
  const last = path?.[path.length - 1];
  if (path && path.length > 1 && last && last[0] === to[0] && last[1] === to[1]) {
    return calculateVisualPlayerPosition(from, path, to, fraction).position;
  }
  return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
}
