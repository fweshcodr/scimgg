import type { NpcActor } from '../../core/actors/NpcActor';
import type { ArenaConfig } from '../../core/arena/ArenaConfig';
import { ACTIVE_ENCOUNTER_OUTCOME, type EncounterOutcome } from '../../core/encounters/outcome';
import type { EncounterSnapshot } from '../../core/encounters/snapshot';
import type { Encounter, EncounterContext, EnvironmentalDamage } from '../../core/encounters/types';
import { CollisionFlag } from '../../rs/collision/CollisionFlag';
import type { ArenaBounds, CollisionMap } from '../../rs/collision/WalkabilityAnalyzer';
import type { Coordinate, MechanicsConfig } from '../../types/simulation';
import { LOBBY_BOSS_NPCS } from './metadata';

export class LobbyEncounter implements Encounter {
  public readonly kind = 'lobby';

  getDefaultPlayerStart(): Coordinate {
    return [31, 25];
  }

  getIntroConfig(): { facingAngle: number; animationSeqId: number } | null {
    return { facingAngle: 1024, animationSeqId: 12152 };
  }

  createNpcs(_playerStart: Coordinate): NpcActor[] {
    return [];
  }

  reset(_seeds?: Record<string, unknown>): void {}

  getSeeds(): Record<string, unknown> {
    return {};
  }

  resolveHazards(_ctx: EncounterContext, _mechanicsEnabled: Partial<MechanicsConfig>): EnvironmentalDamage[] {
    return [];
  }

  processPostTick(_ctx: EncounterContext, _mechanicsEnabled: Partial<MechanicsConfig>): EnvironmentalDamage[] {
    return [];
  }

  /**
   * A fresh object per call. The lobby has no fight state, but callers may hold the payload
   * across ticks, so handing out one shared instance would let a mutation leak between them.
   * Pinned by `LobbyEncounter.test.ts`.
   */
  getSnapshot(): EncounterSnapshot {
    return { kind: 'lobby', state: {}, visuals: {} };
  }

  getOutcome(): EncounterOutcome {
    return ACTIVE_ENCOUNTER_OUTCOME;
  }

  getDefaultMechanicsConfig(): Partial<MechanicsConfig> {
    return { infiniteHealth: false };
  }

  getNpcDamageSourceLabel(): string {
    return 'NpcAttack';
  }

  getArenaConfig(): ArenaConfig {
    return buildLobbyArenaConfig();
  }
}

const ARENA_CENTER_X = 31.5;
const ARENA_CENTER_Y = 25.5;
const ARENA_RADIUS = 16.0;
const LOBBY_GRID_SIZE = 64;

/** Cached lobby config — computed once since it never changes. */
let _cachedLobbyArenaConfig: ArenaConfig | null = null;

function buildLobbyArenaConfig(): ArenaConfig {
  if (_cachedLobbyArenaConfig) return _cachedLobbyArenaConfig;

  const walkableTiles = new Set<string>();
  const flags = new Int32Array(LOBBY_GRID_SIZE * LOBBY_GRID_SIZE);

  for (let x = 0; x < LOBBY_GRID_SIZE; x++) {
    for (let y = 0; y < LOBBY_GRID_SIZE; y++) {
      const dx = x + 0.5 - ARENA_CENTER_X;
      const dy = y + 0.5 - ARENA_CENTER_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ARENA_RADIUS) {
        walkableTiles.add(`${x},${y}`);
      }
    }
  }

  const blockTile = (x: number, y: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx >= 0 && tx < LOBBY_GRID_SIZE && ty >= 0 && ty < LOBBY_GRID_SIZE) {
      flags[tx + ty * LOBBY_GRID_SIZE] |= CollisionFlag.OBJECT;
      walkableTiles.delete(`${tx},${ty}`);
    }
  };

  const blockCircle = (cx: number, cy: number, radius: number) => {
    const minX = Math.floor(cx - radius);
    const maxX = Math.floor(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.floor(cy + radius);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const ddx = x + 0.5 - cx;
        const ddy = y + 0.5 - cy;
        if (ddx * ddx + ddy * ddy <= radius * radius) {
          blockTile(x, y);
        }
      }
    }
  };

  // 8 braziers at radius 11.0, offset π/8
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = ARENA_CENTER_X + Math.cos(angle) * 11.0;
    const by = ARENA_CENTER_Y + Math.sin(angle) * 11.0;
    blockCircle(bx, by, 0.7);
  }

  // Boss pedestals — each boss occupies a 3x3 area, pedestal outer radius 2.25
  for (const boss of LOBBY_BOSS_NPCS) {
    const cx = boss.position[0] + 1.5;
    const cy = boss.position[1] + 1.5;
    blockCircle(cx, cy, 2.3);
  }

  const collisionMap: CollisionMap = {
    sizeX: LOBBY_GRID_SIZE,
    sizeY: LOBBY_GRID_SIZE,
    flags,
    getFlag(x: number, y: number): number {
      if (x < 0 || x >= LOBBY_GRID_SIZE || y < 0 || y >= LOBBY_GRID_SIZE) return -1;
      return flags[x + y * LOBBY_GRID_SIZE];
    },
    hasFlag(x: number, y: number, flag: number): boolean {
      const f = this.getFlag(x, y);
      return f !== -1 && (f & flag) !== 0;
    },
    flag(x: number, y: number, flag: number): void {
      if (x >= 0 && x < LOBBY_GRID_SIZE && y >= 0 && y < LOBBY_GRID_SIZE) {
        flags[x + y * LOBBY_GRID_SIZE] |= flag;
      }
    },
    unflag(x: number, y: number, flag: number): void {
      if (x >= 0 && x < LOBBY_GRID_SIZE && y >= 0 && y < LOBBY_GRID_SIZE) {
        flags[x + y * LOBBY_GRID_SIZE] &= ~flag;
      }
    },
  };

  let minX = LOBBY_GRID_SIZE,
    maxX = 0,
    minY = LOBBY_GRID_SIZE,
    maxY = 0;
  for (const key of walkableTiles) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minX) minX = tx;
    if (tx > maxX) maxX = tx;
    if (ty < minY) minY = ty;
    if (ty > maxY) maxY = ty;
  }
  const bounds: ArenaBounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  _cachedLobbyArenaConfig = {
    bounds,
    walkableTiles,
    collisionMap,
  };

  return _cachedLobbyArenaConfig;
}
