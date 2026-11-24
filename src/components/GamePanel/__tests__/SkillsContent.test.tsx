// @vitest-environment happy-dom

import { type RenderResult, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerStats } from '../../../types/playerState';
import { PanelContentScaleProvider } from '../../panelContentScale';
import { TooltipProvider } from '../../Tooltip';
import { SkillsContent } from '../SkillsContent';
import { getBackingSize } from '../SkillsPanelCanvas';
import { cellOrigin, ICON, PANEL_H, PANEL_W, RIGHT_TILE_X, TILE } from '../skillsPanelLayout';

// The raster only sizes its backing store once every source has decoded, so the cache is
// stubbed to resolve immediately. happy-dom has no 2D context, so nothing is drawn — the
// backing-store size is set first, which is the part worth pinning.
vi.mock(import('../../../util/imageCache'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadCachedImage: () => Promise.resolve({ naturalWidth: 36, naturalHeight: 36 } as HTMLImageElement),
}));

// Canonical classic skills-tab order (row-major over 3 columns; total cell is separate).
const CLASSIC_ORDER = [
  'attack',
  'hitpoints',
  'mining',
  'strength',
  'agility',
  'smithing',
  'defence',
  'herblore',
  'fishing',
  'ranged',
  'thieving',
  'cooking',
  'prayer',
  'crafting',
  'firemaking',
  'magic',
  'fletching',
  'woodcutting',
  'runecraft',
  'slayer',
  'farming',
  'construction',
  'hunter',
] as const;

const COMBAT_SKILLS = ['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'hitpoints'] as const;
const VISUAL_ONLY = [
  'mining',
  'smithing',
  'herblore',
  'fishing',
  'thieving',
  'cooking',
  'crafting',
  'firemaking',
  'fletching',
  'woodcutting',
  'runecraft',
  'slayer',
  'farming',
  'construction',
  'hunter',
] as const;

const YELLOW = /rgb\(255,\s*255,\s*0\)|#ffff00/i;

function makeStats(overrides: Partial<Record<keyof PlayerStats, { current: number; max: number }>> = {}): PlayerStats {
  const base = { current: 99, max: 99 };
  return {
    attack: { ...base },
    strength: { ...base },
    defence: { ...base },
    ranged: { ...base },
    magic: { ...base },
    prayer: { ...base },
    hitpoints: { ...base },
    agility: { ...base },
    ...overrides,
  };
}

function renderSkills(ui: ReactElement): RenderResult {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function raster(): HTMLCanvasElement {
  return screen.getByTestId('skills-canvas') as HTMLCanvasElement;
}

function iconSources(): { name: string; src: string }[] {
  const raw = raster().getAttribute('data-skill-icons') ?? '[]';
  return JSON.parse(raw) as { name: string; src: string }[];
}

function iconSrc(name: string): string | undefined {
  return iconSources().find((icon) => icon.name === name)?.src;
}

describe('SkillsContent', () => {
  it('rasterizes all 23 classic skill icons into the canvas in canonical OSRS order without a total cell', () => {
    // Given/When: the skills tab renders with live stats.
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: the canvas carries every classic skill icon, in canonical grid order.
    const icons = iconSources();
    expect(icons.map((icon) => icon.name)).toEqual([...CLASSIC_ORDER]);
    expect(CLASSIC_ORDER).toHaveLength(23);

    // And: no per-sprite tile/icon <img> leaks back into the DOM (single-primitive contract).
    expect(document.querySelector('[data-testid^="skill-icon-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="tile-left-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="tile-right-"]')).toBeNull();

    // And: the unused total-level section is absent.
    expect(screen.queryByTestId('total-level-label')).toBeNull();
  });

  it('gives the seven supported combat skills live current/base overlays and accessibility labels', () => {
    // Given/When: the skills tab renders.
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: each combat cell has both overlays and an accessible level label.
    for (const key of COMBAT_SKILLS) {
      const cell = screen.getByTestId(`skill-cell-${key}`);
      expect(within(cell).getByTestId(`skill-current-${key}`)).toBeDefined();
      expect(within(cell).getByTestId(`skill-base-${key}`)).toBeDefined();
      expect(screen.getByRole('group', { name: new RegExp(`${key}: level \\d+, base \\d+`, 'i') })).toBe(cell);
    }
  });

  it('shows live Agility including boosts rather than a placeholder', () => {
    renderSkills(<SkillsContent stats={makeStats({ agility: { current: 85, max: 80 } })} />);
    expect(screen.getByTestId('skill-current-agility').textContent).toBe('85');
    expect(screen.getByTestId('skill-base-agility').textContent).toBe('80');
  });

  it('renders unsupported skills with level-99 placeholder values', () => {
    // Given/When: the skills tab renders.
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: unsupported skills use stable 99/99 placeholders to complete the game panel.
    for (const name of VISUAL_ONLY) {
      expect(iconSrc(name)).toBeDefined();
      const cell = screen.getByTestId(`skill-cell-${name}`);
      expect(within(cell).getByTestId(`skill-current-${name}`).textContent).toBe('99');
      expect(within(cell).getByTestId(`skill-base-${name}`).textContent).toBe('99');
      expect(screen.getByRole('group', { name: new RegExp(`^${name}: level 99, base 99$`, 'i') })).toBe(cell);
    }
  });

  it('composes the canvas from authentic pack tile sprites and skill icons', () => {
    // When: the skills tab renders.
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: the canvas resolves the left tile + right-with-slash tile from the pack.
    expect(raster().getAttribute('data-tile-left')).toBe('/assets/ui/packs/pack-vanilla/stats/new_tile_left.png');
    expect(raster().getAttribute('data-tile-right')).toBe(
      '/assets/ui/packs/pack-vanilla/stats/new_tile_right_with_slash.png',
    );

    // And: skill icons come from skill/<name>.png.
    expect(iconSrc('attack')).toBe('/assets/ui/packs/pack-vanilla/skill/attack.png');
    expect(iconSrc('woodcutting')).toBe('/assets/ui/packs/pack-vanilla/skill/woodcutting.png');
  });

  it('sizes the raster backing store to the device box for the APPLIED panel zoom', async () => {
    // Given/When: the skills tab renders inside a panel zoomed by a fractional cover factor.
    // Classic and fixed size their panel from a snapped frame-space box, so the zoom actually
    // applied is not the raw UI scale; a raster built at the raw scale is resampled by the
    // difference, which is what left this panel and its sibling tab stones blurry.
    render(
      <TooltipProvider>
        <PanelContentScaleProvider value={4 / 3}>
          <SkillsContent stats={makeStats()} />
        </PanelContentScaleProvider>
      </TooltipProvider>,
    );

    // Then: the backing store is the panel's device-pixel box at that zoom.
    const expected = getBackingSize(4 / 3);
    await waitFor(() => expect(raster().width).toBe(expected.width));
    expect(raster().height).toBe(expected.height);

    // And: the CSS box stays the panel's logical size, so the raster can never change layout.
    expect(raster().style.width).toBe(`${PANEL_W}px`);
    expect(raster().style.height).toBe(`${PANEL_H}px`);
  });

  it('uses the decoded cache-320 origins with 36x36 tiles at dx 0/31 and a 25x25 icon', () => {
    // Given/When: the skills tab renders (geometry is authoritative in skillsPanelLayout,
    // decoded from OpenRS2 cache 2625 / OSRS build 239, interface group 320 under a 7px inset).
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: the top-left cell (Attack) sits at raw origin (1,1) + the 7px chrome inset = (8,8).
    expect(cellOrigin(0)).toEqual({ x: 8, y: 8 });
    expect(TILE).toBe(36);
    expect(RIGHT_TILE_X).toBe(31);
    expect(cellOrigin(0).x + RIGHT_TILE_X).toBe(39);
    expect(ICON).toBe(25);
  });

  it("lays cells out on the client's grid with the exact stat-widget text offsets", () => {
    // Given/When: the skills tab renders.
    renderSkills(<SkillsContent stats={makeStats()} />);

    // Then: Attack is the top-left cell at grid origin (8,8) = 7px chrome inset + raw cache (1,1).
    const attackCell = screen.getByTestId('skill-cell-attack');
    expect(attackCell.style.left).toBe('8px');
    expect(attackCell.style.top).toBe('8px');

    // And: within the cell, current text sits at (32,4), base at (44,16).
    expect(screen.getByTestId('skill-current-attack').style.left).toBe('32px');
    expect(screen.getByTestId('skill-current-attack').style.top).toBe('4px');
    expect(screen.getByTestId('skill-base-attack').style.left).toBe('44px');
    expect(screen.getByTestId('skill-base-attack').style.top).toBe('16px');

    // And: the decoded 63x30 cache pitch places col 2 at x=71 (8+63) and row 2/8 at y=38/218.
    expect(screen.getByTestId('skill-cell-hitpoints').style.left).toBe('71px');
    expect(screen.getByTestId('skill-cell-hitpoints').style.top).toBe('8px');
    expect(screen.getByTestId('skill-cell-strength').style.top).toBe('38px');
    expect(screen.getByTestId('skill-cell-hunter').style.top).toBe('218px');
  });

  it('shows the boosted current level and the unchanged base level from live stats', () => {
    // Given: attack is boosted above its base.
    renderSkills(<SkillsContent stats={makeStats({ attack: { current: 118, max: 99 } })} />);

    // Then: current reflects the boost, base reflects the true level.
    const cell = screen.getByTestId('skill-cell-attack');
    expect(within(cell).getByTestId('skill-current-attack').textContent).toBe('118');
    expect(within(cell).getByTestId('skill-base-attack').textContent).toBe('99');
    expect(screen.getByRole('group', { name: 'Attack: level 118, base 99' })).toBe(cell);
  });

  it('renders a drained level and its base both in OSRS yellow (never red/green)', () => {
    // Given: strength is drained below its base.
    renderSkills(<SkillsContent stats={makeStats({ strength: { current: 82, max: 99 } })} />);

    const current = screen.getByTestId('skill-current-strength');
    const baseLevel = screen.getByTestId('skill-base-strength');
    expect(current.textContent).toBe('82');
    expect(baseLevel.textContent).toBe('99');

    // Then: both remain OSRS yellow; the numeric difference communicates the drain.
    expect(current.style.color).toMatch(YELLOW);
    expect(baseLevel.style.color).toMatch(YELLOW);
  });

  it('falls back to default level-99 stats when no stats prop is supplied', () => {
    // Given/When: no stats prop (defensive default for pre-simulation frames).
    renderSkills(<SkillsContent />);

    // Then: combat cells still render with the level-99 defaults.
    expect(screen.getByTestId('skill-current-hitpoints').textContent).toBe('99');
  });
});
