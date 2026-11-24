import type { Coordinate } from '../../types/simulation';
import { ZUK_SHADOW_MIN_Y, ZUK_SHIELD_SIZE } from './constants';

/**
 * Do not add a northern bound: the walkable floor ends south of the glyph.
 * Shadow-band evidence: docs/encounters/zuk-facts-spec.md#shadow.
 */
export function zukTargetsPlayer(glyphX: number, player: Readonly<Coordinate>): boolean {
  const [playerX, playerY] = player;
  if (playerY < ZUK_SHADOW_MIN_Y) return true;
  return playerX < glyphX - 1 || playerX > glyphX + ZUK_SHIELD_SIZE;
}
