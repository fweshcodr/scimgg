import type React from 'react';
import { useRef, useState } from 'react';
import {
  type EncounterModifierDefinition,
  type EncounterModifierSelection,
  filterModifierSelection,
} from '../core/encounters/encounterFactory';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import { ModifierGrid } from './ModifierSelector';
import { useBackdropDismiss } from './ui/backdropDismiss';
import { sheet } from './ui/mobileSheet';
import { OsrsButton } from './ui/OsrsButton';
import './ModifiersModal.css';
import { CloseButton } from './ui/CloseButton';
import { useCenteredModalSnap } from './ui/useCenteredModalSnap';

/**
 * The modifiers the running fight was started with, from its engine's run config
 * (`bootstrap.encounterConfig`): what a restart from the picker would otherwise lose. A run started
 * with every modifier off carries no encounter config at all, which reads as none.
 */
export function runModifierSelection(
  encounterConfig: Readonly<Record<string, unknown>> | undefined,
  definitions: readonly EncounterModifierDefinition[] | undefined,
): EncounterModifierSelection {
  const raw = encounterConfig?.modifiers;
  const selection = raw !== null && typeof raw === 'object' ? (raw as EncounterModifierSelection) : {};
  return filterModifierSelection(definitions, selection);
}

interface ModifiersModalProps {
  readonly encounterName: string;
  readonly modifiers: readonly EncounterModifierDefinition[];
  /** The running fight's selection: the picker opens on it. Read once, when the modal mounts. */
  readonly initialSelection: EncounterModifierSelection;
  /** Starts a new fight of the same encounter with `selection`, everything else unchanged. */
  readonly onRestart: (selection: EncounterModifierSelection) => void;
  readonly onClose: () => void;
}

/** A pressed button keeps no focus, so Space and the arrows go on reaching the game (Keyboard and focus policy). */
const keepFocusOffButtons = (event: React.MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
};

/**
 * Changes the running fight's modifiers without going back through the encounter picker: the
 * modifier grid alone, opened on the current run's set, and a restart. Mount it only while open,
 * so every opening starts from the run's selection rather than an abandoned draft.
 */
export const ModifiersModal: React.FC<ModifiersModalProps> = ({
  encounterName,
  modifiers,
  initialSelection,
  onRestart,
  onClose,
}) => {
  const [draft, setDraft] = useState<EncounterModifierSelection>(initialSelection);
  const cardRef = useRef<HTMLElement>(null);
  useCenteredModalSnap(cardRef);
  const backdropDismiss = useBackdropDismiss(cardRef, onClose);
  useEscapeLayer(ESC_PRIORITY.ENCOUNTER_PICKER, true, onClose);

  return (
    <div
      className="modifiers-modal-overlay"
      {...sheet.overlay}
      {...backdropDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modifiers-modal-title"
      onMouseDown={keepFocusOffButtons}
    >
      <div className="modifiers-modal-backdrop" />
      <section ref={cardRef} className="modifiers-modal-card centered-modal-snap" {...sheet.card}>
        <header className="modifiers-modal-header" {...sheet.head}>
          <div className="modifiers-modal-heading">
            <h2 id="modifiers-modal-title">Modifiers</h2>
            <p>Restarts {encounterName} with these modifiers. Your loadout and settings stay the same.</p>
          </div>
          <CloseButton className="modifiers-modal-close" {...sheet.close} onClick={onClose} aria-label="Close" />
        </header>

        <div className="modifiers-modal-body" {...sheet.body}>
          <ModifierGrid modifiers={modifiers} value={draft} onChange={setDraft} />
        </div>

        <footer className="modifiers-modal-footer" {...sheet.foot}>
          <OsrsButton onClick={onClose}>Cancel</OsrsButton>
          <OsrsButton variant="primary" onClick={() => onRestart(draft)}>
            Restart fight
          </OsrsButton>
        </footer>
      </section>
    </div>
  );
};
