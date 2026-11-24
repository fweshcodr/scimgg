import type React from 'react';
import { useState } from 'react';
import { isDizanasQuiver } from '../../data/dizanasQuiver';
import { EQUIPMENT_BUTTONS, EQUIPMENT_FRAME, EQUIPMENT_SLOTS, IRON_RIVETS } from '../../resourcePack';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import { getItemSpriteUrl } from '../../services/ItemSpriteService';
import { THEME } from '../../theme';
import type { SupplyItem } from '../../types/encounterLoadout';
import { computeTotalWeight, type EquipmentStats } from '../../types/equipmentStats';
import type { EquipmentPanelView } from '../../types/gamePanelViews';
import type { Inventory } from '../../types/inventory';
import { buildEquipmentContextMenu, useContextMenu } from '../ContextMenu';
import { PixelComposedLayer, tileFill } from '../PixelComposedLayer';
import { type LayerSprite, PixelSpriteLayer } from '../PixelSpriteLayer';
import { buildEquipmentStatsTooltip, buildEquipmentTooltip, useTooltip } from '../Tooltip';
import { HoverHintButton } from '../ui/HoverHintControl';
import { FONT_BOLD, PIXEL_SHADOW, SectionHeader } from './panelKit';
import { UnlimitedMark } from './UnlimitedMark';

interface EquipmentContentProps {
  /**
   * Owned by `GamePanel` rather than here so a replay can restore it: the stats readout
   * REPLACES the slot grid, and a cursor recorded over a helmet slot otherwise lands on
   * a line of text.
   */
  view: EquipmentPanelView;
  onViewChange: (view: EquipmentPanelView) => void;
  equipmentStats?: EquipmentStats;
  playerEquipment?: PlayerEquipment;
  onUnequipSlot?: (slot: string) => void;
  onEquipmentSlotClick?: (slot: string) => boolean;
  equippedAmmo?: SupplyItem | null;
  quiverAmmo?: SupplyItem | null;
  inventory?: Inventory;
  /** Ammo is not a keyof PlayerEquipment, so it has its own handler. */
  onUnequipAmmo?: () => void;
  objTypeLoader?: ObjTypeLoader;
}

const PANEL_WIDTH = 204;
const PANEL_HEIGHT = 275;
const SLOT_SIZE = 36;
const INVENTORY_QUIVER_OPACITY = 0.5;

const COL_L = 32;
const COL_C = 84;
const COL_R = 136;

const ROW_1 = 9;
const ROW_2 = 50;
const ROW_3 = 91;
const ROW_4 = 132;
const ROW_5 = 173;

const SLOT_POSITIONS = {
  quiverAmmo: { x: COL_R, y: ROW_1 },
  head: { x: COL_C, y: ROW_1 },
  cape: { x: COL_L, y: ROW_2 },
  amulet: { x: COL_C, y: ROW_2 },
  ammo: { x: COL_R, y: ROW_2 },
  weapon: { x: COL_L, y: ROW_3 },
  body: { x: COL_C, y: ROW_3 },
  shield: { x: COL_R, y: ROW_3 },
  legs: { x: COL_C, y: ROW_4 },
  hands: { x: COL_L, y: ROW_5 },
  boots: { x: COL_C, y: ROW_5 },
  ring: { x: COL_R, y: ROW_5 },
};

const formatBonus = (val: number | undefined) => {
  const v = val || 0;
  return v >= 0 ? `+${v}` : `${v}`;
};

const slotSilhouettes = (): Record<string, string> => ({
  head: EQUIPMENT_SLOTS.head,
  cape: EQUIPMENT_SLOTS.cape,
  amulet: EQUIPMENT_SLOTS.amulet,
  ammo: EQUIPMENT_SLOTS.ammo,
  'quiver-ammo': EQUIPMENT_SLOTS.ammo,
  weapon: EQUIPMENT_SLOTS.weapon,
  body: EQUIPMENT_SLOTS.body,
  shield: EQUIPMENT_SLOTS.shield,
  legs: EQUIPMENT_SLOTS.legs,
  hands: EQUIPMENT_SLOTS.hands,
  boots: EQUIPMENT_SLOTS.boots,
  ring: EQUIPMENT_SLOTS.ring,
});

interface EquipmentSlotSpec {
  readonly slotName: string;
  readonly item?: number;
  readonly pos: { readonly x: number; readonly y: number };
  /** Dims the whole slot: an inventory-only quiver shows its ammo grayed. */
  readonly opacity?: number;
  /** Marks the slot's contents as an endless supply. Ammunition only. */
  readonly unlimited?: boolean;
}

const slotHasItem = (item: number | undefined): item is number => item !== undefined && item >= 0;

const ITEM_ICON_SIZE = 32;

// Bottom action row. Laid out from the panel center so the sprite layer and the button hit
// targets read the same geometry off one set of constants.
const ACTION_BUTTON_SIZE = 40;
const actionFrameSources = () => [
  EQUIPMENT_FRAME.edgeTop,
  EQUIPMENT_FRAME.edgeBottom,
  EQUIPMENT_FRAME.edgeLeft,
  EQUIPMENT_FRAME.edgeRight,
  EQUIPMENT_FRAME.cornerTopLeft,
  EQUIPMENT_FRAME.cornerTopRight,
  EQUIPMENT_FRAME.cornerBottomLeft,
  EQUIPMENT_FRAME.cornerBottomRight,
];
const ACTION_BUTTON_GAP = 4;
const ACTION_BUTTON_Y = 218;
const ACTION_ICON_SIZE = 32;
const ACTION_ROW_START = (PANEL_WIDTH - (4 * ACTION_BUTTON_SIZE + 3 * ACTION_BUTTON_GAP)) / 2;
const actionButtonX = (index: number): number => ACTION_ROW_START + index * (ACTION_BUTTON_SIZE + ACTION_BUTTON_GAP);

/**
 * https://oldschool.runescape.wiki/w/Weight: the stats screen shows whole kilograms rounded
 * toward zero (9.979 kg reads 9 kg, -4.535 kg reads -4 kg). Run drain keeps the exact value.
 */
const formatWeight = (kg: number) => `${Math.trunc(kg) || 0} kg`;

const StatRow: React.FC<{ label: string; value?: number; suffix?: string; text?: string }> = ({
  label,
  value,
  suffix = '',
  text,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: FONT_BOLD,
      fontSize: '13px',
      /* Explicit line-height: the default was inflating a 13px row to 22px, which
         pushed half the panel below the fold. */
      lineHeight: 1.15,
      padding: '1px 2px',
    }}
  >
    <span style={{ color: 'var(--native-label)' }}>{label}</span>
    <span style={{ color: 'var(--native-body)' }}>{text ?? `${formatBonus(value)}${suffix}`}</span>
  </div>
);

/**
 * Deliberately not an `OsrsButton`: that is the app-chrome register (pointer
 * cursor, filled surface, primary-gold text), and inside the sprite panel it
 * read as the loudest element on screen.
 */
const StatsBackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [hover, setHover] = useState(false);
  return (
    <HoverHintButton
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Back to equipment"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        /* 12px glyph in a 24px box: the visual weight stays subtle to match the
           panel register, but the hit target clears the 24px minimum. */
        width: 24,
        height: 24,
        marginLeft: -3,
        flex: '0 0 auto',
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'default',
        color: hover ? 'var(--native-body)' : 'var(--native-label)',
        transition: 'color 0.15s ease',
        outline: 'none',
      }}
    >
      {/* 1.4 / square / miter is this app's glyph weight, shared with the picker's
          search and lobby marks. */}
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
        <path
          d="M7.5 2 L3.5 6 L7.5 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </HoverHintButton>
  );
};

const ConnectingLines: React.FC<{ showQuiverAmmo: boolean }> = ({ showQuiverAmmo }) => {
  const tileSize = 36;
  const halfTile = tileSize / 2;

  const verticalSegments = [
    ...(showQuiverAmmo ? [{ id: 'quiver-ammo', x: COL_R + 18, y1: ROW_1 + 18, y2: ROW_2 + 18 }] : []),
    { id: 'v1', x: COL_C + 18, y1: ROW_1 + 18, y2: ROW_2 + 18 },
    { id: 'v2', x: COL_C + 18, y1: ROW_2 + 18, y2: ROW_3 + 18 },
    { id: 'v3', x: COL_C + 18, y1: ROW_3 + 18, y2: ROW_4 + 18 },
    { id: 'v4', x: COL_C + 18, y1: ROW_4 + 18, y2: ROW_5 + 18 },
  ];

  const horizontalSegments = [
    { id: 'h2-left', y: ROW_2 + 18, x1: COL_L + 18, x2: COL_C + 18 },
    { id: 'h2-right', y: ROW_2 + 18, x1: COL_C + 18, x2: COL_R + 18 },
    { id: 'h3-left', y: ROW_3 + 18, x1: COL_L + 18, x2: COL_C + 18 },
    { id: 'h3-right', y: ROW_3 + 18, x1: COL_C + 18, x2: COL_R + 18 },
    { id: 'h5-left', y: ROW_5 + 18, x1: COL_L + 18, x2: COL_C + 18 },
    { id: 'h5-right', y: ROW_5 + 18, x1: COL_C + 18, x2: COL_R + 18 },
  ];

  // Every rivet run is a REPEAT, and the runs meet at their junctions. As CSS backgrounds each
  // repetition restarted on its own subpixel phase and each run rounded its own ends, so hairlines
  // opened along the runs and at every junction. Composed at 1:1 into one panel-sized raster, the
  // repeats land on exact integer boundaries and the junctions are interior pixels.
  const connectorKey = [
    'equipment-connectors',
    IRON_RIVETS.vertical,
    IRON_RIVETS.horizontal,
    verticalSegments.map((seg) => `v${seg.id}:${seg.x},${seg.y1},${seg.y2}`).join(','),
    horizontalSegments.map((seg) => `h${seg.id}:${seg.y},${seg.x1},${seg.x2}`).join(','),
  ].join('|');

  return (
    <PixelComposedLayer
      cacheKey={connectorKey}
      width={PANEL_WIDTH}
      height={PANEL_HEIGHT}
      sources={[IRON_RIVETS.vertical, IRON_RIVETS.horizontal]}
      style={{ zIndex: 0 }}
      draw={(flat, images) => {
        const vertical = images.get(IRON_RIVETS.vertical);
        const horizontal = images.get(IRON_RIVETS.horizontal);
        if (vertical) {
          for (const seg of verticalSegments) {
            tileFill(flat, vertical, seg.x - halfTile, seg.y1, tileSize, seg.y2 - seg.y1);
          }
        }
        if (horizontal) {
          for (const seg of horizontalSegments) {
            tileFill(flat, horizontal, seg.x1, seg.y - halfTile, seg.x2 - seg.x1, tileSize);
          }
        }
      }}
    />
  );
};

// The icon is painted by the panel's shared sprite layer; this renders only the frame.
const EquipmentActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({
  label,
  style,
  ...props
}) => {
  const frameSources = actionFrameSources();
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        position: 'absolute',
        width: ACTION_BUTTON_SIZE,
        height: ACTION_BUTTON_SIZE,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'default',
        // Above the sprite layer, so the frame still overlaps the icon's outer edge.
        zIndex: 2,
        ...style,
      }}
      {...props}
    >
      {/* 9-slice frame, composed at 1:1 — four repeating edges meeting four corners is the
          same seam surface as the panel buttons, and the same fix. */}
      <PixelComposedLayer
        cacheKey={`equipment-action-frame|${frameSources.join(',')}`}
        width={ACTION_BUTTON_SIZE}
        height={ACTION_BUTTON_SIZE}
        sources={frameSources}
        draw={(flat, images) => {
          const I = 9;
          const inner = ACTION_BUTTON_SIZE - 2 * I;
          const top = images.get(EQUIPMENT_FRAME.edgeTop);
          const bottom = images.get(EQUIPMENT_FRAME.edgeBottom);
          const left = images.get(EQUIPMENT_FRAME.edgeLeft);
          const right = images.get(EQUIPMENT_FRAME.edgeRight);
          if (top) tileFill(flat, top, I, 0, inner, I);
          if (bottom) tileFill(flat, bottom, I, ACTION_BUTTON_SIZE - I, inner, I);
          if (left) tileFill(flat, left, 0, I, I, inner);
          if (right) tileFill(flat, right, ACTION_BUTTON_SIZE - I, I, I, inner);
          const tl = images.get(EQUIPMENT_FRAME.cornerTopLeft);
          const tr = images.get(EQUIPMENT_FRAME.cornerTopRight);
          const bl = images.get(EQUIPMENT_FRAME.cornerBottomLeft);
          const br = images.get(EQUIPMENT_FRAME.cornerBottomRight);
          if (tl) flat.drawImage(tl, 0, 0, I, I);
          if (tr) flat.drawImage(tr, ACTION_BUTTON_SIZE - I, 0, I, I);
          if (bl) flat.drawImage(bl, 0, ACTION_BUTTON_SIZE - I, I, I);
          if (br) flat.drawImage(br, ACTION_BUTTON_SIZE - I, ACTION_BUTTON_SIZE - I, I, I);
        }}
      />
    </button>
  );
};

export const EquipmentContent: React.FC<EquipmentContentProps> = ({
  view,
  onViewChange,
  equipmentStats,
  playerEquipment = {},
  onUnequipSlot,
  onEquipmentSlotClick,
  equippedAmmo,
  quiverAmmo,
  inventory,
  onUnequipAmmo,
  objTypeLoader,
}) => {
  const { bindTooltip } = useTooltip();
  const { bindContextMenu } = useContextMenu();
  const hasEquippedDizanaQuiver = isDizanasQuiver(playerEquipment.cape);
  const hasInventoryDizanaQuiver = inventory?.some((slot) => slot !== null && isDizanasQuiver(slot.id)) ?? false;
  const showQuiverAmmo = hasEquippedDizanaQuiver || hasInventoryDizanaQuiver;

  const handleSlotClick = (slot: string) => {
    if (onEquipmentSlotClick?.(slot)) {
      return;
    }
    if (onUnequipSlot) {
      onUnequipSlot(slot);
    }
  };

  if (view === 'stats') {
    return (
      <div style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 10px',
            boxSizing: 'border-box',
            gap: 6,
            textRendering: 'optimizeSpeed',
            WebkitFontSmoothing: 'none',
            MozOsxFontSmoothing: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 2 }}>
            <StatsBackButton onClick={() => onViewChange('equipment')} />
            <div
              style={{
                flex: 1,
                fontFamily: FONT_BOLD,
                fontSize: '16px',
                color: 'var(--native-label)',
                textShadow: PIXEL_SHADOW,
                textAlign: 'center',
                /* Offset the back affordance so the title stays optically centered. */
                marginRight: 25,
              }}
            >
              Equipment Stats
            </div>
          </div>

          <div
            className="game-panel-scroll"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              marginRight: -4,
              paddingRight: 4,
              /* Hairline edge so the scrolled cut reads as "continues below" rather
                 than as a clipped row against the panel frame. */
              borderTop: '1px solid var(--color-border)',
              paddingTop: 2,
              /* Clearance so the final row never sits flush against the panel frame. */
              paddingBottom: 4,
            }}
          >
            <SectionHeader title="Attack" />
            <StatRow label="Stab" value={equipmentStats?.attackStab} />
            <StatRow label="Slash" value={equipmentStats?.attackSlash} />
            <StatRow label="Crush" value={equipmentStats?.attackCrush} />
            <StatRow label="Magic" value={equipmentStats?.attackMagic} />
            <StatRow label="Ranged" value={equipmentStats?.attackRanged} />

            <SectionHeader title="Defence" />
            <StatRow label="Stab" value={equipmentStats?.defenceStab} />
            <StatRow label="Slash" value={equipmentStats?.defenceSlash} />
            <StatRow label="Crush" value={equipmentStats?.defenceCrush} />
            <StatRow label="Magic" value={equipmentStats?.defenceMagic} />
            <StatRow label="Ranged" value={equipmentStats?.defenceRanged} />

            <SectionHeader title="Other" />
            <StatRow label="Melee strength" value={equipmentStats?.meleeStrength} />
            <StatRow label="Ranged strength" value={equipmentStats?.rangedStrength} />
            <StatRow label="Magic damage" value={equipmentStats?.magicDamage} suffix="%" />
            <StatRow label="Prayer" value={equipmentStats?.prayer} />
            {/* Worn plus carried, from the same function the run-energy drain reads. */}
            <StatRow
              label="Weight"
              text={formatWeight(
                objTypeLoader ? computeTotalWeight(playerEquipment, inventory ?? [], objTypeLoader) : 0,
              )}
            />
          </div>
        </div>
      </div>
    );
  }

  const bindSlotTooltip = (slot: string) => {
    const itemId = playerEquipment?.[slot as keyof PlayerEquipment];
    return bindTooltip(() => {
      if (itemId !== undefined)
        return (
          buildEquipmentTooltip(itemId, objTypeLoader) ?? {
            lines: [
              {
                spans: [
                  { text: 'Remove ', color: '#ffffff' },
                  { text: 'item', color: '#00ffff' },
                ],
              },
            ],
          }
        );
      return {
        lines: [
          { spans: [{ text: slot.charAt(0).toUpperCase() + slot.slice(1), color: THEME.colors.native.orangeHover }] },
        ],
      };
    });
  };

  const bindSlotMouseDown = (slot: string) => {
    const itemId = playerEquipment?.[slot as keyof PlayerEquipment];
    const contextMenuProps =
      itemId !== undefined
        ? bindContextMenu(() => buildEquipmentContextMenu(itemId, slot, objTypeLoader, { onUnequipSlot }))
        : null;
    return {
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button === 0) handleSlotClick(slot);
        contextMenuProps?.onMouseDown(e);
      },
      onContextMenu: contextMenuProps?.onContextMenu,
      onPointerDownCapture: contextMenuProps?.onPointerDownCapture,
    };
  };

  const bindAmmoTooltip = (ammo: SupplyItem | null | undefined, removable: boolean) =>
    bindTooltip(() => {
      if (ammo) {
        const content = buildEquipmentTooltip(ammo.id, objTypeLoader, removable) ?? {
          lines: [
            {
              spans: [
                ...(removable ? [{ text: 'Remove ', color: '#ffffff' }] : []),
                { text: 'ammunition', color: '#00ffff' },
              ],
            },
          ],
        };
        // Ammunition never runs out in the simulator, so the tooltip states it rather
        // than leaving it to be inferred.
        return {
          lines: [...content.lines, { spans: [{ text: 'Unlimited', color: THEME.colors.native.label }] }],
        };
      }
      return {
        lines: [{ spans: [{ text: 'Ammunition', color: THEME.colors.native.orangeHover }] }],
      };
    });

  const bindAmmoMouseDown = () => {
    const contextMenuProps = equippedAmmo
      ? bindContextMenu(() =>
          buildEquipmentContextMenu(equippedAmmo.id, 'ammo', objTypeLoader, {
            onUnequipSlot: () => onUnequipAmmo?.(),
          }),
        )
      : null;
    return {
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button === 0 && !onEquipmentSlotClick?.('ammo') && equippedAmmo) onUnequipAmmo?.();
        contextMenuProps?.onMouseDown(e);
      },
      onContextMenu: contextMenuProps?.onContextMenu,
      onPointerDownCapture: contextMenuProps?.onPointerDownCapture,
    };
  };

  const slotSpecs: EquipmentSlotSpec[] = [
    { slotName: 'head', item: playerEquipment.head, pos: SLOT_POSITIONS.head },
    { slotName: 'cape', item: playerEquipment.cape, pos: SLOT_POSITIONS.cape },
    { slotName: 'amulet', item: playerEquipment.amulet, pos: SLOT_POSITIONS.amulet },
    ...(showQuiverAmmo
      ? [
          {
            slotName: 'quiver-ammo',
            item: quiverAmmo?.id,
            pos: SLOT_POSITIONS.quiverAmmo,
            opacity: hasEquippedDizanaQuiver ? 1 : INVENTORY_QUIVER_OPACITY,
            unlimited: true,
          } satisfies EquipmentSlotSpec,
        ]
      : []),
    { slotName: 'ammo', item: equippedAmmo?.id, pos: SLOT_POSITIONS.ammo, unlimited: true },
    { slotName: 'weapon', item: playerEquipment.weapon, pos: SLOT_POSITIONS.weapon },
    { slotName: 'body', item: playerEquipment.body, pos: SLOT_POSITIONS.body },
    { slotName: 'shield', item: playerEquipment.shield, pos: SLOT_POSITIONS.shield },
    { slotName: 'legs', item: playerEquipment.legs, pos: SLOT_POSITIONS.legs },
    { slotName: 'hands', item: playerEquipment.hands, pos: SLOT_POSITIONS.hands },
    { slotName: 'boots', item: playerEquipment.boots, pos: SLOT_POSITIONS.boots },
    { slotName: 'ring', item: playerEquipment.ring, pos: SLOT_POSITIONS.ring },
  ];

  const actionButtons: {
    icon: string;
    label: string;
    disabled?: boolean;
    onMouseDown?: (e: React.MouseEvent) => void;
    tooltip?: ReturnType<typeof buildEquipmentStatsTooltip>;
  }[] = [
    {
      icon: EQUIPMENT_BUTTONS.stats,
      label: 'Equipment Stats',
      onMouseDown: (e) => {
        if (e.button === 0) onViewChange('stats');
      },
      tooltip: buildEquipmentStatsTooltip(),
    },
    { icon: EQUIPMENT_BUTTONS.guidePrices, label: 'Guide Prices', disabled: true },
    { icon: EQUIPMENT_BUTTONS.itemsKeptOnDeath, label: 'Items Kept on Death', disabled: true },
    { icon: EQUIPMENT_BUTTONS.callFollower, label: 'Call Follower', disabled: true },
  ];

  // Every equipment sprite paints into ONE canvas, above the connectors and below the slot
  // hit targets. See PixelSpriteLayer for why a canvas per sprite hitched on tab switch.
  const sprites: LayerSprite[] = [];
  const silhouettes = slotSilhouettes();
  for (const spec of slotSpecs) {
    const alpha = spec.opacity ?? 1;
    const box = { x: spec.pos.x, y: spec.pos.y, w: SLOT_SIZE, h: SLOT_SIZE };
    sprites.push({ ...box, src: EQUIPMENT_SLOTS.tile, width: SLOT_SIZE, height: SLOT_SIZE, opacity: alpha });
    if (slotHasItem(spec.item)) {
      // RuneLite item icons are a 36x32 canvas with the item drawn ~2px left of center, so
      // centering them reads as off-center in the slot.
      sprites.push({
        src: getItemSpriteUrl(spec.item),
        x: spec.pos.x + (SLOT_SIZE - ITEM_ICON_SIZE) / 2,
        y: spec.pos.y + (SLOT_SIZE - ITEM_ICON_SIZE) / 2,
        w: ITEM_ICON_SIZE,
        h: ITEM_ICON_SIZE,
        offsetX: 2,
        opacity: alpha,
      });
    } else if (silhouettes[spec.slotName]) {
      sprites.push({
        ...box,
        src: silhouettes[spec.slotName],
        width: ITEM_ICON_SIZE,
        height: ITEM_ICON_SIZE,
        opacity: alpha * 0.8,
      });
    }
  }
  actionButtons.forEach((button, index) => {
    sprites.push({
      src: button.icon,
      x: actionButtonX(index) + (ACTION_BUTTON_SIZE - ACTION_ICON_SIZE) / 2,
      y: ACTION_BUTTON_Y + (ACTION_BUTTON_SIZE - ACTION_ICON_SIZE) / 2,
      w: ACTION_ICON_SIZE,
      h: ACTION_ICON_SIZE,
      width: ACTION_ICON_SIZE,
      height: ACTION_ICON_SIZE,
      opacity: button.disabled ? 0.5 : 1,
    });
  });

  return (
    <div style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT, position: 'relative' }}>
      <ConnectingLines showQuiverAmmo={showQuiverAmmo} />

      <PixelSpriteLayer width={PANEL_WIDTH} height={PANEL_HEIGHT} sprites={sprites} style={{ zIndex: 1 }} />

      {slotSpecs.map((spec) => (
        <EquipmentSlot
          key={spec.slotName}
          spec={spec}
          {...(spec.slotName === 'quiver-ammo'
            ? {
                ...bindAmmoTooltip(quiverAmmo, false),
                onMouseDown: (e: React.MouseEvent) => {
                  if (e.button === 0) onEquipmentSlotClick?.('quiver-ammo');
                },
              }
            : spec.slotName === 'ammo'
              ? { ...bindAmmoMouseDown(), ...bindAmmoTooltip(equippedAmmo, true) }
              : { ...bindSlotMouseDown(spec.slotName), ...bindSlotTooltip(spec.slotName) })}
        />
      ))}

      {actionButtons.map((button, index) => (
        <EquipmentActionButton
          key={button.label}
          label={button.label}
          disabled={button.disabled}
          onMouseDown={button.onMouseDown}
          style={{
            left: actionButtonX(index),
            top: ACTION_BUTTON_Y,
            ...(button.disabled ? { opacity: 0.5 } : null),
          }}
          {...(button.tooltip ? bindTooltip(button.tooltip) : {})}
        />
      ))}
    </div>
  );
};

/**
 * Hit target for one equipment slot. Its tile, silhouette and item sprite are painted by the
 * panel's shared PixelSpriteLayer, so all this contributes is the badge and the bindings.
 */
const EquipmentSlot: React.FC<React.HTMLAttributes<HTMLDivElement> & { spec: EquipmentSlotSpec }> = ({
  spec,
  style: _style,
  children: _children,
  ...htmlProps
}) => {
  return (
    <div
      data-testid={`equipment-slot-${spec.slotName}`}
      {...htmlProps}
      style={{
        position: 'absolute',
        left: spec.pos.x,
        top: spec.pos.y,
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        boxSizing: 'border-box',
        zIndex: 2,
        cursor: 'default',
        ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
      }}
    >
      {/* Stocked ammunition would otherwise read the same as an empty slot: the item
          sprite alone is as small and as dim as the slot silhouette it replaces. */}
      {spec.unlimited && slotHasItem(spec.item) && <UnlimitedMark top={2} left={2} />}
    </div>
  );
};
