import type { ArenaBounds, CollisionMap } from '../../rs/collision/WalkabilityAnalyzer';

export interface ArenaConfig {
  bounds: ArenaBounds | null;
  walkableTiles: Set<string> | null;
  collisionMap: CollisionMap | null;
}
