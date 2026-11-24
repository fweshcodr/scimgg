// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_SIDE_COLUMN,
  FIXED_SIDE_COLUMN,
  SELECTED_TAB_STONE_WIDTH,
  type SideColumnGeometry,
  selectedTabStonePlacement,
  TAB_STONE,
} from '../../../layout/osrsClientLayout';
import { PANEL } from '../../../resourcePack';
import type { LayerSprite } from '../../PixelSpriteLayer';
import { PanelContentScaleProvider } from '../../panelContentScale';
import { SidePanelColumn, type SidePanelColumnSlot } from '../SidePanelColumn';

const TAB_SLOTS_PER_ROW = 7;

function slot(index: number, icon: string, selected = false, row: 'top' | 'bottom' = 'top'): SidePanelColumnSlot {
  const placement = selectedTabStonePlacement(row, index, TAB_SLOTS_PER_ROW);
  return {
    slot: index,
    icon,
    node: <button type="button" aria-label={`tab-${row}-${index}`} />,
    selectedStone: selected ? { src: PANEL.tabStoneSelected, dx: placement.dx, width: placement.width } : undefined,
  };
}

function renderColumn(
  geometry: SideColumnGeometry = CLASSIC_SIDE_COLUMN,
  topRow: readonly SidePanelColumnSlot[] = [slot(0, '/icons/attack.png')],
  bottomRow: readonly SidePanelColumnSlot[] = [],
) {
  return render(
    <PanelContentScaleProvider value={1}>
      <SidePanelColumn geometry={geometry} topRow={topRow} bottomRow={bottomRow}>
        <div data-testid="panel-body" />
      </SidePanelColumn>
    </PanelContentScaleProvider>,
  );
}

/** The layer publishes its placements as `data-sprites` in dev, which is the paint list. */
function sprites(container: HTMLElement): LayerSprite[] {
  const canvas = container.querySelector('canvas[data-sprites]');
  return JSON.parse(canvas?.getAttribute('data-sprites') ?? '[]') as LayerSprite[];
}

describe('SidePanelColumn sprite list', () => {
  it('paints every single-placement edge plus both tab rows into ONE canvas', () => {
    // Given/When: the classic column renders.
    const { container } = renderColumn();

    // Then: exactly one layer canvas carries the whole column.
    expect(container.querySelectorAll('canvas[data-sprites]')).toHaveLength(1);

    // And: both classic edges and both row sprites are in it. An <img> sharing this layer
    // rasterizes soft on the layer's first paint, so the column must leave none behind.
    const srcs = sprites(container).map((s) => s.src);
    expect(srcs).toContain(PANEL.edgeLeft);
    expect(srcs).toContain(PANEL.edgeRight);
    expect(srcs).toContain(PANEL.tabsTopRow);
    expect(srcs).toContain(PANEL.tabsBottomRow);
    expect(container.querySelector('img')).toBeNull();
  });

  it('composes fixed from the fixed sprite set, never the resizable one', () => {
    // Given/When: the fixed column renders.
    const { container } = renderColumn(FIXED_SIDE_COLUMN);

    // Then: the rows are the 249x38 / 246x37 fixed graphics, whose slot pitch differs.
    const srcs = sprites(container).map((s) => s.src);
    expect(srcs).toContain(PANEL.fixedTabsTopRow);
    expect(srcs).toContain(PANEL.fixedTabsBottomRow);
    expect(srcs).not.toContain(PANEL.tabsTopRow);
    expect(srcs).toContain(PANEL.fixedEdgeLeftUpper);
    expect(srcs).toContain(PANEL.fixedEdgeLeftLower);
    expect(srcs).toContain(PANEL.fixedEdgeRight);
  });

  it('composes a tiled edge into the backdrop raster instead of placing it in the layer', () => {
    // Given: fixed's lower-left lip is a 3px column of a 31x133 sprite spanning 165 rows,
    // so it tiles rather than fitting its rect.
    const tiled = FIXED_SIDE_COLUMN.edges.filter((edge) => edge.sourceSize !== undefined);
    expect(tiled).toHaveLength(1);

    // When: the fixed column renders.
    const { container } = renderColumn(FIXED_SIDE_COLUMN);

    // Then: the layer holds one entry per NON-tiled edge, and the tiled one is in the backdrop.
    const placed = sprites(container).filter((s) => s.src === PANEL.fixedEdgeLeftUpper);
    expect(placed).toHaveLength(1);

    // A repeat must never go back on a CSS background: `background-repeat` restarts the tile
    // every backgroundSize CSS px, so at a fractional device scale each repetition rounds onto
    // its own subpixel phase and hairlines open between them.
    const cssRepeats = [...container.querySelectorAll('div')].filter(
      (el) => el.style.backgroundRepeat === 'repeat' && el.style.backgroundImage !== '',
    );
    expect(cssRepeats).toHaveLength(0);

    const backdrop = container.querySelector('canvas[data-composed]');
    expect(backdrop?.getAttribute('data-composed')).toContain(PANEL.fixedEdgeLeftUpper);
    expect(backdrop?.getAttribute('data-composed')).toContain(PANEL.fixedBackground);
  });
});

describe('SidePanelColumn slot geometry', () => {
  it('places each icon on its row slot at the stone size', () => {
    // Given: the third top-row slot is occupied.
    const { container } = renderColumn(CLASSIC_SIDE_COLUMN, [slot(2, '/icons/prayer.png')]);
    const row = CLASSIC_SIDE_COLUMN.tabRowTop;

    // Then: the icon is centered in the slot's stone box, in column-local coordinates.
    const icon = sprites(container).find((s) => s.src === '/icons/prayer.png');
    expect(icon).toEqual({
      src: '/icons/prayer.png',
      x: row.rect.x + row.slotX[2],
      y: row.rect.y + row.stoneY,
      w: TAB_STONE.width,
      h: TAB_STONE.height,
    });
  });

  it('overhangs the selected stone at a row end, where the sprite is wider than the slot', () => {
    // Given: slot 0 of the top row is selected. Its stone is 38 wide against a 33px slot and
    // hangs 4px left, so it carries its own width and offset rather than fitting the slot.
    const { container } = renderColumn(CLASSIC_SIDE_COLUMN, [slot(0, '/icons/attack.png', true)]);
    const row = CLASSIC_SIDE_COLUMN.tabRowTop;

    const stone = sprites(container).find((s) => s.src === PANEL.tabStoneSelected);
    expect(stone).toEqual({
      src: PANEL.tabStoneSelected,
      x: row.rect.x + row.slotX[0] - 4,
      y: row.rect.y + row.stoneY,
      w: SELECTED_TAB_STONE_WIDTH,
      h: TAB_STONE.height,
      width: SELECTED_TAB_STONE_WIDTH,
      height: TAB_STONE.height,
    });
  });

  it('draws the selected stone under its icon, never over it', () => {
    // Given/When: a selected slot renders.
    const { container } = renderColumn(CLASSIC_SIDE_COLUMN, [slot(1, '/icons/attack.png', true)]);

    // Then: paint order puts the highlight first — later entries overdraw earlier ones.
    const list = sprites(container).map((s) => s.src);
    expect(list.indexOf(PANEL.tabStoneSelected)).toBeLessThan(list.indexOf('/icons/attack.png'));
  });

  it('keeps each slot node as a transparent hit target on the same geometry', () => {
    // Given/When: one slot per row renders.
    const { container } = renderColumn(
      CLASSIC_SIDE_COLUMN,
      [slot(1, '/icons/attack.png')],
      [slot(5, '/icons/settings.png', false, 'bottom')],
    );

    // Then: each node sits in a box on its slot origin, so hit-testing, tooltips, context
    // menus and tutorial targeting are unaffected by the sprites moving into the canvas.
    const top = screen.getByLabelText('tab-top-1').parentElement;
    expect(top?.style.left).toBe(`${CLASSIC_SIDE_COLUMN.tabRowTop.slotX[1]}px`);
    expect(top?.style.top).toBe(`${CLASSIC_SIDE_COLUMN.tabRowTop.stoneY}px`);
    expect(top?.style.width).toBe(`${TAB_STONE.width}px`);
    expect(top?.style.height).toBe(`${TAB_STONE.height}px`);

    const bottom = screen.getByLabelText('tab-bottom-5').parentElement;
    expect(bottom?.style.left).toBe(`${CLASSIC_SIDE_COLUMN.tabRowBottom.slotX[5]}px`);

    // And: the layer canvas cannot swallow those clicks.
    const canvas = container.querySelector('canvas[data-sprites]') as HTMLCanvasElement;
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('marks the upper row as the tutorial tab-bar target', () => {
    // Given/When: the column renders. The tutorial's tab-switching steps point at the upper
    // row; modern's separate bar does not exist in this layout.
    const { container } = renderColumn();

    const targets = container.querySelectorAll('[data-tutorial="tab-bar"]');
    expect(targets).toHaveLength(1);
    expect((targets[0] as HTMLElement).style.width).toBe(`${CLASSIC_SIDE_COLUMN.tabRowTop.rect.width}px`);
  });

  it('places the panel shell so its inset content box lands on the layout content rect', () => {
    // Given/When: the column renders its children.
    renderColumn();

    // Then: the shell is offset by the chrome inset, not by the content rect itself.
    const shell = screen.getByTestId('panel-body').parentElement;
    expect(shell?.style.left).toBe(`${CLASSIC_SIDE_COLUMN.panelShell.x}px`);
    expect(shell?.style.top).toBe(`${CLASSIC_SIDE_COLUMN.panelShell.y}px`);
  });
});
