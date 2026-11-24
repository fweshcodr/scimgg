import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { findSupportedRune, RUNE_GROUPS, type RuneCatalogItem } from '../data/runePouch';
import { getItemSpriteUrl } from '../services/ItemSpriteService';
import type { RunePouch, SupplyItem } from '../types/encounterLoadout';
import { LoadoutUnverifiedBadge, LoadoutUnverifiedTooltipTrigger } from './LoadoutUnverifiedBadge';
import { PixelSprite } from './PixelSprite';
import './RunePouchRow.css';

const RUNE_SLOT_KEYS = ['rune-slot-1', 'rune-slot-2', 'rune-slot-3', 'rune-slot-4'] as const;

/**
 * The inventory cell's own sprite box. Hoisted because an object literal is a new value every
 * render, and `PixelSprite` keys its resample on the box it is given.
 */
const RUNE_SPRITE_BOX = { maxWidth: 32, maxHeight: 32 } as const;

/** As a choice it is an act, not the state "Empty" that the slot's own label reports. */
const CLEAR_CHOICE_LABEL = 'No rune';

// Keep related runes adjacent in catalog order without introducing gaps into the grid.
const CHOICES: readonly (RuneCatalogItem | null)[] = [null, ...RUNE_GROUPS.flatMap((group) => group.runes)];

/**
 * The tray's clear cell. Drawn rather than typeset, on whole pixels: the RuneScape faces
 * rasterize cleanly only at 16px and its multiples, so a glyph at this size lands every edge
 * mid-pixel. Blank, the cell that empties a slot is indistinguishable from a failed sprite.
 */
const NoneGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 12L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

interface RuneFace {
  readonly name: string;
  /** An id this build cannot name, which is what the inventory cell calls unverified. */
  readonly unsupported: boolean;
}

function runeFace(rune: SupplyItem | null): RuneFace {
  if (!rune) {
    return { name: 'Empty', unsupported: false };
  }
  const known = findSupportedRune(rune.id);
  // Imported pouches can hold a rune this build cannot name. It reads as held rather than
  // being dropped, exactly as the picker's own unsupported row does.
  return known ? { name: known.name, unsupported: false } : { name: 'Unsupported item', unsupported: true };
}

export interface RunePouchRowProps {
  readonly runePouch: RunePouch;
  readonly openSlotIndex: number | null;
  readonly onSelectSlot: (slotIndex: number | null) => void;
  readonly onChooseRune: (slotIndex: number, itemId: number | undefined) => void;
}

/**
 * What the pouch in the kit is carrying, and the only place it can be changed.
 *
 * Which pouch is a stated fact, not a control: it is decided by the pouch item in the
 * inventory beside it, so offering a Standard/Divine choice here would be a second,
 * conflicting answer to a question the frame has already answered.
 *
 * Choosing happens INSIDE the row rather than in a surface floating over it: a portalled card
 * of its own width measured 256x208, nearly twice the area of the whole row it belonged to,
 * while the row's own middle sat empty.
 */
export const RunePouchRow: React.FC<RunePouchRowProps> = ({ runePouch, openSlotIndex, onSelectSlot, onChooseRune }) => {
  const labelId = useId();
  const trayId = useId();
  const isOpen = openSlotIndex !== null;
  /** What the caption names while the pointer or the arrow keys are moving over the tray. */
  const [cursor, setCursor] = useState<number | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  /** Flat CHOICES order, so the vertical walk can measure the line each cell wrapped to. */
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const openRune = isOpen ? (runePouch.slots[openSlotIndex] ?? null) : null;
  /**
   * Which slot holds each rune. The pouch resolves a rune type once, so a second copy is dead
   * capacity — the tray refuses it and says where the first one is instead.
   */
  const holderOf = new Map<number, number>();
  runePouch.slots.forEach((slot, index) => {
    if (slot && !holderOf.has(slot.id)) holderOf.set(slot.id, index);
  });

  // Undefined matches the clear cell's own undefined, so an empty slot opens on it rather than
  // on nothing: -1 leaves `aria-activedescendant` pointing at no option at all.
  const heldIndex = CHOICES.findIndex((choice) => choice?.id === openRune?.id);
  const cursorIndex = cursor ?? (heldIndex === -1 ? 0 : heldIndex);
  const cursorChoice = CHOICES[cursorIndex] ?? null;
  const cursorHolder = cursorChoice ? holderOf.get(cursorChoice.id) : undefined;
  const cursorTaken = cursorHolder !== undefined && cursorHolder !== openSlotIndex;
  const readout = cursorChoice === null ? CLEAR_CHOICE_LABEL : runeFace(cursorChoice).name;

  /**
   * The tray opens under the row and the panel body it lives in scrolls, so on a short viewport
   * the cells would open below the fold.
   *
   * It waits for the reveal to finish because `block: 'nearest'` measures the box it is given:
   * called directly in this effect, as it was, that box is still `0fr` and trivially in view, so
   * the call did nothing at any viewport. The listener must check `target`: the panel's own fade
   * bubbles a second `transitionend` through this element.
   */
  useEffect(() => {
    if (!isOpen) return;
    const reveal = revealRef.current;
    if (!reveal) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const settle = () => trayRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    if (reduced) {
      trayRef.current?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    const onSettled = (event: TransitionEvent) => {
      if (event.target === reveal) settle();
    };
    reveal.addEventListener('transitionend', onSettled);
    return () => reveal.removeEventListener('transitionend', onSettled);
  }, [isOpen]);

  const chooseAt = (index: number) => {
    if (openSlotIndex === null) return;
    const choice = CHOICES[index] ?? null;
    const holder = choice ? holderOf.get(choice.id) : undefined;
    if (holder !== undefined && holder !== openSlotIndex) return;
    onChooseRune(openSlotIndex, choice?.id);
  };

  const moveCursor = (next: number) => setCursor(((next % CHOICES.length) + CHOICES.length) % CHOICES.length);

  // Navigate the rendered rows so vertical movement follows the grid at every width.
  const moveVertical = (from: number, delta: 1 | -1) => {
    const current = choiceRefs.current[from]?.getBoundingClientRect();
    if (!current || current.height === 0) {
      return;
    }
    const fromX = current.left + current.width / 2;
    const fromY = current.top + current.height / 2;
    let rowDistance = Number.POSITIVE_INFINITY;
    let best = -1;
    let bestX = Number.POSITIVE_INFINITY;
    choiceRefs.current.forEach((node, index) => {
      if (node === null || index === from) return;
      const box = node.getBoundingClientRect();
      const dy = box.top + box.height / 2 - fromY;
      if (delta === 1 ? dy <= 0 : dy >= 0) return;
      const distance = Math.abs(dy);
      const dx = Math.abs(box.left + box.width / 2 - fromX);
      if (distance < rowDistance - 1 || (Math.abs(distance - rowDistance) <= 1 && dx < bestX)) {
        rowDistance = distance;
        bestX = dx;
        best = index;
      }
    });
    if (best !== -1) {
      moveCursor(best);
    }
  };

  const onTrayKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onSelectSlot(null);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveCursor(cursorIndex + (event.key === 'ArrowRight' ? 1 : -1));
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveVertical(cursorIndex, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveCursor(event.key === 'Home' ? 0 : CHOICES.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseAt(cursorIndex);
    }
  };

  return (
    <div className={`rune-pouch-row${isOpen ? ' rune-pouch-row--open' : ''}`}>
      <div className="rune-pouch-bar">
        <span className="section-label" id={labelId}>
          Rune pouch
        </span>
        {/* A fieldset groups form controls; these are cells that open a tray.
            biome-ignore lint/a11y/useSemanticElements: see above; a fieldset's UA box fights the row. */}
        <div className="rune-pouch-slots" role="group" aria-labelledby={labelId}>
          {RUNE_SLOT_KEYS.slice(0, runePouch.slots.length).map((slotKey, index) => {
            const rune = runePouch.slots[index] ?? null;
            const face = runeFace(rune);
            const slotOpen = openSlotIndex === index;
            const label = `Rune pouch slot ${index + 1}: ${face.name}`;
            const className = [
              'inventory-slot',
              'rune-pouch-slot',
              rune ? 'inventory-slot--filled' : '',
              slotOpen ? 'inventory-slot--selected' : '',
              face.unsupported ? 'inventory-slot--unverified' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const sprite = rune && (
              <PixelSprite
                className="rune-pouch-icon"
                src={getItemSpriteUrl(rune.id)}
                alt=""
                aria-hidden
                style={RUNE_SPRITE_BOX}
              />
            );

            return (
              <LoadoutUnverifiedTooltipTrigger key={slotKey} active={face.unsupported} itemName={face.name}>
                <button
                  type="button"
                  className={className}
                  aria-expanded={slotOpen}
                  aria-controls={trayId}
                  aria-label={label}
                  onClick={() => {
                    setCursor(null);
                    onSelectSlot(slotOpen ? null : index);
                  }}
                >
                  {face.unsupported ? <LoadoutUnverifiedBadge>{sprite}</LoadoutUnverifiedBadge> : sprite}
                </button>
              </LoadoutUnverifiedTooltipTrigger>
            );
          })}
        </div>
      </div>

      {/* Mounted through both states so the reveal has two rows to animate between, and inert
          while shut so a closed tray is out of reach for pointer, focus and screen reader alike. */}
      <div className="rune-pouch-reveal" ref={revealRef} data-expanded={isOpen} inert={!isOpen || undefined}>
        <div className="rune-pouch-clip">
          <div className="rune-pouch-tray-panel">
            {/* Which slot is being filled and what the cursor is on, standing WITH the cells.
                At the far end of the bar above, the name of the rune under the cursor sat a row
                up and 180px away from the cursor naming it. */}
            <p className="rune-pouch-caption">
              <span className="section-label">{isOpen ? `Rune pouch / Slot ${openSlotIndex + 1}` : ''}</span>
              <span className={`rune-pouch-readout${cursorTaken ? ' rune-pouch-readout--taken' : ''}`}>
                {cursorTaken && cursorHolder !== undefined ? `${readout}, in slot ${cursorHolder + 1}` : readout}
              </span>
            </p>
            <div
              ref={trayRef}
              id={trayId}
              className="rune-pouch-tray"
              role="listbox"
              aria-label={openSlotIndex === null ? 'Runes' : `Runes for pouch slot ${openSlotIndex + 1}`}
              tabIndex={isOpen ? 0 : -1}
              aria-activedescendant={isOpen ? `${trayId}-${cursorIndex}` : undefined}
              onKeyDown={onTrayKeyDown}
            >
              {CHOICES.map((choice, at) => {
                const holder = choice ? holderOf.get(choice.id) : undefined;
                const isHeldHere = holder !== undefined && holder === openSlotIndex;
                const isTaken = holder !== undefined && holder !== openSlotIndex;
                const name = choice === null ? CLEAR_CHOICE_LABEL : runeFace(choice).name;
                return (
                  <button
                    key={choice?.id ?? 'clear'}
                    id={`${trayId}-${at}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={isHeldHere}
                    aria-disabled={isTaken || undefined}
                    aria-label={isTaken && holder !== undefined ? `${name}, in slot ${holder + 1}` : name}
                    className={[
                      'inventory-slot',
                      'rune-pouch-choice',
                      choice ? 'inventory-slot--filled' : '',
                      isHeldHere ? 'rune-pouch-choice--held' : '',
                      isTaken ? 'rune-pouch-choice--taken' : '',
                      at === cursorIndex ? 'rune-pouch-choice--cursor' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    ref={(node) => {
                      choiceRefs.current[at] = node;
                    }}
                    onPointerEnter={() => setCursor(at)}
                    onClick={() => chooseAt(at)}
                  >
                    {choice === null ? (
                      <span className="rune-pouch-none">
                        <NoneGlyph />
                      </span>
                    ) : (
                      <PixelSprite
                        className="rune-pouch-icon"
                        src={getItemSpriteUrl(choice.id)}
                        alt=""
                        aria-hidden
                        style={RUNE_SPRITE_BOX}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
