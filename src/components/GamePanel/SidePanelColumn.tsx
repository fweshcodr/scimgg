import type React from 'react';
import {
  type Rect,
  type SideColumnEdge,
  type SideColumnGeometry,
  type SideColumnTabRow,
  TAB_STONE,
} from '../../layout/osrsClientLayout';
import { PANEL } from '../../resourcePack';
import { PixelComposedLayer, tileFill } from '../PixelComposedLayer';
import { type LayerSprite, PixelSpriteLayer } from '../PixelSpriteLayer';

/**
 * The OSRS side column: a tab row, the panel body, and a second tab row.
 *
 * Used by both resizable-classic and fixed, which compose the same pieces and
 * differ only in the geometry they are handed — where the strip sits, how wide
 * it is, and which stone edges the client draws around the content box. Purely
 * presentational — it owns no tab state and no content; `GamePanel` supplies
 * both.
 *
 * The two 241x37 row sprites already have seven stone slots painted into them,
 * exactly as the client's own `tabsTopRow`/`tabsBottomRow` graphics do, so the
 * buttons layered over them are hit targets and nothing else. Empty slots are
 * deliberate: this simulator has 7 of the client's 14 tabs, and leaving the
 * others as bare stone is what the real column looks like.
 *
 * Every placed sprite paints into ONE canvas. Classic and fixed put the tab rows
 * and the panel body in a single zoom-scaled `DraggablePanel`, and an `<img>`
 * sharing that layer with a canvas rasterizes soft on the layer's first paint,
 * healing only on the next repaint. The cure is to leave no `<img>` in the layer
 * rather than to give up the canvas.
 */

export interface SidePanelColumnSlot {
  /** 0-6, indexing the geometry's tab slots. Matches the tab's real OSRS slot. */
  readonly slot: number;
  /** Transparent hit target. Its sprites are painted by the column's layer. */
  readonly node: React.ReactNode;
  readonly icon: string;
  /**
   * The highlight drawn under the icon while this tab is selected. Row-end sprites are wider
   * than the 33px slot and must overhang, so they carry their own width and offset.
   */
  readonly selectedStone?: { readonly src: string; readonly dx: number; readonly width: number };
}

interface SidePanelColumnProps {
  readonly geometry: SideColumnGeometry;
  /** Classic's gameplay backing only; tab stones, content and overlays stay opaque. */
  readonly backgroundOpacity?: number;
  readonly topRow: readonly SidePanelColumnSlot[];
  readonly bottomRow: readonly SidePanelColumnSlot[];
  /** The 204x275 panel shell, placed so its inset content box lands on the cache rect. */
  readonly children: React.ReactNode;
  /**
   * Decorative chrome placed in the COLUMN's coordinates, painted last. The
   * status bars live here rather than beside the column because a sibling of
   * the `DraggablePanel` resolves its offsets against the unzoomed outer box
   * and drifts away from the panel as the UI scales.
   */
  readonly overlay?: React.ReactNode;
}

const absolute = (rect: Rect): React.CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
});

function edgeSprite(edge: SideColumnEdge): string {
  switch (edge) {
    case 'classicLeft':
      return PANEL.edgeLeft;
    case 'classicRight':
      return PANEL.edgeRight;
    case 'fixedLeftUpper':
      return PANEL.fixedEdgeLeftUpper;
    case 'fixedLeftLower':
      return PANEL.fixedEdgeLeftLower;
    case 'fixedRight':
      return PANEL.fixedEdgeRight;
  }
}

/** The row sprite, then each occupied slot's highlight and icon, in paint order. */
function rowSprites(row: SideColumnTabRow, slots: readonly SidePanelColumnSlot[], sprite: string): LayerSprite[] {
  const sprites: LayerSprite[] = [
    {
      src: sprite,
      x: row.rect.x,
      y: row.rect.y,
      w: row.rect.width,
      h: row.rect.height,
      width: row.rect.width,
      height: row.rect.height,
    },
  ];
  for (const { slot, icon, selectedStone } of slots) {
    const x = row.rect.x + (row.slotX[slot] ?? 0);
    const y = row.rect.y + row.stoneY;
    if (selectedStone) {
      sprites.push({
        src: selectedStone.src,
        x: x + selectedStone.dx,
        y,
        w: selectedStone.width,
        h: TAB_STONE.height,
        width: selectedStone.width,
        height: TAB_STONE.height,
      });
    }
    // Natural size, centered in the stone slot.
    sprites.push({ src: icon, x, y, w: TAB_STONE.width, h: TAB_STONE.height });
  }
  return sprites;
}

function TabRow({
  row,
  slots,
  dataTutorial,
}: {
  row: SideColumnTabRow;
  slots: readonly SidePanelColumnSlot[];
  dataTutorial?: string;
}) {
  return (
    <div style={absolute(row.rect)} data-tutorial={dataTutorial}>
      {slots.map(({ slot, node }) => (
        <div
          key={slot}
          style={{
            position: 'absolute',
            left: row.slotX[slot] ?? 0,
            top: row.stoneY,
            width: TAB_STONE.width,
            height: TAB_STONE.height,
          }}
        >
          {node}
        </div>
      ))}
    </div>
  );
}

export const SidePanelColumn: React.FC<SidePanelColumnProps> = ({
  geometry,
  backgroundOpacity = 1,
  topRow,
  bottomRow,
  children,
  overlay,
}) => {
  const isFixed = geometry.spriteSet === 'fixed';
  // A piece with sourceSize tiles its sprite into the rect rather than fitting it — see
  // FIXED_EDGE_LEFT_LOWER_LIP, a 3px column of a 31x133 sprite spanning 165 rows. Tiling repeats,
  // so it composes into the backdrop raster; every single-placement sprite goes into the layer.
  const tiledEdges = geometry.edges.filter((edge) => edge.sourceSize !== undefined);
  const backdropSprite = isFixed ? PANEL.fixedBackground : PANEL.background;
  const bgRect = geometry.background;
  const backdropRect = `${bgRect.x},${bgRect.y},${bgRect.width},${bgRect.height}`;
  const tiledEdgeKey = tiledEdges
    .map((edge) => `${edgeSprite(edge.sprite)}@${edge.rect.x},${edge.rect.y},${edge.rect.width},${edge.rect.height}`)
    .join(';');
  const backdropSources = [backdropSprite, ...tiledEdges.map((edge) => edgeSprite(edge.sprite))];
  const sprites: LayerSprite[] = [
    ...geometry.edges
      .filter((edge) => edge.sourceSize === undefined)
      .map((edge) => ({
        src: edgeSprite(edge.sprite),
        x: edge.rect.x,
        y: edge.rect.y,
        w: edge.rect.width,
        h: edge.rect.height,
        width: edge.rect.width,
        height: edge.rect.height,
      })),
    ...rowSprites(geometry.tabRowTop, topRow, isFixed ? PANEL.fixedTabsTopRow : PANEL.tabsTopRow),
    ...rowSprites(geometry.tabRowBottom, bottomRow, isFixed ? PANEL.fixedTabsBottomRow : PANEL.tabsBottomRow),
  ];

  return (
    <div
      className="panel-surface"
      style={{ position: 'relative', width: geometry.size.width, height: geometry.size.height }}
    >
      {/*
        Stone fill and the tiling edges, composed at 1:1 into ONE raster.

        Both are REPEATS — classic's is an 88x60 seamless tile behind the column, and a piece
        with sourceSize tiles its sprite into the rect rather than fitting it. They were
        CSS backgrounds, which is what put a hairline between repeats: `background-repeat`
        restarts the tile every `backgroundSize` CSS px, so at a fractional device scale each
        repetition rounds onto its own subpixel phase and the boundaries between them do not
        line up. Filling the pattern at 1:1 first makes every repeat an exact integer boundary,
        and the reconstruction then sees one continuous image.
      */}
      <PixelComposedLayer
        cacheKey={`side-column-backdrop|${backdropSprite}|${geometry.backgroundTiled}|${geometry.backgroundOffsetY}|${backdropRect}|${tiledEdgeKey}|${geometry.size.width}x${geometry.size.height}`}
        width={geometry.size.width}
        height={geometry.size.height}
        sources={backdropSources}
        style={{ opacity: backgroundOpacity }}
        draw={(flat, images) => {
          const fill = images.get(backdropSprite);
          const bg = geometry.background;
          if (fill) {
            if (geometry.backgroundTiled) {
              tileFill(flat, fill, bg.x, bg.y, bg.width, bg.height, 0, -geometry.backgroundOffsetY);
            } else {
              flat.drawImage(fill, bg.x, bg.y - geometry.backgroundOffsetY);
            }
          }
          for (const edge of tiledEdges) {
            const image = images.get(edgeSprite(edge.sprite));
            if (image) tileFill(flat, image, edge.rect.x, edge.rect.y, edge.rect.width, edge.rect.height);
          }
        }}
      />

      <PixelSpriteLayer width={geometry.size.width} height={geometry.size.height} sprites={sprites} />

      {/*
        The panel shell is authored at 204x275 with a 7px chrome inset, so its
        190x261 content box lands on the layout's content rect once the shell is
        placed 7px up and left of it. The column draws its own edges, so the
        shell contributes content only — no background, no stone border.
      */}
      <div style={{ position: 'absolute', left: geometry.panelShell.x, top: geometry.panelShell.y }}>{children}</div>

      {/* The upper row carries the `tab-bar` surface name, as modern's separate bar
          does not exist here. It is NOT every tab: the wrench is in the lower row, so a
          tutorial step about one tab points at that tab (panelTabSelector) instead. */}
      <TabRow row={geometry.tabRowTop} slots={topRow} dataTutorial="tab-bar" />
      <TabRow row={geometry.tabRowBottom} slots={bottomRow} />

      {overlay}
    </div>
  );
};
