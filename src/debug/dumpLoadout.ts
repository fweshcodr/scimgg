/**
 * Dev helper: render a player loadout (inventory + equipment) as copy-pasteable
 * text. Exposed in dev builds via `window.dumpInventory()` (registered in
 * `useSimulationWiring`).
 *
 * The "Preset source" block is emitted in the exact shape consumed by
 * `parseInventoryFromSetup(...)` in `src/types/player.ts`, so the output can be
 * pasted straight into an `EQUIPMENT_PRESETS` entry. Empty interior slots are
 * preserved as `null`; trailing empty slots are trimmed.
 */

import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { Inventory } from '../types/inventory';

/** Resolve an OSRS item id to a human-readable name (falls back to `Item <id>`). */
export type ResolveItemName = (id: number) => string;

const EQUIPMENT_SLOT_ORDER: (keyof PlayerEquipment)[] = [
  'head',
  'cape',
  'amulet',
  'weapon',
  'body',
  'shield',
  'legs',
  'hands',
  'boots',
  'ring',
];

const GRID_COLS = 4;

function lastFilledIndex(inventory: Inventory): number {
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i]) return i;
  }
  return -1;
}

export function formatLoadout(inventory: Inventory, equipment: PlayerEquipment, resolveName: ResolveItemName): string {
  const nameOf = (id: number): string => {
    const n = resolveName(id);
    return n?.trim() ? n : `Item ${id}`;
  };

  const equipLines = EQUIPMENT_SLOT_ORDER.map((slot) => {
    const id = equipment[slot];
    const value = id === undefined ? '(empty)' : `${nameOf(id)} (${id})`;
    return `  ${slot.padEnd(7)}: ${value}`;
  });

  const cellNames = inventory.map((s) => (s ? nameOf(s.id) : ''));
  const cellWidth = Math.min(24, Math.max(4, ...cellNames.map((n) => n.length)));
  const gridLines: string[] = [];
  for (let row = 0; row * GRID_COLS < inventory.length; row++) {
    const cells: string[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      const idx = row * GRID_COLS + col;
      if (idx >= inventory.length) break;
      const text = cellNames[idx].slice(0, cellWidth);
      cells.push(`[${text.padEnd(cellWidth)}]`);
    }
    gridLines.push(cells.join(' '));
  }

  const lastIdx = lastFilledIndex(inventory);
  const setupLines: string[] = [];
  if (lastIdx >= 0) {
    for (let row = 0; row * GRID_COLS <= lastIdx; row++) {
      const tokens: string[] = [];
      const comments: string[] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        const idx = row * GRID_COLS + col;
        if (idx > lastIdx) break;
        const slot = inventory[idx];
        if (slot) {
          // No `q`: presets model stacks as presence only, since they never deplete.
          tokens.push(`{ id: ${slot.id} },`);
          comments.push(nameOf(slot.id));
        } else {
          tokens.push('null,');
          comments.push('(empty)');
        }
      }
      setupLines.push(`        ${tokens.join(' ')} // ${comments.join(', ')}`);
    }
  }
  const setupBlock = ['      inventory: parseInventoryFromSetup([', ...setupLines, '      ]),'].join('\n');

  return [
    '=== LOADOUT DUMP ===',
    '',
    'Equipment:',
    ...equipLines,
    '',
    `Inventory grid (${GRID_COLS} wide x ${Math.ceil(inventory.length / GRID_COLS)} tall):`,
    ...gridLines,
    '',
    'Preset source (paste-ready):',
    setupBlock,
    '====================',
  ].join('\n');
}
