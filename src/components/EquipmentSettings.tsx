import type React from 'react';
import { getGearCatalog } from '../data/customEquipmentPresets';
import { findEquipmentCatalogItem } from '../data/equipmentCatalog';
import { describeWeaponVerificationGaps } from '../data/equipmentSupport';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import { getItemSpriteUrl } from '../services/ItemSpriteService';
import type { PlayerConfig } from '../types/player';
import { UnlimitedSlotMark } from './GamePanel/UnlimitedMark';
import { LoadoutUnverifiedBadge, LoadoutUnverifiedTooltipTrigger, verifiedItemNotes } from './LoadoutUnverifiedBadge';
import type { GridCellProps } from './loadoutGridNavigation';
import { PixelSprite } from './PixelSprite';
import './EquipmentSettings.css';

/**
 * What the loadout wears in the ammunition slot, and what its quiver holds.
 *
 * Ammo is NOT part of PlayerEquipment — that interface is the ten slots the model loader
 * dresses — so the cross cannot read this from `playerConfig` the way every other cell does.
 * It travels separately because its home is CombatSupplies.
 */
export interface EquipmentAmmo {
  readonly worn?: number;
  /**
   * Present exactly while the loadout owns a Dizana's quiver, worn or carried, and the quiver
   * cell is drawn exactly then — empty when nothing is stored. A stored stack on its own is
   * not the signal: a set that dropped its quiver can still be carrying `quiverAmmo`.
   */
  readonly quiver?: { readonly stored?: number };
}

/**
 * The twelve cells and where each one sits in the cross. This is the only definition of the
 * layout: the CSS grid lines come from here, and so does arrow-key navigation, so the two
 * can never disagree about where a slot is.
 */
const EQUIPMENT_SLOT_CELLS = [
  { id: 'head', label: 'Head', row: 1, col: 2, section: 'equipment' },
  { id: 'quiverAmmo', label: 'Quiver', row: 1, col: 3, section: 'equipment' },
  { id: 'cape', label: 'Cape', row: 2, col: 1, section: 'equipment' },
  { id: 'amulet', label: 'Amulet', row: 2, col: 2, section: 'equipment' },
  { id: 'ammo', label: 'Ammo', row: 2, col: 3, section: 'equipment' },
  { id: 'weapon', label: 'Weapon', row: 3, col: 1, section: 'equipment' },
  { id: 'body', label: 'Body', row: 3, col: 2, section: 'equipment' },
  { id: 'shield', label: 'Shield', row: 3, col: 3, section: 'equipment' },
  { id: 'hands', label: 'Hands', row: 4, col: 1, section: 'equipment' },
  { id: 'legs', label: 'Legs', row: 4, col: 2, section: 'equipment' },
  { id: 'ring', label: 'Ring', row: 4, col: 3, section: 'equipment' },
  { id: 'boots', label: 'Boots', row: 5, col: 2, section: 'equipment' },
] as const;

type EquipmentSlotCell = (typeof EQUIPMENT_SLOT_CELLS)[number];

export type EquipmentSlotId = EquipmentSlotCell['id'];

const EQUIPMENT_SLOT_CELLS_WITHOUT_QUIVER: readonly EquipmentSlotCell[] = EQUIPMENT_SLOT_CELLS.filter(
  (cell) => cell.id !== 'quiverAmmo',
);

/** Columns the cross occupies, so a neighboring grid knows where its own columns begin. */
export const EQUIPMENT_GRID_COLUMNS = 3;

/**
 * The cells the diagram draws, in DOM order, which is also the order the roving group
 * numbers them in: the section spreads this into its grid and the diagram spreads
 * `cellProps(index)` onto the cell at the same position, so the two cannot drift apart.
 * Both answers are module constants, because the roving group keeps its tab stop by cell
 * identity and would lose it on a fresh copy.
 */
export function equipmentSlotCells(showQuiverAmmo: boolean): readonly EquipmentSlotCell[] {
  return showQuiverAmmo ? EQUIPMENT_SLOT_CELLS : EQUIPMENT_SLOT_CELLS_WITHOUT_QUIVER;
}

interface EquipmentSettingsProps {
  playerConfig: PlayerConfig;
  ammo?: EquipmentAmmo;
  /** Slot the picker currently holds, drawn as the one committed state in the diagram. */
  selectedSlot: EquipmentSlotId | null;
  /**
   * The slot name, plus the cell itself: the picker opens anchored to that cell, and
   * hands focus back to it when the slot is put down.
   */
  onEquipmentSlotClick: (slot: EquipmentSlotId, anchor: HTMLElement) => void;
  /**
   * Roving-focus wiring for each navigable cell, in {@link equipmentSlotCells} order. The
   * group is owned upstream because it spans the inventory too: left and right carry focus
   * between the two, so they cannot be two groups.
   */
  cellProps: (index: number) => GridCellProps;
  /** Arrow-key handler for the shared roving group, hung here where there is a role to hold it. */
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}

function slotItemId(slot: EquipmentSlotCell, equipment: PlayerEquipment, ammo: EquipmentAmmo | undefined) {
  switch (slot.id) {
    case 'ammo':
      return ammo?.worn;
    case 'quiverAmmo':
      return ammo?.quiver?.stored;
    default:
      return equipment[slot.id];
  }
}

function slotItemName(slot: EquipmentSlotCell, itemId: number): string | undefined {
  switch (slot.id) {
    case 'ammo':
    case 'quiverAmmo':
      return findEquipmentCatalogItem(itemId)?.name;
    default:
      return getGearCatalog(slot.id).find((item) => item.id === itemId)?.name;
  }
}

// RuneLite item icons are a 36x32 canvas with the item drawn ~2px left of center, so centering
// the canvas reads as off-center. Nudge it back by the same 2px.
const SPRITE_STYLE: React.CSSProperties = {
  maxWidth: 32,
  maxHeight: 32,
  pointerEvents: 'none',
  position: 'relative',
  left: 2,
};

/**
 * The OSRS equipment diagram: the panel's gear readout and its gear editor at once —
 * the same cells, always live, so there is only ever one picture of the kit and no
 * mode to be in.
 */
export const EquipmentSettings: React.FC<EquipmentSettingsProps> = ({
  playerConfig,
  ammo,
  selectedSlot,
  onEquipmentSlotClick,
  cellProps,
  onKeyDown,
}) => {
  return (
    // A fieldset groups form controls; this is a diagram whose cells happen to be buttons.
    // biome-ignore lint/a11y/useSemanticElements: see above; a fieldset's UA box fights the grid.
    <div className="equip-grid" role="group" aria-label="Equipment" onKeyDown={onKeyDown}>
      {equipmentSlotCells(ammo?.quiver !== undefined).map((slot, index) => {
        const itemId = slotItemId(slot, playerConfig.equipment, ammo);
        const isAmmunition = slot.id === 'ammo' || slot.id === 'quiverAmmo';
        const isEquipped = itemId !== undefined;
        const isSelected = selectedSlot === slot.id;
        const isUnverified =
          slot.id !== 'ammo' &&
          slot.id !== 'quiverAmmo' &&
          itemId !== undefined &&
          getGearCatalog(slot.id).find((item) => item.id === itemId)?.verified === false;
        const notes = isUnverified || itemId === undefined ? undefined : verifiedItemNotes(itemId);
        const notice = isUnverified ? 'unverified' : notes ? 'note' : undefined;
        const className = [
          'equip-slot',
          'equip-slot--editable',
          isEquipped ? 'equip-slot--filled' : '',
          isSelected ? 'equip-slot--selected' : '',
          isUnverified ? 'equip-slot--unverified' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const sprite =
          isEquipped &&
          (slot.id === 'quiverAmmo' ? (
            // Canvas resampling is the rule for item icons; the cells around it still draw an
            // <img>, and are not the pattern to copy.
            <PixelSprite src={getItemSpriteUrl(itemId)} alt={slot.label} style={SPRITE_STYLE} />
          ) : (
            <img
              crossOrigin="anonymous"
              src={getItemSpriteUrl(itemId)}
              alt={slot.label}
              style={SPRITE_STYLE}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ));

        const name = isEquipped ? slotItemName(slot, itemId) : undefined;
        // The button's own label names the slot AND what is in it, so the diagram
        // reads the same to a screen reader as it does on screen.
        const itemName = name ?? (isEquipped ? 'unsupported item' : 'empty');
        // A note reads as what it is, after the item, never as "unverified".
        const described = `${slot.label}: ${itemName}${isUnverified ? ', unverified and may not work correctly' : ''}`;
        const label = [notes ? `${described}. ${notes.join(' ')}` : described, isAmmunition ? 'Never runs out' : '']
          .filter(Boolean)
          .join('. ');

        return (
          <LoadoutUnverifiedTooltipTrigger
            key={slot.id}
            active={notice !== undefined}
            itemName={itemName}
            notice={notice}
            reasons={isUnverified && itemId !== undefined ? describeWeaponVerificationGaps(itemId) : notes}
          >
            <button
              type="button"
              className={className}
              style={{ gridRow: slot.row, gridColumn: slot.col }}
              {...cellProps(index)}
              aria-pressed={isSelected}
              aria-haspopup="dialog"
              aria-label={label}
              onClick={(event) => onEquipmentSlotClick(slot.id, event.currentTarget)}
            >
              <span className="equip-slot-label">{slot.label}</span>
              {notice ? <LoadoutUnverifiedBadge notice={notice}>{sprite}</LoadoutUnverifiedBadge> : sprite}
              {/* Only when there is nothing to show: with a sprite in the cell the glyph would
                compete with the identity the slot exists to carry, so the fact it states
                moves into the label above. */}
              {isAmmunition && !isEquipped && <UnlimitedSlotMark className="equip-slot-unlimited" />}
            </button>
          </LoadoutUnverifiedTooltipTrigger>
        );
      })}
    </div>
  );
};
