export class CollisionFlag {
  static readonly WALL_NORTH_WEST: number = 0x1;
  static readonly WALL_NORTH: number = 0x2;
  static readonly WALL_NORTH_EAST: number = 0x4;
  static readonly WALL_EAST: number = 0x8;
  static readonly WALL_SOUTH_EAST: number = 0x10;
  static readonly WALL_SOUTH: number = 0x20;
  static readonly WALL_SOUTH_WEST: number = 0x40;
  static readonly WALL_WEST: number = 0x80;

  static readonly OBJECT: number = 0x100;

  static readonly WALL_NORTH_WEST_PROJECTILE_BLOCKER: number = 0x200;
  static readonly WALL_NORTH_PROJECTILE_BLOCKER: number = 0x400;
  static readonly WALL_NORTH_EAST_PROJECTILE_BLOCKER: number = 0x800;
  static readonly WALL_EAST_PROJECTILE_BLOCKER: number = 0x1000;
  static readonly WALL_SOUTH_EAST_PROJECTILE_BLOCKER: number = 0x2000;
  static readonly WALL_SOUTH_PROJECTILE_BLOCKER: number = 0x4000;
  static readonly WALL_SOUTH_WEST_PROJECTILE_BLOCKER: number = 0x8000;
  static readonly WALL_WEST_PROJECTILE_BLOCKER: number = 0x10000;
  static readonly OBJECT_PROJECTILE_BLOCKER: number = 0x20000;

  static readonly FLOOR_DECORATION: number = 0x40000;
  static readonly BLOCK_NPCS: number = 0x80000;
  static readonly BLOCK_PLAYERS: number = 0x100000;
  static readonly FLOOR: number = 0x200000;

  // Set/cleared at runtime when entities move. Ignored by pathfinder.
  // Checked at movement execution time to prevent stepping onto occupied tiles.
  // When an entity leaves, its flag is removed REGARDLESS of other entities
  // on the same tile — this is how entity stacking works in OSRS.
  static readonly OCCUPIED_NPC: number = 0x800000;
  static readonly OCCUPIED_PLAYER: number = 0x1000000;
  static readonly OCCUPIED_PROJECTILE_BLOCKER: number = 0x2000000;

  static readonly FLOOR_BLOCKED: number = CollisionFlag.FLOOR | CollisionFlag.FLOOR_DECORATION;

  static readonly OCCUPIED_ENTITY: number = CollisionFlag.OCCUPIED_NPC | CollisionFlag.OCCUPIED_PLAYER;

  static readonly BLOCK_WEST: number = CollisionFlag.WALL_EAST | CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_EAST: number = CollisionFlag.WALL_WEST | CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_SOUTH: number = CollisionFlag.WALL_NORTH | CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH: number = CollisionFlag.WALL_SOUTH | CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_SOUTH_WEST: number =
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_NORTH_EAST |
    CollisionFlag.WALL_EAST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_SOUTH_EAST: number =
    CollisionFlag.WALL_NORTH_WEST |
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_WEST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH_WEST: number =
    CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_SOUTH_EAST |
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH_EAST: number =
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.WALL_SOUTH_WEST |
    CollisionFlag.WALL_WEST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH_AND_SOUTH_EAST: number =
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_NORTH_EAST |
    CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_SOUTH_EAST |
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH_AND_SOUTH_WEST: number =
    CollisionFlag.WALL_NORTH_WEST |
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.WALL_SOUTH_WEST |
    CollisionFlag.WALL_WEST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_NORTH_EAST_AND_WEST: number =
    CollisionFlag.WALL_NORTH_WEST |
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_NORTH_EAST |
    CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_WEST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  static readonly BLOCK_SOUTH_EAST_AND_WEST: number =
    CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_SOUTH_EAST |
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.WALL_SOUTH_WEST |
    CollisionFlag.WALL_WEST |
    CollisionFlag.OBJECT |
    CollisionFlag.FLOOR_BLOCKED;

  // These mirror RuneLite's line-of-sight flags exactly: the incoming directional
  // projectile-wall bit plus OBJECT_PROJECTILE_BLOCKER (= BLOCK_LINE_OF_SIGHT_FULL,
  // 0x20000). Floor flags are deliberately NOT included — BLOCK_MOVEMENT_FLOOR
  // (0x200000, "Eg. water") and BLOCK_MOVEMENT_FLOOR_DECORATION (0x40000) block
  // walking, never projectiles. Including them here made every ranged attack across
  // blocked terrain fail, which is what left TzKal-Zuk unattackable: his whole 7x7
  // footprint and the band between him and the player are terrain FLOOR tiles.
  // See RuneLite CollisionDataFlag.java:55-62.
  static readonly BLOCK_WEST_PROJECTILE: number =
    CollisionFlag.WALL_EAST_PROJECTILE_BLOCKER | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;

  static readonly BLOCK_EAST_PROJECTILE: number =
    CollisionFlag.WALL_WEST_PROJECTILE_BLOCKER | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;

  static readonly BLOCK_SOUTH_PROJECTILE: number =
    CollisionFlag.WALL_NORTH_PROJECTILE_BLOCKER | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;

  static readonly BLOCK_NORTH_PROJECTILE: number =
    CollisionFlag.WALL_SOUTH_PROJECTILE_BLOCKER | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
}
