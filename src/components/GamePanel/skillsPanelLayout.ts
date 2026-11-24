import type { PlayerStatName } from '../../types/playerState';

export type PanelCell = {
  readonly name: string;
  readonly label: string;
  readonly stat: PlayerStatName | null;
};

const skillCell = (name: string, label: string, stat: PlayerStatName | null): PanelCell => ({
  name,
  label,
  stat,
});

// Canonical classic skills-tab order, read exactly as OSRS lays it out (row-major over
// three columns). Combat skills and Agility carry a live stat key;
// every other skill is visual-only. The final grid slot is left empty.
export const PANEL_CELLS: readonly PanelCell[] = [
  skillCell('attack', 'Attack', 'attack'),
  skillCell('hitpoints', 'Hitpoints', 'hitpoints'),
  skillCell('mining', 'Mining', null),
  skillCell('strength', 'Strength', 'strength'),
  skillCell('agility', 'Agility', 'agility'),
  skillCell('smithing', 'Smithing', null),
  skillCell('defence', 'Defence', 'defence'),
  skillCell('herblore', 'Herblore', null),
  skillCell('fishing', 'Fishing', null),
  skillCell('ranged', 'Ranged', 'ranged'),
  skillCell('thieving', 'Thieving', null),
  skillCell('cooking', 'Cooking', null),
  skillCell('prayer', 'Prayer', 'prayer'),
  skillCell('crafting', 'Crafting', null),
  skillCell('firemaking', 'Firemaking', null),
  skillCell('magic', 'Magic', 'magic'),
  skillCell('fletching', 'Fletching', null),
  skillCell('woodcutting', 'Woodcutting', null),
  skillCell('runecraft', 'Runecraft', null),
  skillCell('slayer', 'Slayer', null),
  skillCell('farming', 'Farming', null),
  skillCell('construction', 'Construction', null),
  skillCell('hunter', 'Hunter', null),
];

// Panel + grid geometry, decoded from the live OSRS cache: OpenRS2 cache 2625 (OSRS build
// 239, 2026-07-15), interface index 3 / group 320. The root container is 190x261; the Scim
// panel is 204x275 — exactly a 7px chrome inset around it.
// Each cell composes the client's stat art: a 36x36 left tile at dx=0 and a
// 36x36 right-with-slash tile at dx=31 (67x36 footprint), overlapping the 63x30 pitch slightly.
export const PANEL_W = 204;
export const PANEL_H = 275;
const COLS = 3;
// 7px panel chrome inset + raw cache child origin (1,1).
const GRID_X = 8;
const GRID_Y = 8;
// Raw cache pitch: standard containers step 63 across (x = 1 + 63c) and 30 down (y = 1 + 30r).
const COL_PITCH = 63;
const ROW_PITCH = 30;
export const CELL_W = 67;
export const CELL_H = 36;
export const TILE = 36;
export const RIGHT_TILE_X = 31;
export const ICON = 25;
export const ICON_X = 3;
export const ICON_Y = 4;
// Positions of the stat widget's text boxes.
export const CURRENT = { x: 32, y: 4 } as const;
export const BASE = { x: 44, y: 16 } as const;
export const TEXT_BOX_W = 15;

export interface Origin {
  readonly x: number;
  readonly y: number;
}

export function cellOrigin(index: number): Origin {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: GRID_X + col * COL_PITCH, y: GRID_Y + row * ROW_PITCH };
}
