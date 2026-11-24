import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { getItemSpriteUrl } from '../services/ItemSpriteService';
import { PixelSprite } from './PixelSprite';
import { DisclosureChevron } from './ui/DisclosureChevron';
import { HoverHintButton } from './ui/HoverHintControl';
import './LoadoutPicker.css';

export interface LoadoutOption {
  readonly key: string;
  readonly name: string;
  /** Item ids whose sprites identify the set (weapon, body), in display order. */
  readonly iconItemIds?: readonly number[];
  readonly isCustom?: boolean;
  /**
   * The named shelf a shipped set is listed on (`EncounterPreset.section`). Unsectioned sets are
   * the group's main presets; a section folds away under its own heading below them.
   */
  readonly section?: string;
}

export interface RequirementChip {
  /** Skill key used for the icon path, e.g. "magic". */
  readonly stat: string;
  readonly level: number;
  /** Display name for the icon's alt text, e.g. "Magic". */
  readonly label: string;
}

export interface BlockedLoadoutOption extends LoadoutOption {
  readonly requirements: readonly RequirementChip[];
}

/** Outcome of a save or a delete, reported under the bar the action was taken in. */
export interface LoadoutStatus {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

/** Unsaved changes: update the saved original, keep a separate copy, or revert. */
export interface LoadoutDraft {
  /** The name field is open. It exists for the press that saves, never before it. */
  readonly naming: boolean;
  readonly name: string;
  /** The set these edits started from, or null when there is no way back. */
  readonly revertName: string | null;
  /** Rises each time the refused Start is pressed; each rise sends Save to go find the player. */
  readonly onNameChange: (name: string) => void;
  /** Press Save: opens the name field, then keeps the draft as a named set. */
  readonly onSave: () => void;
  readonly onCancelNaming: () => void;
  readonly onRevert: () => void;
  /** Offered only when editing an existing saved set. Saving as new still asks for a name. */
  readonly onUpdate?: () => void;
}

/** Compact skill-icon + level chips shared by locked preset tiles and the auto-switch note. */
export const RequirementChipList: React.FC<{ requirements: readonly RequirementChip[] }> = ({ requirements }) => (
  <span className="loadout-req-chips">
    {requirements.map((req) => (
      <span className="loadout-req-chip" key={req.stat}>
        <img
          crossOrigin="anonymous"
          className="loadout-req-chip-icon"
          src={`/assets/ui/skill-${req.stat}.png`}
          alt={req.label}
        />
        <span className="loadout-req-chip-level">{req.level}</span>
      </span>
    ))}
  </span>
);

const TILE_ICON_BOX = { maxWidth: 36, maxHeight: 32 } as const;

/** Set-identity strip shared by preset and saved tiles. */
const LoadoutTileIcons: React.FC<{ itemIds?: readonly number[] }> = ({ itemIds }) => (
  <span className="loadout-tile-icons" aria-hidden="true">
    {(itemIds && itemIds.length > 0 ? itemIds : [undefined]).map((itemId, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static decorative strip; order is the identity.
      <span className="loadout-tile-icon" key={i}>
        {itemId !== undefined && <PixelSprite src={getItemSpriteUrl(itemId)} alt="" style={TILE_ICON_BOX} />}
      </span>
    ))}
  </span>
);

const LoadoutStatusIcon: React.FC<{ kind: LoadoutStatus['kind'] }> = ({ kind }) => (
  <svg
    className={`loadout-status-icon loadout-status-icon--${kind}`}
    aria-hidden="true"
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
  >
    {kind === 'success' ? (
      <path d="M2.5 7.2L5.4 10L11.5 3.8" />
    ) : (
      <>
        <path d="M7 2.5V8" />
        <path d="M7 10.8V11" />
      </>
    )}
  </svg>
);

interface LoadoutPickerProps {
  label: string;
  selectedKey: string;
  selectedLabel: string;
  /** Sits beside the section label, not in the state row: actions ON the loadout, not about it. */
  labelActions?: React.ReactNode;
  options: readonly LoadoutOption[];
  blockedOptions: readonly BlockedLoadoutOption[];
  onSelect: (key: string) => void;
  onDeleteCustom?: (key: string) => void;
  /** Present while changes need saving. Absent is the standing state. */
  draft?: LoadoutDraft;
  status?: LoadoutStatus | null;
  /** The configurer keeps alternatives behind Change while the current gear stays visible. */
  presetsExpanded?: boolean;
}

/**
 * Transfer utilities and draft actions stay with their owner when the preset list is folded.
 */
export const LoadoutPicker: React.FC<LoadoutPickerProps> = ({
  label,
  selectedKey,
  selectedLabel,
  labelActions,
  options,
  blockedOptions,
  onSelect,
  onDeleteCustom,
  draft,
  status,
  presetsExpanded = true,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const savedLabelId = `${idPrefix}-saved-label`;
  const savedGroupId = `${idPrefix}-saved-group`;
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  /**
   * Sections opened or closed by hand, by name. A section with no entry follows the selection
   * instead, which makes "closed by default" and "never folds the worn set away" one rule.
   */
  const [sectionOverrides, setSectionOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const naming = draft?.naming === true;

  // The field is asked for, so it takes the caret with it and offers its seeded name up
  // for replacement: accepting it is Enter, changing it is typing. It also brings itself into
  // view, since the bar can sit at the top of a column scrolled down to the gear being edited.
  useEffect(() => {
    if (naming) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      nameRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [naming]);

  // A selection change — by click or by the stat auto-switch — is a change of subject, so an
  // armed delete is dropped rather than left waiting on a row the player has moved away from.
  const [armedSelection, setArmedSelection] = useState(selectedKey);
  const selectedSection = options.find((opt) => opt.key === selectedKey)?.section;
  if (armedSelection !== selectedKey) {
    setArmedSelection(selectedKey);
    setPendingDeleteKey(null);
    // A set taken inside a section hands that section back to the selection rule, so an import
    // or a stat auto-switch into a closed section opens it rather than hiding what is worn.
    if (selectedSection !== undefined && sectionOverrides[selectedSection] !== undefined) {
      const { [selectedSection]: _released, ...rest } = sectionOverrides;
      setSectionOverrides(rest);
    }
  }

  // One number per status reported, used as the readout's key so each gets its own lifetime
  // animation. It counts identities rather than messages because repeating an action reports
  // the same words, and that is exactly the case that would otherwise inherit a timeline
  // already most of the way through and vanish on arrival.
  const [statusToken, setStatusToken] = useState(0);
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setStatusToken((token) => token + 1);
  }

  const moveFocus = (delta: 1 | -1) => {
    const sets = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([aria-disabled="true"])');
    const enabled = Array.from(sets ?? []);
    if (enabled.length === 0) {
      return;
    }
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    enabled[(current + delta + enabled.length) % enabled.length]?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(-1);
    }
  };

  /** Return to the tile's own action after declining its confirmation. */
  const [refocusDeleteKey, setRefocusDeleteKey] = useState<string | null>(null);
  const cancelDelete = (key: string) => {
    setPendingDeleteKey(null);
    setRefocusDeleteKey(key);
  };

  // An effect rather than a callback ref on the button: an inline ref re-runs on every render of
  // the open confirm, so tabbing to Delete would be undone by the next parent render.
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pendingDeleteKey !== null) {
      keepRef.current?.focus({ preventScroll: true });
    }
  }, [pendingDeleteKey]);

  const renderBlockedTile = (opt: BlockedLoadoutOption) => (
    <button
      key={opt.key}
      type="button"
      role="option"
      aria-disabled="true"
      aria-selected={false}
      className="loadout-tile loadout-tile--blocked"
    >
      <LoadoutTileIcons itemIds={opt.iconItemIds} />
      <span className="loadout-tile-name">
        <svg
          className="loadout-tile-lock"
          role="img"
          aria-label="Locked"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="2" y="5.5" width="8" height="5.3" rx="1.2" fill="currentColor" />
        </svg>
        {opt.name}
      </span>
      <RequirementChipList requirements={opt.requirements} />
    </button>
  );

  const renderTile = (opt: LoadoutOption) => {
    const isSelected = opt.key === selectedKey;
    return (
      <button
        key={opt.key}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`loadout-tile${opt.isCustom ? ' loadout-tile--saved' : ''}${isSelected ? ' loadout-tile--selected' : ''}`}
        onClick={() => onSelect(opt.key)}
      >
        <LoadoutTileIcons itemIds={opt.iconItemIds?.slice(0, 1)} />
        <span className="loadout-tile-name">{opt.name}</span>
        {/* Reserve the mark's width in both states so selecting never rewraps the name. */}
        <svg
          className="loadout-tile-check"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          visibility={isSelected ? 'visible' : 'hidden'}
          aria-hidden="true"
        >
          <path d="m2 6 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    );
  };

  const stockOptions = options.filter((opt) => !opt.isCustom);
  const savedOptions = options.filter((opt) => opt.isCustom);
  const pendingDelete = savedOptions.find((opt) => opt.key === pendingDeleteKey);

  // Named shelves in the order their sets declare them. The count promises how many sets are in
  // there, usable or locked, not how many the current stats allow.
  const sectionNames: string[] = [];
  for (const opt of [...stockOptions, ...blockedOptions]) {
    if (opt.section !== undefined && !sectionNames.includes(opt.section)) sectionNames.push(opt.section);
  }
  const sections = sectionNames.map((name, index) => {
    const tiles = stockOptions.filter((opt) => opt.section === name);
    return {
      name,
      tiles,
      locked: blockedOptions.filter((opt) => opt.section === name),
      id: `${idPrefix}-section-${index}`,
      expanded: sectionOverrides[name] ?? tiles.some((opt) => opt.key === selectedKey),
    };
  });
  const mainOptions = stockOptions.filter((opt) => opt.section === undefined);
  const mainBlockedOptions = blockedOptions.filter((opt) => opt.section === undefined);
  // Owned rather than contained, so section headings and saved-tile deletes stay out of the
  // listbox's option-only hierarchy. Listed in the order they are drawn.
  const ownedGroupIds = [
    ...sections.filter((section) => section.expanded).map((section) => section.id),
    ...(savedOptions.length > 0 ? [savedGroupId] : []),
  ];

  const renderSavedTile = (opt: LoadoutOption) => (
    <div className="loadout-saved-cell" key={opt.key}>
      {renderTile(opt)}
      {onDeleteCustom && (
        <HoverHintButton
          type="button"
          className="loadout-saved-delete"
          aria-label={`Delete ${opt.name}`}
          hintPlacement="above"
          aria-expanded={pendingDeleteKey === opt.key}
          ref={(node) => {
            if (node && refocusDeleteKey === opt.key) {
              node.focus({ preventScroll: true });
              setRefocusDeleteKey(null);
            }
          }}
          onClick={() => setPendingDeleteKey(opt.key)}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </HoverHintButton>
      )}
    </div>
  );

  return (
    <div className="loadout-picker">
      <div className={`loadout-bar${naming ? ' loadout-bar--naming' : ''}`}>
        {/* What is worn, named once, as the heading's own value. A row of its own under this one
            would announce the set a second time directly above the tile that already names it
            and marks it selected. */}
        <div className="loadout-bar-heading">
          <span className="section-label section-label--primary">{label}</span>
          {!naming && <span className="loadout-bar-value">{selectedLabel}</span>}
          <div className="loadout-bar-tools">{labelActions}</div>
        </div>
        {/* Reserved for what the heading cannot carry: the name being typed, and the fact that
            what is worn matches no saved set. Empty otherwise. */}
        <div className="loadout-bar-identity">
          {draft && naming ? (
            <label className="loadout-name-field">
              <span>Preset name</span>
              <input
                ref={nameRef}
                className="loadout-draft-name"
                aria-label="Preset name"
                value={draft.name}
                maxLength={48}
                onChange={(event) => draft.onNameChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    draft.onSave();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    draft.onCancelNaming();
                  }
                }}
              />
            </label>
          ) : null}
        </div>
        {draft && (
          <div className="loadout-bar-actions">
            {/* The state and its two answers on one row. Stacked, the draft appearing pushed the
                tiles and the whole gear frame down 62px, under the pointer of someone who had
                just clicked a slot in that frame. */}
            <div className="loadout-bar-draft">
              {!naming && <span className="loadout-current-state">Loadout not saved as a preset.</span>}
              {/* The way back first, the commitment last: the footer's own pairing at bar
                  scale, so the shape says which is which before the words do. */}
              {naming ? (
                <button type="button" className="loadout-bar-action loadout-bar-back" onClick={draft.onCancelNaming}>
                  Cancel
                </button>
              ) : (
                draft.revertName !== null && (
                  <button
                    type="button"
                    className="loadout-bar-action loadout-bar-back"
                    // The verb is the label; the set it puts back is the accessible name. A saved
                    // set can be called anything, and a control that carried that name could only
                    // ever shrink or ellipsize it into something unreadable.
                    aria-label={`Revert to ${draft.revertName}`}
                    onClick={draft.onRevert}
                  >
                    Revert
                  </button>
                )
              )}
              <span className="loadout-bar-commit">
                {draft.onUpdate && !naming && (
                  <button type="button" className="loadout-bar-action loadout-bar-back" onClick={draft.onSave}>
                    Save new preset
                  </button>
                )}
                <button
                  type="button"
                  className="loadout-bar-action loadout-bar-save"
                  onClick={!naming && draft.onUpdate ? draft.onUpdate : draft.onSave}
                >
                  {naming ? 'Save preset' : draft.onUpdate ? 'Update preset' : 'Save preset'}
                </button>
              </span>
            </div>
          </div>
        )}
      </div>

      {status && (
        <p
          key={statusToken}
          className={`loadout-status${status.kind === 'error' ? ' loadout-status--error' : ''}`}
          role="status"
        >
          <LoadoutStatusIcon kind={status.kind} />
          <span>{status.message}</span>
        </p>
      )}

      <div ref={listRef} className="loadout-body" hidden={!presetsExpanded}>
        <h3 className="loadout-group-heading">Presets</h3>
        <div
          className="loadout-list"
          role="listbox"
          aria-label="Equipment loadout presets"
          onKeyDown={onListKeyDown}
          // Keep saved-tile delete buttons outside the listbox's option-only hierarchy.
          aria-owns={ownedGroupIds.length > 0 ? ownedGroupIds.join(' ') : undefined}
        >
          {/* Selectable tiles in their own grid so saved and stock tracks stay equal;
              locked rows below are full-width flex siblings. */}
          <div className="loadout-grid-tiles">{mainOptions.map(renderTile)}</div>
          {mainBlockedOptions.map(renderBlockedTile)}
        </div>

        {/* Closed until asked for, and open while it holds the worn set. Its sets unmount while
            closed: each tile carries its own canvases, and the arrow keys should not walk into
            sets nobody can see. */}
        {sections.map((section) => (
          <div className="loadout-shelf" key={section.name}>
            {/* The heading is the control: one target, and the name it folds away is its label. */}
            <h3 className="loadout-group-heading" id={`${section.id}-label`}>
              <button
                type="button"
                tabIndex={-1}
                className="loadout-shelf-toggle"
                aria-expanded={section.expanded}
                aria-controls={section.expanded ? section.id : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setSectionOverrides((current) => ({ ...current, [section.name]: !section.expanded }))}
              >
                {/* The configurer's own disclosure mark (Combat stats, Account unlocks). */}
                <DisclosureChevron open={section.expanded} />
                {section.name}{' '}
                <span className="loadout-saved-count">{`(${section.tiles.length + section.locked.length})`}</span>
              </button>
            </h3>
            {section.expanded && (
              // biome-ignore lint/a11y/useSemanticElements: a listbox owns groups, not fieldsets; this is the optgroup shape.
              <div
                className="loadout-shelf-items"
                role="group"
                id={section.id}
                aria-labelledby={`${section.id}-label`}
                onKeyDown={onListKeyDown}
              >
                <div className="loadout-grid-tiles">{section.tiles.map(renderTile)}</div>
                {section.locked.map(renderBlockedTile)}
              </div>
            )}
          </div>
        ))}

        {savedOptions.length > 0 && (
          <div className="loadout-saved">
            <h3 className="loadout-group-heading" id={savedLabelId}>
              Saved presets <span className="loadout-saved-count">{`(${savedOptions.length})`}</span>
            </h3>
            {pendingDelete && onDeleteCustom && (
              // biome-ignore lint/a11y/useSemanticElements: an inline action confirmation, not a group of form fields.
              <div
                className="loadout-saved-confirm"
                role="group"
                aria-label={`Delete ${pendingDelete.name}?`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelDelete(pendingDelete.key);
                  }
                }}
              >
                <span className="loadout-saved-confirm-name">Delete “{pendingDelete.name}”?</span>
                <div className="loadout-saved-confirm-actions">
                  <button
                    type="button"
                    className="loadout-saved-confirm-btn loadout-saved-confirm-btn--delete"
                    onClick={() => {
                      setPendingDeleteKey(null);
                      onDeleteCustom(pendingDelete.key);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    ref={keepRef}
                    type="button"
                    className="loadout-saved-confirm-btn loadout-saved-confirm-btn--keep"
                    onClick={() => cancelDelete(pendingDelete.key)}
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
            {/* biome-ignore lint/a11y/useSemanticElements: a listbox owns groups, not fieldsets; this is the optgroup shape. */}
            <div
              className="loadout-saved-scroll"
              role="group"
              id={savedGroupId}
              aria-labelledby={savedLabelId}
              onKeyDown={onListKeyDown}
            >
              <div className="loadout-grid-tiles">{savedOptions.map(renderSavedTile)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
