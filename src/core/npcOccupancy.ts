import type { ActorBase } from './actors/ActorBase';
import type { NpcStepPredicate } from './npcRouteFinding';

/**
 * Entity collision flags: the one shared occupancy layer NPC steps check. Contract and evidence:
 * docs/architecture/npc-combat-movement.md#entity-collision-flags.
 *
 * Each tile has one blocked flag. An actor entering a tile sets its footprint's flags; leaving clears
 * them even if another actor still stands there, so stacks form (Inferno: every one of 11 captured
 * Yt-HurKot stacks follows a player run or a stack partner leaving the tile). The player and every
 * NPC set flags unless `blocksNpcMovement` is false; only NPC steps check them, along the leading edge.
 * Membership, not life, decides: a corpse keeps its flags until it is removed from the world.
 */
export type NpcOccupant = Readonly<Pick<ActorBase, 'id' | 'position' | 'size' | 'blocksNpcMovement'>>;

interface Footprint {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

const OFFSET = 0x8000;
const tileKey = (x: number, y: number): number => (x + OFFSET) * 0x10000 + (y + OFFSET);

function setsFlags(actor: NpcOccupant): boolean {
  return actor.blocksNpcMovement !== false;
}

export class TileOccupancy {
  private readonly flags = new Set<number>();
  /** The footprint each actor instance last flagged. */
  private readonly flagged = new Map<NpcOccupant, Footprint>();

  /** Forgets every flag (a world rebuilt from scratch). */
  clear(): void {
    this.flags.clear();
    this.flagged.clear();
  }

  isBlocked(x: number, y: number): boolean {
    return this.flags.has(tileKey(x, y));
  }

  /** A spawn (or the player's arrival in a new world) sets its footprint, leaving any older one. */
  add(actor: NpcOccupant): void {
    if (!setsFlags(actor)) return;
    this.remove(actor);
    this.enter(actor, actor.position);
  }

  /** A removal clears the footprint the actor last flagged, whoever else stands there. */
  remove(actor: NpcOccupant): void {
    const last = this.flagged.get(actor);
    if (!last) return;
    this.mark(last, false);
    this.flagged.delete(actor);
  }

  /**
   * The turn boundary for tiles changed without a step or an engine add/remove: in world order, an
   * actor placed elsewhere (teleport, resurface, scripted placement) leaves its old footprint and
   * enters the new one, one never added enters, and one that stopped blocking or left the world by
   * another route leaves.
   */
  reconcile(actors: Iterable<NpcOccupant>): this {
    const present = new Set<NpcOccupant>();
    for (const actor of actors) {
      present.add(actor);
      const last = this.flagged.get(actor);
      if (!setsFlags(actor)) {
        this.remove(actor);
        continue;
      }
      if (last && last.x === actor.position[0] && last.y === actor.position[1] && last.size === actor.size) continue;
      this.add(actor);
    }
    for (const actor of [...this.flagged.keys()]) if (!present.has(actor)) this.remove(actor);
    return this;
  }

  /** One tile step: the actor leaves its footprint at `from` (clearing it) and enters it at `to`. */
  step(actor: NpcOccupant, from: readonly [number, number], to: readonly [number, number]): void {
    if (!setsFlags(actor)) return;
    this.mark({ x: from[0], y: from[1], size: actor.size }, false);
    const last = this.flagged.get(actor);
    if (last && (last.x !== from[0] || last.y !== from[1] || last.size !== actor.size)) this.mark(last, false);
    this.enter(actor, to);
  }

  private enter(actor: NpcOccupant, position: readonly [number, number]): void {
    const footprint = { x: position[0], y: position[1], size: actor.size };
    this.mark(footprint, true);
    this.flagged.set(actor, footprint);
  }

  private mark({ x, y, size }: Footprint, blocked: boolean): void {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (blocked) this.flags.add(tileKey(x + dx, y + dy));
        else this.flags.delete(tileKey(x + dx, y + dy));
      }
    }
  }
}

export function npcFootprintsOverlap(
  first: Pick<NpcOccupant, 'position' | 'size'>,
  second: Pick<NpcOccupant, 'position' | 'size'>,
): boolean {
  return (
    first.position[0] < second.position[0] + second.size &&
    first.position[0] + first.size > second.position[0] &&
    first.position[1] < second.position[1] + second.size &&
    first.position[1] + first.size > second.position[1]
  );
}

/**
 * Whether an NPC step may enter flagged tiles. Only the tiles the footprint newly covers (its leading
 * edge) are checked, plus both side tiles of a size-1 diagonal: an NPC in a stack leaves it whenever its
 * leading edge is clear, whatever its current tiles hold. Reads the flags live, so steps applied after
 * it is built are seen.
 */
export function createNpcStepOccupancyPredicate(occupancy: TileOccupancy): NpcStepPredicate {
  return (current, candidate, size) => {
    const deltaX = candidate[0] - current[0];
    const deltaY = candidate[1] - current[1];
    if (deltaX === 0 && deltaY === 0) return false;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) return false;

    const canEnter = (x: number, y: number): boolean => !occupancy.isBlocked(x, y);

    if (deltaX !== 0) {
      const edgeX = deltaX > 0 ? candidate[0] + size - 1 : candidate[0];
      for (let offset = 0; offset < size; offset++) {
        if (!canEnter(edgeX, candidate[1] + offset)) return false;
      }
    }
    if (deltaY !== 0) {
      const edgeY = deltaY > 0 ? candidate[1] + size - 1 : candidate[1];
      for (let offset = 0; offset < size; offset++) {
        if (!canEnter(candidate[0] + offset, edgeY)) return false;
      }
    }
    if (size === 1 && deltaX !== 0 && deltaY !== 0) {
      return canEnter(candidate[0], current[1]) && canEnter(current[0], candidate[1]);
    }
    return true;
  };
}
