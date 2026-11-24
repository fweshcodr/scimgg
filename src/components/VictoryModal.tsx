import { createPortal } from 'react-dom';
import type { EncounterVictoryAccent, EncounterVictoryDescriptor } from '../core/encounters/encounterFactory';
import type { PracticeSessionState } from '../types/practiceSession';
import type { ReplayPracticeControls } from '../types/replayPractice';
import { OutcomePracticeActions } from './ReplayPractice';
import './VictoryModal.css';
import './OutcomeCrest.css';
import { deriveVictoryStats, type VictoryStatSource } from './VictoryModalStats';

const ACCENT_CLASS: Record<EncounterVictoryAccent, string> = {
  gold: 'victory-modal-overlay--gold',
  blood: 'victory-modal-overlay--blood',
};

export type VictoryModalProps = {
  readonly replayPractice?: ReplayPracticeControls;
  /** The encounter's own restart for the stage the run ended on, where it offers one. */
  readonly encounterSession?: PracticeSessionState | null;
  /** Static presentation copy + accent authored by the encounter descriptor. */
  readonly victory: EncounterVictoryDescriptor;
  readonly simulationState: VictoryStatSource;
  readonly onRestart: () => void;
  readonly onEnterReplay: () => void;
  readonly onReturnToLobby?: () => void;
  readonly visible: boolean;
  readonly isReplaying?: boolean;
  /** Whether a replay recording exists; when false, Watch Replay is omitted. */
  readonly hasRecording?: boolean;
};

export function VictoryModal({
  victory,
  simulationState,
  onRestart,
  onEnterReplay,
  onReturnToLobby,
  visible,
  isReplaying = false,
  hasRecording = true,
  replayPractice,
  encounterSession,
}: VictoryModalProps): React.ReactElement | null {
  // deriveVictoryStats walks the whole damage history twice. Gate it on
  // visibility first: this component stays mounted through fights and replays,
  // so deriving unconditionally billed that O(run) scan to every render —
  // including every replay tick change while scrubbing.
  const showing = visible && !isReplaying;
  const stats = showing ? deriveVictoryStats(simulationState) : null;
  const active = showing && stats !== null;

  if (!active || !stats) return null;

  return createPortal(
    <div
      className={`victory-modal-overlay ${ACCENT_CLASS[victory.accent]}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
      aria-describedby="victory-modal-narrative"
    >
      <div className="victory-modal-content-wrapper">
        <p className="victory-modal-eyebrow">{victory.eyebrow}</p>
        <h1 id="victory-modal-title" className="victory-modal-heading">
          {victory.title}
        </h1>
        <div className="victory-modal-emblem" aria-hidden="true">
          <span className="victory-modal-emblem-line victory-modal-emblem-line--left" />
          <span className="victory-modal-emblem-diamond" />
          <span className="victory-modal-emblem-line victory-modal-emblem-line--right" />
        </div>
        <p id="victory-modal-narrative" className="victory-modal-narrative">
          {victory.narrative}
        </p>

        <section className="victory-modal-record" aria-labelledby="victory-modal-record-heading">
          <h2 id="victory-modal-record-heading" className="victory-modal-record-heading">
            Fight record
          </h2>
          <dl className="victory-modal-record-list">
            <div className="victory-modal-record-row">
              <dt>Kill time</dt>
              <dd>{stats.killTime}</dd>
            </div>
            <div className="victory-modal-record-row">
              <dt>Damage dealt</dt>
              <dd>{stats.damageDealt}</dd>
            </div>
            <div className="victory-modal-record-row">
              <dt>Damage taken</dt>
              <dd>{stats.damageTaken}</dd>
            </div>
            <div className="victory-modal-record-row">
              <dt>HP remaining</dt>
              <dd>{stats.hpRemaining}</dd>
            </div>
            <div className="victory-modal-record-row">
              <dt>Prayer remaining</dt>
              <dd>{stats.prayerRemaining}</dd>
            </div>
          </dl>
        </section>

        <div className="victory-modal-actions">
          <OutcomePracticeActions
            controls={replayPractice}
            encounterSession={encounterSession}
            onRestart={onRestart}
            onReplay={hasRecording ? onEnterReplay : undefined}
            onReturnToLobby={onReturnToLobby}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
