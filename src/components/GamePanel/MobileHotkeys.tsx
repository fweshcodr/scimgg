import type React from 'react';
import {
  OSM_HOTKEY_STRIP_INSET,
  OSM_HOTKEYS,
  OSM_TAB_SLOTS,
  osmHotkeyContent,
  osmHotkeysPlacement,
} from '../../layout/osmClientLayout';
import { type OsmFrame, osmCssRect } from '../../layout/osmFrame';
import {
  type OsmHotkeyFacts,
  type OsmHotkeySlot,
  type OsmHotkeyStone,
  type OsmHotkeyType,
  osmHotkeyActive,
  osmHotkeyStone,
  osmHotkeyType,
} from '../../layout/osmHotkeys';
import type { Size } from '../../layout/osrsClientLayout';
import { MINIMAP, MOBILE, packSprite } from '../../resourcePack';
import { useContextMenu } from '../ContextMenu';
import { DraggablePanel } from '../DraggablePanel';
import { type LayerSprite, PixelSpriteLayer } from '../PixelSpriteLayer';
import { useHotkeyCustomization } from '../TouchControls';
import { HoverHintButton } from '../ui/HoverHintControl';
import { MOBILE_TAB_SLOT, mobileNineSlice } from './MobileSideChrome';
import './MobileHotkeys.css';

/** The stone art for each hotkey state (TliButton01Square40x40). */
function stoneSprite(stone: OsmHotkeyStone): string {
  switch (stone) {
    case 'resting':
      return MOBILE.tabStone;
    case 'active':
      return MOBILE.tabStoneSelected;
    case 'special':
      return MOBILE.hotkeyStoneSpecial;
    case 'specialOn':
      return MOBILE.hotkeyStoneSpecialOn;
    case 'disabled':
      return MOBILE.hotkeyStoneDisabled;
  }
}

/** enum 5607's param 1988 (and 1989x1990), with the orb hotkeys' orb_icon swaps. */
function hotkeyIcon(type: OsmHotkeyType, facts: OsmHotkeyFacts): { readonly src: string } & Size {
  if (type.tab) return { src: packSprite(OSM_TAB_SLOTS[MOBILE_TAB_SLOT[type.tab]].iconPath), width: 33, height: 36 };
  const on = osmHotkeyActive(type, facts);
  switch (type.orb) {
    case 'quickPrayers':
      return { src: on ? MINIMAP.orbPrayerIconActivated : MINIMAP.orbPrayerIcon, width: 26, height: 26 };
    case 'run':
      return { src: on ? MINIMAP.orbRunIconActivated : MINIMAP.orbRunIcon, width: 26, height: 26 };
    default:
      // 23 Special attack draws sprite 168, the combat tab's crossed swords.
      return { src: packSprite(OSM_TAB_SLOTS.combat.iconPath), width: 33, height: 36 };
  }
}

export interface MobileHotkeyBinding {
  readonly onPress: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onPointerDownCapture?: React.PointerEventHandler<HTMLButtonElement>;
}

interface MobileHotkeysProps {
  readonly frame: OsmFrame;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly slots: readonly OsmHotkeySlot[];
  readonly facts: OsmHotkeyFacts;
  /** What pressing (and long-pressing) a hotkey does; GamePanel owns every action. */
  readonly bind: (type: OsmHotkeyType) => MobileHotkeyBinding;
  /** The bar folded down to its master toggle. */
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}

/**
 * The mobile client's hotkeys bar (601:40 HOTKEYS, group 892): the empty slots are skipped and the rest close up from the
 * top at the rail's 39-row pitch, over a dark 9-slice strip under the accordion's lip, with
 * the master toggle at the bottom. Collapsed, only the 58x43 toggle is left.
 */
export const MobileHotkeys: React.FC<MobileHotkeysProps> = ({
  frame,
  viewportWidth,
  viewportHeight,
  slots,
  facts,
  bind,
  collapsed,
  onToggleCollapsed,
}) => {
  const { customize } = useHotkeyCustomization();
  const { bindContextMenu } = useContextMenu();
  const customizeMenu = bindContextMenu(() => ({ entries: [{ action: 'Customize', onClick: customize }] }));
  const types = slots.map((slot) => osmHotkeyType(slot)).filter((type): type is OsmHotkeyType => type !== undefined);
  const rect = osmHotkeysPlacement(frame.size.height, collapsed);
  const css = osmCssRect(frame, rect);
  const content = osmHotkeyContent(types.length, collapsed);
  // 892:1 CONTENT is bottom-anchored inside the component (its y mode is abs_bottom).
  const top = rect.height - content.height;
  const toggleBottom = top + content.height;

  const sprites: LayerSprite[] = [];
  if (content.stones.length > 0) {
    // 892:3, painted before the buttons: the strip, then the lip that caps the column.
    sprites.push(
      ...mobileNineSlice({
        x: OSM_HOTKEY_STRIP_INSET,
        y: top,
        width: OSM_HOTKEYS.width - 2 * OSM_HOTKEY_STRIP_INSET,
        height: content.height,
      }),
    );
    sprites.push({ src: MOBILE.hotkeysAccordionLip, x: 0, y: top, w: 58, h: 43 });
    content.stones.forEach((stone, i) => {
      const type = types[i];
      const icon = hotkeyIcon(type, facts);
      sprites.push({ src: stoneSprite(osmHotkeyStone(type, facts)), x: stone.x, y: top + stone.y, w: 40, h: 40 });
      sprites.push({
        src: icon.src,
        x: stone.x + Math.trunc((stone.width - icon.width) / 2),
        y: top + stone.y + Math.trunc((stone.height - icon.height) / 2),
        w: icon.width,
        h: icon.height,
      });
    });
    // The 58x43 body bottom-anchored in the 33-row toggle, its
    // top ten rows transparent; side_icons 48 at bottom 5.
    sprites.push({ src: MOBILE.hotkeysAccordionBody, x: 0, y: toggleBottom - 43, w: 58, h: 43 });
    sprites.push({ src: MOBILE.hotkeysHide, x: 12, y: toggleBottom - 5 - 36, w: 33, h: 36 });
  } else {
    sprites.push({ src: MOBILE.hotkeysAccordion, x: 0, y: toggleBottom - 43, w: 58, h: 43 });
    sprites.push({ src: MOBILE.hotkeysShow, x: 12, y: toggleBottom - 5 - 36, w: 33, h: 36 });
  }

  const hit = (x: number, y: number, width: number, height: number): React.CSSProperties => ({
    position: 'absolute',
    left: x,
    top: y,
    width,
    height,
    padding: 0,
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    cursor: 'default',
  });

  return (
    <DraggablePanel
      inputSurface="gameplay"
      defaultPosition={{ x: css.x, y: css.y, anchorX: 'left', anchorY: 'top' }}
      position={{ x: css.x, y: css.y, anchorX: 'left', anchorY: 'top' }}
      width={rect.width}
      height={rect.height}
      scale={frame.scale}
      physicalSize={css}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      locked
      scaleEnabled={false}
      dataTutorial="mobile-hotkeys"
    >
      <div
        className="panel-surface osm-hotkeys"
        role="toolbar"
        aria-label="Hotkeys"
        style={{ position: 'relative', width: rect.width, height: rect.height }}
      >
        <PixelSpriteLayer width={rect.width} height={rect.height} sprites={sprites} />
        {content.stones.map((stone, i) => {
          const type = types[i];
          const binding = bind(type);
          return (
            <HoverHintButton
              key={stone.y}
              type="button"
              aria-label={type.name}
              aria-pressed={osmHotkeyActive(type, facts)}
              data-hotkey={type.id}
              onClick={binding.onPress}
              onMouseDown={binding.onMouseDown}
              onContextMenu={binding.onContextMenu}
              onPointerDownCapture={binding.onPointerDownCapture}
              style={hit(stone.x, top + stone.y, stone.width, stone.height)}
            />
          );
        })}
        <button
          type="button"
          className="osm-hotkeys__toggle"
          aria-label={collapsed ? 'Show hotkeys' : 'Hide hotkeys'}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          {...customizeMenu}
          style={hit(content.toggle.x, top + content.toggle.y, content.toggle.width, content.toggle.height)}
        >
          {/* "Hotkeys", p11_full, 14 rows at bottom 2; tinted like the tool tabs. */}
          <span className="osm-hotkeys__label">Hotkeys</span>
        </button>
      </div>
    </DraggablePanel>
  );
};
