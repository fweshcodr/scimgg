import type React from 'react';
import type { GamePanelTab } from '../../hooks/useGamePanelShortcuts';
import {
  OSM_EXPAND_SLOT,
  OSM_SIDE_PANEL,
  OSM_TAB_ICON,
  OSM_TAB_SLOT_Y,
  OSM_TAB_SLOTS,
  OSM_TAB_STONE,
  OSM_TABS_BLOCKING_TRANS,
  type OsmChromeLayout,
  osmTabColumns,
} from '../../layout/osmClientLayout';
import { type OsmFrame, osmCssRect } from '../../layout/osmFrame';
import { ifTransAlpha, type Rect } from '../../layout/osrsClientLayout';
import { MOBILE, packSprite } from '../../resourcePack';
import { useContextMenu } from '../ContextMenu';
import { DraggablePanel } from '../DraggablePanel';
import { type LayerSprite, PixelSpriteLayer } from '../PixelSpriteLayer';
import { PanelContentScaleProvider } from '../panelContentScale';
import { HoverHintButton } from '../ui/HoverHintControl';

type OsmTabSlotName = keyof typeof OSM_TAB_SLOTS;

/** The simulator's tabs, by the mobile slot each one occupies. */
export const MOBILE_TAB_SLOT: Record<GamePanelTab, OsmTabSlotName> = {
  inventory: 'inventory',
  equipment: 'equipment',
  prayer: 'prayer',
  spellbook: 'spellbook',
  combat: 'combat',
  skills: 'skills',
  settings: 'settings',
};

export interface MobileTabSpec {
  readonly tab: GamePanelTab;
  readonly label: string;
  readonly highlight?: boolean;
  readonly contextMenu?: {
    readonly onMouseDown: React.MouseEventHandler<HTMLButtonElement>;
    readonly onContextMenu: React.MouseEventHandler<HTMLButtonElement>;
    readonly onPointerDownCapture: React.PointerEventHandler<HTMLButtonElement> | undefined;
  };
}

interface MobileSideChromeProps {
  readonly frame: OsmFrame;
  readonly layout: OsmChromeLayout;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly tabs: readonly MobileTabSpec[];
  /** The tab whose stone is lit, or null while the side panel is closed. */
  readonly selectedTab: GamePanelTab | null;
  readonly onTabPress: (tab: GamePanelTab) => void;
  readonly tabsCollapsed: boolean;
  readonly onToggleTabsCollapsed: () => void;
  /**
   * The 204x275 side container, border and fill included (GamePanel's `panelBody('mobile')`);
   * unmounted while the panel is closed.
   */
  readonly children: React.ReactNode;
  /** Drawn over the shell in its own coordinates, unclipped (the status bars hang off its edge). */
  readonly overlay?: React.ReactNode;
}

/** DraggablePanel's default stacking level, which the side panel uses. */
const PANEL_Z_INDEX = 10;

const pinned = (rect: Rect) => ({ x: rect.x, y: rect.y, anchorX: 'left' as const, anchorY: 'top' as const });

/**
 * The mobile `_9SliceDark01_3x3` frame stretched over one rect: the rail's 601:51–60 and the
 * hotkeys strip's 892:5–13. Every piece is a stretched graphic, not a tile (their IF3 tiling
 * flag is off), so drawing each at its component size is exact.
 */
export function mobileNineSlice({ x, y, width, height }: Rect): LayerSprite[] {
  const c = 3;
  const piece = (src: string, px: number, py: number, w: number, h: number): LayerSprite => ({
    src,
    x: x + px,
    y: y + py,
    w,
    h,
    width: w,
    height: h,
  });
  return [
    piece(MOBILE.railMiddle, c, c, width - 2 * c, height - 2 * c),
    piece(MOBILE.railTop, c, 0, width - 2 * c, c),
    piece(MOBILE.railBottom, c, height - c, width - 2 * c, c),
    piece(MOBILE.railLeft, 0, c, c, height - 2 * c),
    piece(MOBILE.railRight, width - c, c, c, height - 2 * c),
    piece(MOBILE.railTopLeft, 0, 0, c, c),
    piece(MOBILE.railTopRight, width - c, 0, c, c),
    piece(MOBILE.railBottomLeft, 0, height - c, c, c),
    piece(MOBILE.railBottomRight, width - c, height - c, c, c),
  ];
}

interface RailSlot {
  readonly name: OsmTabSlotName | 'expand';
  readonly rect: Rect;
}

/**
 * The mobile client's right-hand chrome: the tab rail (601:50) and, left of it, the
 * side panel (601:111). Both are pinned to the gameframe by the layout rules in
 * osmClientLayout, so neither can be dragged or resized.
 *
 * Every rail sprite paints into one canvas, as the desktop side column does: the
 * buttons over it are transparent hit targets only.
 */
export const MobileSideChrome: React.FC<MobileSideChromeProps> = ({
  frame,
  layout,
  viewportWidth,
  viewportHeight,
  tabs,
  selectedTab,
  onTabPress,
  tabsCollapsed,
  onToggleTabsCollapsed,
  children,
  overlay,
}) => {
  const { bindContextMenu } = useContextMenu();
  // A touch pointer (see `isTouchPointer`): a stone without a menu still takes its taps through the shared press
  // recognizer, which keeps a wobbling or slow tap a tap for as long as the finger stays on
  // the stone. Only the touch handler, so the mouse's right-click is left as it was.
  const touchTap = bindContextMenu(() => null).onPointerDownCapture;
  const railRect = layout.tabRail;
  const railCss = osmCssRect(frame, railRect);
  const panelCss = osmCssRect(frame, layout.sidePanel);
  // DraggablePanel's cover zoom for a `physicalSize` box, so the overlay lines up with the shell.
  const panelZoom = Math.max(panelCss.width / OSM_SIDE_PANEL.width, panelCss.height / OSM_SIDE_PANEL.height);
  const columns = osmTabColumns(tabsCollapsed);
  const tabBySlot = new Map(tabs.map((spec) => [MOBILE_TAB_SLOT[spec.tab], spec]));
  const selectedSlot = selectedTab ? MOBILE_TAB_SLOT[selectedTab] : null;

  const slots: RailSlot[] = [];
  for (const [name, slot] of Object.entries(OSM_TAB_SLOTS) as [
    OsmTabSlotName,
    (typeof OSM_TAB_SLOTS)[OsmTabSlotName],
  ][]) {
    if (slot.column === 'chat') continue;
    const column = slot.column === 'left' ? columns.left : columns.right;
    slots.push({
      name,
      rect: { x: column.x, y: column.y + OSM_TAB_SLOT_Y[slot.slot], ...OSM_TAB_STONE },
    });
  }
  const expandRect: Rect = {
    x: columns.left.x,
    y: columns.left.y + OSM_TAB_SLOT_Y[OSM_EXPAND_SLOT.slot],
    ...OSM_TAB_STONE,
  };

  // Paint order follows the cache: the 9-slice frame (51), the right group (61), the collapsed
  // cover (85/86), then the left group (87). Within a group every resting stone comes first,
  // then the lit one, then the icons, so a lit stone overlaps its neighbors' shared row as in
  // game. Collapsed, the right group still draws at its right-anchored x (15, under the left
  // column) and the translucent cover dims the sliver of it that shows.
  const sprites: LayerSprite[] = mobileNineSlice({ x: 0, y: 0, width: railRect.width, height: railRect.height });
  const paintGroup = (group: readonly RailSlot[], withExpand: boolean) => {
    const stones = withExpand ? [...group, { name: 'expand' as const, rect: expandRect }] : group;
    for (const { rect } of stones) {
      sprites.push({ src: MOBILE.tabStone, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    }
    for (const { name, rect } of group) {
      if (name === selectedSlot) {
        sprites.push({ src: MOBILE.tabStoneSelected, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }
    for (const { name, rect } of group) {
      // A tab the simulator does not implement keeps its bare stone, as in fixed and classic.
      if (name === 'expand' || !tabBySlot.has(name)) continue;
      sprites.push({
        src: packSprite(OSM_TAB_SLOTS[name].iconPath),
        x: rect.x + OSM_TAB_ICON.x,
        y: rect.y + OSM_TAB_ICON.y,
        w: OSM_TAB_ICON.width,
        h: OSM_TAB_ICON.height,
      });
    }
    if (withExpand) {
      sprites.push({
        src: tabsCollapsed ? MOBILE.showMore : MOBILE.showLess,
        x: expandRect.x + OSM_EXPAND_SLOT.iconRect.x,
        y: columns.left.y + OSM_EXPAND_SLOT.iconRect.y,
        w: OSM_EXPAND_SLOT.iconRect.width,
        h: OSM_EXPAND_SLOT.iconRect.height,
      });
    }
  };
  const rightGroup = slots.filter((slot) => OSM_TAB_SLOTS[slot.name as OsmTabSlotName].column === 'right');
  paintGroup(rightGroup, false);
  if (tabsCollapsed) {
    const inset = 3;
    const w = railRect.width - 2 * inset;
    const h = railRect.height - 2 * inset;
    sprites.push({
      src: MOBILE.railMiddle,
      x: inset,
      y: inset,
      w,
      h,
      width: w,
      height: h,
      opacity: ifTransAlpha(OSM_TABS_BLOCKING_TRANS),
    });
  }
  paintGroup(
    slots.filter((slot) => OSM_TAB_SLOTS[slot.name as OsmTabSlotName].column === 'left'),
    true,
  );

  const buttonStyle = (rect: Rect): React.CSSProperties => ({
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    padding: 0,
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    cursor: 'default',
  });

  return (
    <>
      <DraggablePanel
        inputSurface="gameplay"
        defaultPosition={pinned(railCss)}
        position={pinned(railCss)}
        width={railRect.width}
        height={railRect.height}
        scale={frame.scale}
        physicalSize={railCss}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        locked
        scaleEnabled={false}
        dataTutorial="tab-bar"
      >
        <div className="panel-surface" style={{ position: 'relative', width: railRect.width, height: railRect.height }}>
          <PixelSpriteLayer width={railRect.width} height={railRect.height} sprites={sprites} />
          {slots.map(({ name, rect }) => {
            const spec = tabBySlot.get(name as OsmTabSlotName);
            // Collapsed, 601:85 TABS_BLOCKING sits over the right group: drawn, not reachable.
            if (!spec || (tabsCollapsed && OSM_TAB_SLOTS[name as OsmTabSlotName].column === 'right')) return null;
            const isSelected = selectedSlot === name;
            return (
              <button
                key={name}
                type="button"
                aria-label={spec.label}
                aria-pressed={isSelected}
                data-tab={spec.tab}
                data-active={isSelected || undefined}
                className={spec.highlight ? 'shortcut-hint-glow' : undefined}
                onClick={() => onTabPress(spec.tab)}
                onMouseDown={spec.contextMenu?.onMouseDown}
                onContextMenu={spec.contextMenu?.onContextMenu}
                onPointerDownCapture={spec.contextMenu?.onPointerDownCapture ?? touchTap}
                style={buttonStyle(rect)}
              />
            );
          })}
          <HoverHintButton
            type="button"
            aria-label={tabsCollapsed ? 'Show more' : 'Show less'}
            aria-expanded={!tabsCollapsed}
            onClick={onToggleTabsCollapsed}
            onPointerDownCapture={touchTap}
            style={buttonStyle(expandRect)}
          />
        </div>
      </DraggablePanel>

      {children !== null && (
        <DraggablePanel
          inputSurface="gameplay"
          defaultPosition={pinned(panelCss)}
          position={pinned(panelCss)}
          width={OSM_SIDE_PANEL.width}
          height={OSM_SIDE_PANEL.height}
          scale={frame.scale}
          physicalSize={panelCss}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          locked
          scaleEnabled={false}
          dataTutorial="game-panel"
        >
          <div style={{ position: 'relative', width: OSM_SIDE_PANEL.width, height: OSM_SIDE_PANEL.height }}>
            {children}
          </div>
        </DraggablePanel>
      )}
      {children !== null && overlay && (
        // The overlay hangs off the shell's edges, so it cannot sit inside the pinned panel,
        // which clips to its box. It takes the same box and the zoom the panel applies there.
        <div
          data-mobile-side-overlay=""
          style={{
            position: 'absolute',
            left: panelCss.x,
            top: panelCss.y,
            width: panelCss.width,
            height: panelCss.height,
            zIndex: PANEL_Z_INDEX,
            pointerEvents: 'none',
          }}
        >
          <PanelContentScaleProvider value={panelZoom}>
            <div
              style={{
                position: 'relative',
                width: OSM_SIDE_PANEL.width,
                height: OSM_SIDE_PANEL.height,
                zoom: panelZoom,
              }}
            >
              {overlay}
            </div>
          </PanelContentScaleProvider>
        </div>
      )}
    </>
  );
};
