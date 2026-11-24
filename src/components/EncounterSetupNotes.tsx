import type React from 'react';
import type { EncounterSetupNote } from '../core/encounters/setupNotes';
import { LoadoutNoticeMark } from './LoadoutUnverifiedBadge';
import './EncounterSetupNotes.css';

/**
 * The encounter panel's setup notes, one line each behind the loadout's amber `!` disc, so they read
 * as the same kind of warning as an unverified slot. Advisory only; nothing here gates Start.
 *
 * The status region stays mounted while empty, so a note that appears as the loadout or modifiers
 * change is announced.
 */
export const EncounterSetupNotes: React.FC<{ readonly notes: readonly EncounterSetupNote[] }> = ({ notes }) => (
  <div className={notes.length > 0 ? 'setup-notes' : undefined} role="status" aria-label="Setup notes">
    {notes.map((note) => (
      <p key={note.id} className="setup-note">
        <LoadoutNoticeMark notice="unverified" />
        <span>{note.message}</span>
      </p>
    ))}
  </div>
);
