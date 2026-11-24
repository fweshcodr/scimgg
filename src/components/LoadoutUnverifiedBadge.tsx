import type React from 'react';
import { cloneElement, useId, useRef } from 'react';
import { findEquipmentCatalogItem } from '../data/equipmentCatalog';
import { describeWeaponVerificationGaps, getEquipmentVerificationStatus } from '../data/equipmentSupport';
import { useHoverCard } from './ui/HoverCard';
import './LoadoutUnverifiedBadge.css';

/**
 * Which mark a slot carries. `unverified` is the amber warning: the item may not work. `note` is the
 * quiet gray `i` on a verified item that still has something worth saying, either an accepted gap
 * (the atlatl's special attack) or a plain fact. It must never read as the warning: the item works.
 */
export type LoadoutNotice = 'unverified' | 'note';

/**
 * Facts about fully verified items that a player would not otherwise expect. Not verification gaps:
 * these items stay verified. Exact ids only, so the unverified empty and other-wood variants get none.
 */
const VERIFIED_ITEM_FACTS: Readonly<Record<number, readonly string[]>> = {
  // attackResources.ts loads the blowpipe family with infinite dragon darts, whatever ammo is worn.
  12926: ['Always uses dragon darts.'], // Toxic blowpipe
  28688: ['Always uses dragon darts.'], // Blazing blowpipe
};

/**
 * The gray note for a verified item, one line each, or undefined when it has none. An unverified
 * item carries the warning instead, so it never gets a note here.
 */
export function verifiedItemNotes(itemId: number): readonly string[] | undefined {
  const piece = findEquipmentCatalogItem(itemId);
  const status = piece === undefined ? undefined : getEquipmentVerificationStatus(piece);
  if (status === 'verified-with-limitations') return describeWeaponVerificationGaps(itemId);
  if (status === 'verified') return VERIFIED_ITEM_FACTS[itemId];
  return undefined;
}

interface LoadoutUnverifiedBadgeProps {
  readonly notice?: LoadoutNotice;
  readonly children: React.ReactNode;
}

/**
 * The `!` drawn rather than typeset, on integer coordinates in a viewBox of whole pixels, so it
 * rasterizes bilevel at DPR 1 and stays sharp at every whole ratio above it. This is the same
 * job `MarkGlyph` does for the `?`: the RuneScape faces rasterize cleanly only at 16px and its
 * multiples, and this mark has 10px of disc to live in, so a font glyph here lands every edge
 * mid-pixel. Set it in a font at any size and it goes soft against the pixel art under it.
 */
const WarningGlyph: React.FC = () => (
  <svg width="2" height="7" viewBox="0 0 2 7" aria-hidden="true" focusable="false">
    <rect x="0" y="0" width="2" height="5" fill="currentColor" />
    <rect x="0" y="6" width="2" height="1" fill="currentColor" />
  </svg>
);

/**
 * The `i`, drawn on the same terms as the `!`. Deliberately not the `!` upside down: a 2x2 dot and
 * a longer stem keep the two apart even where the disc color cannot, and 8px tall centers on
 * whole pixels in the 12px disc.
 */
const InfoGlyph: React.FC = () => (
  <svg width="2" height="8" viewBox="0 0 2 8" aria-hidden="true" focusable="false">
    <rect x="0" y="0" width="2" height="2" fill="currentColor" />
    <rect x="0" y="3" width="2" height="5" fill="currentColor" />
  </svg>
);

/** The disc alone, for a surface that places it itself (the picker sets it inline with its note). */
export const LoadoutNoticeMark: React.FC<{ readonly notice: LoadoutNotice }> = ({ notice }) => (
  <span className={`loadout-slot-${notice}`} aria-hidden="true">
    {notice === 'note' ? <InfoGlyph /> : <WarningGlyph />}
  </span>
);

interface LoadoutUnverifiedTooltipTriggerProps {
  readonly active: boolean;
  readonly itemName: string;
  /** Which card the slot explains. Unverified unless the caller says otherwise. */
  readonly notice?: LoadoutNotice;
  /**
   * What is known to be wrong, unchecked or unavailable about the item, one line each
   * (`describeWeaponVerificationGaps`). Without it the card says only that the item is unverified.
   */
  readonly reasons?: readonly string[];
  /** React 19 carries `ref` as an ordinary prop, which is how the slot becomes the card's anchor. */
  readonly children: React.ReactElement<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement | null> }
  >;
}

/**
 * Split from the trigger so the card's effects mount WITH the slot's ref, not before it. A slot
 * becomes unverified when an import lands, long after first render, and a hook that bound its
 * listeners on the trigger's mount would have bound them to a ref that was still null.
 */
const UnverifiedSlot: React.FC<LoadoutUnverifiedTooltipTriggerProps> = ({
  active,
  itemName,
  notice = 'unverified',
  reasons,
  children,
}) => {
  const slotRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();
  const { card } = useHoverCard({
    // The item leads, because which item is the only part of this the badge cannot already say.
    // A mark and a generic "Unverified item" above it would copy the badge the pointer is
    // resting on and label a card that only ever means one thing.
    content: (
      <>
        <span className="loadout-unverified-card-title">{itemName}</span>
        {reasons && reasons.length > 0 ? (
          <ul className="loadout-unverified-card-body loadout-unverified-card-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="loadout-unverified-card-body">
            Not verified yet. Its animations, sounds or special attack may be missing or wrong.
          </p>
        )}
      </>
    ),
    anchorRef: slotRef,
    // Under the slot, not beside it. Beside is where the rest of the loadout is: the previous
    // placement chose its side from the slot's position in the frame, so every inventory slot
    // opened its card straight over the equipment cross the player was reading it against.
    placement: 'block',
    cardClassName: `loadout-unverified-card${notice === 'note' ? ' loadout-unverified-card--note' : ''}`,
    cardId,
    // A press opens the slot picker over this slot, which is where the card is sitting.
    dismissOnPress: true,
  });

  return (
    <>
      {cloneElement(children, { ref: slotRef })}
      {active && card}
    </>
  );
};

export const LoadoutUnverifiedTooltipTrigger: React.FC<LoadoutUnverifiedTooltipTriggerProps> = ({
  active,
  itemName,
  notice,
  reasons,
  children,
}) => (
  // Always the same element type, active or not: switching to a bare child remounted the slot
  // button whenever an item's verification flipped, and took keyboard focus with it.
  <UnverifiedSlot active={active} itemName={itemName} notice={notice} reasons={reasons}>
    {children}
  </UnverifiedSlot>
);

export const LoadoutUnverifiedBadge: React.FC<LoadoutUnverifiedBadgeProps> = ({ notice = 'unverified', children }) => (
  <span className="loadout-unverified-item">
    {children}
    <LoadoutNoticeMark notice={notice} />
  </span>
);
