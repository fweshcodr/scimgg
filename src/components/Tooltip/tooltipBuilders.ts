import { resolveDefaultInventoryAction, resolveEquipmentItemName } from '../../data/equipmentCatalog';
import type { LocType } from '../../rs/config/loctype/LocType';
import type { NpcType } from '../../rs/config/npctype/NpcType';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { TOOLTIP_COLORS, type TooltipContent } from './tooltipTypes';

export function buildInventoryTooltip(
  itemId: number,
  objTypeLoader: ObjTypeLoader | undefined,
  /** Shift is down and means "drop", so the hover text promises what the click will do. */
  shiftDrop = false,
): TooltipContent | null {
  if (!objTypeLoader) return null;

  try {
    const objType = objTypeLoader.load(itemId);
    // Drop is a client-side op, never cache data — no item carries it in
    // inventoryActions — so shift always has one to offer.
    const action = shiftDrop ? 'Drop' : resolveDefaultInventoryAction(itemId, objType.inventoryActions) || 'Use';
    const name = resolveEquipmentItemName(itemId, objType.name);

    return {
      lines: [
        {
          spans: [
            { text: `${action} `, color: TOOLTIP_COLORS.action },
            { text: name, color: TOOLTIP_COLORS.item },
          ],
        },
      ],
    };
  } catch {
    return null;
  }
}

/**
 * The cache leaves `groundActions` empty for plenty of ids the player can still pick up, so
 * `Take` is the floor.
 */
export function buildGroundItemTooltip(
  itemId: number,
  objTypeLoader: ObjTypeLoader | undefined,
): TooltipContent | null {
  if (!objTypeLoader) return null;

  try {
    const objType = objTypeLoader.load(itemId);
    const action = objType.groundActions.find((a): a is string => a !== undefined && a !== null) || 'Take';
    const name = resolveEquipmentItemName(itemId, objType.name);

    return {
      lines: [
        {
          spans: [
            { text: `${action} `, color: TOOLTIP_COLORS.action },
            { text: name, color: TOOLTIP_COLORS.item },
          ],
        },
      ],
    };
  } catch {
    return null;
  }
}

export function buildEquipmentTooltip(
  itemId: number,
  objTypeLoader: ObjTypeLoader | undefined,
  removable = true,
): TooltipContent | null {
  if (!objTypeLoader) return null;

  try {
    const objType = objTypeLoader.load(itemId);
    const name = resolveEquipmentItemName(itemId, objType.name);

    return {
      lines: [
        {
          spans: [
            ...(removable ? [{ text: 'Remove ', color: TOOLTIP_COLORS.action }] : []),
            { text: name, color: TOOLTIP_COLORS.item },
          ],
        },
      ],
    };
  } catch {
    return null;
  }
}

export function buildPrayerTooltip(prayerLabel: string, isActive: boolean): TooltipContent {
  const action = isActive ? 'Deactivate' : 'Activate';
  return {
    lines: [
      {
        spans: [
          { text: `${action} `, color: TOOLTIP_COLORS.action },
          { text: prayerLabel, color: TOOLTIP_COLORS.prayer },
        ],
      },
    ],
  };
}

export function buildSpellTooltip(spellLabel: string): TooltipContent {
  return {
    lines: [
      {
        spans: [
          { text: 'Cast ', color: TOOLTIP_COLORS.action },
          { text: spellLabel, color: TOOLTIP_COLORS.spell },
        ],
      },
    ],
  };
}

export function buildEquipmentStatsTooltip(): TooltipContent {
  return {
    lines: [{ spans: [{ text: 'View equipment stats', color: TOOLTIP_COLORS.ui }] }],
  };
}

export function buildToggleRunTooltip(): TooltipContent {
  return {
    lines: [
      {
        spans: [
          { text: 'Toggle ', color: TOOLTIP_COLORS.action },
          { text: 'Run', color: TOOLTIP_COLORS.ui },
        ],
      },
    ],
  };
}

export function buildSpecialAttackTooltip(): TooltipContent {
  return {
    lines: [
      {
        spans: [
          { text: 'Use ', color: TOOLTIP_COLORS.action },
          { text: 'Special Attack', color: TOOLTIP_COLORS.ui },
        ],
      },
    ],
  };
}

/**
 * @param targetColor NPC Highlights paints the hover text in the NPC's highlight
 * color, so the left-click target reads as tagged before the menu is ever opened.
 */
export function buildNpcTooltip(npcType: NpcType, targetColor?: string): TooltipContent | null {
  const name = npcType.name || 'NPC';
  const action = npcType.actions.find((a): a is string => a !== undefined && a !== null);
  if (!action) return null;
  const levelSuffix = npcType.combatLevel > 0 ? `  (level-${npcType.combatLevel})` : '';
  return {
    lines: [
      {
        spans: [
          { text: `${action} `, color: TOOLTIP_COLORS.action },
          { text: name + levelSuffix, color: targetColor ?? TOOLTIP_COLORS.npc },
        ],
      },
    ],
  };
}

/**
 * Hover text for the entry a Custom Menu Swaps rule promoted to the left click. Built
 * from the menu entry rather than the NPC type because the promoted entry may belong to
 * an NPC behind the nearest one, or to a loc or a ground item.
 */
export function buildMenuEntryTooltip(entry: {
  action: string;
  target?: string;
  targetColor?: string;
}): TooltipContent | null {
  if (!entry.target) return null;
  // The leading marker on the current attack target belongs to the right-click menu; the
  // client's hover text never carries it.
  const target = entry.target.startsWith('*') ? entry.target.slice(1) : entry.target;
  return {
    lines: [
      {
        spans: [
          { text: `${entry.action} `, color: TOOLTIP_COLORS.action },
          { text: target, color: entry.targetColor ?? TOOLTIP_COLORS.npc },
        ],
      },
    ],
  };
}

export function buildLocTooltip(locType: LocType): TooltipContent | null {
  const name = locType.name || 'Object';
  if (name === 'null') return null;
  const action = locType.actions.find((a): a is string => a !== undefined && a !== null);
  if (!action) return null;
  return {
    lines: [
      {
        spans: [
          { text: `${action} `, color: TOOLTIP_COLORS.action },
          { text: name, color: TOOLTIP_COLORS.loc },
        ],
      },
    ],
  };
}
