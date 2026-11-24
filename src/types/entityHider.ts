import type { NpcSnapshot } from './simulation';

/**
 * Entity Hider plugin, after RuneLite's core `entityhider` (EntityHiderConfig / EntityHiderPlugin,
 * BSD-2): stops the client drawing chosen entities. Presentation only: snapshots, combat and
 * replay data are untouched, and a hidden NPC is only left out of what is drawn and clicked.
 *
 * "2D" is the entity's client-drawn overlays: health bar, hitsplats, overhead icon and text, and
 * the highlight plugins' marks on it. The sim has no other players, thralls or pets, so RuneLite's
 * options for those are not ported.
 */
export interface EntityHiderOptions {
  readonly hideLocalPlayer: boolean;
  readonly hideLocalPlayer2D: boolean;
  readonly hideNpcs: boolean;
  readonly hideNpcs2D: boolean;
  /** A modifier on the two NPC options for NPCs fighting you; see {@link isNpcDrawnByEntityHider}. */
  readonly hideAttackers: boolean;
  readonly hideProjectiles: boolean;
  /** From the tick the killing hitsplat lands (authoritative `alive === false`), death animation included. */
  readonly hideDeadNpcs: boolean;
}

/** RuneLite's defaults for these options, all off. */
export const DEFAULT_ENTITY_HIDER_OPTIONS: EntityHiderOptions = {
  hideLocalPlayer: false,
  hideLocalPlayer2D: false,
  hideNpcs: false,
  hideNpcs2D: false,
  hideAttackers: false,
  hideProjectiles: false,
  hideDeadNpcs: false,
};

/** Panel order and labels, RuneLite's config names in its config order. */
export const ENTITY_HIDER_OPTION_LABELS: ReadonlyArray<{
  readonly key: keyof EntityHiderOptions;
  readonly label: string;
}> = [
  { key: 'hideLocalPlayer', label: 'Hide local player' },
  { key: 'hideLocalPlayer2D', label: 'Hide local player 2D' },
  { key: 'hideNpcs', label: 'Hide NPCs' },
  { key: 'hideNpcs2D', label: 'Hide NPCs 2D' },
  { key: 'hideAttackers', label: 'Hide attackers' },
  { key: 'hideProjectiles', label: 'Hide projectiles' },
  { key: 'hideDeadNpcs', label: 'Hide dead NPCs' },
];

/** A stored value, key by key: anything that is not a boolean falls back to its default. */
export function parseEntityHiderOptions(value: unknown): EntityHiderOptions {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const read = (key: keyof EntityHiderOptions): boolean =>
    typeof source[key] === 'boolean' ? (source[key] as boolean) : DEFAULT_ENTITY_HIDER_OPTIONS[key];
  return {
    hideLocalPlayer: read('hideLocalPlayer'),
    hideLocalPlayer2D: read('hideLocalPlayer2D'),
    hideNpcs: read('hideNpcs'),
    hideNpcs2D: read('hideNpcs2D'),
    hideAttackers: read('hideAttackers'),
    hideProjectiles: read('hideProjectiles'),
    hideDeadNpcs: read('hideDeadNpcs'),
  };
}

/**
 * Whether the plugin lets this NPC's model (`drawingUI` false) or its 2D elements (`drawingUI`
 * true) be drawn, with RuneLite's precedence:
 *
 * 1. Hide dead NPCs wins over everything, both layers, attacker or not.
 * 2. An NPC targeting the local player follows Hide attackers alone, until either NPC option is on;
 *    then it is hidden only in the layers where Hide attackers AND that layer's NPC option are on.
 *    So with Hide NPCs on and Hide attackers off, the NPCs fighting you stay visible.
 * 3. Every other NPC follows Hide NPCs / Hide NPCs 2D.
 *
 * The target is the snapshot's `combatTargetId`, which reads null while a Fremennik warbander walks
 * (it faces its steps), so Hide attackers does not hold one that is closing in.
 */
export function isNpcDrawnByEntityHider(
  npc: Pick<NpcSnapshot, 'alive' | 'combatTargetId'>,
  options: EntityHiderOptions,
  drawingUI: boolean,
  localPlayerId: string,
): boolean {
  if (options.hideDeadNpcs && !npc.alive) return false;
  if (npc.combatTargetId === localPlayerId) {
    let hide = options.hideAttackers;
    if (options.hideNpcs || options.hideNpcs2D) hide &&= drawingUI ? options.hideNpcs2D : options.hideNpcs;
    return !hide;
  }
  return !(drawingUI ? options.hideNpcs2D : options.hideNpcs);
}
